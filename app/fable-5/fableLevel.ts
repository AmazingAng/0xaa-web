// Level data for 0xAA WORLD — the side-scrolling platformer that IS the
// Fable homepage. Distances are world units (~meters); y is the TOP surface
// of a platform, x grows to the right. The level walks through the same
// chapters as the reading-mode page: fields, projects, connect, epilogue.

export type LevelLanguage = "zh" | "en";

export type LevelPlatform = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CardCopy = {
  kicker: string;
  title: string;
  body: string;
  meta?: string;
};

export type LevelBlock = {
  id: number;
  x: number;
  /** Bottom of the block. Blocks are 0.9 × 0.9 solids. */
  y: number;
  card: Record<LevelLanguage, CardCopy>;
};

export type LevelCoin = {
  id: number;
  x: number;
  y: number;
};

export type LevelEnemy = {
  id: number;
  minX: number;
  maxX: number;
  /** Ground the enemy patrols on (its feet). */
  y: number;
  speed: number;
};

export type LevelPortal = {
  id: number;
  x: number;
  y: number;
  href: string;
  label: string;
  sub: string;
};

export type LevelSign = {
  id: number;
  x: number;
  y: number;
  width: number;
  copy: Record<LevelLanguage, CardCopy>;
};

export type LevelZone = {
  fromX: number;
  spawnX: number;
  spawnY: number;
  name: Record<LevelLanguage, string>;
};

export const BLOCK_SIZE = 0.9;
export const COIN_RADIUS = 0.32;
export const ENEMY_HALF = { x: 0.42, y: 0.36 };
export const PLAYER_HALF = { x: 0.3, y: 0.46 };
export const PORTAL_HALF = { x: 0.8, y: 1.1 };
export const FALL_LIMIT_Y = -9;
export const FLAG_X = 171.5;
export const LEVEL_END_X = 176;

export const GROUND_SEGMENTS: LevelPlatform[] = [
  { x: -4, y: 0, width: 30, height: 2.4 },
  { x: 28.5, y: 0, width: 29.5, height: 2.4 },
  { x: 61, y: 0, width: 35, height: 2.4 },
  { x: 99, y: 0, width: 37, height: 2.4 },
  { x: 138.5, y: 0, width: 41.5, height: 2.4 },
];

export const FLOATING_PLATFORMS: LevelPlatform[] = [
  // Fields shrines.
  { x: 23, y: 1.1, width: 2.6, height: 0.5 },
  { x: 33, y: 1.1, width: 2.6, height: 0.5 },
  { x: 43, y: 1.1, width: 2.6, height: 0.5 },
  // Projects: learning staircase accents.
  { x: 69.4, y: 1.7, width: 2.2, height: 0.45 },
  { x: 77.4, y: 2.5, width: 2.2, height: 0.45 },
  { x: 85.4, y: 1.7, width: 2.2, height: 0.45 },
  // Projects: personal upper route.
  { x: 100, y: 3.2, width: 4, height: 0.5 },
  { x: 108, y: 3.2, width: 4, height: 0.5 },
  { x: 116, y: 3.2, width: 4, height: 0.5 },
  { x: 104.6, y: 1.6, width: 1.8, height: 0.4 },
  { x: 112.6, y: 1.6, width: 1.8, height: 0.4 },
  // Finale stairs.
  { x: 161.5, y: 1.1, width: 2.4, height: 1.1 },
  { x: 164.7, y: 2.1, width: 2.4, height: 2.1 },
  { x: 167.9, y: 3.1, width: 2.4, height: 3.1 },
];

export const LEVEL_ZONES: LevelZone[] = [
  { fromX: 0, spawnX: 2, spawnY: 0, name: { zh: "序章", en: "PROLOGUE" } },
  { fromX: 19, spawnX: 21, spawnY: 0, name: { zh: "卷一 · 领域", en: "I · FIELDS" } },
  { fromX: 60, spawnX: 62.5, spawnY: 0, name: { zh: "卷二 · 项目", en: "II · PROJECTS" } },
  { fromX: 137, spawnX: 140, spawnY: 0, name: { zh: "卷三 · 联系", en: "III · CONNECT" } },
  { fromX: 159.5, spawnX: 160.5, spawnY: 0, name: { zh: "跋", en: "EPILOGUE" } },
];

