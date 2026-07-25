"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import ModelSwitcher from "./ModelSwitcher";
import type { OpeningGameLanguage } from "./OpeningGame";

const ParticlePortrait = dynamic(() => import("./ParticlePortrait"), { ssr: false });
const OpeningGame = dynamic(() => import("./OpeningGame"), { ssr: false });

const LANGUAGE_KEY = "0xaa:lang";

const pulseBars = [18, 42, 24, 68, 31, 82, 46, 27, 58, 38, 94, 52, 34, 71, 23, 49, 80, 41, 21, 60, 35, 74, 29, 47, 66, 36, 86, 45, 28, 63, 32, 76, 39, 26, 54, 33];

type Language = OpeningGameLanguage;

type Field = {
  name: string;
  copy: string;
};

type ArchiveProject = {
  meta: string;
  metaLabel: string;
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
  gameLabel: string;
  navigation: { fields: string; projects: string; connect: string };
  hero: { portraitLabel: string; explore: string; pulseLabel: string };
  fieldsHeading: { lead: string; accent: string };
  archiveHeading: string;
  archiveGroups: { learning: string; openSource: string; personal: string };
  archiveMetrics: { projects: string; stars: string };
  archiveMetricsLabel: string;
  connectHeading: string;
  connectKicker: string;
  profileLabels: { github: string; scholar: string; publications: string };
  fields: Field[];
  learningProjects: ArchiveProject[];
  openSourceProjects: ArchiveProject[];
  personalProjects: ArchiveProject[];
};

