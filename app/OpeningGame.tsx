"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createOpeningGameAudio, type OpeningGameAudio } from "./openingGameAudio";
import type { OpeningGameRenderer } from "./openingGameRenderer";

export type GamePhase = "briefing" | "active" | "cleared" | "failed";
export type OpeningGameLanguage = "zh" | "en";

export type EnemyKind = "scout" | "sweep" | "sentinel" | "core" | "warden" | "archon";
export type AsteroidKind = "shard" | "monolith";
export type MissionStage = "LOCK-ON" | "BELT" | "CORE" | "WARDEN" | "ARCHON";

const BOSS_SEQUENCE = ["core", "warden", "archon"] as const;
type BossKind = (typeof BOSS_SEQUENCE)[number];

const isBossKind = (kind: EnemyKind): kind is BossKind =>
  kind === "core" || kind === "warden" || kind === "archon";

export type Enemy = {
  id: number;
  kind: EnemyKind;
  baseX: number;
  baseY: number;
  phase: number;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  spawnAt: number;
  velocity: number;
  alive: boolean;
};

export type Projectile = {
  x: number;
  y: number;
  velocity: number;
  velocityX: number;
  friendly: boolean;
};

export type Spark = {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  life: number;
};

export type Asteroid = {
  id: number;
  kind: AsteroidKind;
  x: number;
  y: number;
  velocity: number;
  size: number;
  spin: number;
  breakable: boolean;
  active: boolean;
};

export type GameWorld = {
  elapsed: number;
  forwardDistance: number;
  playerX: number;
  playerY: number;
  health: number;
  score: number;
  stage: MissionStage;
  lastPlayerShot: number;
  lastPlayerHit: number;
  lastEnemyShot: number;
  lastBossVolley: number;
  lastAsteroidSpawn: number;
  asteroidCursor: number;
  enemyCursor: number;
  escortCursor: number;
  bossIndex: number;
  bossVolleyIndex: number;
  nextBossAt: number;
  nextEscortAt: number;
  enemies: Enemy[];
  asteroids: Asteroid[];
  projectiles: Projectile[];
  sparks: Spark[];
};

type Hud = {
  bossKind: BossKind | null;
  bossHealth: number;
  bossMaxHealth: number;
  health: number;
  score: number;
};

type RendererState = "loading" | "ready" | "unavailable";

export type OpeningGameProps = {
  onComplete: () => void;
  language: OpeningGameLanguage;
  onLanguageChange: (language: OpeningGameLanguage) => void;
};

const gameCopy: Record<OpeningGameLanguage, {
  title: string;
  loading: string;
  unavailable: string;
  enter: string;
  retry: string;
  startGame: string;
  retryGame: string;
  soundOn: string;
  soundOff: string;
  soundLabel: string;
  soundEnabled: string;
  soundDisabled: string;
  controls: string;
  fallback: string;
  retryHeading: string;
  languageLabel: string;
  chinese: string;
  english: string;
  scoreLabel: string;
  nodeComplete: string;
  unlocked: string;
  skip: string;
  skipLabel: string;
}> = {
  zh: {
    title: "0xAA 神经拦截器",
    loading: "初始化中",
    unavailable: "3D 不可用",
    enter: "点击进入",
    retry: "点击重试",
    startGame: "开始信号拦截游戏",
    retryGame: "重新开始信号拦截游戏",
    soundOn: "开启游戏声音",
    soundOff: "关闭游戏声音",
    soundLabel: "声音",
    soundEnabled: "开",
    soundDisabled: "关",
    controls: "拖动 · 自动射击",
    fallback: "此设备无法初始化 3D 信号场。请刷新后重试。",
    retryHeading: "再试一次",
    languageLabel: "选择语言",
    chinese: "中",
    english: "EN",
    scoreLabel: "积分",
    nodeComplete: "节点 03 / 03",
    unlocked: "已解锁",
    skip: "跳过",
    skipLabel: "跳过开场游戏",
  },
  en: {
    title: "0xAA neural interceptor",
    loading: "INITIALIZING",
    unavailable: "3D UNAVAILABLE",
    enter: "TAP TO ENTER",
    retry: "TAP TO RETRY",
    startGame: "Start the signal interceptor game",
    retryGame: "Retry the signal interceptor game",
    soundOn: "Enable game sound",
    soundOff: "Mute game sound",
    soundLabel: "SND",
    soundEnabled: "ON",
    soundDisabled: "OFF",
    controls: "DRAG · AUTO FIRE",
    fallback: "This device could not initialize the 3D signal field. Reload to retry.",
    retryHeading: "RETRY",
    languageLabel: "Choose language",
    chinese: "中",
    english: "EN",
    scoreLabel: "SCORE",
    nodeComplete: "NODE 03 / 03",
    unlocked: "UNLOCKED",
    skip: "SKIP",
    skipLabel: "Skip the opening game",
  },
};

// The mission runs from fixed pools and a deterministic director: no entity count
// grows with time, so the arcade pace stays predictable on a phone.
const MAX_RENDER_RATE = 30;
const REDUCED_RENDER_RATE = 12;
const MAX_ENEMIES = 12;
const MAX_PLAYER_PROJECTILES = 18;
const MAX_ENEMY_PROJECTILES = 10;
const MAX_SPARKS = 48;
const MAX_ASTEROIDS = 6;
const AUTO_FIRE_INTERVAL = 165;
const PLAYER_HIT_COOLDOWN = 520;
const ENEMY_SHOT_INTERVAL = 940;
const BELT_ENTRY_AT = 6;
const CORE_ENTRY_AT = 5.8;
const BOSS_RESPITE_SECONDS = 1.1;
const VICTORY_HOLD_DURATION = 1450;
const VICTORY_EXIT_DURATION = 640;
const PLAYER_MIN_X = 0.14;
const PLAYER_MAX_X = 0.86;
const PLAYER_START_Y = 0.84;
const PLAYER_MIN_Y = 0.62;
const PLAYER_MAX_Y = 0.91;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const seed = (index: number, offset = 0) => {
  const value = Math.sin(index * 12.9898 + offset * 78.233) * 43758.5453;
  return value - Math.floor(value);
};

