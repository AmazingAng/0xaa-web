"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ParticlePortrait from "./ParticlePortrait";

const pulseBars = [18, 42, 24, 68, 31, 82, 46, 27, 58, 38, 94, 52, 34, 71, 23, 49, 80, 41, 21, 60, 35, 74, 29, 47, 66, 36, 86, 45, 28, 63, 32, 76, 39, 26, 54, 33];

const fields = [
  {
    index: "01",
    eyebrow: "EDU / OPEN ACCESS",
    name: "EDU",
    copy: "把复杂的区块链和 AI 知识，压缩成人人可进入的开源教程。",
    detail: "Open knowledge, made reachable.",
    project: "WTF Academy",
    href: "https://wtf.academy",
    url: "wtf.academy",
    mark: "<>"
  },
  {
    index: "02",
    eyebrow: "NEURO & AI / INQUIRY",
    name: "NEURO & AI",
    copy: "从神经科学出发，持续追问学习、智能与行为。",
    detail: "Learning, intelligence, behavior.",
    project: "xAPI",
    href: "https://xapi.to",
    url: "xapi.to",
    mark: "∿"
  },
  {
    index: "03",
    eyebrow: "MEME / DISTRIBUTION",
    name: "MEME",
    copy: "传播趣事，并从中赚钱。",
    detail: "Humor / network / value.",
    project: "FIELD NOTE",
    href: "https://x.com/0xAA_Science",
    url: "humor / network / value",
    mark: "$$"
  }
];

const learningProjects = [
  {
    label: "EDUCATION / WEB3",
    stars: "14,010 ★",
    name: "WTF-Solidity",
    note: "Solidity, made legible.",
    detail: "面向初学者的 Solidity 极简入门教程，也提供英文内容。",
    href: "https://github.com/AmazingAng/WTF-Solidity",
    featured: true
  },
  {
    label: "ETHERS.JS",
    stars: "3,527 ★",
    name: "WTF-Ethers",
    note: "A practical route through ethers.js.",
    detail: "把 ethers.js 的细节拆解成可持续学习的 Web3 路线。",
    href: "https://github.com/WTFAcademy/WTF-Ethers"
  },
  {
    label: "ZERO KNOWLEDGE",
    stars: "2,124 ★",
    name: "WTF-zk",
    note: "Zero-knowledge, made approachable.",
    detail: "一套面向实践者的零知识证明入门教程。",
    href: "https://github.com/WTFAcademy/WTF-zk"
  },
  {
    label: "DEEP RL",
    stars: "316 ★",
    name: "WTF-DeepRL",
    note: "Reinforcement learning, built in PyTorch.",
    detail: "以 PyTorch 实现深度强化学习算法，让研究与构建相遇。",
    href: "https://github.com/AmazingAng/WTF-DeepRL"
  }
];

const personalProjects = [
  {
    label: "PREDICTION MARKETS",
    stars: "179 ★",
    name: "PolyWorld",
    note: "A live map of prediction markets.",
    detail: "实时预测市场可视化仪表盘，用交互式世界地图观察 Polymarket。",
    href: "https://github.com/AmazingAng/PolyWorld"
  },
  {
    label: "AI INFRA",
    stars: "524 ★",
    name: "auth2api",
    note: "OAuth, translated into an OpenAI-compatible API.",
    detail: "轻量 OAuth 到 OpenAI-compatible API 的代理工具。",
    href: "https://github.com/AmazingAng/auth2api"
  },
  {
    label: "AGENT CLI",
    stars: "11 ★",
    name: "xapi-cli",
    note: "An agent-native command line for xAPI.",
    detail: "面向 Agent 的 xAPI 命令行工具，用来发现与调用能力和 API。",
    href: "https://github.com/xapi-labs/xapi-cli"
  }
];

type ArchiveProject = (typeof learningProjects)[number] | (typeof personalProjects)[number];

function ArchiveCard({ project }: { project: ArchiveProject }) {
  return (
    <a
      className={`archive-card${"featured" in project && project.featured ? " archive-card-featured" : ""}`}
      href={project.href}
      target="_blank"
      rel="noreferrer"
    >
      <div className="archive-card-meta">
        <span>{project.label}</span>
        <span>{project.stars}</span>
      </div>
      <div className="archive-card-core">
        <h3>{project.name}</h3>
        <p>{project.note}</p>
        <p className="archive-detail">{project.detail}</p>
      </div>
      <span className="archive-arrow" aria-hidden="true">↗</span>
      <span className="archive-card-grid" aria-hidden="true" />
    </a>
  );
}

