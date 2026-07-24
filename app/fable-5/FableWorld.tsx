"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ModelSwitcher from "../ModelSwitcher";
import { createFableWorldAudio, type FableWorldAudio } from "./fableWorldAudio";
import type { FableWorldRenderer } from "./fableWorldRenderer";
import {
  BLOCK_SIZE,
  COIN_RADIUS,
  ENEMY_HALF,
  FALL_LIMIT_Y,
  FLAG_X,
  GROUND_SEGMENTS,
  FLOATING_PLATFORMS,
  LEVEL_BLOCKS,
  LEVEL_COINS,
  LEVEL_ENEMIES,
  LEVEL_PORTALS,
  LEVEL_ZONES,
  PLAYER_HALF,
  PORTAL_HALF,
  TOTAL_BLOCKS,
  buildColliders,
  type LevelPlatform,
} from "./fableLevel";

export type WorldPhase = "start" | "playing" | "defeated" | "victory";
export type FableWorldLanguage = "zh" | "en";

export type PlayerState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  grounded: boolean;
  hearts: number;
  invulnUntil: number;
  lastGroundedAt: number;
  jumpBufferUntil: number;
  jumpHeld: boolean;
  stompBounceAt: number;
  hurtAt: number;
};

export type BlockState = { used: boolean; bumpAt: number };
export type CoinState = { collected: boolean; collectedAt: number };
export type EnemyState = { x: number; y: number; direction: 1 | -1; alive: boolean; squashedAt: number };

export type PlatformWorld = {
  elapsed: number;
  runStartedAt: number;
  player: PlayerState;
  blocks: BlockState[];
  coins: CoinState[];
  enemies: EnemyState[];
  stardust: number;
  revealed: number;
  checkpointIndex: number;
  activePortal: number;
  lastCoinAt: number;
  lastBumpAt: number;
  lastBumpX: number;
  lastBumpY: number;
  lastStompAt: number;
  lastStompX: number;
  lastStompY: number;
  victoryAt: number;
  completedSeconds: number;
};

const GRAVITY = 34;
const JUMP_VELOCITY = 12.5;
const FALL_GRAVITY_MULTIPLIER = 1.25;
const JUMP_CUT_GRAVITY_MULTIPLIER = 2.1;
const RUN_SPEED = 7;
const GROUND_ACCEL = 48;
const AIR_ACCEL = 30;
const GROUND_FRICTION = 40;
const COYOTE_SECONDS = 0.09;
const JUMP_BUFFER_SECONDS = 0.12;
const FIXED_STEP = 1 / 120;
const MAX_STEPS_PER_FRAME = 6;
const STOMP_BOUNCE_VELOCITY = 8.5;
const STOMP_MIN_FALL_VELOCITY = -1;
const HURT_KNOCKBACK_X = 4.5;
const HURT_KNOCKBACK_Y = 6;
const INVULN_SECONDS = 1.5;
const MAX_HEARTS = 3;
const BLOCK_REVEAL_STARDUST = 5;

type RendererState = "loading" | "ready" | "unavailable";

const worldCopy: Record<
  FableWorldLanguage,
  {
    title: string;
    kicker: string;
    lede: string;
    controlsDesktop: string;
    controlsTouch: string;
    start: string;
    loading: string;
    readingMode: string;
    unavailableBody: string;
    victoryHeading: string;
    victoryStats: (stardust: number, revealed: number, seconds: string) => string;
    victoryHint: string;
    replay: string;
    defeatedHeading: string;
    defeatedBody: string;
    respawn: string;
    hudZone: string;
    hudStardust: string;
    portalHint: (label: string) => string;
    enterPortal: string;
    soundLabel: string;
    soundOn: string;
    soundOff: string;
    languageLabel: string;
    switcherLabel: string;
    canvasLabel: string;
    touchLeft: string;
    touchRight: string;
    touchJump: string;
  }
