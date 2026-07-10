"use client";

import * as THREE from "three";
import { useEffect, useRef, useState } from "react";

type ParticleSeed = {
  nx: number;
  ny: number;
  depth: number;
  size: number;
  opacity: number;
  tone: number;
  phase: number;
  rank: number;
};

type ParticlePortraitProps = {
  pulseSequence: number;
};

const portraitAspect = 400 / 352;

const stableHash = (x: number, y: number) => {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return value - Math.floor(value);
};

const vertexShader = `
  attribute float aSize;
  attribute float aOpacity;
  attribute vec3 color;

  uniform float uPixelRatio;
  uniform float uPulse;

  varying vec3 vColor;
  varying float vOpacity;

  void main() {
    vColor = color;
    vOpacity = aOpacity;

    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = aSize * uPixelRatio * (1.0 + uPulse * 0.42);
  }
`;

const fragmentShader = `
  varying vec3 vColor;
  varying float vOpacity;

  void main() {
    vec2 pixel = abs(gl_PointCoord - vec2(0.5));
    float ledDistance = max(pixel.x, pixel.y);
    float edge = 1.0 - smoothstep(0.31, 0.5, ledDistance);
    float core = 1.0 - smoothstep(0.0, 0.2, ledDistance);
    float alpha = edge * vOpacity;

    gl_FragColor = vec4(vColor + core * 0.08, alpha);
  }
`;

