"use client";

import * as THREE from "three";
import { useEffect, useRef, useState } from "react";
import pointCloudMetaData from "./generated/portrait-points.meta.json";

type PointCloudChannel = {
  min: number;
  range: number;
};

type PointCloudMeta = {
  version: number;
  stride: number;
  aspectRatio: number;
  lod: {
    mobile: number;
    desktop: number;
  };
  count: number;
  sourceHash: string;
  channels: PointCloudChannel[];
  bin: string;
};

type ParticlePortraitProps = {
  pulseSequence: number;
};

const fallbackAspectRatio = 400 / 352;
const pointCloudMeta = pointCloudMetaData as PointCloudMeta;
const QUANTIZED_MAX = 65535;

const isUsablePointCloudMeta = (meta: PointCloudMeta) =>
  meta.version === 2 &&
  meta.stride === 7 &&
  Number.isFinite(meta.aspectRatio) &&
  meta.aspectRatio > 0 &&
  Number.isInteger(meta.lod.mobile) &&
  Number.isInteger(meta.lod.desktop) &&
  meta.lod.mobile > 0 &&
  meta.lod.desktop >= meta.lod.mobile &&
  Number.isInteger(meta.count) &&
  meta.count >= meta.lod.desktop &&
  typeof meta.bin === "string" &&
  meta.bin.length > 0 &&
  Array.isArray(meta.channels) &&
  meta.channels.length === meta.stride &&
  meta.channels.every(
    (channel) => Number.isFinite(channel.min) && Number.isFinite(channel.range) && channel.range > 0,
  );

const hasUsablePointCloudMeta = isUsablePointCloudMeta(pointCloudMeta);