export default function Home() {
  const pulseTimerRef = useRef<number | null>(null);
  const [isPulsing, setIsPulsing] = useState(false);
  const [pulseSequence, setPulseSequence] = useState(0);
  const [signalState, setSignalState] = useState("LISTENING");
  const [clock, setClock] = useState("--:--:--");

  useEffect(() => {
    const updateClock = () => {
      setClock(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Shanghai",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false
        }).format(new Date())
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
    []
  );

  const triggerPulse = useCallback(() => {
    setPulseSequence((sequence) => sequence + 1);
    setIsPulsing(true);
    setSignalState("DISTURBED");

    if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
    pulseTimerRef.current = window.setTimeout(() => {
      setIsPulsing(false);
      setSignalState("LISTENING");
    }, 1000);
  }, []);

  return (
    <main className={`monolith-site${isPulsing ? " is-pulsing" : ""}`} id="top">
      <div className="ambient-grid" aria-hidden="true" />
      <div className="ambient-noise" aria-hidden="true" />
      <a className="skip-link" href="#fields">跳至主要内容</a>

      <header className="monolith-header">
        <a className="monolith-mark" href="#top" aria-label="回到 0xAA 首页">
          <span>0xAA</span>
          <i aria-hidden="true" />
          <small>MONOLITH_01</small>
        </a>
        <nav className="monolith-nav" aria-label="页面导航">
          <a href="#fields">01 / FIELDS</a>
          <a href="#archive">02 / ARCHIVE</a>
          <a href="#transmit">03 / TRANSMIT</a>
        </nav>
        <div className="header-links">
          <a href="https://github.com/amazingang" target="_blank" rel="noreferrer">GH ↗</a>
          <a href="https://x.com/0xAA_Science" target="_blank" rel="noreferrer">X ↗</a>
        </div>
      </header>

      <section className="monolith-hero" aria-labelledby="hero-heading">
        <div className="hero-crosshair" aria-hidden="true" />
        <div className="hero-coordinate hero-coordinate-a" aria-hidden="true">X / 0.071</div>
        <div className="hero-coordinate hero-coordinate-b" aria-hidden="true">Y / 0.402</div>
        <div className="hero-coordinate hero-coordinate-c" aria-hidden="true">DEPTH / ∞</div>

        <div className="hero-portrait" role="img" aria-label="0xAA 的动态点云肖像">
          <div className="orbit-ring orbit-ring-a" aria-hidden="true" />
          <div className="orbit-ring orbit-ring-b" aria-hidden="true" />
          <div className="orbit-ring orbit-ring-c" aria-hidden="true" />
          <div className="hero-scanline" aria-hidden="true" />
          <div className="portrait-slab">
            <span className="slab-corner slab-corner-a" aria-hidden="true" />
            <span className="slab-corner slab-corner-b" aria-hidden="true" />
            <span className="slab-corner slab-corner-c" aria-hidden="true" />
            <span className="slab-corner slab-corner-d" aria-hidden="true" />
            <ParticlePortrait pulseSequence={pulseSequence} />
          </div>
          <p className="portrait-caption portrait-caption-top">LIVE POINT CLOUD / 892 NODES</p>
          <p className="portrait-caption portrait-caption-side">SCANNING / 001</p>
        </div>

        <div className="hero-identity">
          <p className="eyebrow"><span aria-hidden="true" />NODE_00 / NEURAL MONOLITH</p>
          <h1 id="hero-heading">0xAA</h1>
          <p className="hero-role">Computational Neuroscience Ph.D.</p>
          <p className="hero-thesis">A personal node for learning, intelligence, and open systems.</p>
          <div className="hero-actions">
            <a className="primary-action" href="#fields">ENTER THE FIELDS <span aria-hidden="true">↓</span></a>
            <button className="secondary-action" type="button" onClick={triggerPulse} aria-pressed={isPulsing}>
              DISTURB THE FIELD <span aria-hidden="true">✦</span>
            </button>
          </div>
        </div>

        <aside className="hero-readout" aria-label="节点实时读数">
          <div>
            <span>STATE</span>
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
        </aside>

        <div className="hero-wave" aria-hidden="true">
          <span className="wave-label">FIELD / 001</span>
          <div>
            {pulseBars.map((height, index) => (
              <span key={`${height}-${index}`} style={{ height: `${height}%` }} />
            ))}
          </div>
          <span className="wave-label">SCROLL TO DECODE</span>
        </div>
      </section>

      <section className="fields-section" id="fields" aria-labelledby="fields-heading">
        <div className="section-index">
          <span>01</span>
          <p>FIELDS OF PRACTICE</p>
          <i aria-hidden="true" />
        </div>
        <div className="fields-intro">
          <div>
            <p className="eyebrow"><span aria-hidden="true" />终生学习 / LIFELONG LEARNING</p>
            <h2 id="fields-heading">终生<br /><em>学习.</em></h2>
          </div>
          <div className="fields-intro-copy">
            <p>把好奇心变成长期实践：理解世界、分享知识、持续构建，并保持开放。</p>
            <p>Turn curiosity into a lifelong practice: understand, share, build, and stay open.</p>
          </div>
        </div>

        <div className="field-stack">
          {fields.map((field) => (
            <article className="field-slab" key={field.index}>
              <div className="field-number">{field.index}</div>
              <div className="field-main">
                <p>{field.eyebrow}</p>
                <h3>{field.name}</h3>
              </div>
              <div className="field-copy">
                <p>{field.copy}</p>
                <span>{field.detail}</span>
              </div>
              <a className="field-project" href={field.href} target="_blank" rel="noreferrer">
                <span>PROJECT / {field.project}</span>
                <strong>{field.url} ↗</strong>
              </a>
              <b aria-hidden="true">{field.mark}</b>
            </article>
          ))}
        </div>
      </section>

      <section className="archive-section" id="archive" aria-labelledby="archive-heading">
        <div className="section-index">
          <span>02</span>
          <p>OPEN ARCHIVE</p>
          <i aria-hidden="true" />
        </div>
        <div className="archive-heading">
          <div>
            <p className="eyebrow"><span aria-hidden="true" />PINNED PROJECTS / 07</p>
            <h2 id="archive-heading">OPEN<br /><em>ARCHIVE.</em></h2>
          </div>
          <div className="archive-heading-copy">
            <p>Seven public artifacts. One continuous practice.</p>
            <a href="https://github.com/amazingang" target="_blank" rel="noreferrer">VISIT @AMAZINGANG <span aria-hidden="true">↗</span></a>
          </div>
        </div>

        <div className="archive-group">
          <div className="archive-group-label"><span>LEARNING SYSTEMS</span><span>04</span></div>
          <div className="archive-grid archive-grid-learning">
            {learningProjects.map((project) => <ArchiveCard key={project.name} project={project} />)}
          </div>
        </div>

        <div className="archive-group">
          <div className="archive-group-label"><span>PERSONAL SYSTEMS</span><span>03</span></div>
          <div className="archive-grid archive-grid-personal">
            {personalProjects.map((project) => <ArchiveCard key={project.name} project={project} />)}
          </div>
        </div>
      </section>

      <section className="transmit-section" id="transmit" aria-labelledby="transmit-heading">
        <div className="transmit-shell">
          <div className="transmit-grid" aria-hidden="true" />
          <div className="transmit-index" aria-hidden="true">03</div>
          <div className="transmit-copy">
            <p className="eyebrow"><span aria-hidden="true" />THE NODE IS OPEN</p>
            <h2 id="transmit-heading">MAKE<br /><em>A SIGNAL.</em></h2>
            <p>新的作品、想法与连接，持续发射。</p>
            <p>New work, ideas, and connections—still transmitting.</p>
          </div>
          <div className="transmit-links">
            <a href="https://github.com/amazingang" target="_blank" rel="noreferrer"><span>GITHUB</span><strong>@amazingang</strong><i aria-hidden="true">↗</i></a>
            <a href="https://x.com/0xAA_Science" target="_blank" rel="noreferrer"><span>X</span><strong>@0xAA_Science</strong><i aria-hidden="true">↗</i></a>
            <button type="button" onClick={triggerPulse}><span>FIELD</span><strong>RE-IGNITE</strong><i aria-hidden="true">✦</i></button>
          </div>
          <div className="transmit-wave" aria-hidden="true">
            {pulseBars.slice(0, 28).map((height, index) => (
              <span key={`${height}-transmit-${index}`} style={{ height: `${height}%` }} />
            ))}
          </div>
        </div>
      </section>

      <footer className="monolith-footer">
        <span>© 0xAA / MONOLITH_01</span>
        <span>COMPUTATIONAL NEUROSCIENCE · OPEN SYSTEMS</span>
        <button type="button" onClick={triggerPulse}>REBOOT THE NODE ↺</button>
      </footer>
    </main>
  );
}