const siteCopy: Record<Language, SiteCopy> = {
  zh: {
    skipLink: "跳至主要内容",
    homeLabel: "回到 0xAA 首页",
    navigationLabel: "页面导航",
    languageLabel: "选择语言",
    gameLabel: "游戏",
    navigation: { fields: "领域", projects: "项目", connect: "联系" },
    hero: { portraitLabel: "0xAA 的动态点云肖像", explore: "探索", pulseLabel: "扰动点云" },
    fieldsHeading: { lead: "终生", accent: "学习." },
    archiveHeading: "项目.",
    archiveGroups: { learning: "学习", openSource: "开源", personal: "个人" },
    archiveMetrics: { projects: "09 / PROJECTS", stars: "20.7K ★" },
    archiveMetricsLabel: "项目数量与 GitHub 星标数",
    connectHeading: "联系.",
    connectKicker: "03 / 直接通道",
    profileLabels: { github: "GITHUB", scholar: "GOOGLE SCHOLAR", publications: "论文发表" },
    fields: [
      {
        name: "EDU",
        copy: "把复杂的区块链和 AI 知识，压缩成人人可进入的开源教程。",
      },
      {
        name: "NEURO & AI",
        copy: "从神经科学出发，持续追问学习、智能与行为。",
      },
      { name: "MEME", copy: "传播趣事，并从中赚钱。" },
    ],
    learningProjects: [
      { meta: "14,010 ★", metaLabel: "GitHub 星标数", name: "WTF-Solidity", detail: "面向初学者的 Solidity 极简入门教程，也提供英文内容。", href: "https://github.com/AmazingAng/WTF-Solidity", featured: true },
      { meta: "3,527 ★", metaLabel: "GitHub 星标数", name: "WTF-Ethers", detail: "把 ethers.js 的细节拆解成可持续学习的 Web3 路线。", href: "https://github.com/WTFAcademy/WTF-Ethers" },
      { meta: "2,124 ★", metaLabel: "GitHub 星标数", name: "WTF-zk", detail: "一套面向实践者的零知识证明入门教程。", href: "https://github.com/WTFAcademy/WTF-zk" },
      { meta: "316 ★", metaLabel: "GitHub 星标数", name: "WTF-DeepRL", detail: "以 PyTorch 实现深度强化学习算法，让研究与构建相遇。", href: "https://github.com/AmazingAng/WTF-DeepRL" },
    ],
    openSourceProjects: [
      { meta: "179 ★", metaLabel: "GitHub 星标数", name: "PolyWorld", detail: "实时预测市场可视化仪表盘，用交互式世界地图观察 Polymarket。", href: "https://github.com/AmazingAng/PolyWorld" },
      { meta: "524 ★", metaLabel: "GitHub 星标数", name: "auth2api", detail: "轻量 OAuth 到 OpenAI-compatible API 的代理工具。", href: "https://github.com/AmazingAng/auth2api" },
      { meta: "11 ★", metaLabel: "GitHub 星标数", name: "xapi-cli", detail: "面向 Agent 的 xAPI 命令行工具，用来发现与调用能力和 API。", href: "https://github.com/xapi-labs/xapi-cli" },
    ],
    personalProjects: [
      { meta: "WTF.ACADEMY", metaLabel: "WTF Academy 官网", name: "WTF Academy", detail: "把 Web3 与 AI 的复杂知识做成人人可进入的开源教程。", href: "https://wtf.academy", featured: true },
      { meta: "XAPI.TO", metaLabel: "xAPI 官网", name: "xAPI", detail: "探索学习、智能与行为的神经科学工具与开放能力。", href: "https://xapi.to", featured: true },
    ],
  },
  en: {
    skipLink: "Skip to main content",
    homeLabel: "Return to 0xAA home",
    navigationLabel: "Page navigation",
    languageLabel: "Choose language",
    gameLabel: "PLAY",
    navigation: { fields: "FIELDS", projects: "PROJECTS", connect: "CONNECT" },
    hero: { portraitLabel: "0xAA animated particle-cloud portrait", explore: "EXPLORE", pulseLabel: "Perturb particle portrait" },
    fieldsHeading: { lead: "LIFELONG", accent: "LEARNING." },
    archiveHeading: "PROJECTS.",
    archiveGroups: { learning: "LEARNING", openSource: "OPEN SOURCE", personal: "PERSONAL" },
    archiveMetrics: { projects: "09 / PROJECTS", stars: "20.7K ★" },
    archiveMetricsLabel: "Project count and GitHub stars",
    connectHeading: "CONNECT.",
    connectKicker: "03 / DIRECT CHANNELS",
    profileLabels: { github: "GITHUB", scholar: "GOOGLE SCHOLAR", publications: "PUBLICATIONS" },
    fields: [
      {
        name: "EDU",
        copy: "Distill complex blockchain and AI knowledge into open-source tutorials anyone can access.",
      },
      {
        name: "NEURO & AI",
        copy: "From neuroscience, keep asking how learning, intelligence, and behavior emerge.",
      },
      { name: "MEME", copy: "Share interesting things—and make a living from them." },
    ],
    learningProjects: [
      { meta: "14,010 ★", metaLabel: "GitHub stars", name: "WTF-Solidity", detail: "A minimal Solidity primer for beginners, also available in English.", href: "https://github.com/AmazingAng/WTF-Solidity", featured: true },
      { meta: "3,527 ★", metaLabel: "GitHub stars", name: "WTF-Ethers", detail: "A durable Web3 learning path that breaks down ethers.js.", href: "https://github.com/WTFAcademy/WTF-Ethers" },
      { meta: "2,124 ★", metaLabel: "GitHub stars", name: "WTF-zk", detail: "A hands-on primer on zero-knowledge proofs.", href: "https://github.com/WTFAcademy/WTF-zk" },
      { meta: "316 ★", metaLabel: "GitHub stars", name: "WTF-DeepRL", detail: "Deep reinforcement learning in PyTorch, where research meets building.", href: "https://github.com/AmazingAng/WTF-DeepRL" },
    ],
    openSourceProjects: [
      { meta: "179 ★", metaLabel: "GitHub stars", name: "PolyWorld", detail: "A real-time prediction-market dashboard that maps Polymarket activity.", href: "https://github.com/AmazingAng/PolyWorld" },
      { meta: "524 ★", metaLabel: "GitHub stars", name: "auth2api", detail: "A lightweight OAuth-to-OpenAI-compatible API proxy.", href: "https://github.com/AmazingAng/auth2api" },
      { meta: "11 ★", metaLabel: "GitHub stars", name: "xapi-cli", detail: "A command-line xAPI tool for agents to discover and call capabilities and APIs.", href: "https://github.com/xapi-labs/xapi-cli" },
    ],
    personalProjects: [
      { meta: "WTF.ACADEMY", metaLabel: "WTF Academy website", name: "WTF Academy", detail: "Open-source tutorials that make complex Web3 and AI knowledge accessible.", href: "https://wtf.academy", featured: true },
      { meta: "XAPI.TO", metaLabel: "xAPI website", name: "xAPI", detail: "Open tools and capabilities for asking how learning, intelligence, and behavior emerge.", href: "https://xapi.to", featured: true },
    ],
  },
};