// Dequantizes the fetched Uint16 binary buffer into a flat Float32Array of
// `count * stride` values, applying each channel's stored min/range.
const dequantizePoints = (buffer: ArrayBuffer, meta: PointCloudMeta): Float32Array | null => {
  const quantized = new Uint16Array(buffer);
  const expectedLength = meta.count * meta.stride;
  if (quantized.length < expectedLength) return null;

  const values = new Float32Array(expectedLength);
  for (let index = 0; index < expectedLength; index += 1) {
    const channel = index % meta.stride;
    const { min, range } = meta.channels[channel];
    values[index] = min + (quantized[index] / QUANTIZED_MAX) * range;
  }

  return values.every(Number.isFinite) ? values : null;
};

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
  varying float vSeed;
  varying float vAnchor;

  void main() {
    vec3 base = vec3(position.xy * uPortraitScale, position.z);
    float phase = aPhase * 6.28318530718;
    float sourceTone = clamp(color.r, 0.0, 1.0);
    float structuralEnergy = smoothstep(0.68, 1.95, aSize) * (0.45 + sourceTone * 0.55);
    float tierSeed = fract(aPhase * 17.231);
    float midTier = step(0.56, tierSeed) * (1.0 - step(0.86, tierSeed));
    float anchorTier = step(0.92, tierSeed) * smoothstep(0.20, 0.88, structuralEnergy);
    float structuralResponse = max(midTier * 0.82, anchorTier);
    float motionResponse = mix(0.34, 1.0, structuralResponse);

    vec2 idle = vec2(
      sin(uTime * 0.58 + phase),
      cos(uTime * 0.43 + phase * 0.75)
    ) * mix(0.00024, 0.00155, aOpacity) * motionResponse * uMotion;
    float idleDepth = sin(uTime * 0.62 + phase * 1.37) * 0.0028 * aOpacity * motionResponse * uMotion;

    vec2 pointerDelta = base.xy - uPointer;
    float pointerDistance = max(length(pointerDelta), 0.0001);
    vec2 pointerRadial = pointerDelta / pointerDistance;
    vec2 pointerTangent = vec2(-pointerRadial.y, pointerRadial.x);
    float pointerInfluence = (1.0 - smoothstep(0.0, 0.34, pointerDistance)) * uPointerStrength;
    vec2 pointerField = (pointerRadial * 0.026 + pointerTangent * 0.011) * pointerInfluence * motionResponse;

    vec2 pulseDelta = base.xy - uPulseOrigin;
    float pulseDistance = max(length(pulseDelta), 0.0001);
    float pulseRadius = mix(0.0, 1.34, uPulseProgress);
    float pulseShell = (1.0 - smoothstep(0.0, 0.1, abs(pulseDistance - pulseRadius))) * uPulse;
    vec2 pulseField = (pulseDelta / pulseDistance) * pulseShell * 0.05 * motionResponse;

    float scanCenter = sin(uTime * 0.38) * 0.62;
    float scanner = 1.0 - smoothstep(0.0, 0.115, abs(base.y - scanCenter));
    vec3 displaced = base + vec3(idle + pointerField + pulseField, idleDepth + pulseShell * 0.026 * motionResponse);

    vec4 viewPosition = modelViewMatrix * vec4(displaced, 1.0);
    gl_Position = projectionMatrix * viewPosition;

    float shimmer = 0.93 + sin(uTime * 1.35 + phase * 1.91) * 0.07;
    float pointBoost = 1.0 + scanner * 0.12 * motionResponse + pointerInfluence * 0.18 * motionResponse + pulseShell * 0.34 * motionResponse;
    float microDiameter = aSize * uPixelRatio * (0.62 + sourceTone * 0.20);
    float midDiameter = microDiameter * (1.36 + structuralEnergy * 0.22);
    float anchorDiameter = microDiameter * (2.20 + structuralEnergy * 0.60);
    float pointDiameter = mix(microDiameter, midDiameter, midTier);
    pointDiameter = mix(pointDiameter, anchorDiameter, anchorTier);
    float tierOpacity = mix(0.58, 0.84, midTier);
    tierOpacity = mix(tierOpacity, 1.24, anchorTier);

    gl_PointSize = min(pointDiameter * pointBoost, 10.0);
    vColor = color + vec3((scanner * 0.06 + pointerInfluence * 0.05 + pulseShell * 0.09) * motionResponse + anchorTier * 0.09);
    vOpacity = min(1.0, aOpacity * shimmer * (0.78 + sourceTone * 0.20) * tierOpacity * (1.0 + scanner * 0.16 * motionResponse + pointerInfluence * 0.14 * motionResponse + pulseShell * 0.20 * motionResponse));
    vSeed = fract(aPhase * 67.231);
    vAnchor = anchorTier;
  }
`;

const fragmentShader = `
  varying vec3 vColor;
  varying float vOpacity;
  varying float vSeed;
  varying float vAnchor;

  void main() {
    vec2 pixel = gl_PointCoord - vec2(0.5);
    float circularDistance = length(pixel);
    float squareDistance = max(abs(pixel.x), abs(pixel.y));
    float squareMix = max(step(0.94, vSeed), vAnchor * 0.86);
    float particleDistance = mix(circularDistance, squareDistance, squareMix);
    float halo = 1.0 - smoothstep(mix(0.24, 0.31, vAnchor), 0.5, particleDistance);
    float core = 1.0 - smoothstep(0.0, mix(0.10, 0.14, vAnchor), particleDistance);
    float tone = clamp(vColor.r, 0.0, 1.0);
    float alpha = halo * vOpacity * mix(0.72, 1.0, pow(tone, 0.56));
    vec3 particleColor = mix(vec3(0.32), vec3(1.0), pow(tone, 0.58));

    gl_FragColor = vec4(particleColor + core * (0.04 + vAnchor * 0.08), alpha);
  }
