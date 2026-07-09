"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hue: number;
  drift: number;
};

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pulseRef = useRef(0);
  const pulseTimerRef = useRef<number | null>(null);
  const [isPulsing, setIsPulsing] = useState(false);
  const [signalState, setSignalState] = useState("LIVE // SYNCHRONIZED");
  const [clock, setClock] = useState("--:--:--");

  useEffect(() => {
    const updateClock = () => {
      setClock(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Shanghai",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(new Date()),
      );
    };

    updateClock();
    const interval = window.setInterval(updateClock, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) return;

    let width = 0;
    let height = 0;
    let animationFrame = 0;
    let previousTime = 0;
    let isRunning = false;
    const pointer = { x: -1000, y: -1000, active: false };
    const particles: Particle[] = [];
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const seedParticles = () => {
      particles.length = 0;
      const count = Math.min(112, Math.max(48, Math.round(width / 14)));

      for (let index = 0; index < count; index += 1) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.34,
          vy: (Math.random() - 0.5) * 0.34,
          radius: Math.random() * 1.45 + 0.3,
          hue: Math.random() > 0.58 ? 321 : 182,
          drift: Math.random() * Math.PI * 2,
        });
      }
    };

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      seedParticles();
    };

    const draw = (time: number) => {
      const delta = Math.min((time - previousTime) / 16.67 || 1, 2.5);
      previousTime = time;
      const energy = pulseRef.current;
      pulseRef.current = Math.max(0, energy - 0.014 * delta);

      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = "lighter";

      for (const particle of particles) {
        const drift = Math.sin(time * 0.00045 + particle.drift) * 0.003;
        particle.vx += drift;
        particle.vy += Math.cos(time * 0.00034 + particle.drift) * 0.002;

        if (pointer.active) {
          const dx = pointer.x - particle.x;
          const dy = pointer.y - particle.y;
          const distance = Math.hypot(dx, dy);

          if (distance < 220) {
            const force = ((220 - distance) / 220) * (0.13 + energy * 0.28);
            particle.vx -= (dx / (distance || 1)) * force;
            particle.vy -= (dy / (distance || 1)) * force;
          }
        }

        particle.x += particle.vx * delta * (1 + energy * 1.6);
        particle.y += particle.vy * delta * (1 + energy * 1.6);
        particle.vx *= 0.988;
        particle.vy *= 0.988;

        if (particle.x < -12) particle.x = width + 12;
        if (particle.x > width + 12) particle.x = -12;
        if (particle.y < -12) particle.y = height + 12;
        if (particle.y > height + 12) particle.y = -12;

        context.beginPath();
        context.fillStyle = `hsla(${particle.hue}, 100%, 76%, ${0.18 + particle.radius / 4})`;
        context.arc(particle.x, particle.y, particle.radius + energy * 0.7, 0, Math.PI * 2);
        context.fill();
      }

      const maxDistance = 128 + energy * 52;
      const maxDistanceSquared = maxDistance * maxDistance;
      for (let first = 0; first < particles.length; first += 1) {
        for (let second = first + 1; second < particles.length; second += 1) {
          const dx = particles[first].x - particles[second].x;
          const dy = particles[first].y - particles[second].y;
          const distanceSquared = dx * dx + dy * dy;

          if (distanceSquared < maxDistanceSquared) {
            const opacity = (1 - distanceSquared / maxDistanceSquared) * (0.085 + energy * 0.13);
            context.beginPath();
            context.strokeStyle = `rgba(${particles[first].hue === 321 ? "255, 61, 173" : "53, 246, 228"}, ${opacity})`;
            context.lineWidth = 0.55;
            context.moveTo(particles[first].x, particles[first].y);
            context.lineTo(particles[second].x, particles[second].y);
            context.stroke();
          }
        }
      }

      context.globalCompositeOperation = "source-over";

      if (!prefersReducedMotion && isRunning) {
        animationFrame = window.requestAnimationFrame(draw);
      }
    };

    const start = () => {
      if (isRunning || document.hidden) return;
      isRunning = true;
      previousTime = performance.now();
      animationFrame = window.requestAnimationFrame(draw);
    };

    const stop = () => {
      isRunning = false;
      window.cancelAnimationFrame(animationFrame);
    };

    const handlePointerMove = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
    };

    const handlePointerLeave = () => {
      pointer.active = false;
    };

    const handleVisibility = () => {
      if (document.hidden) {
        stop();
      } else if (!prefersReducedMotion) {
        start();
      }
    };

    resize();
    draw(performance.now());
    if (!prefersReducedMotion) start();

    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("blur", handlePointerLeave);
    document.addEventListener("mouseleave", handlePointerLeave);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stop();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("blur", handlePointerLeave);
      document.removeEventListener("mouseleave", handlePointerLeave);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const triggerPulse = useCallback(() => {
    pulseRef.current = 1;
    setIsPulsing(true);
    setSignalState("SIGNAL // AMPLIFIED");

    if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
    pulseTimerRef.current = window.setTimeout(() => {
      setIsPulsing(false);
      setSignalState("LIVE // SYNCHRONIZED");
    }, 960);
  }, []);

  const tiltPortrait = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    const target = event.currentTarget;
    const bounds = target.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    target.style.setProperty("--rotate-y", `${(x - 0.5) * 10}deg`);
    target.style.setProperty("--rotate-x", `${(0.5 - y) * 9}deg`);
    target.style.setProperty("--light-x", `${x * 100}%`);
    target.style.setProperty("--light-y", `${y * 100}%`);
  };

  const resetPortrait = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    target.style.setProperty("--rotate-y", "0deg");
    target.style.setProperty("--rotate-x", "0deg");
    target.style.setProperty("--light-x", "50%");
    target.style.setProperty("--light-y", "50%");
  };

  return (
    <main className={`site-shell${isPulsing ? " is-pulsing" : ""}`}>
      <canvas ref={canvasRef} className="particle-field" aria-hidden="true" />
      <div className="ambient ambient-cyan" aria-hidden="true" />
      <div className="ambient ambient-magenta" aria-hidden="true" />
      <div className="scanlines" aria-hidden="true" />
      <a className="skip-link" href="#signal">
        跳至主要内容
      </a>

      <header className="topbar">
        <a className="wordmark" href="#top" aria-label="回到 0xaa.xyz 首页">
          <span className="wordmark-bracket" aria-hidden="true">
            [
          </span>
          0xaa<span className="wordmark-dot">.xyz</span>
          <span className="wordmark-bracket" aria-hidden="true">
            ]
          </span>
        </a>

        <nav className="topnav" aria-label="页面导航">
          <a href="#signal">SIGNAL</a>
          <a href="#transmission">CHANNEL</a>
        </nav>

        <div className="connection-state" aria-label="站点在线">
          <span className="status-dot" aria-hidden="true" />
          <span>ONLINE</span>
        </div>
      </header>

      <section className="hero" id="top" aria-labelledby="hero-heading">
        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="eyebrow-mark" aria-hidden="true" />
              PERSONAL SIGNAL / 00
            </p>
            <h1 id="hero-heading">
              <span>0x</span>
              <span className="glitch-word" data-text="AA">
                AA
              </span>
            </h1>
            <p className="hero-statement">
              A SIGNAL FROM THE EDGE
              <br />
              OF THE NETWORK.
            </p>
            <p className="hero-intro">
              从网络边缘发出的个人信号。把灵感编译成界面，把噪声折叠成信号。
            </p>
            <div className="hero-actions">
              <a className="button button-primary" href="#signal">
                <span>向下解码</span>
                <span aria-hidden="true">↘</span>
              </a>
              <button className="button button-ghost" type="button" onClick={triggerPulse}>
                <span className="button-spark" aria-hidden="true">
                  ✦
                </span>
                释放粒子
              </button>
            </div>
          </div>

          <div className="portrait-column">
            <div
              className="portrait-stage"
              onPointerMove={tiltPortrait}
              onPointerLeave={resetPortrait}
            >
              <span className="orbit orbit-one" aria-hidden="true" />
              <span className="orbit orbit-two" aria-hidden="true" />
              <span className="portrait-coordinate coordinate-one" aria-hidden="true">
                31°14′ / 121°28′
              </span>
              <span className="portrait-coordinate coordinate-two" aria-hidden="true">
                NODE_0XAA
              </span>
              <div className="portrait-shell">
                <span className="portrait-glitch portrait-cyan" aria-hidden="true" />
                <span className="portrait-glitch portrait-pink" aria-hidden="true" />
                <div className="portrait-screen">
                  <img src="/0xaa.png" alt="0xaa 的黑白像素风头像" />
                  <span className="portrait-scan" aria-hidden="true" />
                  <span className="portrait-shine" aria-hidden="true" />
                </div>
                <span className="frame-corner corner-top-left" aria-hidden="true" />
                <span className="frame-corner corner-bottom-right" aria-hidden="true" />
              </div>
              <div className="portrait-chip">
                <span className="chip-dot" aria-hidden="true" />
                IDENTITY // VERIFIED
              </div>
            </div>
          </div>
        </div>

        <div className="hero-rail" aria-label="当前系统状态">
          <div className="rail-item">
            <span>STATUS</span>
            <strong>{signalState}</strong>
          </div>
          <div className="rail-item rail-item-center">
            <span>LOCATION</span>
            <strong>CN / UTC+08</strong>
          </div>
          <div className="rail-item rail-item-right">
            <span>LOCAL TIME</span>
            <strong>{clock}</strong>
          </div>
          <span className="scroll-cue" aria-hidden="true">
            SCROLL TO DECODE <i>↓</i>
          </span>
        </div>
      </section>

      <section className="signal-section" id="signal" aria-labelledby="signal-heading">
        <div className="section-tag">
          <span>01</span>
          <span>DECODED SIGNAL</span>
        </div>
        <div className="signal-layout">
          <div>
            <p className="kicker">MANIFESTO / 正在发生</p>
            <h2 id="signal-heading">
              BUILT FROM
              <br />
              <em>STATIC.</em>
            </h2>
          </div>
          <div className="signal-copy">
            <p>
              这里记录实验、作品，以及那些还没有被定义的好奇心。不是档案馆，而是一台持续接收、不断重组的个人终端。
            </p>
            <p className="signal-copy-en">
              I compile sparks into interfaces and fold noise into signal. A place for work, experiments, and untimely curiosity.
            </p>
          </div>
        </div>

        <div className="protocol-grid">
          <article className="protocol-card protocol-card-cyan">
            <span className="protocol-number">/ 01</span>
            <h3>CODE</h3>
            <p>把模糊的念头写成可运行的东西。</p>
            <span className="protocol-mark" aria-hidden="true">
              &lt;/&gt;
            </span>
          </article>
          <article className="protocol-card protocol-card-magenta">
            <span className="protocol-number">/ 02</span>
            <h3>NOISE</h3>
            <p>在噪声里保留偏执、直觉与不合时宜。</p>
            <span className="protocol-mark" aria-hidden="true">
              ~~~
            </span>
          </article>
          <article className="protocol-card protocol-card-neutral">
            <span className="protocol-number">/ 03</span>
            <h3>SIGNAL</h3>
            <p>让值得被看见的东西穿过屏幕抵达你。</p>
            <span className="protocol-mark" aria-hidden="true">
              0x
            </span>
          </article>
        </div>
      </section>

      <section className="transmission-section" id="transmission" aria-labelledby="transmission-heading">
        <div className="transmission-panel">
          <div className="transmission-topline">
            <span>INCOMING TRANSMISSION</span>
            <span>CHANNEL / 01</span>
          </div>
          <div className="transmission-body">
            <p className="transmission-index">001</p>
            <div>
              <p className="kicker">OPEN A CHANNEL</p>
              <h2 id="transmission-heading">LET&apos;S MAKE<br />SOME NOISE.</h2>
              <p>
                频道已开启。新的作品、想法与连接正在路上。
              </p>
            </div>
            <button className="transmission-button" type="button" onClick={triggerPulse}>
              PING THE NODE <span aria-hidden="true">↗</span>
            </button>
          </div>
          <div className="transmission-wave" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
      </section>

      <footer className="footer">
        <span>© 0xAA / PERSONAL NODE</span>
        <button type="button" onClick={triggerPulse}>
          REBOOT SIGNAL <span aria-hidden="true">↺</span>
        </button>
        <span>NO TRACKERS. JUST STATIC.</span>
      </footer>
    </main>
  );
}