type SignalKind = Exclude<EnemyKind, BossKind>;

type BossEscortPlan = {
  maxSignals: number;
  entryDelay: number;
  interval: number;
  kinds: readonly SignalKind[];
};

// The director deliberately stays below the twelve-object render pool. Boss
// fights can escalate visually without adding allocation or frame-time spikes
// on a phone.
const bossEscortPlans: Record<BossKind, BossEscortPlan> = {
  core: { maxSignals: 6, entryDelay: 0.42, interval: 1.24, kinds: ["scout", "sweep", "scout"] },
  warden: { maxSignals: 7, entryDelay: 0.32, interval: 0.94, kinds: ["sweep", "scout", "sentinel"] },
  archon: { maxSignals: 8, entryDelay: 0.24, interval: 0.76, kinds: ["sentinel", "sweep", "scout", "sentinel"] },
};

const bossEscortLanes = [0.14, 0.3, 0.7, 0.86] as const;

type SpawnDirective = {
  at: number;
  afterBosses: number;
  kind: SignalKind;
  x: number;
  y: number;
  phase: number;
};

const missionScript: SpawnDirective[] = [
  { at: 0.7, afterBosses: 0, kind: "scout", x: 0.23, y: -0.08, phase: 0.2 },
  { at: 1.35, afterBosses: 0, kind: "scout", x: 0.5, y: -0.16, phase: 1.1 },
  { at: 2.05, afterBosses: 0, kind: "scout", x: 0.77, y: -0.1, phase: 2.2 },
  { at: 3.6, afterBosses: 0, kind: "scout", x: 0.35, y: -0.12, phase: 0.6 },
  { at: 4.3, afterBosses: 0, kind: "scout", x: 0.65, y: -0.16, phase: 2.8 },
  { at: 7.4, afterBosses: 1, kind: "sweep", x: 0.12, y: -0.12, phase: 0.4 },
  { at: 8.2, afterBosses: 1, kind: "sweep", x: 0.88, y: -0.18, phase: 2.4 },
  { at: 9.3, afterBosses: 1, kind: "sentinel", x: 0.5, y: -0.16, phase: 1.4 },
  { at: 13.2, afterBosses: 2, kind: "sweep", x: 0.18, y: -0.11, phase: 2.7 },
  { at: 13.95, afterBosses: 2, kind: "sweep", x: 0.82, y: -0.16, phase: 0.1 },
  { at: 14.85, afterBosses: 2, kind: "sentinel", x: 0.3, y: -0.15, phase: 2.1 },
  { at: 15.45, afterBosses: 2, kind: "sentinel", x: 0.7, y: -0.1, phase: 0.9 },
];

type EnemySpec = {
  health: number;
  velocity: number;
  score: number;
  hitbox: {
    halfWidth: number;
    halfHeight: number;
    offsetY: number;
  };
};

// These hitboxes follow the visible, layered silhouettes in the renderer,
// rather than treating every enemy as a small circle. The offset accounts for
// the slightly lower visual center of the forward-facing craft.
const enemySpecs: Record<EnemyKind, EnemySpec> = {
  scout: { health: 1, velocity: 0.072, score: 100, hitbox: { halfWidth: 0.07, halfHeight: 0.085, offsetY: 0.014 } },
  sweep: { health: 2, velocity: 0.095, score: 175, hitbox: { halfWidth: 0.088, halfHeight: 0.078, offsetY: 0.015 } },
  sentinel: { health: 3, velocity: 0.052, score: 260, hitbox: { halfWidth: 0.071, halfHeight: 0.074, offsetY: -0.003 } },
  core: { health: 14, velocity: 0.115, score: 650, hitbox: { halfWidth: 0.112, halfHeight: 0.125, offsetY: 0 } },
  warden: { health: 18, velocity: 0.098, score: 900, hitbox: { halfWidth: 0.155, halfHeight: 0.14, offsetY: -0.004 } },
  archon: { health: 22, velocity: 0.09, score: 1200, hitbox: { halfWidth: 0.16, halfHeight: 0.17, offsetY: 0.008 } },
};

const getEnemyVisualScale = (enemy: Enemy) => {
  const approach = clamp((enemy.y - 0.06) / 0.9, 0, 1);
  const kindScale =
    enemy.kind === "archon"
      ? 1.72
      : enemy.kind === "core"
        ? 1.58
        : enemy.kind === "warden"
          ? 1.46
          : enemy.kind === "sentinel"
            ? 1.07
            : enemy.kind === "sweep"
              ? 0.98
              : 0.9;
  const slotScale = 0.84 + (enemy.id % 3) * 0.08;
  return kindScale * slotScale * (0.82 + approach * 0.34);
};

const projectileHitsEnemy = (projectile: Projectile, enemy: Enemy) => {
  const { hitbox } = enemySpecs[enemy.kind];
  const scale = getEnemyVisualScale(enemy);
  // Projectiles are tall on screen, so the small asymmetric padding prevents
  // visible wing/body impacts from passing through between simulation frames.
  const halfWidth = hitbox.halfWidth * scale + 0.005;
  const halfHeight = hitbox.halfHeight * scale + 0.012;
  const centerY = enemy.y + hitbox.offsetY * scale;
  const normalizedX = (projectile.x - enemy.x) / halfWidth;
  const normalizedY = (projectile.y - centerY) / halfHeight;
  return normalizedX * normalizedX + normalizedY * normalizedY <= 1;
};

