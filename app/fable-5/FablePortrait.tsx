"use client";

import * as THREE from "three";
import { useEffect, useRef } from "react";
import pointCloudMetaData from "../generated/portrait-points.meta.json";

// The Fable portrait reuses the precomputed 0xAA point-cloud binaries that the
// Terra page ships, but renders them as golden ink dust: points scatter in
// from a loose sphere, breathe, and tilt in 3D with the pointer. Clicking the
// portrait scatters the ink and lets it gather again.

type PointCloudChannel = { min: number; range: number };

type PointCloudMeta = {
  version: number;
  stride: number;
  aspectRatio: number;
  lod: { mobile: number; desktop: number };
  count: number;
  channels: PointCloudChannel[];
  bin: string;
  mobileBin?: string;
};

const meta = pointCloudMetaData as PointCloudMeta;
const QUANTIZED_MAX = 65535;
const PORTRAIT_HEIGHT = 2.5;
const DEPTH_SPREAD = 3.1;
const PIXEL_RATIO_CAP = 1.25;
const MOBILE_PIXEL_RATIO_CAP = 1;
const REVEAL_SECONDS = 2.2;

const metaUsable =
  meta.version === 2 &&
  meta.stride === 7 &&
  Number.isFinite(meta.aspectRatio) &&
  meta.aspectRatio > 0 &&
  Array.isArray(meta.channels) &&
  meta.channels.length === meta.stride &&
  typeof meta.bin === "string" &&
  meta.bin.length > 0;

const dequantize = (buffer: ArrayBuffer, pointCount: number): Float32Array | null => {
  const expectedBytes = pointCount * meta.stride * Uint16Array.BYTES_PER_ELEMENT;
  if (buffer.byteLength < expectedBytes) return null;
  const view = new DataView(buffer);
  const values = new Float32Array(pointCount * meta.stride);
  for (let index = 0; index < values.length; index += 1) {
    const channel = index % meta.stride;
    const { min, range } = meta.channels[channel];
    values[index] = min + (view.getUint16(index * 2, true) / QUANTIZED_MAX) * range;
  }
  return values;
};

const vertexShader = `
  attribute float aSize;
  attribute float aOpacity;
  attribute float aLight;
  attribute float aPhase;
  attribute vec3 aScatter;

  uniform float uTime;
  uniform float uReveal;
  uniform float uMotion;
  uniform float uPixelRatio;
  uniform float uPointScale;
  uniform vec2 uTilt;

  varying float vOpacity;
  varying float vLight;
  varying float vDepth;

  void main() {
    float stagger = fract(aPhase * 0.159154943);
    float reveal = clamp((uReveal - stagger * 0.55) / 0.45, 0.0, 1.0);
    float eased = 1.0 - pow(1.0 - reveal, 3.0);

    vec3 target = position;
    target.x += sin(uTime * 0.8 + aPhase) * 0.006 * uMotion;
    target.y += cos(uTime * 0.7 + aPhase * 1.7) * 0.006 * uMotion;
    vec3 transformed = mix(aScatter, target, eased);

    float tiltY = uTilt.x * 0.42 * uMotion;
    float tiltX = uTilt.y * 0.26 * uMotion;
    float cosY = cos(tiltY);
    float sinY = sin(tiltY);
    transformed = vec3(
      transformed.x * cosY + transformed.z * sinY,
      transformed.y,
      -transformed.x * sinY + transformed.z * cosY
    );
    float cosX = cos(tiltX);
    float sinX = sin(tiltX);
    transformed = vec3(
      transformed.x,
      transformed.y * cosX - transformed.z * sinX,
      transformed.y * sinX + transformed.z * cosX
    );

    vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
    gl_PointSize = max(aSize * uPointScale * uPixelRatio * (3.4 / -mvPosition.z), 0.65);
    gl_Position = projectionMatrix * mvPosition;

    vOpacity = aOpacity * (0.15 + 0.85 * eased);
    vLight = aLight;
    vDepth = transformed.z;
  }
`;

const fragmentShader = `
  varying float vOpacity;
  varying float vLight;
  varying float vDepth;

  void main() {
    vec2 offset = gl_PointCoord - vec2(0.5);
    float mask = smoothstep(0.5, 0.12, length(offset));
    if (mask <= 0.0) discard;

    vec3 shadowInk = vec3(0.28, 0.19, 0.10);
    vec3 gold = vec3(0.95, 0.78, 0.49);
    vec3 cream = vec3(1.0, 0.95, 0.85);
    vec3 color = mix(shadowInk, gold, vLight);
    color = mix(color, cream, smoothstep(0.75, 1.0, vLight) * 0.7);
    color = mix(color, vec3(0.49, 0.91, 0.85), smoothstep(0.09, 0.22, vDepth) * 0.18);

    gl_FragColor = vec4(color, vOpacity * mask);
  }
`;

const isCoarsePointerDevice = () =>
  window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(pointer: fine)").matches;