function ArchiveCard({ project }: { project: ArchiveProject }) {
  return (
    <a
      className={`archive-card${"featured" in project && project.featured ? " archive-card-featured" : ""}`}
      href={project.href}
      target="_blank"
      rel="noreferrer"
    >
      <div className="archive-card-meta">
        <span aria-label={project.metaLabel}>{project.meta}</span>
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
  const gameTriggerRef = useRef<HTMLButtonElement>(null);
  const [isPulsing, setIsPulsing] = useState(false);
  const [pulseSequence, setPulseSequence] = useState(0);
  const [isGameOpen, setIsGameOpen] = useState(false);
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
    let revealFrame: number | null = null;
    const mountFrame = window.requestAnimationFrame(() => {
      revealFrame = window.requestAnimationFrame(() => setIsHomeRevealed(true));
    });

    return () => {
      window.cancelAnimationFrame(mountFrame);
      if (revealFrame !== null) window.cancelAnimationFrame(revealFrame);
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);

  // Restore the saved language preference after hydration. Browser storage is
  // unavailable during SSR, so this cannot run during render.
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

  const openGame = useCallback(() => {
    setIsGameOpen(true);
  }, []);

  const closeGame = useCallback(() => {
    setIsGameOpen(false);
    window.requestAnimationFrame(() => gameTriggerRef.current?.focus({ preventScroll: true }));
  }, []);

  return (
    <>
    <main tabIndex={-1} className={`monolith-site home-reveal${isPulsing ? " is-pulsing" : ""}${isHomeRevealed ? " is-revealed" : ""}`} id="top">
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
          <button ref={gameTriggerRef} className="header-game-button" type="button" onClick={openGame}>
            <i aria-hidden="true">✦</i>
            <span>{copy.gameLabel}</span>
          </button>
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
          {copy.fields.map((field, index) => (
            <article className="field-slab" key={field.name}>
              <div className="field-main">
                <span className="field-index" aria-hidden="true">{String(index + 1).padStart(2, "0")} / 03</span>
                <h3>{field.name}</h3>
              </div>
              <div className="field-copy">
                <p>{field.copy}</p>
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
            <div className="archive-metrics" aria-label={copy.archiveMetricsLabel}>
              <span>{copy.archiveMetrics.projects}</span>
              <span>{copy.archiveMetrics.stars}</span>
            </div>
          </div>
        </div>

        <div className="archive-group">
          <div className="archive-group-label"><span>{copy.archiveGroups.learning}</span><span>{String(copy.learningProjects.length).padStart(2, "0")}</span></div>
          <div className="archive-grid archive-grid-learning">
            {copy.learningProjects.map((project) => <ArchiveCard key={project.name} project={project} />)}
          </div>
        </div>

        <div className="archive-group">
          <div className="archive-group-label"><span>{copy.archiveGroups.openSource}</span><span>{String(copy.openSourceProjects.length).padStart(2, "0")}</span></div>
          <div className="archive-grid archive-grid-open-source">
            {copy.openSourceProjects.map((project) => <ArchiveCard key={project.name} project={project} />)}
          </div>
        </div>

        <div className="archive-group">
          <div className="archive-group-label"><span>{copy.archiveGroups.personal}</span><span>{String(copy.personalProjects.length).padStart(2, "0")}</span></div>
          <div className="archive-grid archive-grid-personal">
            {copy.personalProjects.map((project) => <ArchiveCard key={project.name} project={project} />)}
          </div>
        </div>
      </section>

      <section className="transmit-section" id="connect" aria-labelledby="transmit-heading">
        <div className="transmit-shell">
          <div className="transmit-grid" aria-hidden="true" />
          <div className="transmit-copy">
            <p className="transmit-kicker">{copy.connectKicker}</p>
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
    {isGameOpen ? <OpeningGame onComplete={closeGame} language={language} onLanguageChange={setLanguage} /> : null}
    </>
  );
}
