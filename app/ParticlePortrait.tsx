"use client";

import * as THREE from "three";
import { useEffect, useRef, useState } from "react";
import pointCloudData from "./generated/portrait-points.json";

type ParticleSeed = {
  nx: number;
  ny: number;
  depth: number;
  size: number;
  opacity: number;
  tone: number;
  phase: number;
};

type PointCloudAsset = {
  version: number;
  stride: number;
  aspectRatio: number;
  lod: {
    mobile: number;
    desktop: number;
  };
  points: number[];
};

type ParticlePortraitProps = {
  pulseSequence: number;
};

const fallbackAspectRatio = 400 / 352;
const pointCloud = pointCloudData as PointCloudAsset;

const stableHash = (x: number, y: number) => {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return value - Math.floor(value);
};

const isUsablePointCloud = (asset: PointCloudAsset) =>
  asset.version === 1 &&
  asset.stride === 7 &&
  Number.isFinite(asset.aspectRatio) &&
  asset.aspectRatio > 0 &&
  Number.isInteger(asset.lod.mobile) &&
  Number.isInteger(asset.lod.desktop) &&
  asset.lod.mobile > 0 &&
  asset.lod.desktop >= asset.lod.mobile &&
  asset.points.length >= asset.lod.desktop * asset.stride &&
  asset.points.every(Number.isFinite);

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
  const [loadState, setLoadState] = useState<"loading" | "ready" | "unavailable">("loading");

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;

    if (!canvas || !host) return;

    setLoadState("loading");
    if (!isUsablePointCloud(pointCloud)) {
      setLoadState("unavailable");
      return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
      });
    } catch {
      setLoadState("unavailable");
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

    const seeds: ParticleSeed[] = [];
    const pointer = { x: 0, y: 0, active: false };
    const pointCount = Math.min(
      window.innerWidth < 620 ? pointCloud.lod.mobile : pointCloud.lod.desktop,
      Math.floor(pointCloud.points.length / pointCloud.stride),
    );
    const pointOffset = pointCloud.stride;

    for (let index = 0; index < pointCount; index += 1) {
      const offset = index * pointOffset;
      seeds.push({
        nx: pointCloud.points[offset],
        ny: pointCloud.points[offset + 1],
        depth: pointCloud.points[offset + 2],
        size: pointCloud.points[offset + 3],
        opacity: pointCloud.points[offset + 4],
        tone: pointCloud.points[offset + 5],
        phase: pointCloud.points[offset + 6],
      });
    }

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
    let portraitReady = seeds.length > 0;
    let frameRequested = false;
    let inViewport = true;
    let disposed = false;
    const portraitAspect = pointCloud.aspectRatio || fallbackAspectRatio;

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
    igniteRef.current = ignite;
    resize();
    setLoadState("ready");

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      host.removeEventListener("pointermove", handlePointerMove);
      host.removeEventListener("pointerleave", handlePointerLeave);
      document.removeEventListener("visibilitychange", handleVisibility);
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
    <div className={`particle-portrait is-${loadState}`} data-particle-portrait>
      <span className="portrait-loading" aria-hidden="true">
        POINT CLOUD / LOADING
      </span>
      <span className="portrait-unavailable" role="status">
        PARTICLE PORTRAIT UNAVAILABLE
      </span>
      <canvas ref={canvasRef} className="portrait-particle-canvas" aria-hidden="true" />
    </div>
  );
}