export default function ParticlePortrait({ pulseSequence }: ParticlePortraitProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const igniteRef = useRef<() => void>(() => undefined);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;

    if (!canvas || !host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
      });
    } catch {
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uPixelRatio: { value: 1 },
        uPulse: { value: 0 },
      },
      vertexShader,
      fragmentShader,
    });
    const cloud = new THREE.Points(geometry, material);

    camera.position.z = 3;
    cloud.frustumCulled = false;
    scene.add(cloud);
    renderer.setClearColor(0x000000, 0);

    const image = new Image();
    const sampleCanvas = document.createElement("canvas");
    const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });
    const seeds: ParticleSeed[] = [];
    const pointer = { x: 0, y: 0, active: false };
    let positionAttribute: THREE.BufferAttribute | null = null;
    let basePositions = new Float32Array();
    let positions = new Float32Array();
    let velocities = new Float32Array();
    let width = 0;
    let height = 0;
    let viewportWidth = 2.4;
    let viewportHeight = 2.4;
    let frame = 0;
    let lastTime = performance.now();
    let pulseEnergy = 0;
    let portraitReady = false;
    let frameRequested = false;
    let inViewport = true;
    let disposed = false;

    const canRender = () => !disposed && portraitReady && inViewport && !document.hidden;

    const render = () => {
      if (!disposed) renderer.render(scene, camera);
    };

    const rebuildGeometry = () => {
      if (!seeds.length) return;

      const imageHeight = Math.min(viewportHeight * 0.82, viewportWidth * 0.76 * portraitAspect);
      const imageWidth = imageHeight / portraitAspect;
      const count = seeds.length;
      const colors = new Float32Array(count * 3);
      const sizes = new Float32Array(count);
      const opacities = new Float32Array(count);

      basePositions = new Float32Array(count * 3);
      positions = new Float32Array(count * 3);
      velocities = new Float32Array(count * 3);

      seeds.forEach((seed, index) => {
        const point = index * 3;
        const x = (seed.nx - 0.5) * imageWidth;
        const y = (0.5 - seed.ny) * imageHeight;

        basePositions[point] = x;
        basePositions[point + 1] = y;
        basePositions[point + 2] = seed.depth;
        positions[point] = x;
        positions[point + 1] = y;
        positions[point + 2] = seed.depth;
        colors[point] = seed.tone;
        colors[point + 1] = seed.tone;
        colors[point + 2] = seed.tone;
        sizes[index] = seed.size;
        opacities[index] = seed.opacity;
      });

      positionAttribute = new THREE.BufferAttribute(positions, 3);
      geometry.setAttribute("position", positionAttribute);
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
      geometry.setAttribute("aOpacity", new THREE.BufferAttribute(opacities, 1));
      geometry.computeBoundingSphere();
    };

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      viewportHeight = viewportWidth * (height / width);
      camera.left = -viewportWidth / 2;
      camera.right = viewportWidth / 2;
      camera.top = viewportHeight / 2;
      camera.bottom = -viewportHeight / 2;
      camera.updateProjectionMatrix();
      material.uniforms.uPixelRatio.value = pixelRatio;

      if (portraitReady) rebuildGeometry();
      render();
    };

    const requestFrame = () => {
      if (frameRequested || reducedMotion || !canRender()) return;
      frameRequested = true;
      frame = window.requestAnimationFrame(draw);
    };

    const draw = (time: number) => {
      frameRequested = false;
      if (!canRender() || !positionAttribute) return;

      const delta = Math.min((time - lastTime) / 16.67 || 1, 2.5);
      lastTime = time;
      pulseEnergy = Math.max(0, pulseEnergy - 0.019 * delta);

      let motion = pulseEnergy;
      const interactionRadius = Math.min(viewportWidth, viewportHeight) * 0.23;

      for (let point = 0; point < positions.length; point += 3) {
        const seed = seeds[point / 3];
        const dxHome = basePositions[point] - positions[point];
        const dyHome = basePositions[point + 1] - positions[point + 1];
        const dzHome = basePositions[point + 2] - positions[point + 2];

        velocities[point] += dxHome * 0.052 * delta;
        velocities[point + 1] += dyHome * 0.052 * delta;
        velocities[point + 2] += dzHome * 0.038 * delta;

        if (pointer.active) {
          const dx = positions[point] - pointer.x;
          const dy = positions[point + 1] - pointer.y;
          const distance = Math.hypot(dx, dy);

          if (distance < interactionRadius) {
            const force = ((interactionRadius - distance) / interactionRadius) * 0.0085;
            velocities[point] += (dx / (distance || 1)) * force * delta;
            velocities[point + 1] += (dy / (distance || 1)) * force * delta;
          }
        }

        const drift = pulseEnergy * 0.0018;
        velocities[point] += Math.sin(time * 0.0014 + seed.phase) * drift;
        velocities[point + 1] += Math.cos(time * 0.0012 + seed.phase) * drift;

        positions[point] += velocities[point] * delta;
        positions[point + 1] += velocities[point + 1] * delta;
        positions[point + 2] += velocities[point + 2] * delta;
        velocities[point] *= 0.85;
        velocities[point + 1] *= 0.85;
        velocities[point + 2] *= 0.82;
        motion += Math.abs(velocities[point]) + Math.abs(velocities[point + 1]);
      }

      positionAttribute.needsUpdate = true;
      material.uniforms.uPulse.value = pulseEnergy;
      render();

      if (pointer.active || pulseEnergy > 0.002 || motion > 0.018) requestFrame();
    };

    const buildPortrait = () => {
      if (disposed || portraitReady || !sampleContext || image.naturalWidth === 0) return;

      try {
        const sampleSize = 168;
        const isCompact = window.innerWidth < 620;
        const step = 2;
        const maximum = isCompact ? 760 : 1650;
        const candidates: ParticleSeed[] = [];

        sampleCanvas.width = sampleSize;
        sampleCanvas.height = sampleSize;
        sampleContext.drawImage(image, 24, 0, 352, 400, 0, 0, sampleSize, sampleSize);
        const imageData = sampleContext.getImageData(0, 0, sampleSize, sampleSize).data;

        for (let y = 1; y < sampleSize - 1; y += step) {
          for (let x = 1; x < sampleSize - 1; x += step) {
            const pixel = (y * sampleSize + x) * 4;
            const left = (y * sampleSize + x - 1) * 4;
            const right = (y * sampleSize + x + 1) * 4;
            const above = ((y - 1) * sampleSize + x) * 4;
            const below = ((y + 1) * sampleSize + x) * 4;
            const luminance =
              (0.2126 * imageData[pixel] + 0.7152 * imageData[pixel + 1] + 0.0722 * imageData[pixel + 2]) /
              255;
            const rightLuminance =
              (0.2126 * imageData[right] + 0.7152 * imageData[right + 1] + 0.0722 * imageData[right + 2]) /
              255;
            const leftLuminance =
              (0.2126 * imageData[left] + 0.7152 * imageData[left + 1] + 0.0722 * imageData[left + 2]) /
              255;
            const aboveLuminance =
              (0.2126 * imageData[above] + 0.7152 * imageData[above + 1] + 0.0722 * imageData[above + 2]) /
              255;
            const belowLuminance =
              (0.2126 * imageData[below] + 0.7152 * imageData[below + 1] + 0.0722 * imageData[below + 2]) /
              255;
            const alpha = imageData[pixel + 3] / 255;
            const ink = alpha * Math.pow(Math.max(0, (0.95 - luminance) / 0.95), 0.74);
            const edge = Math.min(
              1,
              (Math.abs(leftLuminance - rightLuminance) + Math.abs(aboveLuminance - belowLuminance)) * 1.32,
            );
            const body = Math.max(0, ink - 0.67) * 0.18;
            const density = Math.min(0.96, edge * 0.97 + body);
            const chance = stableHash(x, y);

            if (density < 0.1 || chance > density) continue;

            const edgeWeight = Math.min(1, edge * 1.55);
            candidates.push({
              nx: (x + 0.5) / sampleSize,
              ny: (y + 0.5) / sampleSize,
              depth: (stableHash(x + 97, y + 43) - 0.5) * 0.18,
              size: 1.02 + edgeWeight * 1.52 + stableHash(x + 7, y + 11) * 0.4,
              opacity: 0.24 + edgeWeight * 0.68 + body * 0.2,
              tone: 0.3 + edgeWeight * 0.64 + body * 0.15,
              phase: stableHash(x + 211, y + 619) * Math.PI * 2,
              rank: edge * 0.9 + body * 0.08 + stableHash(x + 641, y + 73) * 0.02,
            });
          }
        }

        candidates.sort((first, second) => second.rank - first.rank);
        seeds.push(...candidates.slice(0, maximum));
        portraitReady = seeds.length > 0;
        if (!portraitReady) return;

        rebuildGeometry();
        setIsReady(true);
        render();
      } catch {
        // A normal portrait is left visible if the source cannot be sampled.
      }
    };

    const ignite = () => {
      if (!portraitReady || reducedMotion) return;

      pulseEnergy = 1;
      for (let point = 0; point < positions.length; point += 3) {
        const x = positions[point];
        const y = positions[point + 1];
        const distance = Math.hypot(x, y) || 1;
        const force = 0.018 + stableHash(point, point + 17) * 0.036;
        velocities[point] += (x / distance) * force;
        velocities[point + 1] += (y / distance) * force;
        velocities[point + 2] += (stableHash(point + 73, point + 19) - 0.5) * 0.02;
      }

      requestFrame();
    };

    const handlePointerMove = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width - 0.5) * viewportWidth;
      pointer.y = (0.5 - (event.clientY - bounds.top) / bounds.height) * viewportHeight;
      pointer.active = true;
      requestFrame();
    };

    const handlePointerLeave = () => {
      pointer.active = false;
      requestFrame();
    };

    const handleVisibility = () => {
      lastTime = performance.now();
      if (document.hidden) {
        window.cancelAnimationFrame(frame);
        frameRequested = false;
      } else {
        render();
        requestFrame();
      }
    };

    const resizeObserver = new ResizeObserver(resize);
    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        inViewport = entry.isIntersecting;
        lastTime = performance.now();
        if (inViewport) {
          render();
          requestFrame();
        } else {
          window.cancelAnimationFrame(frame);
          frameRequested = false;
        }
      },
      { threshold: 0.01 },
    );

    resizeObserver.observe(host);
    intersectionObserver.observe(host);
    host.addEventListener("pointermove", handlePointerMove, { passive: true });
    host.addEventListener("pointerleave", handlePointerLeave);
    document.addEventListener("visibilitychange", handleVisibility);
    image.addEventListener("load", buildPortrait, { once: true });
    image.src = "/0xaa.png";
    if (image.complete) buildPortrait();
    igniteRef.current = ignite;
    resize();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      host.removeEventListener("pointermove", handlePointerMove);
      host.removeEventListener("pointerleave", handlePointerLeave);
      document.removeEventListener("visibilitychange", handleVisibility);
      image.removeEventListener("load", buildPortrait);
      igniteRef.current = () => undefined;
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    if (pulseSequence > 0) igniteRef.current();
  }, [pulseSequence]);

  return (
    <div className={`particle-portrait${isReady ? " is-ready" : ""}`} data-particle-portrait>
      <img className="portrait-fallback" src="/0xaa.png" alt="0xaa 的黑白粒子头像" />
      <canvas ref={canvasRef} className="portrait-particle-canvas" aria-hidden="true" />
    </div>
  );
}