> = {
  zh: {
    title: "0xAA WORLD",
    kicker: "FABLE 5 / 主页即关卡",
    lede: "一则未写完的寓言：向右奔跑，顶出「?」砖里的领域与项目，踩扁噪声，最后穿过传送门抵达旗帜。这一页主页，由你亲手顶出来。",
    controlsDesktop: "←→ 移动 · 空格跳跃（长按更高）· ↑ 进入传送门",
    controlsTouch: "左右按键移动 · ● 跳跃 · 传送门前按「进入」",
    start: "开始冒险",
    loading: "初始化世界",
    readingMode: "阅读模式",
    unavailableBody: "此设备暂不支持 WebGL，已为你切换到阅读模式。",
    victoryHeading: "未完待续",
    victoryStats: (stardust, revealed, seconds) =>
      `星尘 ${stardust} · 揭示 ${revealed}/${TOTAL_BLOCKS} 张卡片 · 用时 ${seconds}s`,
    victoryHint: "错过的卡片可以再跑一遍，或切换到阅读模式慢慢看。",
    replay: "再跑一遍",
    defeatedHeading: "信号衰减",
    defeatedBody: "噪声吞没了信号。从检查点重新出发。",
    respawn: "重新出发",
    hudZone: "章节",
    hudStardust: "星尘",
    portalHint: (label) => `↑ 进入 ${label}`,
    enterPortal: "进入",
    soundLabel: "切换声音",
    soundOn: "声音 开",
    soundOff: "声音 关",
    languageLabel: "选择语言",
    switcherLabel: "切换模型主页",
    canvasLabel: "0xAA WORLD：横版平台跳跃小游戏，主页内容藏在关卡里",
    touchLeft: "向左移动",
    touchRight: "向右移动",
    touchJump: "跳跃",
  },
  en: {
    title: "0xAA WORLD",
    kicker: "FABLE 5 / THE HOMEPAGE IS THE LEVEL",
    lede: "An unfinished fable: run right, bump fields and projects out of ? blocks, stomp the noise, and reach the flag beyond the portals. You knock this homepage into being yourself.",
    controlsDesktop: "←→ move · SPACE jump (hold for height) · ↑ enter portals",
    controlsTouch: "Left/right to move · ● to jump · press ENTER at portals",
    start: "START THE RUN",
    loading: "PRIMING THE WORLD",
    readingMode: "READING MODE",
    unavailableBody: "WebGL is unavailable on this device — switching you to reading mode.",
    victoryHeading: "TO BE CONTINUED",
    victoryStats: (stardust, revealed, seconds) =>
      `Stardust ${stardust} · Revealed ${revealed}/${TOTAL_BLOCKS} cards · ${seconds}s`,
    victoryHint: "Missed a card? Run it again, or switch to reading mode.",
    replay: "RUN AGAIN",
    defeatedHeading: "SIGNAL LOST",
    defeatedBody: "The noise swallowed your signal. Restart from the checkpoint.",
    respawn: "RESPAWN",
    hudZone: "CHAPTER",
    hudStardust: "STARDUST",
    portalHint: (label) => `↑ ENTER ${label}`,
    enterPortal: "ENTER",
    soundLabel: "Toggle sound",
    soundOn: "SND ON",
    soundOff: "SND OFF",
    languageLabel: "Choose language",
    switcherLabel: "Switch model pages",
    canvasLabel: "0xAA WORLD: a side-scrolling platformer with the homepage hidden inside the level",
    touchLeft: "Move left",
    touchRight: "Move right",
    touchJump: "Jump",
  },
};

const createPlayer = (): PlayerState => ({
  x: LEVEL_ZONES[0].spawnX,
  y: PLAYER_HALF.y + 0.01,
  vx: 0,
  vy: 0,
  facing: 1,
  grounded: false,
  hearts: MAX_HEARTS,
  invulnUntil: 0,
  lastGroundedAt: -1,
  jumpBufferUntil: -1,
  jumpHeld: false,
  stompBounceAt: 0,
  hurtAt: 0,
});

