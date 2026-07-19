"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import ModelSwitcher from "./ModelSwitcher";
import OpeningGame, { type OpeningGameLanguage } from "./OpeningGame";

const ParticlePortrait = dynamic(() => import("./ParticlePortrait"), { ssr: false });

const GATE_CLEARED_KEY = "0xaa:gate-cleared";
const LANGUAGE_KEY = "0xaa:lang";

const pulseBars = [18, 42, 24, 68, 31, 82, 46, 27, 58, 38, 94, 52, 34, 71, 23, 49, 80, 41, 21, 60, 35, 74, 29, 47, 66, 36, 86, 45, 28, 63, 32, 76, 39, 26, 54, 33];

type Language = OpeningGameLanguage;

type Field = {
  name: string;
  copy: string;
  project?: string;
  href?: string;
};

type ArchiveProject = {
  stars: string;
  name: string;
  detail: string;
  href: string;
  featured?: boolean;
};

type SiteCopy = {
  skipLink: string;
  homeLabel: string;
  navigationLabel: string;
  languageLabel: string;
  navigation: { fields: string; projects: string; connect: string };
  hero: { portraitLabel: string; explore: string; pulseLabel: string };
  fieldsHeading: { lead: string; accent: string };
  archiveHeading: string;
  archiveGroups: { learning: string; personal: string };
  starsLabel: string;
  connectHeading: string;
  profileLabels: { github: string; scholar: string; publications: string };
  fields: Field[];
  learningProjects: ArchiveProject[];
  personalProjects: ArchiveProject[];
};