const createWorld = (): GameWorld => ({
  elapsed: 0,
  forwardDistance: 0,
  playerX: 0.5,
  playerY: PLAYER_START_Y,
  health: 3,
  score: 0,
  stage: "LOCK-ON",
  lastPlayerShot: -AUTO_FIRE_INTERVAL,
  lastPlayerHit: -PLAYER_HIT_COOLDOWN,
  lastEnemyShot: 0,
  lastBossVolley: 0,
  lastAsteroidSpawn: 0,
  asteroidCursor: 0,
  enemyCursor: 0,
  escortCursor: 0,
  bossIndex: 0,
  bossVolleyIndex: 0,
  nextBossAt: CORE_ENTRY_AT,
  nextEscortAt: Number.POSITIVE_INFINITY,
  enemies: Array.from({ length: MAX_ENEMIES }, (_, index) => ({
    id: index,
    kind: "scout",
    baseX: 0.5,
    baseY: -0.16,
    phase: index * 0.91,
    x: 0.5,
    y: -0.16,
    health: 0,
    maxHealth: 0,
    spawnAt: 0,
    velocity: 0,
    alive: false,
  })),
  asteroids: Array.from({ length: MAX_ASTEROIDS }, (_, id) => ({
    id,
    kind: "shard",
    x: 0.5,
    y: -0.16,
    velocity: 0,
    size: 0,
    spin: 0,
    breakable: true,
    active: false,
  })),
  projectiles: [],
  sparks: [],
});

const activeBoss = (world: GameWorld) => world.enemies.find((enemy) => enemy.alive && isBossKind(enemy.kind));

const remainingSignals = (world: GameWorld) =>
  world.enemies.filter((enemy) => enemy.alive && !isBossKind(enemy.kind)).length;

const syncHud = (world: GameWorld, setHud: (next: Hud) => void) => {
  const boss = activeBoss(world);
  setHud({
    bossKind: boss && isBossKind(boss.kind) ? boss.kind : null,
    bossHealth: boss?.health ?? 0,
    bossMaxHealth: boss?.maxHealth ?? 0,
    health: world.health,
    score: world.score,
  });
};

const spawnSparks = (world: GameWorld, x: number, y: number, count: number) => {
  const available = Math.max(0, MAX_SPARKS - world.sparks.length);
  const seedBase = world.elapsed * 17.21 + world.score * 0.071;

  for (let index = 0; index < Math.min(count, available); index += 1) {
    const angle = seed(seedBase + index, 6) * Math.PI * 2;
    const speed = 0.04 + seed(seedBase + index, 7) * 0.09;
    world.sparks.push({
      x,
      y,
      velocityX: Math.cos(angle) * speed,
      velocityY: Math.sin(angle) * speed,
      life: 0.18 + seed(seedBase + index, 8) * 0.24,
    });
  }
};

const damagePlayer = (world: GameWorld, count: number) => {
  const now = world.elapsed * 1000;
  if (now - world.lastPlayerHit < PLAYER_HIT_COOLDOWN) return false;
  world.lastPlayerHit = now;
  world.health -= 1;
  spawnSparks(world, world.playerX, world.playerY, count);
  return true;
};

const firePlayerShot = (world: GameWorld) => {
  const activeShots = world.projectiles.filter((projectile) => projectile.friendly).length;
  const now = world.elapsed * 1000;

  if (activeShots >= MAX_PLAYER_PROJECTILES || now - world.lastPlayerShot < AUTO_FIRE_INTERVAL) return false;

  world.lastPlayerShot = now;
  world.projectiles.push({ x: world.playerX, y: world.playerY - 0.052, velocity: -0.94, velocityX: 0, friendly: true });
  return true;
};

const spawnEnemy = (world: GameWorld, kind: EnemyKind, x: number, y: number, phase: number) => {
  const enemy = world.enemies.find((candidate) => !candidate.alive);
  if (!enemy) return false;

  const spec = enemySpecs[kind];
  enemy.kind = kind;
  enemy.baseX = x;
  enemy.baseY = y;
  enemy.phase = phase;
  enemy.x = x;
  enemy.y = y;
  enemy.health = spec.health;
  enemy.maxHealth = spec.health;
  enemy.spawnAt = world.elapsed;
  enemy.velocity = spec.velocity;
  enemy.alive = true;
  return true;
};

const bossEntries: Record<BossKind, Pick<Enemy, "baseX" | "baseY" | "phase">> = {
  core: { baseX: 0.5, baseY: -0.18, phase: 0.35 },
  warden: { baseX: 0.5, baseY: -0.22, phase: 1.15 },
  archon: { baseX: 0.5, baseY: -0.24, phase: 2.1 },
};

const spawnBossEscort = (world: GameWorld, boss: Enemy) => {
  if (!isBossKind(boss.kind)) return false;

  const plan = bossEscortPlans[boss.kind];
  if (world.elapsed < world.nextEscortAt || remainingSignals(world) >= plan.maxSignals) return false;

  const cursor = world.escortCursor;
  const kind = plan.kinds[cursor % plan.kinds.length];
  const lane = bossEscortLanes[(cursor * 2 + world.bossIndex) % bossEscortLanes.length];
  const y = -0.13 - (cursor % 2) * 0.055;
  const phase = cursor * 1.17 + world.bossIndex * 0.73;
  if (!spawnEnemy(world, kind, lane, y, phase)) return false;

  world.escortCursor += 1;
  world.nextEscortAt = world.elapsed + plan.interval;
  return true;
};

