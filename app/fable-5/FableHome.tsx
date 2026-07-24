"use client";

import dynamic from "next/dynamic";
import ModelSwitcher from "../ModelSwitcher";
import type { FableGateLanguage } from "./FableGate";

const FablePortrait = dynamic(() => import("./FablePortrait"), { ssr: false });

type Language = FableGateLanguage;

type FableField = {
  name: string;
  copy: string;
  project?: string;
  href?: string;
};

type FableProject = {
  stars: string;
  name: string;
  detail: string;
  href: string;
};

type FableCopy = {
  skipLink: string;
  homeLabel: string;
  navigationLabel: string;
  languageLabel: string;
  switcherLabel: string;
  navigation: { fields: string; projects: string; connect: string };
  hero: {
    kicker: string;
    tagline: string;
    taglineSecond: string;
    portraitLabel: string;
    portraitHint: string;
  };
  chapterOne: { numeral: string; title: string };
  chapterTwo: { numeral: string; title: string };
  chapterThree: { numeral: string; title: string };
  projectGroups: { learning: string; personal: string };
  starsLabel: string;
  profileLabels: { github: string; scholar: string; publications: string };
  epilogue: string;
  fields: FableField[];
  learningProjects: FableProject[];
  personalProjects: FableProject[];
};

const fableCopy: Record<Language, FableCopy> = {
  zh: {
    skipLink: "跳至主要内容",
    homeLabel: "回到 0xAA 首页",
    navigationLabel: "页面导航",
    languageLabel: "选择语言",
    switcherLabel: "切换模型主页",
    navigation: { fields: "卷一 · 领域", projects: "卷二 · 项目", connect: "卷三 · 联系" },
    hero: {
      kicker: "0xAA / 一则未写完的寓言",
      tagline: "把复杂讲清楚，",
      taglineSecond: "把好奇养大。",
      portraitLabel: "0xAA 的金色墨尘肖像，由数万粒子聚合而成",
      portraitHint: "点一下肖像，墨会散开，再自己聚拢。",
    },
    chapterOne: { numeral: "卷一", title: "领域" },
    chapterTwo: { numeral: "卷二", title: "项目" },
    chapterThree: { numeral: "卷三", title: "联系" },
    projectGroups: { learning: "学习", personal: "个人" },
    starsLabel: "GitHub 星标数",
    profileLabels: { github: "GITHUB", scholar: "GOOGLE SCHOLAR", publications: "论文发表" },
    epilogue: "未完待续",
    fields: [
      {
        name: "EDU",
        copy: "把区块链与 AI 的复杂知识，写成任何人都能免费进入的开源教程。",
        project: "WTF Academy",
        href: "https://wtf.academy",
      },
      {
        name: "NEURO & AI",
        copy: "从神经科学出发，追问学习、智能与行为如何涌现。",
        project: "xAPI",
        href: "https://xapi.to",
      },
      { name: "MEME", copy: "传播有趣的事，并以此为生。" },
    ],
    learningProjects: [
      { stars: "14,010 ★", name: "WTF-Solidity", detail: "面向初学者的 Solidity 极简入门教程，也提供英文内容。", href: "https://github.com/AmazingAng/WTF-Solidity" },
      { stars: "3,527 ★", name: "WTF-Ethers", detail: "把 ethers.js 的细节拆解成可持续学习的 Web3 路线。", href: "https://github.com/WTFAcademy/WTF-Ethers" },
      { stars: "2,124 ★", name: "WTF-zk", detail: "一套面向实践者的零知识证明入门教程。", href: "https://github.com/WTFAcademy/WTF-zk" },
      { stars: "316 ★", name: "WTF-DeepRL", detail: "以 PyTorch 实现深度强化学习算法，让研究与构建相遇。", href: "https://github.com/AmazingAng/WTF-DeepRL" },
    ],
    personalProjects: [
      { stars: "524 ★", name: "auth2api", detail: "轻量 OAuth 到 OpenAI-compatible API 的代理工具。", href: "https://github.com/AmazingAng/auth2api" },
      { stars: "179 ★", name: "PolyWorld", detail: "实时预测市场可视化仪表盘，用交互式世界地图观察 Polymarket。", href: "https://github.com/AmazingAng/PolyWorld" },
      { stars: "11 ★", name: "xapi-cli", detail: "面向 Agent 的 xAPI 命令行工具，用来发现与调用能力和 API。", href: "https://github.com/xapi-labs/xapi-cli" },
    ],
  },
  en: {
    skipLink: "Skip to main content",
    homeLabel: "Return to 0xAA home",
    navigationLabel: "Page navigation",
    languageLabel: "Choose language",
    switcherLabel: "Switch model pages",
    navigation: { fields: "I · FIELDS", projects: "II · PROJECTS", connect: "III · CONNECT" },
    hero: {
      kicker: "0xAA / AN UNFINISHED FABLE",
      tagline: "Make the complex clear.",
      taglineSecond: "Keep curiosity alive.",
      portraitLabel: "Golden ink-dust portrait of 0xAA, gathered from tens of thousands of particles",
      portraitHint: "Click the portrait — the ink scatters, then gathers itself again.",
    },
    chapterOne: { numeral: "I", title: "FIELDS" },
    chapterTwo: { numeral: "II", title: "PROJECTS" },
    chapterThree: { numeral: "III", title: "CONNECT" },
    projectGroups: { learning: "LEARNING", personal: "PERSONAL" },
    starsLabel: "GitHub stars",
    profileLabels: { github: "GITHUB", scholar: "GOOGLE SCHOLAR", publications: "PUBLICATIONS" },
    epilogue: "TO BE CONTINUED",
    fields: [
      {
        name: "EDU",
        copy: "Turn the complexity of blockchain and AI into open-source tutorials anyone can enter for free.",
        project: "WTF Academy",
        href: "https://wtf.academy",
      },
      {
        name: "NEURO & AI",
        copy: "Start from neuroscience and keep asking how learning, intelligence, and behavior emerge.",
        project: "xAPI",
        href: "https://xapi.to",
      },
      { name: "MEME", copy: "Spread interesting things — and make a living from them." },
    ],
    learningProjects: [
      { stars: "14,010 ★", name: "WTF-Solidity", detail: "A minimal Solidity primer for beginners, also available in English.", href: "https://github.com/AmazingAng/WTF-Solidity" },
      { stars: "3,527 ★", name: "WTF-Ethers", detail: "A durable Web3 learning path that breaks down ethers.js.", href: "https://github.com/WTFAcademy/WTF-Ethers" },
      { stars: "2,124 ★", name: "WTF-zk", detail: "A hands-on primer on zero-knowledge proofs.", href: "https://github.com/WTFAcademy/WTF-zk" },
      { stars: "316 ★", name: "WTF-DeepRL", detail: "Deep reinforcement learning in PyTorch, where research meets building.", href: "https://github.com/AmazingAng/WTF-DeepRL" },
    ],
    personalProjects: [
      { stars: "524 ★", name: "auth2api", detail: "A lightweight OAuth-to-OpenAI-compatible API proxy.", href: "https://github.com/AmazingAng/auth2api" },
      { stars: "179 ★", name: "PolyWorld", detail: "A real-time prediction-market dashboard that maps Polymarket activity.", href: "https://github.com/AmazingAng/PolyWorld" },
      { stars: "11 ★", name: "xapi-cli", detail: "A command-line xAPI tool for agents to discover and call capabilities and APIs.", href: "https://github.com/xapi-labs/xapi-cli" },
    ],
  },
};