const siteCopy: Record<Language, SiteCopy> = {
  zh: {
    skipLink: "跳至主要内容",
    homeLabel: "回到 0xAA 首页",
    navigationLabel: "页面导航",
    languageLabel: "选择语言",
    navigation: { fields: "领域", projects: "项目", connect: "联系" },
    hero: { portraitLabel: "0xAA 的动态点云肖像", explore: "探索", pulseLabel: "扰动点云" },
    fieldsHeading: { lead: "终生", accent: "学习." },
    archiveHeading: "项目.",
    archiveGroups: { learning: "学习", personal: "个人" },
    starsLabel: "GitHub 星标数",
    connectHeading: "联系.",
    profileLabels: { github: "GITHUB", scholar: "GOOGLE SCHOLAR", publications: "论文发表" },
    fields: [
      {
        name: "EDU",
        copy: "把复杂的区块链和 AI 知识，压缩成人人可进入的开源教程。",
        project: "WTF Academy",
        href: "https://wtf.academy",
      },
      {
        name: "NEURO & AI",
        copy: "从神经科学出发，持续追问学习、智能与行为。",
        project: "xAPI",
        href: "https://xapi.to",
      },
      { name: "MEME", copy: "传播趣事，并从中赚钱。" },
    ],
    learningProjects: [
      { stars: "14,010 ★", name: "WTF-Solidity", detail: "面向初学者的 Solidity 极简入门教程，也提供英文内容。", href: "https://github.com/AmazingAng/WTF-Solidity", featured: true },
      { stars: "3,527 ★", name: "WTF-Ethers", detail: "把 ethers.js 的细节拆解成可持续学习的 Web3 路线。", href: "https://github.com/WTFAcademy/WTF-Ethers" },
      { stars: "2,124 ★", name: "WTF-zk", detail: "一套面向实践者的零知识证明入门教程。", href: "https://github.com/WTFAcademy/WTF-zk" },
      { stars: "316 ★", name: "WTF-DeepRL", detail: "以 PyTorch 实现深度强化学习算法，让研究与构建相遇。", href: "https://github.com/AmazingAng/WTF-DeepRL" },
    ],
    personalProjects: [
      { stars: "179 ★", name: "PolyWorld", detail: "实时预测市场可视化仪表盘，用交互式世界地图观察 Polymarket。", href: "https://github.com/AmazingAng/PolyWorld" },
      { stars: "524 ★", name: "auth2api", detail: "轻量 OAuth 到 OpenAI-compatible API 的代理工具。", href: "https://github.com/AmazingAng/auth2api" },
      { stars: "11 ★", name: "xapi-cli", detail: "面向 Agent 的 xAPI 命令行工具，用来发现与调用能力和 API。", href: "https://github.com/xapi-labs/xapi-cli" },
    ],
  },
  en: {
    skipLink: "Skip to main content",
    homeLabel: "Return to 0xAA home",
    navigationLabel: "Page navigation",
    languageLabel: "Choose language",
    navigation: { fields: "FIELDS", projects: "PROJECTS", connect: "CONNECT" },
    hero: { portraitLabel: "0xAA animated particle-cloud portrait", explore: "EXPLORE", pulseLabel: "Perturb particle portrait" },
    fieldsHeading: { lead: "LIFELONG", accent: "LEARNING." },
    archiveHeading: "PROJECTS.",
    archiveGroups: { learning: "LEARNING", personal: "PERSONAL" },
    starsLabel: "GitHub stars",
    connectHeading: "CONNECT.",
    profileLabels: { github: "GITHUB", scholar: "GOOGLE SCHOLAR", publications: "PUBLICATIONS" },
    fields: [
      {
        name: "EDU",
        copy: "Distill complex blockchain and AI knowledge into open-source tutorials anyone can access.",
        project: "WTF Academy",
        href: "https://wtf.academy",
      },
      {
        name: "NEURO & AI",
        copy: "From neuroscience, keep asking how learning, intelligence, and behavior emerge.",
        project: "xAPI",
        href: "https://xapi.to",
      },
      { name: "MEME", copy: "Share interesting things—and make a living from them." },
    ],
    learningProjects: [
      { stars: "14,010 ★", name: "WTF-Solidity", detail: "A minimal Solidity primer for beginners, also available in English.", href: "https://github.com/AmazingAng/WTF-Solidity", featured: true },
      { stars: "3,527 ★", name: "WTF-Ethers", detail: "A durable Web3 learning path that breaks down ethers.js.", href: "https://github.com/WTFAcademy/WTF-Ethers" },
      { stars: "2,124 ★", name: "WTF-zk", detail: "A hands-on primer on zero-knowledge proofs.", href: "https://github.com/WTFAcademy/WTF-zk" },
      { stars: "316 ★", name: "WTF-DeepRL", detail: "Deep reinforcement learning in PyTorch, where research meets building.", href: "https://github.com/AmazingAng/WTF-DeepRL" },
    ],
    personalProjects: [
      { stars: "179 ★", name: "PolyWorld", detail: "A real-time prediction-market dashboard that maps Polymarket activity.", href: "https://github.com/AmazingAng/PolyWorld" },
      { stars: "524 ★", name: "auth2api", detail: "A lightweight OAuth-to-OpenAI-compatible API proxy.", href: "https://github.com/AmazingAng/auth2api" },
      { stars: "11 ★", name: "xapi-cli", detail: "A command-line xAPI tool for agents to discover and call capabilities and APIs.", href: "https://github.com/xapi-labs/xapi-cli" },
    ],
  },
};

function ArchiveCard({ project, starsLabel }: { project: ArchiveProject; starsLabel: string }) {
  return (
    <a
      className={`archive-card${"featured" in project && project.featured ? " archive-card-featured" : ""}`}
      href={project.href}
      target="_blank"
      rel="noreferrer"
    >
      <div className="archive-card-meta">
        <span aria-label={starsLabel}>{project.stars}</span>
      </div>
      <div className="archive-card-core">
        <h3>{project.name}</h3>
        <p>{project.detail}</p>
      </div>
      <span className="archive-arrow" aria-hidden="true">↗</span>
      <span className="archive-card-grid" aria-hidden="true" />
    </a>
  );
}