export default function FablePortrait({ label }: { label: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const revealTargetRef = useRef(1);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas || !metaUsable) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const compact = isCoarsePointerDevice();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: false,
        powerPreference: "low-power",
      });
    } catch {
      return;
    }
    renderer.setClearColor(0x000000, 0);
    const pixelRatioCap = compact ? MOBILE_PIXEL_RATIO_CAP : PIXEL_RATIO_CAP;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 30);
    camera.position.set(0, 0, 4.4);

    const geometry = new THREE.BufferGeometry();
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uReveal: { value: 0 },
        uMotion: { value: reducedMotion ? 0 : 1 },
        uPixelRatio: { value: 1 },
        uPointScale: { value: compact ? 1.35 : 1.7 },
        uTilt: { value: new THREE.Vector2(0, 0) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    scene.add(points);

    let disposed = false;
    let frame: number | null = null;
    let startedAt: number | null = null;
    let reveal = reducedMotion ? 1 : 0;
    const tilt = new THREE.Vector2(0, 0);
    const tiltTarget = new THREE.Vector2(0, 0);
    const abortController = new AbortController();

    const resize = () => {
      const width = container.clientWidth || 1;
      const height = container.clientHeight || 1;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioCap));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      (material.uniforms.uPixelRatio as { value: number }).value = renderer.getPixelRatio();
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    const buildGeometry = (values: Float32Array, pointCount: number) => {
      const width = PORTRAIT_HEIGHT * meta.aspectRatio;
      const positions = new Float32Array(pointCount * 3);
      const scatters = new Float32Array(pointCount * 3);
      const sizes = new Float32Array(pointCount);
      const opacities = new Float32Array(pointCount);
      const lights = new Float32Array(pointCount);
      const phases = new Float32Array(pointCount);

      for (let index = 0; index < pointCount; index += 1) {
        const base = index * meta.stride;
        const x = (values[base] - 0.5) * width;
        const y = (0.5 - values[base + 1]) * PORTRAIT_HEIGHT;
        const z = values[base + 2] * DEPTH_SPREAD;
        positions[index * 3] = x;
        positions[index * 3 + 1] = y;
        positions[index * 3 + 2] = z;

        const phase = values[base + 6];
        const theta = phase * 7.13 + index * 0.618;
        const radius = 2.6 + Math.sin(phase * 3.7 + index) * 1.4;
        scatters[index * 3] = Math.cos(theta) * radius;
        scatters[index * 3 + 1] = Math.sin(theta * 1.3) * radius * 0.7;
        scatters[index * 3 + 2] = Math.sin(theta) * 1.8 - 0.6;

        sizes[index] = values[base + 3];
        opacities[index] = values[base + 4];
        lights[index] = values[base + 5];
        phases[index] = phase;
      }

      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("aScatter", new THREE.BufferAttribute(scatters, 3));
      geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
      geometry.setAttribute("aOpacity", new THREE.BufferAttribute(opacities, 1));
      geometry.setAttribute("aLight", new THREE.BufferAttribute(lights, 1));
      geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
      geometry.setDrawRange(0, pointCount);
    };

    const loop = (timestamp: number) => {
      if (disposed) return;
      frame = window.requestAnimationFrame(loop);
      if (startedAt === null) startedAt = timestamp;
      const elapsed = (timestamp - startedAt) / 1000;

      if (!reducedMotion) {
        const target = revealTargetRef.current;
        const pace = target > reveal ? 1 / REVEAL_SECONDS : 1 / 0.45;
        reveal += Math.sign(target - reveal) * Math.min(Math.abs(target - reveal), pace / 60);
        // Once fully scattered, let the ink gather again.
        if (revealTargetRef.current === 0 && reveal <= 0.01) revealTargetRef.current = 1;
      }

      tilt.lerp(tiltTarget, 0.06);
      (material.uniforms.uTime as { value: number }).value = elapsed;
      (material.uniforms.uReveal as { value: number }).value = reveal;
      (material.uniforms.uTilt as { value: THREE.Vector2 }).value.copy(tilt);
      renderer.render(scene, camera);
    };

    const loadPoints = async () => {
      const useMobile = compact && typeof meta.mobileBin === "string" && meta.mobileBin.length > 0;
      const asset = useMobile ? (meta.mobileBin as string) : meta.bin;
      const pointCount = useMobile ? meta.lod.mobile : meta.lod.desktop;
      try {
        const response = await fetch(asset, { signal: abortController.signal });
        if (!response.ok) return;
        const buffer = await response.arrayBuffer();
        if (disposed) return;
        const values = dequantize(buffer, pointCount);
        if (!values) return;
        buildGeometry(values, pointCount);
        container.dataset.portraitReady = "true";
        frame = window.requestAnimationFrame(loop);
      } catch {
        // Fetch aborted or failed — the hero simply keeps its ambient styling.
      }
    };
    void loadPoints();

    const onPointerMove = (event: PointerEvent) => {
      if (reducedMotion) return;
      tiltTarget.set(
        (event.clientX / window.innerWidth) * 2 - 1,
        (event.clientY / window.innerHeight) * 2 - 1,
      );
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    const onClick = () => {
      if (reducedMotion) return;
      revealTargetRef.current = 0;
    };
    container.addEventListener("click", onClick);

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (frame !== null) window.cancelAnimationFrame(frame);
        frame = null;
      } else if (frame === null && geometry.getAttribute("position")) {
        startedAt = null;
        frame = window.requestAnimationFrame(loop);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      disposed = true;
      abortController.abort();
      if (frame !== null) window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("click", onClick);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    };
  }, []);

  return (
    <div ref={containerRef} className="fable-portrait" role="img" aria-label={label}>
      <canvas ref={canvasRef} className="fable-portrait-canvas" />
    </div>
  );
}
