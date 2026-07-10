"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ParticlePortrait from "./ParticlePortrait";

const waveHeights = [18, 34, 22, 58, 28, 76, 42, 25, 63, 33, 89, 52, 30, 68, 24, 46, 82, 39, 20, 54, 32, 73, 28, 43, 62, 35, 84, 45, 26, 58, 31, 70, 38, 22, 49, 29];

export default function Home() {
  const pulseTimerRef = useRef<number | null>(null);
  const [isPulsing, setIsPulsing] = useState(false);
  const [pulseSequence, setPulseSequence] = useState(0);
  const [signalState, setSignalState] = useState("SYNCHRONIZED");
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

  useEffect(
    () => () => {
      if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
    },
    [],
  );

  const triggerPulse = useCallback(() => {
    setPulseSequence((sequence) => sequence + 1);
    setIsPulsing(true);
    setSignalState("AMPLIFIED");

    if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
    pulseTimerRef.current = window.setTimeout(() => {
      setIsPulsing(false);
      setSignalState("SYNCHRONIZED");
    }, 960);
  }, []);

  return (
    <main className={`signal-site${isPulsing ? " is-pulsing" : ""}`} id="top">
      <div className="site-grid" aria-hidden="true" />
      <div className="site-noise" aria-hidden="true" />
      <a className="skip-link" href="#signal">
        跳至主要内容
      </a>

      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="回到 0xaa.xyz 首页">
          0xaa.xyz
        </a>
        <nav className="site-nav" aria-label="页面导航">
          <a href="#signal">SIGNAL</a>
          <a href="#work">WORK</a>
          <a href="#channel">CHANNEL</a>
          <a href="https://github.com/amazingang" target="_blank" rel="noreferrer">
            GITHUB ↗
          </a>
          <a href="https://x.com/0xAA_Science" target="_blank" rel="noreferrer">
            X ↗
          </a>
        </nav>
        <p className="network-state" aria-label={`站点状态：${signalState}`}>
          <span aria-hidden="true" />
          ONLINE
        </p>
      </header>

      <section className="hero-console" aria-labelledby="hero-heading">
        <div className="hero-copy">
          <p className="console-label">
            <span aria-hidden="true" />
            NODE_00 / NEUROSCIENCE × WEB3
          </p>
          <h1 id="hero-heading">
            <span>0xAA</span>
          </h1>
          <div className="hero-rule" aria-hidden="true" />
          <p className="hero-signal-name">PERSONAL SIGNAL</p>
          <p className="hero-intro">Computational Neuroscience Ph.D.</p>
          <div className="hero-actions">
            <a className="signal-button signal-button-solid" href="#signal">
              EXPLORE SIGNAL <span aria-hidden="true">↘</span>
            </a>
            <button
              className="signal-button"
              type="button"
              onClick={triggerPulse}
              aria-pressed={isPulsing}
            >
              AMPLIFY NODE <span aria-hidden="true">✦</span>
            </button>
          </div>
        </div>

        <div className="hero-portrait" aria-label="0xaa 的 Three.js 粒子头像">
          <span className="portrait-grid-overlay" aria-hidden="true" />
          <span className="portrait-data-trail" aria-hidden="true" />
          <div className="portrait-frame">
            <ParticlePortrait pulseSequence={pulseSequence} />
          </div>
          <p className="portrait-meta portrait-meta-top">SCAN / 0001</p>
          <p className="portrait-meta portrait-meta-bottom">PKU · SG · 0xAA</p>
          <div className="portrait-axis" aria-hidden="true">
            <span>X / 071</span>
            <span>Y / 402</span>
          </div>
        </div>

        <div className="signal-waveband" aria-hidden="true">
          <span className="wave-axis" />
          <div className="signal-wave">
            {waveHeights.map((height, index) => (
              <span key={`${height}-${index}`} style={{ height: `${height}%` }} />
            ))}
          </div>
          <span className="wave-readout">SIGNAL TRACE / 01</span>
        </div>

        <div className="data-rail" aria-label="当前系统读数">
          <div>
            <span>STATUS</span>
            <strong>{signalState}</strong>
          </div>
          <div>
            <span>LOCATION</span>
            <strong>SG / UTC+08</strong>
          </div>
          <div>
            <span>LOCAL TIME</span>
            <strong>{clock}</strong>
          </div>
          <a href="#signal">SCROLL TO DECODE ↓</a>
        </div>
      </section>

      <section className="signal-section" id="signal" aria-labelledby="signal-heading">
        <div className="section-heading">
          <p>01 / DECODED SIGNAL</p>
          <span aria-hidden="true" />
        </div>
        <div className="manifesto-grid">
          <div>
            <p className="console-label">
              <span aria-hidden="true" />
              终生学习 / LIFELONG LEARNING
            </p>
            <h2 id="signal-heading" className="manifesto-title">
              终生
              <br />
              <em>学习.</em>
            </h2>
          </div>
          <div className="manifesto-copy">
            <p>
              终生学习，是把好奇心变成长期实践：理解世界、分享知识、持续构建，并在变化中保持开放。
            </p>
            <p>
              Lifelong learning turns curiosity into a durable practice: understand, share, build, and stay open to change.
            </p>
          </div>
        </div>

        <div className="protocol-list">
          <article>
            <span>01</span>
            <div>
              <h3>EDU</h3>
              <p>把复杂的区块链和AI知识压缩成人人可进入的开源教程。</p>
            </div>
            <strong aria-hidden="true">&lt;/&gt;</strong>
          </article>
          <article>
            <span>02</span>
            <div>
              <h3>NEURO &amp; AI</h3>
              <p>从神经科学出发，持续追问学习、智能与行为。</p>
            </div>
            <strong aria-hidden="true">∿</strong>
          </article>
          <article>
            <span>03</span>
            <div>
              <h3>MEME</h3>
              <p>传播趣事并从中赚钱。</p>
            </div>
            <strong aria-hidden="true">$$</strong>
          </article>
        </div>
      </section>

      <section className="work-section" id="work" aria-labelledby="work-heading">
        <div className="section-heading">
          <p>02 / OPEN SOURCE SIGNALS</p>
          <span aria-hidden="true" />
        </div>
        <div className="work-heading-row">
          <div>
            <p className="console-label">
              <span aria-hidden="true" />
              GITHUB / PINNED + PERSONAL PROJECTS
            </p>
            <h2 id="work-heading">
              OPEN
              <br />
              <em>SOURCE.</em>
            </h2>
          </div>
          <a className="text-link" href="https://github.com/amazingang" target="_blank" rel="noreferrer">
            VISIT @AMAZINGANG <span aria-hidden="true">↗</span>
          </a>
        </div>

        <div className="repo-collection">
          <div className="repo-collection-heading">
            <span>01 / PINNED PROJECTS</span>
            <span aria-hidden="true" />
          </div>
          <div className="repo-grid repo-grid-pinned">
            <a className="repo-card repo-card-featured" href="https://github.com/AmazingAng/WTF-Solidity" target="_blank" rel="noreferrer">
              <div className="repo-card-topline">
                <span>EDUCATION / WEB3</span>
                <span>14,010 ★</span>
              </div>
              <h3>WTF-Solidity</h3>
              <p>面向初学者的 Solidity 极简入门教程，也提供英文内容。</p>
              <span className="repo-arrow" aria-hidden="true">↗</span>
            </a>
            <a className="repo-card" href="https://github.com/WTFAcademy/WTF-Ethers" target="_blank" rel="noreferrer">
              <div className="repo-card-topline">
                <span>PINNED / ETHERS.JS</span>
                <span>3,527 ★</span>
              </div>
              <h3>WTF-Ethers</h3>
              <p>把 ethers.js 的细节拆解成可持续学习的 Web3 路线。</p>
              <span className="repo-arrow" aria-hidden="true">↗</span>
            </a>
            <a className="repo-card" href="https://github.com/WTFAcademy/WTF-zk" target="_blank" rel="noreferrer">
              <div className="repo-card-topline">
                <span>PINNED / ZK</span>
                <span>2,124 ★</span>
              </div>
              <h3>WTF-zk</h3>
              <p>一套面向实践者的零知识证明入门教程。</p>
              <span className="repo-arrow" aria-hidden="true">↗</span>
            </a>
            <a className="repo-card" href="https://github.com/AmazingAng/WTF-DeepRL" target="_blank" rel="noreferrer">
              <div className="repo-card-topline">
                <span>PINNED / DEEP RL</span>
                <span>316 ★</span>
              </div>
              <h3>WTF-DeepRL</h3>
              <p>以 PyTorch 实现深度强化学习算法，让研究与构建相遇。</p>
              <span className="repo-arrow" aria-hidden="true">↗</span>
            </a>
            <a className="repo-card" href="https://github.com/AmazingAng/PolyWorld" target="_blank" rel="noreferrer">
              <div className="repo-card-topline">
                <span>PERSONAL / POLYMARKET</span>
                <span>179 ★</span>
              </div>
              <h3>PolyWorld</h3>
              <p>实时预测市场可视化仪表盘，用交互式世界地图观察 Polymarket。</p>
              <span className="repo-arrow" aria-hidden="true">↗</span>
            </a>
            <a className="repo-card" href="https://github.com/AmazingAng/auth2api" target="_blank" rel="noreferrer">
              <div className="repo-card-topline">
                <span>PERSONAL / AI INFRA</span>
                <span>524 ★</span>
              </div>
              <h3>auth2api</h3>
              <p>轻量 OAuth 到 OpenAI-compatible API 的代理工具。</p>
              <span className="repo-arrow" aria-hidden="true">↗</span>
            </a>
            <a className="repo-card" href="https://github.com/xapi-labs/xapi-cli" target="_blank" rel="noreferrer">
              <div className="repo-card-topline">
                <span>PERSONAL / AGENT CLI</span>
                <span>11 ★</span>
              </div>
              <h3>xapi-cli</h3>
              <p>面向 Agent 的 xAPI 命令行工具，用来发现与调用能力和 API。</p>
              <span className="repo-arrow" aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      </section>

      <section className="channel-section" id="channel" aria-labelledby="channel-heading">
        <div className="channel-panel">
          <div className="channel-topline">
            <span>INCOMING TRANSMISSION</span>
            <span>CHANNEL / 01</span>
          </div>
          <div className="channel-body">
            <p className="channel-index">003</p>
            <div>
              <p className="console-label">
                <span aria-hidden="true" />
                OPEN A CHANNEL
              </p>
              <h2 id="channel-heading">LET&apos;S MAKE<br />SOME SIGNAL.</h2>
              <p>频道已开启。新的作品、想法与连接正在路上。</p>
            </div>
            <button className="channel-button" type="button" onClick={triggerPulse}>
              PING THE NODE <span aria-hidden="true">↗</span>
            </button>
          </div>
          <div className="channel-wave" aria-hidden="true">
            {waveHeights.slice(0, 24).map((height, index) => (
              <span key={`${height}-channel-${index}`} style={{ height: `${height}%` }} />
            ))}
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <span>© 0xAA / PERSONAL NODE</span>
        <a href="https://github.com/amazingang" target="_blank" rel="noreferrer">
          GITHUB @AMAZINGANG ↗
        </a>
        <a href="https://x.com/0xAA_Science" target="_blank" rel="noreferrer">
          X @0XAA_SCIENCE ↗
        </a>
        <button type="button" onClick={triggerPulse}>
          REBOOT SIGNAL ↺
        </button>
        <span>NEUROSCIENCE × WEB3</span>
      </footer>
    </main>
  );
}