const createWorld = (): PlatformWorld => ({
  elapsed: 0,
  runStartedAt: 0,
  player: createPlayer(),
  blocks: LEVEL_BLOCKS.map(() => ({ used: false, bumpAt: 0 })),
  coins: LEVEL_COINS.map(() => ({ collected: false, collectedAt: 0 })),
  enemies: LEVEL_ENEMIES.map((enemy) => ({
    x: enemy.minX + (enemy.maxX - enemy.minX) / 2,
    y: enemy.y + ENEMY_HALF.y,
    direction: 1,
    alive: true,
    squashedAt: 0,
  })),
  stardust: 0,
  revealed: 0,
  checkpointIndex: 0,
  activePortal: -1,
  lastCoinAt: 0,
  lastBumpAt: 0,
  lastBumpX: 0,
  lastBumpY: 0,
  lastStompAt: 0,
  lastStompX: 0,
  lastStompY: 0,
  victoryAt: 0,
  completedSeconds: 0,
});

const overlaps = (
  ax: number, ay: number, ahx: number, ahy: number,
  bx: number, by: number, bhx: number, bhy: number,
) => Math.abs(ax - bx) < ahx + bhx && Math.abs(ay - by) < ahy + bhy;

const colliderTop = (collider: LevelPlatform) => collider.y;
const colliderBottom = (collider: LevelPlatform) => collider.y - collider.height;
const colliderLeft = (collider: LevelPlatform) => collider.x;
const colliderRight = (collider: LevelPlatform) => collider.x + collider.width;

const playerOverlapsCollider = (player: PlayerState, collider: LevelPlatform) =>
  player.x + PLAYER_HALF.x > colliderLeft(collider) &&
  player.x - PLAYER_HALF.x < colliderRight(collider) &&
  player.y + PLAYER_HALF.y > colliderBottom(collider) &&
  player.y - PLAYER_HALF.y < colliderTop(collider);

export type FableWorldProps = {
  language: FableWorldLanguage;
  onLanguageChange: (language: FableWorldLanguage) => void;
  onSwitchToReading: () => void;
};

