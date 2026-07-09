"use client";

import { useEffect, useRef, useState } from "react";

type ParticleSeed = {
  nx: number;
  ny: number;
  alpha: number;
  color: "paper" | "cyan" | "magenta";
  radius: number;
  phase: number;
};

type PortraitParticle = ParticleSeed & {
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

type ParticlePortraitProps = {
  pulseSequence: number;
};

const stableHash = (x: number, y: number) => {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return value - Math.floor(value);
};

export default function ParticlePortrait({ pulseSequence }: ParticlePortraitProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const igniteRef = useRef<() => void>(() => undefined);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const host = canvas.parentElement;
    const image = new Image();
    const sampleCanvas = document.createElement("canvas");
    const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });
    const seeds: ParticleSeed[] = [];
    const particles: PortraitParticle[] = [];
    const pointer = { x: -1000, y: -1000, active: false };
    let width = 0;
    let height = 0;
    let ratio = 1;
    let frame = 0;
    let previousTime = 0;
    let pulseEnergy = 0;
    let imageLoaded = false;
    let animationRequested = false;
    let isVisible = true;

    const colorMap = {
      paper: "244, 247, 251",
      cyan: "53, 246, 228",
      magenta: "255, 61, 173",
    };

    const draw = (time: number) => {
      animationRequested = false;
      if (!imageLoaded || !isVisible) return;

      const delta = Math.min((time - previousTime) / 16.67 || 1, 2.5);
      previousTime = time;
      pulseEnergy = Math.max(0, pulseEnergy - 0.02 * delta);

      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = "lighter";

      let motion = pulseEnergy;
      for (const particle of particles) {
        const spring = reducedMotion ? 0.17 : 0.045;
        particle.vx += (particle.homeX - particle.x) * spring;
        particle.vy += (particle.homeY - particle.y) * spring;

        if (pointer.active && !reducedMotion) {
          const dx = particle.x - pointer.x;
          const dy = particle.y - pointer.y;
          const distance = Math.hypot(dx, dy);

          if (distance < 96) {
            const force = ((96 - distance) / 96) * 0.58;
            particle.vx += (dx / (distance || 1)) * force;
            particle.vy += (dy / (distance || 1)) * force;
          }
        }

        particle.vx += Math.sin(time * 0.0012 + particle.phase) * 0.0018;
        particle.vy += Math.cos(time * 0.0011 + particle.phase) * 0.0012;
        particle.x += particle.vx * delta;
        particle.y += particle.vy * delta;
        particle.vx *= reducedMotion ? 0.56 : 0.87;
        particle.vy *= reducedMotion ? 0.56 : 0.87;
        motion += Math.abs(particle.vx) + Math.abs(particle.vy);

        const glow = pulseEnergy * 0.55;
        context.fillStyle = `rgba(${colorMap[particle.color]}, ${Math.min(1, particle.alpha + glow)})`;
        context.fillRect(
          particle.x,
          particle.y,
          particle.radius + pulseEnergy * 0.78,
          particle.radius + pulseEnergy * 0.78,
        );
      }

      context.globalCompositeOperation = "source-over";

      if (!reducedMotion && (pointer.active || pulseEnergy > 0.015 || motion > 2.8)) {
        requestDraw();
      }
    };

    const requestDraw = () => {
      if (animationRequested || reducedMotion || !isVisible) return;
      animationRequested = true;
      frame = window.requestAnimationFrame(draw);
    };

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      for (const particle of particles) {
        particle.homeX = particle.nx * width;
        particle.homeY = particle.ny * height;
        particle.x = particle.homeX;
        particle.y = particle.homeY;
        particle.vx = 0;
        particle.vy = 0;
      }

      if (imageLoaded) draw(performance.now());
    };

    const buildPortrait = () => {
      if (!sampleContext || imageLoaded) return;

      const sampleSize = 136;
      sampleCanvas.width = sampleSize;
      sampleCanvas.height = sampleSize;
      // Crop the plain outer margin so the particle portrait resolves to the character, not a square field.
      sampleContext.drawImage(image, 24, 0, 352, 400, 0, 0, sampleSize, sampleSize);
      const imageData = sampleContext.getImageData(0, 0, sampleSize, sampleSize).data;
      const step = window.innerWidth < 620 ? 3 : 2;
      const maximum = window.innerWidth < 620 ? 430 : 880;
      seeds.length = 0;

      outer: for (let y = 1; y < sampleSize - 1; y += step) {
        for (let x = 1; x < sampleSize - 1; x += step) {
          const pixel = (y * sampleSize + x) * 4;
          const right = (y * sampleSize + x + 1) * 4;
          const below = ((y + 1) * sampleSize + x) * 4;
          const luminance =
            (0.2126 * imageData[pixel] + 0.7152 * imageData[pixel + 1] + 0.0722 * imageData[pixel + 2]) /
            255;
          const rightLuminance =
            (0.2126 * imageData[right] + 0.7152 * imageData[right + 1] + 0.0722 * imageData[right + 2]) /
            255;
          const belowLuminance =
            (0.2126 * imageData[below] + 0.7152 * imageData[below + 1] + 0.0722 * imageData[below + 2]) /
            255;
          const edge = Math.min(1, (Math.abs(luminance - rightLuminance) + Math.abs(luminance - belowLuminance)) * 1.6);
          const brightMatter = luminance > 0.9 ? (luminance - 0.89) * 1.8 : 0;
          const density = Math.max(edge * 0.9, brightMatter * 0.34);
          const seed = stableHash(x, y);

          if (density < 0.1 || seed > density) continue;

          const isEdge = edge > 0.24;
          const color = isEdge ? (seed > 0.5 ? "cyan" : "magenta") : "paper";
          seeds.push({
            nx: (x + 0.5 + (seed - 0.5) * 1.4) / sampleSize,
            ny: (y + 0.5 + (stableHash(y, x) - 0.5) * 1.4) / sampleSize,
            alpha: isEdge ? 0.72 + edge * 0.28 : 0.26 + brightMatter * 0.42,
            color,
            radius: isEdge ? 0.8 + seed * 0.8 : 0.55 + seed * 0.65,
            phase: seed * Math.PI * 2,
          });

          if (seeds.length >= maximum) break outer;
        }
      }

      particles.length = 0;
      for (const seed of seeds) {
        particles.push({
          ...seed,
          homeX: seed.nx * width,
          homeY: seed.ny * height,
          x: seed.nx * width,
          y: seed.ny * height,
          vx: 0,
          vy: 0,
        });
      }

      imageLoaded = true;
      setIsReady(true);
      draw(performance.now());
    };

    const ignite = () => {
      if (!imageLoaded || reducedMotion) return;
      pulseEnergy = 1;
      for (const particle of particles) {
        const dx = particle.x - width / 2;
        const dy = particle.y - height / 2;
        const distance = Math.hypot(dx, dy) || 1;
        const force = 1.1 + stableHash(particle.homeX, particle.homeY) * 2.4;
        particle.vx += (dx / distance) * force;
        particle.vy += (dy / distance) * force;
      }
      requestDraw();
    };

    const handlePointerMove = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      pointer.x = event.clientX - bounds.left;
      pointer.y = event.clientY - bounds.top;
      pointer.active = true;
      requestDraw();
    };

    const handlePointerLeave = () => {
      pointer.active = false;
      requestDraw();
    };

    const handleVisibility = () => {
      isVisible = !document.hidden;
      if (isVisible) {
        previousTime = performance.now();
        requestDraw();
      } else {
        window.cancelAnimationFrame(frame);
        animationRequested = false;
      }
    };

    const observer = new ResizeObserver(resize);
    if (host) observer.observe(host);
    resize();
    host?.addEventListener("pointermove", handlePointerMove, { passive: true });
    host?.addEventListener("pointerleave", handlePointerLeave);
    document.addEventListener("visibilitychange", handleVisibility);
    igniteRef.current = ignite;
    image.addEventListener("load", buildPortrait, { once: true });
    image.src = "/0xaa.png";
    if (image.complete) buildPortrait();

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      host?.removeEventListener("pointermove", handlePointerMove);
      host?.removeEventListener("pointerleave", handlePointerLeave);
      document.removeEventListener("visibilitychange", handleVisibility);
      igniteRef.current = () => undefined;
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
