"use client";

import * as THREE from "three";
import { useEffect, useRef, useState } from "react";
import pointCloudData from "./generated/portrait-points.json";

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
  attribute float aPhase;
  attribute vec3 color;

  uniform float uPixelRatio;
  uniform float uTime;
  uniform float uMotion;
  uniform vec2 uPortraitScale;
  uniform vec2 uPointer;
  uniform float uPointerStrength;
  uniform vec2 uPulseOrigin;
  uniform float uPulseProgress;
  uniform float uPulse;

  varying vec3 vColor;
  varying float vOpacity;

  void main() {
    vec3 base = vec3(position.xy * uPortraitScale, position.z);
    float phase = aPhase * 6.28318530718;

    vec2 idle = vec2(
      sin(uTime * 0.58 + phase),
      cos(uTime * 0.43 + phase * 0.75)
    ) * mix(0.0025, 0.008, aOpacity) * uMotion;
    float idleDepth = sin(uTime * 0.62 + phase * 1.37) * 0.012 * aOpacity * uMotion;

    vec2 pointerDelta = base.xy - uPointer;
    float pointerDistance = max(length(pointerDelta), 0.0001);
    vec2 pointerRadial = pointerDelta / pointerDistance;
    vec2 pointerTangent = vec2(-pointerRadial.y, pointerRadial.x);
    float pointerInfluence = (1.0 - smoothstep(0.0, 0.34, pointerDistance)) * uPointerStrength;
    vec2 pointerField = (pointerRadial * 0.043 + pointerTangent * 0.018) * pointerInfluence;

    vec2 pulseDelta = base.xy - uPulseOrigin;
    float pulseDistance = max(length(pulseDelta), 0.0001);
    float pulseRadius = mix(0.0, 1.34, uPulseProgress);
    float pulseShell = (1.0 - smoothstep(0.0, 0.1, abs(pulseDistance - pulseRadius))) * uPulse;
    vec2 pulseField = (pulseDelta / pulseDistance) * pulseShell * 0.085;

    float scanCenter = sin(uTime * 0.38) * 0.62;
    float scanner = 1.0 - smoothstep(0.0, 0.115, abs(base.y - scanCenter));
    vec3 displaced = base + vec3(idle + pointerField + pulseField, idleDepth + pulseShell * 0.04);

    vec4 viewPosition = modelViewMatrix * vec4(displaced, 1.0);
    gl_Position = projectionMatrix * viewPosition;

    float pointBoost = 1.0 + scanner * 0.34 + pointerInfluence * 0.38 + pulseShell * 0.62;
    gl_PointSize = min(aSize * uPixelRatio * pointBoost, 18.0);
    vColor = color + vec3(scanner * 0.18 + pointerInfluence * 0.1 + pulseShell * 0.2);
    vOpacity = min(1.0, aOpacity * (1.0 + scanner * 0.42 + pointerInfluence * 0.28 + pulseShell * 0.36));
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
        powerPreference: "high-performance"
      });
    } catch {
      setLoadState("unavailable");
      return;
    }

    const reducedMotionMedia = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointerMedia = window.matchMedia("(hover: hover) and (pointer: fine)");
    let reducedMotion = reducedMotionMedia.matches;
    let finePointer = finePointerMedia.matches;
    let disposed = false;
    let contextLost = false;
    let inViewport = true;
    let frameRequested = false;
    let frame = 0;
    let lastFrame = performance.now();
    let pointerStrength = 0;
    let pointerTarget = 0;
    let pulseStartedAt: number | null = null;
    const pulseDuration = 920;
    const portraitAspect = pointCloud.aspectRatio || fallbackAspectRatio;

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
        uTime: { value: 0 },
        uMotion: { value: reducedMotion ? 0 : 1 },
        uPortraitScale: { value: new THREE.Vector2(1, 1) },
        uPointer: { value: new THREE.Vector2(0, -0.04) },
        uPointerStrength: { value: 0 },
        uPulseOrigin: { value: new THREE.Vector2(0, -0.04) },
        uPulseProgress: { value: 0 },
        uPulse: { value: 0 }
      },
      vertexShader,
      fragmentShader
    });
    const cloud = new THREE.Points(geometry, material);

    camera.position.z = 3;
    cloud.frustumCulled = false;
    scene.add(cloud);
    renderer.setClearColor(0x000000, 0);

    const capacity = Math.min(pointCloud.lod.desktop, Math.floor(pointCloud.points.length / pointCloud.stride));
    const positions = new Float32Array(capacity * 3);
    const colors = new Float32Array(capacity * 3);
    const sizes = new Float32Array(capacity);
    const opacities = new Float32Array(capacity);
    const phases = new Float32Array(capacity);

    for (let index = 0; index < capacity; index += 1) {
      const offset = index * pointCloud.stride;
      const point = index * 3;
      positions[point] = pointCloud.points[offset] - 0.5;
      positions[point + 1] = 0.5 - pointCloud.points[offset + 1];
      positions[point + 2] = pointCloud.points[offset + 2];
      colors[point] = pointCloud.points[offset + 5];
      colors[point + 1] = pointCloud.points[offset + 5];
      colors[point + 2] = pointCloud.points[offset + 5];
      sizes[index] = pointCloud.points[offset + 3];
      opacities[index] = pointCloud.points[offset + 4];
      phases[index] = pointCloud.points[offset + 6];
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("aOpacity", new THREE.BufferAttribute(opacities, 1));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    geometry.setDrawRange(0, capacity);
    geometry.computeBoundingSphere();

    const canRender = () => !disposed && !contextLost && inViewport && !document.hidden;

    const render = () => {
      if (!disposed && !contextLost) renderer.render(scene, camera);
    };

    const updateDrawRange = () => {
      const count = window.innerWidth < 620 ? pointCloud.lod.mobile : capacity;
      geometry.setDrawRange(0, Math.min(count, capacity));
    };

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const width = Math.max(1, bounds.width);
      const height = Math.max(1, bounds.height);
      const pixelRatioCap = finePointer ? 1.5 : 1.25;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, pixelRatioCap);
      const viewportWidth = 2.4;
      const viewportHeight = viewportWidth * (height / width);
      const imageHeight = Math.min(viewportHeight * 0.84, viewportWidth * 0.79 * portraitAspect);
      const imageWidth = imageHeight / portraitAspect;

      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      camera.left = -viewportWidth / 2;
      camera.right = viewportWidth / 2;
      camera.top = viewportHeight / 2;
      camera.bottom = -viewportHeight / 2;
      camera.updateProjectionMatrix();
      material.uniforms.uPixelRatio.value = pixelRatio;
      material.uniforms.uPortraitScale.value.set(imageWidth, imageHeight);
      updateDrawRange();
      render();
    };

    const requestFrame = () => {
      if (frameRequested || reducedMotion || !canRender()) return;
      frameRequested = true;
      frame = window.requestAnimationFrame(draw);
    };

    const draw = (time: number) => {
      frameRequested = false;
      if (!canRender() || reducedMotion) return;

      const frameInterval = pointerStrength > 0.025 || pulseStartedAt !== null ? 1000 / 60 : finePointer ? 1000 / 30 : 1000 / 24;
      if (time - lastFrame < frameInterval - 1) {
        requestFrame();
        return;
      }

      const delta = Math.min((time - lastFrame) / 16.67 || 1, 3);
      lastFrame = time;
      pointerStrength += (pointerTarget - pointerStrength) * Math.min(1, 0.12 * delta);

      material.uniforms.uTime.value = time * 0.001;
      material.uniforms.uPointerStrength.value = pointerStrength;

      if (pulseStartedAt !== null) {
        const progress = Math.min((time - pulseStartedAt) / pulseDuration, 1);
        material.uniforms.uPulseProgress.value = progress;
        material.uniforms.uPulse.value = Math.sin(progress * Math.PI);
        if (progress >= 1) {
          pulseStartedAt = null;
          material.uniforms.uPulse.value = 0;
        }
      }

      render();
      requestFrame();
    };

    const ignite = () => {
      if (reducedMotion || !canRender()) return;

      const pointer = material.uniforms.uPointer.value as THREE.Vector2;
      const origin = material.uniforms.uPulseOrigin.value as THREE.Vector2;
      origin.copy(pointerStrength > 0.08 ? pointer : new THREE.Vector2(0, -0.04));
      material.uniforms.uPulseProgress.value = 0;
      material.uniforms.uPulse.value = 1;
      pulseStartedAt = performance.now();
      requestFrame();
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!finePointer) return;

      const bounds = canvas.getBoundingClientRect();
      const pointer = material.uniforms.uPointer.value as THREE.Vector2;
      const viewportWidth = camera.right - camera.left;
      const viewportHeight = camera.top - camera.bottom;
      pointer.set(
        ((event.clientX - bounds.left) / bounds.width - 0.5) * viewportWidth,
        (0.5 - (event.clientY - bounds.top) / bounds.height) * viewportHeight
      );
      pointerTarget = 1;
      requestFrame();
    };

    const handlePointerLeave = () => {
      pointerTarget = 0;
      requestFrame();
    };

    const handleVisibility = () => {
      lastFrame = performance.now();
      if (document.hidden) {
        window.cancelAnimationFrame(frame);
        frameRequested = false;
      } else {
        render();
        requestFrame();
      }
    };

    const handleReducedMotionChange = () => {
      reducedMotion = reducedMotionMedia.matches;
      material.uniforms.uMotion.value = reducedMotion ? 0 : 1;
      if (reducedMotion) {
        pointerStrength = 0;
        pointerTarget = 0;
        pulseStartedAt = null;
        material.uniforms.uPointerStrength.value = 0;
        material.uniforms.uPulse.value = 0;
        material.uniforms.uPulseProgress.value = 0;
        window.cancelAnimationFrame(frame);
        frameRequested = false;
        render();
      } else {
        lastFrame = performance.now();
        requestFrame();
      }
    };

    const handleFinePointerChange = () => {
      finePointer = finePointerMedia.matches;
      if (!finePointer) {
        pointerTarget = 0;
      }
      resize();
      requestFrame();
    };

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      contextLost = true;
      window.cancelAnimationFrame(frame);
      frameRequested = false;
      setLoadState("unavailable");
    };

    const resizeObserver = new ResizeObserver(resize);
    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        inViewport = entry.isIntersecting;
        lastFrame = performance.now();
        if (inViewport) {
          render();
          requestFrame();
        } else {
          window.cancelAnimationFrame(frame);
          frameRequested = false;
        }
      },
      { threshold: 0.01 }
    );

    resizeObserver.observe(host);
    intersectionObserver.observe(host);
    host.addEventListener("pointermove", handlePointerMove, { passive: true });
    host.addEventListener("pointerleave", handlePointerLeave);
    canvas.addEventListener("webglcontextlost", handleContextLost, false);
    document.addEventListener("visibilitychange", handleVisibility);
    reducedMotionMedia.addEventListener("change", handleReducedMotionChange);
    finePointerMedia.addEventListener("change", handleFinePointerChange);
    igniteRef.current = ignite;
    resize();
    setLoadState("ready");
    requestFrame();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      host.removeEventListener("pointermove", handlePointerMove);
      host.removeEventListener("pointerleave", handlePointerLeave);
      canvas.removeEventListener("webglcontextlost", handleContextLost, false);
      document.removeEventListener("visibilitychange", handleVisibility);
      reducedMotionMedia.removeEventListener("change", handleReducedMotionChange);
      finePointerMedia.removeEventListener("change", handleFinePointerChange);
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
      <span className="portrait-loading" aria-hidden="true">POINT CLOUD / INITIALIZING</span>
      <span className="portrait-unavailable" role="status">PARTICLE PORTRAIT UNAVAILABLE</span>
      <canvas ref={canvasRef} className="portrait-particle-canvas" aria-hidden="true" />
    </div>
  );
}