export default function FableWorld({ language, onLanguageChange, onSwitchToReading }: FableWorldProps) {
  const copy = worldCopy[language];

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<PlatformWorld>(createWorld());
  const collidersRef = useRef<LevelPlatform[]>(buildColliders());
  const rendererRef = useRef<FableWorldRenderer | null>(null);
  const audioRef = useRef<FableWorldAudio | null>(null);
  const phaseRef = useRef<WorldPhase>("start");
  const inputRef = useRef({ left: false, right: false });
  const reducedMotionRef = useRef(false);
  const mutedRef = useRef(false);
  const languageRef = useRef(language);

  const [phase, setPhase] = useState<WorldPhase>("start");
  const [rendererState, setRendererState] = useState<RendererState>("loading");
  const [muted, setMuted] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [hudHearts, setHudHearts] = useState(MAX_HEARTS);
  const [hudStardust, setHudStardust] = useState(0);
  const [hudRevealed, setHudRevealed] = useState(0);
  const [hudZone, setHudZone] = useState(0);
  const [hudPortal, setHudPortal] = useState(-1);
  const [victoryStats, setVictoryStats] = useState({ stardust: 0, revealed: 0, seconds: "0.0" });

  const updatePhase = useCallback((next: WorldPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  useEffect(() => {
    languageRef.current = language;
    rendererRef.current?.setLanguage(language);
  }, [language]);

  const requestJump = useCallback(() => {
    const world = worldRef.current;
    world.player.jumpBufferUntil = world.elapsed + JUMP_BUFFER_SECONDS;
    world.player.jumpHeld = true;
  }, []);

  const releaseJump = useCallback(() => {
    worldRef.current.player.jumpHeld = false;
  }, []);

  const enterActivePortal = useCallback(() => {
    const portalIndex = worldRef.current.activePortal;
    if (portalIndex < 0) return false;
    const portal = LEVEL_PORTALS[portalIndex];
    audioRef.current?.cuePortal();
    window.open(portal.href, "_blank", "noopener");
    return true;
  }, []);

  const stepWorld = useCallback(
    (world: PlatformWorld, dt: number) => {
      const player = world.player;
      world.elapsed += dt;

      // Horizontal control.
      const move = (inputRef.current.right ? 1 : 0) - (inputRef.current.left ? 1 : 0);
      const accel = player.grounded ? GROUND_ACCEL : AIR_ACCEL;
      if (move !== 0) {
        player.vx += move * accel * dt;
        player.vx = Math.max(-RUN_SPEED, Math.min(RUN_SPEED, player.vx));
        player.facing = move > 0 ? 1 : -1;
      } else if (player.grounded) {
        const decel = GROUND_FRICTION * dt;
        player.vx = Math.abs(player.vx) <= decel ? 0 : player.vx - Math.sign(player.vx) * decel;
      }

      // Jump: buffered press + coyote time + variable height via gravity shaping.
      const canJump =
        player.grounded || world.elapsed - player.lastGroundedAt <= COYOTE_SECONDS;
      if (player.jumpBufferUntil >= world.elapsed && canJump) {
        player.vy = JUMP_VELOCITY;
        player.grounded = false;
        player.jumpBufferUntil = -1;
        player.lastGroundedAt = -1;
        audioRef.current?.cueJump();
      }
      const gravityMultiplier =
        player.vy < 0
          ? FALL_GRAVITY_MULTIPLIER
          : player.jumpHeld
            ? 1
            : JUMP_CUT_GRAVITY_MULTIPLIER;
      player.vy -= GRAVITY * gravityMultiplier * dt;
      player.vy = Math.max(player.vy, -26);

      const colliders = collidersRef.current;

      // Integrate X, resolve horizontal overlaps.
      player.x += player.vx * dt;
      for (const collider of colliders) {
        if (!playerOverlapsCollider(player, collider)) continue;
        if (player.vx > 0) player.x = colliderLeft(collider) - PLAYER_HALF.x;
        else if (player.vx < 0) player.x = colliderRight(collider) + PLAYER_HALF.x;
        player.vx = 0;
      }
      player.x = Math.max(player.x, -2);

      // Integrate Y, resolve vertical overlaps.
      player.y += player.vy * dt;
      player.grounded = false;
      let bumpedBlock = -1;
      for (let index = 0; index < colliders.length; index += 1) {
        const collider = colliders[index];
        if (!playerOverlapsCollider(player, collider)) continue;
        if (player.vy <= 0) {
          player.y = colliderTop(collider) + PLAYER_HALF.y;
          player.vy = 0;
          player.grounded = true;
          player.lastGroundedAt = world.elapsed;
        } else {
          player.y = colliderBottom(collider) - PLAYER_HALF.y;
          player.vy = 0;
          const blockIndex = index - (GROUND_SEGMENTS.length + FLOATING_PLATFORMS.length);
          if (blockIndex >= 0) bumpedBlock = blockIndex;
        }
      }

      // ? block bump.
      if (bumpedBlock >= 0) {
        const state = world.blocks[bumpedBlock];
        state.bumpAt = world.elapsed;
        world.lastBumpAt = world.elapsed;
        world.lastBumpX = LEVEL_BLOCKS[bumpedBlock].x;
        world.lastBumpY = LEVEL_BLOCKS[bumpedBlock].y + BLOCK_SIZE;
        if (!state.used) {
          state.used = true;
          world.revealed += 1;
          world.stardust += BLOCK_REVEAL_STARDUST;
          audioRef.current?.cueReveal(world.revealed);
        } else {
          audioRef.current?.cueBump();
        }
      }

      // Coins.
      for (let index = 0; index < LEVEL_COINS.length; index += 1) {
        const state = world.coins[index];
        if (state.collected) continue;
        const coin = LEVEL_COINS[index];
        if (overlaps(player.x, player.y, PLAYER_HALF.x, PLAYER_HALF.y, coin.x, coin.y, COIN_RADIUS, COIN_RADIUS)) {
          state.collected = true;
          state.collectedAt = world.elapsed;
          world.stardust += 1;
          world.lastCoinAt = world.elapsed;
          audioRef.current?.cueCoin();
        }
      }

      // Enemies: patrol, stomp, hurt.
      const invulnerable = world.elapsed < player.invulnUntil;
      for (let index = 0; index < LEVEL_ENEMIES.length; index += 1) {
        const enemy = LEVEL_ENEMIES[index];
        const state = world.enemies[index];
        if (!state.alive) continue;
        state.x += state.direction * enemy.speed * dt;
        if (state.x < enemy.minX) state.direction = 1;
        if (state.x > enemy.maxX) state.direction = -1;

        if (!overlaps(player.x, player.y, PLAYER_HALF.x * 0.9, PLAYER_HALF.y * 0.9, state.x, state.y, ENEMY_HALF.x, ENEMY_HALF.y)) {
          continue;
        }
        const playerBottom = player.y - PLAYER_HALF.y;
        if (player.vy < STOMP_MIN_FALL_VELOCITY && playerBottom > state.y - ENEMY_HALF.y * 0.5) {
          state.alive = false;
          state.squashedAt = world.elapsed;
          world.lastStompAt = world.elapsed;
          world.lastStompX = state.x;
          world.lastStompY = state.y;
          world.stardust += 1;
          player.vy = STOMP_BOUNCE_VELOCITY;
          audioRef.current?.cueStomp();
        } else if (!invulnerable) {
          player.hearts -= 1;
          player.hurtAt = world.elapsed;
          player.invulnUntil = world.elapsed + INVULN_SECONDS;
          player.vx = (player.x < state.x ? -1 : 1) * HURT_KNOCKBACK_X;
          player.vy = HURT_KNOCKBACK_Y;
          audioRef.current?.cueHurt();
          if (player.hearts <= 0) updatePhase("defeated");
        }
      }

      // Checkpoints: remember the furthest chapter reached.
      for (let index = LEVEL_ZONES.length - 1; index >= 0; index -= 1) {
        if (player.x >= LEVEL_ZONES[index].fromX) {
          if (index > world.checkpointIndex) world.checkpointIndex = index;
          break;
        }
      }

      // Pit fall.
      if (player.y < FALL_LIMIT_Y) {
        player.hearts -= 1;
        player.hurtAt = world.elapsed;
        player.invulnUntil = world.elapsed + INVULN_SECONDS;
        audioRef.current?.cueFall();
        const zone = LEVEL_ZONES[world.checkpointIndex];
        player.x = zone.spawnX;
        player.y = zone.spawnY + PLAYER_HALF.y + 0.01;
        player.vx = 0;
        player.vy = 0;
        if (player.hearts <= 0) updatePhase("defeated");
      }

      // Portal proximity.
      world.activePortal = -1;
      for (let index = 0; index < LEVEL_PORTALS.length; index += 1) {
        const portal = LEVEL_PORTALS[index];
        if (overlaps(player.x, player.y, PLAYER_HALF.x, PLAYER_HALF.y, portal.x, portal.y + PORTAL_HALF.y, PORTAL_HALF.x, PORTAL_HALF.y)) {
          world.activePortal = index;
          break;
        }
      }

      // Flag.
      if (player.x >= FLAG_X && phaseRef.current === "playing") {
        world.victoryAt = world.elapsed;
        world.completedSeconds = world.elapsed - world.runStartedAt;
        setVictoryStats({
          stardust: world.stardust,
          revealed: world.revealed,
          seconds: world.completedSeconds.toFixed(1),
        });
        updatePhase("victory");
        audioRef.current?.cueVictory();
      }
    },
    [updatePhase],
  );

  // Renderer + fixed-timestep simulation loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let frame: number | null = null;
    let lastTimestamp: number | null = null;
    let accumulator = 0;

    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = reducedMotionQuery.matches;
    const onReducedMotionChange = (event: MediaQueryListEvent) => {
      reducedMotionRef.current = event.matches;
    };
    reducedMotionQuery.addEventListener("change", onReducedMotionChange);

    const compact =
      window.matchMedia("(max-width: 720px)").matches ||
      window.matchMedia("(pointer: coarse)").matches;
    setIsTouchDevice(window.matchMedia("(pointer: coarse)").matches);

    const loop = (timestamp: number) => {
      if (disposed) return;
      frame = window.requestAnimationFrame(loop);
      if (lastTimestamp === null) {
        lastTimestamp = timestamp;
        return;
      }
      const frameSeconds = Math.min((timestamp - lastTimestamp) / 1000, 0.25);
      lastTimestamp = timestamp;

      const world = worldRef.current;
      if (phaseRef.current === "playing") {
        accumulator += frameSeconds;
        let steps = 0;
        while (accumulator >= FIXED_STEP && steps < MAX_STEPS_PER_FRAME) {
          stepWorld(world, FIXED_STEP);
          accumulator -= FIXED_STEP;
          steps += 1;
        }
        if (steps === MAX_STEPS_PER_FRAME) accumulator = 0;

        const player = world.player;
        setHudHearts((previous) => (previous === player.hearts ? previous : player.hearts));
        setHudStardust((previous) => (previous === world.stardust ? previous : world.stardust));
        setHudRevealed((previous) => (previous === world.revealed ? previous : world.revealed));
        setHudPortal((previous) => (previous === world.activePortal ? previous : world.activePortal));
        let zoneIndex = 0;
        for (let index = LEVEL_ZONES.length - 1; index >= 0; index -= 1) {
          if (player.x >= LEVEL_ZONES[index].fromX) {
            zoneIndex = index;
            break;
          }
        }
        setHudZone((previous) => (previous === zoneIndex ? previous : zoneIndex));
      } else {
        world.elapsed += frameSeconds;
      }

      rendererRef.current?.render(world, phaseRef.current, reducedMotionRef.current, frameSeconds);
    };

    void import("./fableWorldRenderer")
      .then(({ createFableWorldRenderer }) => {
        if (disposed) return;
        try {
          rendererRef.current = createFableWorldRenderer(canvas, {
            compact,
            language: languageRef.current,
          });
          setRendererState("ready");
        } catch {
          setRendererState("unavailable");
          return;
        }
        frame = window.requestAnimationFrame(loop);
      })
      .catch(() => {
        if (!disposed) setRendererState("unavailable");
      });

    const onResize = () => rendererRef.current?.resize();
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (frame !== null) window.cancelAnimationFrame(frame);
        frame = null;
        lastTimestamp = null;
      } else if (frame === null && rendererRef.current) {
        frame = window.requestAnimationFrame(loop);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      disposed = true;
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      reducedMotionQuery.removeEventListener("change", onReducedMotionChange);
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, [stepWorld]);

  // Keyboard input.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      switch (event.key) {
        case "ArrowLeft":
        case "a":
          inputRef.current.left = true;
          break;
        case "ArrowRight":
        case "d":
          inputRef.current.right = true;
          break;
        case " ":
          if (phaseRef.current === "playing") {
            requestJump();
            event.preventDefault();
          }
          break;
        case "ArrowUp":
        case "w":
          if (phaseRef.current === "playing") {
            // At a portal, up means "enter"; elsewhere it is a jump key.
            if (!enterActivePortal()) requestJump();
            event.preventDefault();
          }
          break;
        case "e":
          if (phaseRef.current === "playing") enterActivePortal();
          break;
        default:
          return;
      }
      if (phaseRef.current === "playing" && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      switch (event.key) {
        case "ArrowLeft":
        case "a":
          inputRef.current.left = false;
          break;
        case "ArrowRight":
        case "d":
          inputRef.current.right = false;
          break;
        case " ":
        case "ArrowUp":
        case "w":
          releaseJump();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [enterActivePortal, releaseJump, requestJump]);

  useEffect(
    () => () => {
      audioRef.current?.dispose();
    },
    [],
  );

  // Auto-switch to reading mode when WebGL is unavailable.
  useEffect(() => {
    if (rendererState !== "unavailable") return;
    const timer = window.setTimeout(onSwitchToReading, 2400);
    return () => window.clearTimeout(timer);
  }, [onSwitchToReading, rendererState]);

  const startRun = useCallback(() => {
    if (!audioRef.current) audioRef.current = createFableWorldAudio();
    audioRef.current.setMuted(mutedRef.current);
    void audioRef.current.start();
    const world = worldRef.current;
    world.runStartedAt = world.elapsed;
    updatePhase("playing");
  }, [updatePhase]);

  const replayRun = useCallback(() => {
    const elapsed = worldRef.current.elapsed;
    worldRef.current = createWorld();
    worldRef.current.elapsed = elapsed;
    worldRef.current.runStartedAt = elapsed;
    setHudHearts(MAX_HEARTS);
    setHudStardust(0);
    setHudRevealed(0);
    setHudZone(0);
    setHudPortal(-1);
    updatePhase("playing");
  }, [updatePhase]);

  const respawn = useCallback(() => {
    const world = worldRef.current;
    const zone = LEVEL_ZONES[world.checkpointIndex];
    world.player.hearts = MAX_HEARTS;
    world.player.x = zone.spawnX;
    world.player.y = zone.spawnY + PLAYER_HALF.y + 0.01;
    world.player.vx = 0;
    world.player.vy = 0;
    world.player.invulnUntil = world.elapsed + INVULN_SECONDS;
    setHudHearts(MAX_HEARTS);
    updatePhase("playing");
  }, [updatePhase]);

  const toggleMuted = useCallback(() => {
    setMuted((previous) => {
      const next = !previous;
      mutedRef.current = next;
      audioRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const bindHold = useCallback(
    (key: "left" | "right") => ({
      onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        inputRef.current[key] = true;
      },
      onPointerUp: () => {
        inputRef.current[key] = false;
      },
      onPointerCancel: () => {
        inputRef.current[key] = false;
      },
    }),
    [],
  );

  const hearts = Array.from({ length: MAX_HEARTS }, (_, index) => index < hudHearts);
  const activePortal = hudPortal >= 0 ? LEVEL_PORTALS[hudPortal] : null;

  return (
    <div className={`fable-world${isTouchDevice ? " is-touch" : ""}`} data-phase={phase}>
      <canvas ref={canvasRef} className="fable-world-canvas" aria-label={copy.canvasLabel} role="img" />
      <div className="fable-world-vignette" aria-hidden="true" />

      <header className="fable-world-header">
        <span className="fable-mark" aria-hidden="true">
          0xAA<i />
        </span>
        <div className="fable-gate-header-tools">
          <ModelSwitcher activeModel="fable-5" label={copy.switcherLabel} />
          <div className="fable-language-switch" role="group" aria-label={copy.languageLabel}>
            <button type="button" aria-pressed={language === "zh"} data-active={language === "zh"} onClick={() => onLanguageChange("zh")}>
              中
            </button>
            <button type="button" aria-pressed={language === "en"} data-active={language === "en"} onClick={() => onLanguageChange("en")}>
              EN
            </button>
          </div>
          <button type="button" className="fable-sound-toggle" onClick={toggleMuted} aria-label={copy.soundLabel} aria-pressed={!muted}>
            {muted ? copy.soundOff : copy.soundOn}
          </button>
          <button type="button" className="fable-reading-toggle" onClick={onSwitchToReading}>
            {copy.readingMode}
          </button>
        </div>
      </header>

      {phase === "playing" || phase === "victory" ? (
        <div className="fable-world-hud" aria-live="polite">
          <div className="fable-hud-block">
            <span className="fable-hud-label">{copy.hudZone}</span>
            <strong className="fable-hud-zone">{LEVEL_ZONES[hudZone].name[language]}</strong>
          </div>
          <div className="fable-hud-block">
            <span className="fable-hud-label">{copy.hudStardust}</span>
            <strong>
              ★ {hudStardust} · {hudRevealed}/{TOTAL_BLOCKS}
            </strong>
          </div>
          <div className="fable-hud-block">
            <div className="fable-hud-pips fable-hud-pips-integrity" role="img" aria-label={`${hudHearts}/${MAX_HEARTS}`}>
              {hearts.map((lit, index) => (
                <i key={index} data-lit={lit} />
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {activePortal && phase === "playing" && !isTouchDevice ? (
        <p className="fable-portal-hint">{copy.portalHint(activePortal.label)}</p>
      ) : null}

      {isTouchDevice && phase === "playing" ? (
        <div className="fable-touch-controls">
          <div className="fable-touch-move">
            <button type="button" aria-label={copy.touchLeft} {...bindHold("left")}>
              ◀
            </button>
            <button type="button" aria-label={copy.touchRight} {...bindHold("right")}>
              ▶
            </button>
          </div>
          <div className="fable-touch-actions">
            {activePortal ? (
              <button type="button" className="fable-touch-portal" onClick={enterActivePortal}>
                {copy.enterPortal}
              </button>
            ) : null}
            <button
              type="button"
              className="fable-touch-jump"
              aria-label={copy.touchJump}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                requestJump();
              }}
              onPointerUp={releaseJump}
              onPointerCancel={releaseJump}
            >
              ●
            </button>
          </div>
        </div>
      ) : null}

      {phase === "start" ? (
        <div className="fable-gate-overlay fable-world-start">
          <p className="fable-gate-kicker">{copy.kicker}</p>
          <h1>{copy.title}</h1>
          <p className="fable-gate-lede">{copy.lede}</p>
          {rendererState === "unavailable" ? (
            <p className="fable-gate-note">{copy.unavailableBody}</p>
          ) : (
            <>
              <div className="fable-gate-actions">
                <button type="button" className="fable-primary-button" onClick={startRun} disabled={rendererState === "loading"}>
                  {rendererState === "loading" ? copy.loading : copy.start}
                </button>
                <button type="button" className="fable-skip-link" onClick={onSwitchToReading}>
                  {copy.readingMode} <span aria-hidden="true">→</span>
                </button>
              </div>
              <p className="fable-gate-note">{isTouchDevice ? copy.controlsTouch : copy.controlsDesktop}</p>
            </>
          )}
        </div>
      ) : null}

      {phase === "victory" ? (
        <div className="fable-gate-overlay fable-gate-victory">
          <p className="fable-gate-kicker">{copy.kicker}</p>
          <h2>{copy.victoryHeading}</h2>
          <p className="fable-gate-lede">{copy.victoryStats(victoryStats.stardust, victoryStats.revealed, victoryStats.seconds)}</p>
          <div className="fable-gate-actions">
            <button type="button" className="fable-primary-button" onClick={replayRun} autoFocus>
              {copy.replay}
            </button>
            <button type="button" className="fable-skip-link" onClick={onSwitchToReading}>
              {copy.readingMode} <span aria-hidden="true">→</span>
            </button>
          </div>
          <p className="fable-gate-note">{copy.victoryHint}</p>
        </div>
      ) : null}

      {phase === "defeated" ? (
        <div className="fable-gate-overlay fable-gate-failed">
          <h2>{copy.defeatedHeading}</h2>
          <p className="fable-gate-lede">{copy.defeatedBody}</p>
          <div className="fable-gate-actions">
            <button type="button" className="fable-primary-button" onClick={respawn} autoFocus>
              {copy.respawn}
            </button>
            <button type="button" className="fable-skip-link" onClick={onSwitchToReading}>
              {copy.readingMode} <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