const advanceMission = (world: GameWorld) => {
  while (world.enemyCursor < missionScript.length) {
    const directive = missionScript[world.enemyCursor];
    if (world.elapsed < directive.at || directive.afterBosses > world.bossIndex) break;
    if (!spawnEnemy(world, directive.kind, directive.x, directive.y, directive.phase)) break;
    world.enemyCursor += 1;
  }

  const boss = activeBoss(world);
  if (boss) {
    spawnBossEscort(world, boss);
    return;
  }

  const nextBoss = BOSS_SEQUENCE[world.bossIndex];
  const hasPendingSignals = missionScript.slice(world.enemyCursor).some(
    (directive) => directive.afterBosses === world.bossIndex,
  );
  if (
    nextBoss &&
    world.elapsed >= world.nextBossAt &&
    !hasPendingSignals
  ) {
    const entry = bossEntries[nextBoss];
    if (spawnEnemy(world, nextBoss, entry.baseX, entry.baseY, entry.phase)) {
      world.lastBossVolley = world.elapsed * 1000;
      world.bossVolleyIndex = 0;
      world.nextEscortAt = world.elapsed + bossEscortPlans[nextBoss].entryDelay;
    }
  }
};

const spawnAsteroid = (world: GameWorld) => {
  const now = world.elapsed * 1000;
  if (world.stage === "LOCK-ON" || world.stage === "CORE" || world.stage === "WARDEN" || world.stage === "ARCHON") return;

  const interval = 760;
  if (now - world.lastAsteroidSpawn < interval) return;

  const asteroid = world.asteroids.find((candidate) => !candidate.active);
  if (!asteroid) return;

  const cursor = world.asteroidCursor;
  world.asteroidCursor += 1;

  const large = cursor % 4 === 2;
  const lanes = [0.14, 0.32, 0.5, 0.68, 0.86];
  let x = lanes[(cursor * 2 + (large ? 1 : 0)) % lanes.length];
  const safetyMargin = large ? 0.24 : 0.14;
  if (Math.abs(x - world.playerX) < safetyMargin) {
    x = lanes.reduce((safest, candidate) =>
      Math.abs(candidate - world.playerX) > Math.abs(safest - world.playerX) ? candidate : safest,
    lanes[0]);
  }

  asteroid.x = x;
  asteroid.y = -0.16;
  asteroid.kind = large ? "monolith" : "shard";
  asteroid.breakable = !large;
  asteroid.velocity = large ? 0.18 + seed(cursor, 20) * 0.06 : 0.27 + seed(cursor, 20) * 0.13;
  asteroid.size = large ? 0.125 + seed(cursor, 21) * 0.05 : 0.05 + seed(cursor, 21) * 0.05;
  asteroid.spin = 0.45 + seed(cursor, 22) * 1.1;
  asteroid.active = true;
  world.lastAsteroidSpawn = now;
};

const getMissionStage = (world: GameWorld): MissionStage => {
  const boss = activeBoss(world);
  if (boss?.kind === "core") return "CORE";
  if (boss?.kind === "warden") return "WARDEN";
  if (boss?.kind === "archon") return "ARCHON";
  if (world.elapsed >= BELT_ENTRY_AT) return "BELT";
  return "LOCK-ON";
};

type BossShot = {
  offsetX: number;
  velocityX: number;
  velocity: number;
};

const bossVolleyIntervals: Record<BossKind, number> = {
  core: 920,
  warden: 820,
  archon: 680,
};

const bossVolleyPatterns: Record<BossKind, readonly BossShot[]> = {
  core: [
    { offsetX: -0.095, velocityX: -0.05, velocity: 0.34 },
    { offsetX: 0.095, velocityX: 0.05, velocity: 0.34 },
  ],
  warden: [
    { offsetX: -0.12, velocityX: -0.12, velocity: 0.37 },
    { offsetX: 0, velocityX: 0, velocity: 0.4 },
    { offsetX: 0.12, velocityX: 0.12, velocity: 0.37 },
  ],
  archon: [
    { offsetX: -0.12, velocityX: -0.12, velocity: 0.4 },
    { offsetX: 0, velocityX: 0, velocity: 0.42 },
    { offsetX: 0.12, velocityX: 0.12, velocity: 0.4 },
  ],
};

const fireBossVolley = (world: GameWorld, boss: Enemy) => {
  if (!isBossKind(boss.kind) || boss.y <= 0.03) return false;
  const pattern = bossVolleyPatterns[boss.kind];
  const activeEnemyShots = world.projectiles.filter((projectile) => !projectile.friendly).length;
  const now = world.elapsed * 1000;
  if (
    activeEnemyShots + pattern.length > MAX_ENEMY_PROJECTILES ||
    now - world.lastBossVolley < bossVolleyIntervals[boss.kind]
  ) {
    return false;
  }

  const playerLead = boss.kind === "archon" ? clamp((world.playerX - boss.x) * 0.26, -0.12, 0.12) : 0;
  const alternatingDrift = boss.kind === "warden" ? (world.bossVolleyIndex % 2 === 0 ? -0.045 : 0.045) : 0;
  for (const shot of pattern) {
    world.projectiles.push({
      x: clamp(boss.x + shot.offsetX, 0.04, 0.96),
      y: boss.y + 0.06,
      velocity: shot.velocity,
      velocityX: shot.velocityX + playerLead + alternatingDrift,
      friendly: false,
    });
  }
  world.lastBossVolley = now;
  world.bossVolleyIndex += 1;
  return true;
};