export const LEVEL_SIGNS: LevelSign[] = [
  {
    id: 0,
    x: 5.5,
    y: 3.4,
    width: 6.4,
    copy: {
      zh: {
        kicker: "0xAA / 一则未写完的寓言",
        title: "0xAA WORLD",
        body: "把复杂讲清楚，把好奇养大。向右走，把这一页主页亲手顶出来。",
      },
      en: {
        kicker: "0xAA / AN UNFINISHED FABLE",
        title: "0xAA WORLD",
        body: "Make the complex clear. Keep curiosity alive. Head right and bump this homepage into being.",
      },
    },
  },
  {
    id: 1,
    x: 13,
    y: 2.6,
    width: 4.6,
    copy: {
      zh: {
        kicker: "教程",
        title: "操作",
        body: "←→ 移动 · 空格跳跃（长按跳更高）· 顶「?」砖 · 踩扁噪声 · ↑ 进入传送门",
      },
      en: {
        kicker: "TUTORIAL",
        title: "CONTROLS",
        body: "←→ move · SPACE jump (hold for height) · bump ? blocks · stomp noise · ↑ enter portals",
      },
    },
  },
];

export const LEVEL_BLOCKS: LevelBlock[] = [
  // Chapter I — fields.
  {
    id: 0,
    x: 24,
    y: 3.4,
    card: {
      zh: { kicker: "卷一 · 领域", title: "EDU", body: "把区块链与 AI 的复杂知识，写成任何人都能免费进入的开源教程。", meta: "WTF Academy · wtf.academy" },
      en: { kicker: "I · FIELDS", title: "EDU", body: "Turn the complexity of blockchain and AI into open-source tutorials anyone can enter for free.", meta: "WTF Academy · wtf.academy" },
    },
  },
  {
    id: 1,
    x: 34,
    y: 3.4,
    card: {
      zh: { kicker: "卷一 · 领域", title: "NEURO & AI", body: "从神经科学出发，追问学习、智能与行为如何涌现。", meta: "xAPI · xapi.to" },
      en: { kicker: "I · FIELDS", title: "NEURO & AI", body: "Start from neuroscience and keep asking how learning, intelligence, and behavior emerge.", meta: "xAPI · xapi.to" },
    },
  },
  {
    id: 2,
    x: 44,
    y: 3.4,
    card: {
      zh: { kicker: "卷一 · 领域", title: "MEME", body: "传播有趣的事，并以此为生。" },
      en: { kicker: "I · FIELDS", title: "MEME", body: "Spread interesting things — and make a living from them." },
    },
  },
  // Chapter II — learning projects (ground row).
  {
    id: 3,
    x: 66,
    y: 1.9,
    card: {
      zh: { kicker: "卷二 · 学习", title: "WTF-Solidity", body: "面向初学者的 Solidity 极简入门教程，也提供英文内容。", meta: "14,010 ★" },
      en: { kicker: "II · LEARNING", title: "WTF-Solidity", body: "A minimal Solidity primer for beginners, also available in English.", meta: "14,010 ★" },
    },
  },
  {
    id: 4,
    x: 74,
    y: 1.9,
    card: {
      zh: { kicker: "卷二 · 学习", title: "WTF-Ethers", body: "把 ethers.js 的细节拆解成可持续学习的 Web3 路线。", meta: "3,527 ★" },
      en: { kicker: "II · LEARNING", title: "WTF-Ethers", body: "A durable Web3 learning path that breaks down ethers.js.", meta: "3,527 ★" },
    },
  },
  {
    id: 5,
    x: 82,
    y: 1.9,
    card: {
      zh: { kicker: "卷二 · 学习", title: "WTF-zk", body: "一套面向实践者的零知识证明入门教程。", meta: "2,124 ★" },
      en: { kicker: "II · LEARNING", title: "WTF-zk", body: "A hands-on primer on zero-knowledge proofs.", meta: "2,124 ★" },
    },
  },
  {
    id: 6,
    x: 90,
    y: 1.9,
    card: {
      zh: { kicker: "卷二 · 学习", title: "WTF-DeepRL", body: "以 PyTorch 实现深度强化学习算法，让研究与构建相遇。", meta: "316 ★" },
      en: { kicker: "II · LEARNING", title: "WTF-DeepRL", body: "Deep reinforcement learning in PyTorch, where research meets building.", meta: "316 ★" },
    },
  },
  // Chapter II — personal projects (upper route).
  {
    id: 7,
    x: 102,
    y: 5.2,
    card: {
      zh: { kicker: "卷二 · 个人", title: "auth2api", body: "轻量 OAuth 到 OpenAI-compatible API 的代理工具。", meta: "524 ★" },
      en: { kicker: "II · PERSONAL", title: "auth2api", body: "A lightweight OAuth-to-OpenAI-compatible API proxy.", meta: "524 ★" },
    },
  },
  {
    id: 8,
    x: 110,
    y: 5.2,
    card: {
      zh: { kicker: "卷二 · 个人", title: "PolyWorld", body: "实时预测市场可视化仪表盘，用交互式世界地图观察 Polymarket。", meta: "179 ★" },
      en: { kicker: "II · PERSONAL", title: "PolyWorld", body: "A real-time prediction-market dashboard that maps Polymarket activity.", meta: "179 ★" },
    },
  },
  {
    id: 9,
    x: 118,
    y: 5.2,
    card: {
      zh: { kicker: "卷二 · 个人", title: "xapi-cli", body: "面向 Agent 的 xAPI 命令行工具，用来发现与调用能力和 API。", meta: "11 ★" },
      en: { kicker: "II · PERSONAL", title: "xapi-cli", body: "A command-line xAPI tool for agents to discover and call capabilities and APIs.", meta: "11 ★" },
    },
  },
];