`;

export default function ParticlePortrait({ pulseSequence }: ParticlePortraitProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const igniteRef = useRef<() => void>(() => undefined);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "unavailable">(() =>
    hasUsablePointCloudMeta ? "loading" : "unavailable",
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;

    if (!canvas || !host) return;

    if (!hasUsablePointCloudMeta) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: "high-performance"
      });
    } catch {
      const unavailableFrame = window.requestAnimationFrame(() => setLoadState("unavailable"));
      return () => window.cancelAnimationFrame(unavailableFrame);
    }

    const abortController = new AbortController();
    const reducedMotionMedia = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointerMedia = window.matchMedia("(hover: hover) and (pointer: fine)");
    let reducedMotion = reducedMotionMedia.matches;
    let finePointer = finePointerMedia.matches;
    let disposed = false;
    let dataLoaded = false;
    let contextLost = false;
    let inViewport = true;
    let frameRequested = false;
    let frame = 0;
    let stateFrame = 0;
    let lastFrame = performance.now();
    let pointerStrength = 0;
    let pointerTarget = 0;
    let pulseStartedAt: number | null = null;
    const pulseDuration = 920;
    const portraitAspect = pointCloudMeta.aspectRatio || fallbackAspectRatio;

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

    // The buffer attributes are allocated up front (their capacity is known
    // from the meta JSON) but left zero-filled until the quantized .bin
    // asset is fetched and dequantized below.
    const capacity = Math.min(pointCloudMeta.lod.desktop, pointCloudMeta.count);
    const positions = new Float32Array(capacity * 3);
    const colors = new Float32Array(capacity * 3);
    const sizes = new Float32Array(capacity);
    const opacities = new Float32Array(capacity);
    const phases = new Float32Array(capacity);

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("aOpacity", new THREE.BufferAttribute(opacities, 1));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    geometry.setDrawRange(0, 0);

    const canRender = () => !disposed && dataLoaded && !contextLost && inViewport && !document.hidden;

    const render = () => {
      if (!disposed && !contextLost) renderer.render(scene, camera);
    };

    const updateDrawRange = () => {
      const count = window.innerWidth < 620 ? pointCloudMeta.lod.mobile : capacity;
      geometry.setDrawRange(0, dataLoaded ? Math.min(count, capacity) : 0);
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

    // Fetch the quantized binary point cloud at runtime instead of bundling
    // it statically. sourceHash is embedded as a query string to bust caches
    // on redeploy since public/ assets aren't content-hashed on this stack.
    const binUrl = `${pointCloudMeta.bin}?v=${pointCloudMeta.sourceHash}`;
    fetch(binUrl, { signal: abortController.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to fetch point cloud asset (${response.status})`);
        return response.arrayBuffer();
      })
      .then((buffer) => {
        if (disposed) return;

        const values = dequantizePoints(buffer, pointCloudMeta);
        if (!values) throw new Error("Point cloud asset failed validation");

        for (let index = 0; index < capacity; index += 1) {
          const offset = index * pointCloudMeta.stride;
          const point = index * 3;
          positions[point] = values[offset] - 0.5;
          positions[point + 1] = 0.5 - values[offset + 1];
          positions[point + 2] = values[offset + 2];
          colors[point] = values[offset + 5];
          colors[point + 1] = values[offset + 5];
          colors[point + 2] = values[offset + 5];
          sizes[index] = values[offset + 3];
          opacities[index] = values[offset + 4];
          phases[index] = values[offset + 6];
        }

        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.color.needsUpdate = true;
        geometry.attributes.aSize.needsUpdate = true;
        geometry.attributes.aOpacity.needsUpdate = true;
        geometry.attributes.aPhase.needsUpdate = true;
        geometry.computeBoundingSphere();

        dataLoaded = true;
        updateDrawRange();
        render();
        requestFrame();
        stateFrame = window.requestAnimationFrame(() => {
          if (!disposed) setLoadState("ready");
        });
      })
      .catch((error: unknown) => {
        if (disposed || (error instanceof DOMException && error.name === "AbortError")) return;
        setLoadState("unavailable");
      });

    return () => {
      disposed = true;
      abortController.abort();
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(stateFrame);
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