export default function OpeningGame({ onComplete, language, onLanguageChange }: OpeningGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<OpeningGameRenderer | null>(null);
  const audioRef = useRef<OpeningGameAudio | null>(null);
  const worldRef = useRef<GameWorld>(createWorld());
  const phaseRef = useRef<GamePhase>("briefing");
  const reducedMotionRef = useRef(false);
  const inputRef = useRef({ left: false, right: false, up: false, down: false });
  const activePointerIdRef = useRef<number | null>(null);
  const [phase, setPhase] = useState<GamePhase>("briefing");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [rendererState, setRendererState] = useState<RendererState>("loading");
  const [soundMuted, setSoundMuted] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [hud, setHud] = useState<Hud>({
    bossKind: null,
    bossHealth: 0,
    bossMaxHealth: 0,
    health: 3,
    score: 0,
  });
  const copy = gameCopy[language];

  const setGamePhase = useCallback((nextPhase: GamePhase) => {
    phaseRef.current = nextPhase;
    setPhase(nextPhase);
  }, []);

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) audioRef.current = createOpeningGameAudio();
    return audioRef.current;
  }, []);

  const resetWave = useCallback(() => {
    if (rendererState !== "ready" || (phaseRef.current !== "briefing" && phaseRef.current !== "failed")) return;
    const nextWorld = createWorld();
    worldRef.current = nextWorld;
    setIsExiting(false);
    inputRef.current = { left: false, right: false, up: false, down: false };
    activePointerIdRef.current = null;
    syncHud(nextWorld, setHud);
    const audio = ensureAudio();
    audio.setMuted(soundMuted);
    if (!soundMuted) void audio.start();
    setGamePhase("active");
  }, [ensureAudio, rendererState, setGamePhase, soundMuted]);

  const updatePlayerFromPointer = useCallback((clientX: number, clientY: number) => {
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds) return;
    worldRef.current.playerX = clamp((clientX - bounds.left) / bounds.width, PLAYER_MIN_X, PLAYER_MAX_X);
    worldRef.current.playerY = clamp((clientY - bounds.top) / bounds.height, PLAYER_MIN_Y, PLAYER_MAX_Y);
  }, []);

  const toggleSound = useCallback(() => {
    const nextMuted = !soundMuted;
    setSoundMuted(nextMuted);
    const audio = audioRef.current;
    if (!audio) return;
    audio.setMuted(nextMuted);
    if (!nextMuted) void audio.start();
  }, [soundMuted]);

  useEffect(() => {
    return () => {
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handleAudioVisibility = () => {
      const audio = audioRef.current;
      if (!audio || soundMuted) return;
      if (document.hidden) {
        void audio.suspend();
      } else if (phaseRef.current === "active") {
        void audio.resume();
      }
    };

    document.addEventListener("visibilitychange", handleAudioVisibility);
    return () => document.removeEventListener("visibilitychange", handleAudioVisibility);
  }, [soundMuted]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = () => {
      reducedMotionRef.current = media.matches;
      setReducedMotion(media.matches);
    };

    handleChange();
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let ownedRenderer: OpeningGameRenderer | null = null;
    const handleResize = () => rendererRef.current?.resize();
    const visualViewport = window.visualViewport;

    const loadRenderer = async () => {
      try {
        const { createOpeningGameRenderer } = await import("./openingGameRenderer");
        if (disposed) return;

        const renderer = createOpeningGameRenderer(canvas, () => {
          rendererRef.current = null;
          setRendererState("unavailable");
        });
        ownedRenderer = renderer;
        if (disposed) {
          renderer.dispose();
          return;
        }

        rendererRef.current = renderer;
        renderer.render(worldRef.current, phaseRef.current, reducedMotionRef.current, 0);
        setRendererState("ready");
      } catch {
        if (!disposed) setRendererState("unavailable");
      }
    };

    void loadRenderer();
    window.addEventListener("resize", handleResize);
    visualViewport?.addEventListener("resize", handleResize);
    return () => {
      disposed = true;
      window.removeEventListener("resize", handleResize);
      visualViewport?.removeEventListener("resize", handleResize);
      ownedRenderer?.dispose();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    rendererRef.current?.render(worldRef.current, phase, reducedMotion, 0);
  }, [phase, reducedMotion, rendererState]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const currentPhase = phaseRef.current;

      if (currentPhase !== "active") {
        if (
          rendererState === "ready" &&
          (event.code === "Enter" || event.code === "Space") &&
          (currentPhase === "briefing" || currentPhase === "failed")
        ) {
          event.preventDefault();
          resetWave();
        }
        return;
      }

      if (event.code === "ArrowLeft" || event.code === "KeyA") {
        inputRef.current.left = true;
        event.preventDefault();
      }
      if (event.code === "ArrowRight" || event.code === "KeyD") {
        inputRef.current.right = true;
        event.preventDefault();
      }
      if (event.code === "ArrowUp" || event.code === "KeyW") {
        inputRef.current.up = true;
        event.preventDefault();
      }
      if (event.code === "ArrowDown" || event.code === "KeyS") {
        inputRef.current.down = true;
        event.preventDefault();
      }
      if (event.code === "Space") event.preventDefault();
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "ArrowLeft" || event.code === "KeyA") inputRef.current.left = false;
      if (event.code === "ArrowRight" || event.code === "KeyD") inputRef.current.right = false;
      if (event.code === "ArrowUp" || event.code === "KeyW") inputRef.current.up = false;
      if (event.code === "ArrowDown" || event.code === "KeyS") inputRef.current.down = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [rendererState, resetWave]);

  useEffect(() => {
    if (phase !== "briefing" || reducedMotion || rendererState !== "ready") return;

    let frame = 0;
    let lastTime = 0;
    let suspended = document.hidden;
    const frameInterval = 1000 / 12;

    const drawAmbient = (now: number) => {
      if (suspended || phaseRef.current !== "briefing") return;
      if (lastTime === 0) lastTime = now;
      const elapsed = now - lastTime;
      if (elapsed >= frameInterval) {
        lastTime = now;
        worldRef.current.elapsed += Math.min(elapsed / 1000, 0.05) * 0.34;
        rendererRef.current?.render(worldRef.current, "briefing", false, Math.min(elapsed / 1000, 0.05));
      }
      frame = window.requestAnimationFrame(drawAmbient);
    };

    const handleVisibility = () => {
      suspended = document.hidden;
      if (suspended) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      } else if (frame === 0) {
        lastTime = 0;
        frame = window.requestAnimationFrame(drawAmbient);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    if (!suspended) frame = window.requestAnimationFrame(drawAmbient);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.cancelAnimationFrame(frame);
    };
  }, [phase, reducedMotion, rendererState]);

  useEffect(() => {
    if (phase !== "active" || rendererState !== "ready") return;

    const frameInterval = 1000 / (reducedMotion ? REDUCED_RENDER_RATE : MAX_RENDER_RATE);
    let frameId = 0;
    let lastFrameAt = 0;
    let suspended = document.hidden;

    const endWave = (result: Extract<GamePhase, "cleared" | "failed">) => {
      if (phaseRef.current !== "active") return;
      audioRef.current?.play(result === "cleared" ? "clear" : "fail");
      setGamePhase(result);
    };

    const updateWorld = (delta: number) => {
      const world = worldRef.current;
      const input = inputRef.current;
      world.elapsed += delta;
      world.forwardDistance += delta;
      let hudChanged = false;

      if (input.left) world.playerX -= delta * 0.66;
      if (input.right) world.playerX += delta * 0.66;
      if (input.up) world.playerY -= delta * 0.48;
      if (input.down) world.playerY += delta * 0.48;
      world.playerX = clamp(world.playerX, PLAYER_MIN_X, PLAYER_MAX_X);
      world.playerY = clamp(world.playerY, PLAYER_MIN_Y, PLAYER_MAX_Y);
      if (firePlayerShot(world)) audioRef.current?.play("fire");

      const previousCursor = world.enemyCursor;
      const previousBossIndex = world.bossIndex;
      const bossWasActive = Boolean(activeBoss(world));
      advanceMission(world);
      if (world.enemyCursor !== previousCursor || world.bossIndex !== previousBossIndex || Boolean(activeBoss(world)) !== bossWasActive) {
        hudChanged = true;
      }

      const nextStage = getMissionStage(world);
      if (nextStage !== world.stage) {
        world.stage = nextStage;
        audioRef.current?.play("stage");
        hudChanged = true;
      }

      for (const enemy of world.enemies) {
        if (!enemy.alive) continue;
        const age = world.elapsed - enemy.spawnAt;
        const motion = reducedMotion ? 0 : Math.sin(age * 2.8 + enemy.phase);

        if (enemy.kind === "scout") {
          enemy.x = clamp(enemy.baseX + motion * 0.055, 0.08, 0.92);
          enemy.y = enemy.baseY + age * enemy.velocity;
        } else if (enemy.kind === "sweep") {
          enemy.x = clamp(enemy.baseX + Math.sin(age * 1.65 + enemy.phase) * 0.29, 0.07, 0.93);
          enemy.y = enemy.baseY + age * enemy.velocity;
        } else if (enemy.kind === "sentinel") {
          enemy.x = clamp(enemy.baseX + motion * 0.12, 0.09, 0.91);
          enemy.y = enemy.baseY + age * enemy.velocity;
        } else if (enemy.kind === "core") {
          enemy.x = 0.5 + (reducedMotion ? 0 : Math.sin(age * 0.62 + enemy.phase) * 0.1);
          enemy.y = Math.min(0.19, enemy.baseY + age * enemy.velocity);
        } else if (enemy.kind === "warden") {
          enemy.x = 0.5 + (reducedMotion ? 0 : Math.sin(age * 0.72 + enemy.phase) * 0.2);
          enemy.y = Math.min(0.2, enemy.baseY + age * enemy.velocity);
        } else {
          enemy.x = 0.5 + (reducedMotion ? 0 : Math.sin(age * 0.5 + enemy.phase) * 0.24);
          enemy.y = Math.min(0.18, enemy.baseY + age * enemy.velocity);
        }

        if (!isBossKind(enemy.kind) && enemy.y > 0.76) {
          enemy.alive = false;
          hudChanged = true;
        }
      }

      spawnAsteroid(world);
      for (const asteroid of world.asteroids) {
        if (!asteroid.active) continue;
        asteroid.y += asteroid.velocity * delta;
        if (asteroid.y > 1.16) asteroid.active = false;
      }

      const boss = activeBoss(world);
      const now = world.elapsed * 1000;
      if (boss) {
        fireBossVolley(world, boss);
      }

      const livingSignals = world.enemies.filter(
        (enemy) => enemy.alive && !isBossKind(enemy.kind),
      );
      const activeEnemyShots = world.projectiles.filter((projectile) => !projectile.friendly).length;
      if (
        livingSignals.length > 0 &&
        activeEnemyShots < MAX_ENEMY_PROJECTILES &&
        now - world.lastEnemyShot >= ENEMY_SHOT_INTERVAL
      ) {
        const shooter = livingSignals[Math.floor((world.elapsed * 1.7) % livingSignals.length)];
        world.lastEnemyShot = now;
        world.projectiles.push({
          x: shooter.x,
          y: shooter.y + 0.05,
          velocity: 0.33,
          velocityX: 0,
          friendly: false,
        });
      }

      const nextProjectiles: Projectile[] = [];
      for (const projectile of world.projectiles) {
        projectile.x += projectile.velocityX * delta;
        projectile.y += projectile.velocity * delta;
        if (projectile.x < -0.06 || projectile.x > 1.06 || projectile.y < -0.04 || projectile.y > 1.04) continue;

        if (projectile.friendly) {
          const asteroid = world.asteroids.find(
            (candidate) =>
              candidate.active &&
              Math.hypot(candidate.x - projectile.x, candidate.y - projectile.y) < candidate.size + 0.018,
          );
          if (asteroid) {
            if (asteroid.breakable) {
              asteroid.active = false;
              world.score += 25;
              spawnSparks(world, asteroid.x, asteroid.y, 6);
              audioRef.current?.play("asteroidDestroy");
              hudChanged = true;
            } else {
              spawnSparks(world, projectile.x, projectile.y, 2);
              audioRef.current?.play("asteroidImpact");
            }
            continue;
          }

          const bossTarget = activeBoss(world);
          const target = bossTarget && projectileHitsEnemy(projectile, bossTarget)
            ? bossTarget
            : world.enemies.find(
              (enemy) =>
                enemy.alive &&
                !isBossKind(enemy.kind) &&
                projectileHitsEnemy(projectile, enemy),
            );
          if (target) {
            target.health -= 1;
            if (target.health <= 0) {
              target.alive = false;
              world.score += enemySpecs[target.kind].score;
              spawnSparks(world, target.x, target.y, isBossKind(target.kind) ? 18 : 9);
              audioRef.current?.play("enemyDestroy");
              if (isBossKind(target.kind)) {
                world.bossIndex += 1;
                world.nextBossAt = world.elapsed + BOSS_RESPITE_SECONDS;
              }
            } else {
              world.score += isBossKind(target.kind) ? 20 : 10;
              spawnSparks(world, target.x, target.y, 3);
              audioRef.current?.play("enemyHit");
            }
            hudChanged = true;
            continue;
          }
        } else if (Math.hypot(world.playerX - projectile.x, world.playerY - projectile.y) < 0.052) {
          if (damagePlayer(world, 6)) {
            audioRef.current?.play("playerDamage");
            hudChanged = true;
          }
          continue;
        }

        nextProjectiles.push(projectile);
      }
      world.projectiles = nextProjectiles;

      for (const asteroid of world.asteroids) {
        if (!asteroid.active) continue;
        if (Math.hypot(world.playerX - asteroid.x, world.playerY - asteroid.y) >= asteroid.size + 0.052) continue;
        asteroid.active = false;
        if (damagePlayer(world, 11)) {
          audioRef.current?.play("playerDamage");
          hudChanged = true;
        }
      }

      const nextSparks: Spark[] = [];
      for (const spark of world.sparks) {
        spark.life -= delta;
        if (spark.life <= 0) continue;
        spark.x += spark.velocityX * delta;
        spark.y += spark.velocityY * delta;
        nextSparks.push(spark);
      }
      world.sparks = nextSparks;

      if (hudChanged) syncHud(world, setHud);
      if (world.bossIndex >= BOSS_SEQUENCE.length && !activeBoss(world)) endWave("cleared");
      else if (world.health <= 0) endWave("failed");
    };

    const scheduleFrame = () => {
      frameId = window.requestAnimationFrame(renderFrame);
    };

    const renderFrame = (now: number) => {
      if (suspended || phaseRef.current !== "active") return;
      if (lastFrameAt === 0) lastFrameAt = now;
      const elapsed = now - lastFrameAt;
      if (elapsed >= frameInterval) {
        lastFrameAt = now;
        const delta = Math.min(elapsed / 1000, 0.05);
        updateWorld(delta);
        rendererRef.current?.render(worldRef.current, phaseRef.current, reducedMotion, delta);
      }
      if (phaseRef.current === "active") scheduleFrame();
    };

    const handleVisibility = () => {
      suspended = document.hidden;
      if (suspended) {
        window.cancelAnimationFrame(frameId);
        frameId = 0;
        return;
      }
      lastFrameAt = 0;
      if (frameId === 0 && phaseRef.current === "active") scheduleFrame();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    if (!suspended) scheduleFrame();
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.cancelAnimationFrame(frameId);
    };
  }, [phase, reducedMotion, rendererState, setGamePhase]);

  useEffect(() => {
    if (phase !== "cleared") return;

    if (reducedMotion) {
      const timeout = window.setTimeout(onComplete, 40);
      return () => window.clearTimeout(timeout);
    }

    const exitTimeout = window.setTimeout(() => setIsExiting(true), VICTORY_HOLD_DURATION);
    const completeTimeout = window.setTimeout(onComplete, VICTORY_HOLD_DURATION + VICTORY_EXIT_DURATION);
    return () => {
      window.clearTimeout(exitTimeout);
      window.clearTimeout(completeTimeout);
    };
  }, [onComplete, phase, reducedMotion]);

  useEffect(() => {
    if (phase !== "cleared" || reducedMotion || rendererState !== "ready") return;

    let frame = 0;
    let lastFrameAt = 0;
    let suspended = document.hidden;
    const frameInterval = 1000 / 12;

    const renderVictory = (now: number) => {
      if (suspended || phaseRef.current !== "cleared") return;
      if (lastFrameAt === 0) lastFrameAt = now;
      const elapsed = now - lastFrameAt;
      if (elapsed >= frameInterval) {
        lastFrameAt = now;
        rendererRef.current?.render(worldRef.current, "cleared", false, Math.min(elapsed / 1000, 0.05));
      }
      frame = window.requestAnimationFrame(renderVictory);
    };

    const handleVisibility = () => {
      suspended = document.hidden;
      if (suspended) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      } else if (frame === 0) {
        lastFrameAt = 0;
        frame = window.requestAnimationFrame(renderVictory);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    if (!suspended) frame = window.requestAnimationFrame(renderVictory);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.cancelAnimationFrame(frame);
    };
  }, [phase, reducedMotion, rendererState]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (phaseRef.current !== "active" || rendererState !== "ready") return;
    event.preventDefault();
    activePointerIdRef.current = event.pointerId;
    updatePlayerFromPointer(event.clientX, event.clientY);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (phaseRef.current !== "active") return;
    const activePointerId = activePointerIdRef.current;
    if (activePointerId !== null && activePointerId !== event.pointerId) return;
    if (event.pointerType !== "mouse" && activePointerId === null) return;
    event.preventDefault();
    updatePlayerFromPointer(event.clientX, event.clientY);
  };

  const releasePointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activePointerIdRef.current !== event.pointerId) return;
    activePointerIdRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const stateCopy =
    rendererState === "loading"
      ? copy.loading
      : rendererState === "unavailable"
        ? copy.unavailable
        : phase === "briefing"
          ? copy.enter
          : phase === "failed"
            ? copy.retry
            : "";
  const bossCodes: Record<BossKind, string> = { core: "C-01", warden: "W-02", archon: "A-03" };
  const bossReadout = hud.bossKind && hud.bossMaxHealth > 0
    ? `${bossCodes[hud.bossKind]} ${"▰".repeat(Math.ceil((hud.bossHealth / hud.bossMaxHealth) * 8))}${"▱".repeat(8 - Math.ceil((hud.bossHealth / hud.bossMaxHealth) * 8))}`
    : null;

  return (
    <section className={`opening-game opening-game--${phase}${isExiting ? " is-exiting" : ""}`} aria-labelledby="opening-game-title">
      <canvas
        ref={canvasRef}
        className="opening-game-canvas"
        aria-hidden="true"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={releasePointer}
        onPointerCancel={releasePointer}
      />

      {rendererState === "ready" && (phase === "briefing" || phase === "failed") ? (
        <button
          type="button"
          className="opening-game-tap-target"
          aria-label={phase === "briefing" ? copy.startGame : copy.retryGame}
          onClick={resetWave}
        />
      ) : null}

      <h1 className="opening-game-sr-title" id="opening-game-title">{copy.title}</h1>

      <div className="opening-game-topbar">
        <span>0xAA</span>
        <div className="opening-game-topbar-controls">
          <div className="language-switch" role="group" aria-label={copy.languageLabel}>
            <button
              type="button"
              className="language-switch-button"
              aria-pressed={language === "zh"}
              data-active={language === "zh"}
              onClick={(event) => {
                event.stopPropagation();
                onLanguageChange("zh");
              }}
            >
              {copy.chinese}
            </button>
            <button
              type="button"
              className="language-switch-button"
              aria-pressed={language === "en"}
              data-active={language === "en"}
              onClick={(event) => {
                event.stopPropagation();
                onLanguageChange("en");
              }}
            >
              {copy.english}
            </button>
          </div>
          <button
            type="button"
            className="opening-game-sound-toggle"
            aria-label={soundMuted ? copy.soundOn : copy.soundOff}
            aria-pressed={!soundMuted}
            onClick={(event) => {
              event.stopPropagation();
              toggleSound();
            }}
          >
            {copy.soundLabel} {soundMuted ? copy.soundDisabled : copy.soundEnabled}
          </button>
          <button
            type="button"
            className="opening-game-skip"
            aria-label={copy.skipLabel}
            onClick={(event) => {
              event.stopPropagation();
              onComplete();
            }}
          >
            {copy.skip} →
          </button>
        </div>
      </div>

      <div className="opening-game-hud" aria-hidden="true">
        <span className="opening-game-score-readout">
          {copy.scoreLabel} {hud.score.toString().padStart(5, "0")}
        </span>
        {bossReadout ? <span className="opening-game-boss-readout">{bossReadout}</span> : null}
        <span>{"▰".repeat(hud.health)}{"▱".repeat(3 - hud.health)}</span>
      </div>

      <div className="opening-game-panel">
        {stateCopy ? <p className="opening-game-status" aria-live="polite">{stateCopy}</p> : null}

        {phase === "briefing" ? (
          <div className="opening-game-briefing">
            <h2>0xAA</h2>
            <p className="opening-game-controls">{copy.controls}</p>
            {rendererState === "unavailable" ? (
              <p className="opening-game-fallback">{copy.fallback}</p>
            ) : null}
          </div>
        ) : null}

        {phase === "failed" ? (
          <div className="opening-game-briefing">
            <h2>{copy.retryHeading}</h2>
          </div>
        ) : null}

      </div>

      {phase === "cleared" ? (
        <div className="opening-game-victory" role="status" aria-live="polite">
          <p>{copy.nodeComplete}</p>
          <h2>0xAA</h2>
          <div className="opening-game-victory-rail" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <p>{copy.unlocked}</p>
        </div>
      ) : null}
    </section>
  );
}