export default function Home() {
  const pulseTimerRef = useRef<number | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const [isPulsing, setIsPulsing] = useState(false);
  const [pulseSequence, setPulseSequence] = useState(0);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isHomeRevealed, setIsHomeRevealed] = useState(false);
  const [language, setLanguage] = useState<Language>("zh");
  const copy = siteCopy[language];

  useEffect(
    () => () => {
      if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
    },
    []
  );

  useEffect(() => {
    if (!isUnlocked) return;

    let revealFrame: number | null = null;
    const mountFrame = window.requestAnimationFrame(() => {
      revealFrame = window.requestAnimationFrame(() => setIsHomeRevealed(true));
    });

    return () => {
      window.cancelAnimationFrame(mountFrame);
      if (revealFrame !== null) window.cancelAnimationFrame(revealFrame);
    };
  }, [isUnlocked]);

  useEffect(() => {
    if (!isHomeRevealed) return;
    const frame = window.requestAnimationFrame(() => mainRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [isHomeRevealed]);

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);

  // Restore a previously-cleared gate and the saved language preference on
  // mount. This runs as an effect (not a lazy initializer) because the
  // component is server-rendered and reading sessionStorage/localStorage
  // during render would cause a hydration mismatch. The one-time setState
  // calls below are intentional: they sync React state with browser storage
  // that isn't available during SSR/hydration.
  useEffect(() => {
    try {
      const savedLanguage = window.localStorage.getItem(LANGUAGE_KEY);
      if (savedLanguage === "zh" || savedLanguage === "en") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring persisted state after hydration, not a derived-state anti-pattern
        setLanguage(savedLanguage);
      }
    } catch {
      // localStorage unavailable (e.g. privacy mode) — keep the default language.
    }

    try {
      if (window.sessionStorage.getItem(GATE_CLEARED_KEY) === "1") {
        setIsUnlocked(true);
      }
    } catch {
      // sessionStorage unavailable — fall back to playing the opening game.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(LANGUAGE_KEY, language);
    } catch {
      // Ignore write failures (e.g. storage disabled or full).
    }
  }, [language]);

  const triggerPulse = useCallback(() => {
    setPulseSequence((sequence) => sequence + 1);
    setIsPulsing(true);

    if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
    pulseTimerRef.current = window.setTimeout(() => {
      setIsPulsing(false);
    }, 1000);
  }, []);

  const unlockNode = useCallback(() => {
    try {
      window.sessionStorage.setItem(GATE_CLEARED_KEY, "1");
    } catch {
      // Ignore write failures (e.g. storage disabled) — the gate will just
      // replay next visit.
    }
    setIsHomeRevealed(false);
    setIsUnlocked(true);
  }, []);

  if (!isUnlocked) return <OpeningGame onComplete={unlockNode} language={language} onLanguageChange={setLanguage} />;

  return (
    <main ref={mainRef} tabIndex={-1} className={`monolith-site home-reveal${isPulsing ? " is-pulsing" : ""}${isHomeRevealed ? " is-revealed" : ""}`} id="top">
      <div className="home-reveal-curtain" aria-hidden="true"><i /></div>
      <div className="ambient-grid" aria-hidden="true" />
      <div className="ambient-noise" aria-hidden="true" />
      <a className="skip-link" href="#fields">{copy.skipLink}</a>

      <header className="monolith-header">
        <a className="monolith-mark" href="#top" aria-label={copy.homeLabel}>
          <span>0xAA</span>
          <i aria-hidden="true" />
        </a>
        <nav className="monolith-nav" aria-label={copy.navigationLabel}>
          <a href="#fields">{copy.navigation.fields}</a>
          <a href="#archive">{copy.navigation.projects}</a>
          <a href="#connect">{copy.navigation.connect}</a>
        </nav>
        <div className="header-links">
          <a href="https://github.com/amazingang" target="_blank" rel="noreferrer">GH ↗</a>
          <a href="https://x.com/0xAA_Science" target="_blank" rel="noreferrer">X ↗</a>
          <a href="https://scholar.google.com/citations?user=raXwI1QAAAAJ&hl=en" target="_blank" rel="noreferrer">SCHOLAR ↗</a>
          <ModelSwitcher
            activeModel="gpt-5-6-terra"
            label={language === "zh" ? "切换模型主页" : "Switch model pages"}
          />
          <div className="language-switch" role="group" aria-label={copy.languageLabel}>
            <button type="button" className="language-switch-button" aria-pressed={language === "zh"} data-active={language === "zh"} onClick={() => setLanguage("zh")}>中</button>
            <button type="button" className="language-switch-button" aria-pressed={language === "en"} data-active={language === "en"} onClick={() => setLanguage("en")}>EN</button>
          </div>
        </div>
      </header>

      <section className="monolith-hero" aria-labelledby="hero-heading">
        <div className="hero-crosshair" aria-hidden="true" />

        <div className="hero-portrait" role="img" aria-label={copy.hero.portraitLabel}>
          <div className="orbit-ring orbit-ring-a" aria-hidden="true" />
          <div className="orbit-ring orbit-ring-b" aria-hidden="true" />
          <div className="orbit-ring orbit-ring-c" aria-hidden="true" />
          <div className="hero-scanline" aria-hidden="true" />
          <div className="portrait-field">
            <ParticlePortrait pulseSequence={pulseSequence} />
          </div>
        </div>

        <div className="hero-identity">
          <h1 id="hero-heading">0xAA</h1>
          <div className="hero-actions">
            <a className="primary-action" href="#fields">{copy.hero.explore} <span aria-hidden="true">↓</span></a>
            <button className="secondary-action" type="button" onClick={triggerPulse} aria-label={copy.hero.pulseLabel} aria-pressed={isPulsing}>
              <span aria-hidden="true">✦</span>
            </button>
          </div>
        </div>

        <div className="hero-wave" aria-hidden="true">
          <div>
            {pulseBars.map((height, index) => (
              <span key={`${height}-${index}`} style={{ height: `${height}%` }} />
            ))}
          </div>
        </div>
      </section>

      <section className="fields-section" id="fields" aria-labelledby="fields-heading">
        <div className="fields-intro">
          <h2 id="fields-heading">{copy.fieldsHeading.lead}<em>{copy.fieldsHeading.accent}</em></h2>
        </div>

        <div className="field-stack">
          {copy.fields.map((field) => (
            <article className="field-slab" key={field.name}>
              <div className="field-main">
                <h3>{field.name}</h3>
              </div>
              <div className="field-copy">
                <p>{field.copy}</p>
                {field.project && field.href ? (
                  <a className="field-project" href={field.href} target="_blank" rel="noreferrer">
                    {field.project} <span aria-hidden="true">↗</span>
                  </a>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="archive-section" id="archive" aria-labelledby="archive-heading">
        <div className="archive-heading">
          <h2 id="archive-heading">{copy.archiveHeading}</h2>
          <div className="archive-heading-copy">
            <a href="https://github.com/amazingang" target="_blank" rel="noreferrer">GITHUB / @amazingang <span aria-hidden="true">↗</span></a>
          </div>
        </div>

        <div className="archive-group">
          <div className="archive-group-label"><span>{copy.archiveGroups.learning}</span><span>04</span></div>
          <div className="archive-grid archive-grid-learning">
            {copy.learningProjects.map((project) => <ArchiveCard key={project.name} project={project} starsLabel={copy.starsLabel} />)}
          </div>
        </div>

        <div className="archive-group">
          <div className="archive-group-label"><span>{copy.archiveGroups.personal}</span><span>03</span></div>
          <div className="archive-grid archive-grid-personal">
            {copy.personalProjects.map((project) => <ArchiveCard key={project.name} project={project} starsLabel={copy.starsLabel} />)}
          </div>
        </div>
      </section>

      <section className="transmit-section" id="connect" aria-labelledby="transmit-heading">
        <div className="transmit-shell">
          <div className="transmit-grid" aria-hidden="true" />
          <div className="transmit-copy">
            <h2 id="transmit-heading">{copy.connectHeading}</h2>
          </div>
          <div className="transmit-links">
            <a href="https://github.com/amazingang" target="_blank" rel="noreferrer"><span>{copy.profileLabels.github}</span><strong>@amazingang</strong><i aria-hidden="true">↗</i></a>
            <a href="https://x.com/0xAA_Science" target="_blank" rel="noreferrer"><span>X</span><strong>@0xAA_Science</strong><i aria-hidden="true">↗</i></a>
            <a href="https://scholar.google.com/citations?user=raXwI1QAAAAJ&hl=en" target="_blank" rel="noreferrer"><span>{copy.profileLabels.scholar}</span><strong>{copy.profileLabels.publications}</strong><i aria-hidden="true">↗</i></a>
          </div>
        </div>
      </section>

      <footer className="monolith-footer">
        <span>© 0xAA</span>
      </footer>
    </main>
  );
}