function LedgerRow({ project, index, starsLabel }: { project: FableProject; index: number; starsLabel: string }) {
  return (
    <a className="fable-ledger-row" href={project.href} target="_blank" rel="noreferrer">
      <span className="fable-ledger-index" aria-hidden="true">
        {String(index + 1).padStart(2, "0")}
      </span>
      <span className="fable-ledger-core">
        <strong>{project.name}</strong>
        <em>{project.detail}</em>
      </span>
      <span className="fable-ledger-leader" aria-hidden="true" />
      <span className="fable-ledger-stars" aria-label={starsLabel}>
        {project.stars}
      </span>
    </a>
  );
}

export type FableHomeProps = {
  language: Language;
  onLanguageChange: (language: Language) => void;
  isRevealed: boolean;
};

export default function FableHome({ language, onLanguageChange, isRevealed }: FableHomeProps) {
  const copy = fableCopy[language];

  return (
    <main className={`fable-site${isRevealed ? " is-revealed" : ""}`} id="top">
      <div className="fable-reveal-wash" aria-hidden="true" />
      <div className="fable-ambient" aria-hidden="true" />
      <a className="skip-link" href="#fable-fields">
        {copy.skipLink}
      </a>

      <header className="fable-header">
        <a className="fable-mark" href="#top" aria-label={copy.homeLabel}>
          0xAA<i aria-hidden="true" />
        </a>
        <nav className="fable-nav" aria-label={copy.navigationLabel}>
          <a href="#fable-fields">{copy.navigation.fields}</a>
          <a href="#fable-projects">{copy.navigation.projects}</a>
          <a href="#fable-connect">{copy.navigation.connect}</a>
        </nav>
        <div className="fable-header-tools">
          <a href="https://github.com/amazingang" target="_blank" rel="noreferrer">GH ↗</a>
          <a href="https://x.com/0xAA_Science" target="_blank" rel="noreferrer">X ↗</a>
          <a href="https://scholar.google.com/citations?user=raXwI1QAAAAJ&hl=en" target="_blank" rel="noreferrer">SCHOLAR ↗</a>
          <ModelSwitcher activeModel="fable-5" label={copy.switcherLabel} />
          <div className="fable-language-switch" role="group" aria-label={copy.languageLabel}>
            <button type="button" aria-pressed={language === "zh"} data-active={language === "zh"} onClick={() => onLanguageChange("zh")}>
              中
            </button>
            <button type="button" aria-pressed={language === "en"} data-active={language === "en"} onClick={() => onLanguageChange("en")}>
              EN
            </button>
          </div>
        </div>
      </header>

      <section className="fable-hero" aria-labelledby="fable-hero-heading">
        <div className="fable-hero-copy">
          <p className="fable-kicker">{copy.hero.kicker}</p>
          <h1 id="fable-hero-heading">0xAA</h1>
          <p className="fable-tagline">
            {copy.hero.tagline}
            <br />
            <em>{copy.hero.taglineSecond}</em>
          </p>
        </div>
        <div className="fable-hero-portrait">
          <FablePortrait label={copy.hero.portraitLabel} />
          <p className="fable-portrait-hint">{copy.hero.portraitHint}</p>
        </div>
      </section>

      <section className="fable-chapter" id="fable-fields" aria-labelledby="fable-fields-heading">
        <header className="fable-chapter-heading">
          <span className="fable-chapter-numeral">{copy.chapterOne.numeral}</span>
          <h2 id="fable-fields-heading">{copy.chapterOne.title}</h2>
        </header>
        <div className="fable-field-grid">
          {copy.fields.map((field) => (
            <article className="fable-field-panel" key={field.name}>
              <h3>{field.name}</h3>
              <p>{field.copy}</p>
              {field.project && field.href ? (
                <a className="fable-field-project" href={field.href} target="_blank" rel="noreferrer">
                  {field.project} <span aria-hidden="true">↗</span>
                </a>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="fable-chapter" id="fable-projects" aria-labelledby="fable-projects-heading">
        <header className="fable-chapter-heading">
          <span className="fable-chapter-numeral">{copy.chapterTwo.numeral}</span>
          <h2 id="fable-projects-heading">{copy.chapterTwo.title}</h2>
          <a className="fable-chapter-aside" href="https://github.com/amazingang" target="_blank" rel="noreferrer">
            GITHUB / @amazingang <span aria-hidden="true">↗</span>
          </a>
        </header>

        <div className="fable-ledger">
          <p className="fable-ledger-group">{copy.projectGroups.learning}</p>
          {copy.learningProjects.map((project, index) => (
            <LedgerRow key={project.name} project={project} index={index} starsLabel={copy.starsLabel} />
          ))}
          <p className="fable-ledger-group">{copy.projectGroups.personal}</p>
          {copy.personalProjects.map((project, index) => (
            <LedgerRow
              key={project.name}
              project={project}
              index={index + copy.learningProjects.length}
              starsLabel={copy.starsLabel}
            />
          ))}
        </div>
      </section>

      <section className="fable-chapter" id="fable-connect" aria-labelledby="fable-connect-heading">
        <header className="fable-chapter-heading">
          <span className="fable-chapter-numeral">{copy.chapterThree.numeral}</span>
          <h2 id="fable-connect-heading">{copy.chapterThree.title}</h2>
        </header>
        <div className="fable-connect-links">
          <a href="https://github.com/amazingang" target="_blank" rel="noreferrer">
            <span>{copy.profileLabels.github}</span>
            <strong>@amazingang</strong>
            <i aria-hidden="true">↗</i>
          </a>
          <a href="https://x.com/0xAA_Science" target="_blank" rel="noreferrer">
            <span>X</span>
            <strong>@0xAA_Science</strong>
            <i aria-hidden="true">↗</i>
          </a>
          <a href="https://scholar.google.com/citations?user=raXwI1QAAAAJ&hl=en" target="_blank" rel="noreferrer">
            <span>{copy.profileLabels.scholar}</span>
            <strong>{copy.profileLabels.publications}</strong>
            <i aria-hidden="true">↗</i>
          </a>
        </div>
      </section>

      <footer className="fable-footer">
        <span className="fable-epilogue">— {copy.epilogue} —</span>
        <span>© 0xAA</span>
      </footer>
    </main>
  );
}