export const LEVEL_COINS: LevelCoin[] = [
  // Prologue trail.
  { id: 0, x: 9, y: 1.1 }, { id: 1, x: 10.4, y: 1.4 }, { id: 2, x: 11.8, y: 1.1 },
  // First gap arc.
  { id: 3, x: 26.4, y: 1.6 }, { id: 4, x: 27.3, y: 2.1 }, { id: 5, x: 28.2, y: 1.6 },
  // Field shrine rewards.
  { id: 6, x: 29.5, y: 1.0 }, { id: 7, x: 39, y: 1.0 }, { id: 8, x: 49, y: 1.0 },
  // Second gap arc.
  { id: 9, x: 58.6, y: 1.7 }, { id: 10, x: 59.5, y: 2.2 }, { id: 11, x: 60.4, y: 1.7 },
  // Learning staircase.
  { id: 12, x: 70.5, y: 2.8 }, { id: 13, x: 78.5, y: 3.6 }, { id: 14, x: 86.5, y: 2.8 },
  // Third gap arc.
  { id: 15, x: 96.7, y: 1.7 }, { id: 16, x: 97.5, y: 2.2 }, { id: 17, x: 98.3, y: 1.7 },
  // Upper route line.
  { id: 18, x: 101, y: 4.2 }, { id: 19, x: 106, y: 4.4 }, { id: 20, x: 109, y: 4.2 },
  { id: 21, x: 114, y: 4.4 }, { id: 22, x: 117, y: 4.2 },
  // Fourth gap + connect approach.
  { id: 23, x: 136.7, y: 1.7 }, { id: 24, x: 137.6, y: 2.2 },
  { id: 25, x: 146, y: 1.0 }, { id: 26, x: 152, y: 1.0 },
  // Finale stairs.
  { id: 27, x: 162.7, y: 2.2 }, { id: 28, x: 165.9, y: 3.2 }, { id: 29, x: 169.1, y: 4.2 },
];

export const LEVEL_ENEMIES: LevelEnemy[] = [
  { id: 0, minX: 48, maxX: 54, y: 0, speed: 1.5 },
  { id: 1, minX: 69, maxX: 76, y: 0, speed: 1.7 },
  { id: 2, minX: 84, maxX: 92, y: 0, speed: 1.9 },
  { id: 3, minX: 103, maxX: 112, y: 0, speed: 2.0 },
  { id: 4, minX: 108.4, maxX: 111.6, y: 3.2, speed: 1.6 },
  { id: 5, minX: 122, maxX: 131, y: 0, speed: 2.1 },
  { id: 6, minX: 141.5, maxX: 145, y: 0, speed: 1.6 },
];

export const LEVEL_PORTALS: LevelPortal[] = [
  { id: 0, x: 144, y: 0, href: "https://github.com/amazingang", label: "GITHUB", sub: "@amazingang" },
  { id: 1, x: 150, y: 0, href: "https://x.com/0xAA_Science", label: "X", sub: "@0xAA_Science" },
  {
    id: 2,
    x: 156,
    y: 0,
    href: "https://scholar.google.com/citations?user=raXwI1QAAAAJ&hl=en",
    label: "SCHOLAR",
    sub: "PUBLICATIONS",
  },
];

export const TOTAL_COINS = LEVEL_COINS.length;
export const TOTAL_BLOCKS = LEVEL_BLOCKS.length;

/** Solid colliders: ground, floating platforms, and every ? block. */
export const buildColliders = (): LevelPlatform[] => [
  ...GROUND_SEGMENTS.map((segment) => ({ ...segment })),
  ...FLOATING_PLATFORMS.map((platform) => ({ ...platform })),
  ...LEVEL_BLOCKS.map((block) => ({
    x: block.x - BLOCK_SIZE / 2,
    y: block.y + BLOCK_SIZE,
    width: BLOCK_SIZE,
    height: BLOCK_SIZE,
  })),
];
