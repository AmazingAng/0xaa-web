"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import ModelSwitcher from "../ModelSwitcher";
import { createFableGateAudio, type FableGateAudio } from "./fableAudio";
import type { FableGateRenderer } from "./fableGateRenderer";

export type FableGatePhase = "briefing" | "active" | "cleared" | "failed";
export type FableGateLanguage = "zh" | "en";

export type SynapseNode = {
  id: number;
  x: number;
  y: number;
  z: number;
  baseX: number;
  baseY: number;
  seed: number;
  ignited: boolean;
  ignitedAt: number;
  active: boolean;
};

export type NoiseOrb = {
  id: number;
  x: number;
  y: number;
  z: number;
  baseX: number;
  baseY: number;
  seed: number;
  active: boolean;
};

export type TransferSpark = {
  fromX: number;
  fromY: number;
  fromZ: number;
  socket: number;
  startedAt: number;
  active: boolean;
};

export type GateWorld = {
  elapsed: number;
  playerX: number;
  playerY: number;
  charge: number;
  chargeTarget: number;
  integrity: number;
  speed: number;
  lastIgniteAt: number;
  lastHitAt: number;
  clearedAt: number;
  failedAt: number;
  nextSynapseAt: number;
  nextNoiseAt: number;
  spawnCursor: number;
  nodes: SynapseNode[];
  noises: NoiseOrb[];
  transfers: TransferSpark[];
};

const TARGET_CHARGE = 12;
const MAX_ACTIVE_SYNAPSES = 5;
const MAX_ACTIVE_NOISE = 4;
const MAX_TRANSFERS = 4;
const BASE_SPEED = 9;
const SPEED_PER_CHARGE = 0.4;
const MAX_SPEED = 14.5;
const FIELD_HALF_WIDTH = 2.5;
const FIELD_HALF_HEIGHT = 1.55;
const SPAWN_Z = -42;
const DESPAWN_Z = 7.5;
const IGNITE_RADIUS = 0.66;
const NOISE_RADIUS = 0.7;
const COLLISION_NEAR_Z = -1.4;
const COLLISION_FAR_Z = 1.1;
const INVULN_SECONDS = 1.2;
const NOISE_UNLOCK_CHARGE = 2;
const MAX_SIM_DELTA = 0.05;
const KEYBOARD_UNITS_PER_SECOND = 4.6;
const VICTORY_EXIT_DURATION = 620;
const SKIP_AFTER_SECONDS = 30;

type RendererState = "loading" | "ready" | "unavailable";

export type FableGateProps = {
  onComplete: () => void;
  language: FableGateLanguage;
  onLanguageChange: (language: FableGateLanguage) => void;
};

const gateCopy: Record<
  FableGateLanguage,
  {
    kicker: string;
    title: string;
    lede: string;
    controls: string;
    start: string;
    loading: string;
    unavailableHeading: string;
    unavailableBody: string;
    enterAnyway: string;
    victoryHeading: string;
    victoryBody: (seconds: string) => string;
    enter: string;
    failedHeading: string;
    failedBody: string;
    retry: string;
    skip: string;
    soundLabel: string;
    soundOn: string;
    soundOff: string;
    languageLabel: string;
    switcherLabel: string;
    hudSynapses: string;
    hudSignal: string;
    canvasLabel: string;
  }
> = {
  zh: {
    kicker: "FABLE 5 / 前置仪式",
    title: "突触绽放",
    lede: `拖动信号，点亮 ${TARGET_CHARGE} 个金色突触，唤醒沉睡的网络。避开红色噪声。`,
    controls: "拖动 / 方向键 · 触碰点亮",
    start: "开始点火",
    loading: "初始化神经星云",
    unavailableHeading: "星云无法渲染",
    unavailableBody: "此设备暂不支持 WebGL，可直接进入主页。",
    enterAnyway: "直接进入",
    victoryHeading: "网络已苏醒",
    victoryBody: (seconds) => `${TARGET_CHARGE} 个突触全部点亮 · 用时 ${seconds}s`,
    enter: "进入 0xAA",
    failedHeading: "信号衰减",
    failedBody: "噪声吞没了信号。再试一次，或直接进入。",
    retry: "重新点火",
    skip: "跳过，直接进入",
    soundLabel: "切换声音",
    soundOn: "声音 开",
    soundOff: "声音 关",
    languageLabel: "选择语言",
    switcherLabel: "切换模型主页",
    hudSynapses: "突触",
    hudSignal: "信号",
    canvasLabel: "突触绽放：三维神经星云小游戏",
  },
  en: {
    kicker: "FABLE 5 / OPENING RITE",
    title: "SYNAPSE BLOOM",
    lede: `Drag the signal to ignite ${TARGET_CHARGE} golden synapses and wake the network. Dodge the red noise.`,
    controls: "DRAG / ARROW KEYS · TOUCH TO IGNITE",
    start: "IGNITE",
    loading: "PRIMING THE NEURAL NEBULA",
    unavailableHeading: "NEBULA UNAVAILABLE",
    unavailableBody: "WebGL is unavailable on this device. You can enter the site directly.",
    enterAnyway: "ENTER ANYWAY",
    victoryHeading: "THE NETWORK WAKES",
    victoryBody: (seconds) => `All ${TARGET_CHARGE} synapses ignited · ${seconds}s`,
    enter: "ENTER 0xAA",
    failedHeading: "SIGNAL LOST",
    failedBody: "The noise swallowed your signal. Try again, or enter directly.",
    retry: "RE-IGNITE",
    skip: "SKIP TO SITE",
    soundLabel: "Toggle sound",
    soundOn: "SND ON",
    soundOff: "SND OFF",
    languageLabel: "Choose language",
    switcherLabel: "Switch model pages",
    hudSynapses: "SYNAPSES",
    hudSignal: "SIGNAL",
    canvasLabel: "Synapse Bloom: a 3D neural nebula minigame",
  },
};

const createWorld = (): GateWorld => ({
  elapsed: 0,
  playerX: 0,
  playerY: 0,
  charge: 0,
  chargeTarget: TARGET_CHARGE,
  integrity: 3,
  speed: BASE_SPEED,
  lastIgniteAt: 0,
  lastHitAt: 0,
  clearedAt: 0,
  failedAt: 0,
  nextSynapseAt: 0.4,
  nextNoiseAt: 0,
  spawnCursor: 0,
  nodes: Array.from({ length: MAX_ACTIVE_SYNAPSES + 1 }, (_, id) => ({
    id,
    x: 0,
    y: 0,
    z: SPAWN_Z,
    baseX: 0,
    baseY: 0,
    seed: 0,
    ignited: false,
    ignitedAt: 0,
    active: false,
  })),
  noises: Array.from({ length: MAX_ACTIVE_NOISE }, (_, id) => ({
    id,
    x: 0,
    y: 0,
    z: SPAWN_Z,
    baseX: 0,
    baseY: 0,
    seed: 0,
    active: false,
  })),
  transfers: Array.from({ length: MAX_TRANSFERS }, () => ({
    fromX: 0,
    fromY: 0,
    fromZ: 0,
    socket: 0,
    startedAt: 0,
    active: false,
  })),
});

const pseudoRandom = (cursor: number, salt: number) => {
  const value = Math.sin(cursor * 127.1 + salt * 311.7) * 43758.5453;
  return value - Math.floor(value);
};

export default function FableGate({ onComplete, language, onLanguageChange }: FableGateProps) {
  const copy = gateCopy[language];

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<GateWorld>(createWorld());
  const rendererRef = useRef<FableGateRenderer | null>(null);
  const audioRef = useRef<FableGateAudio | null>(null);
  const phaseRef = useRef<FableGatePhase>("briefing");
  const pointerTargetRef = useRef({ x: 0, y: 0 });
  const keysRef = useRef({ left: false, right: false, up: false, down: false });
  const reducedMotionRef = useRef(false);
  const mutedRef = useRef(false);
  const exitTimerRef = useRef<number | null>(null);

  const [phase, setPhase] = useState<FableGatePhase>("briefing");
  const [rendererState, setRendererState] = useState<RendererState>("loading");
  const [muted, setMuted] = useState(false);
  const [hudCharge, setHudCharge] = useState(0);
  const [hudIntegrity, setHudIntegrity] = useState(3);
  const [clearSeconds, setClearSeconds] = useState("0.0");
  const [showSkip, setShowSkip] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const updatePhase = useCallback((nextPhase: FableGatePhase) => {
    phaseRef.current = nextPhase;
    setPhase(nextPhase);
  }, []);

  const spawnSynapse = useCallback((world: GateWorld) => {
    const slot = world.nodes.find((node) => !node.active);
    if (!slot) return;
    world.spawnCursor += 1;
    slot.active = true;
    slot.ignited = false;
    slot.ignitedAt = 0;
    slot.seed = pseudoRandom(world.spawnCursor, 7);
    slot.baseX = (pseudoRandom(world.spawnCursor, 13) * 2 - 1) * (FIELD_HALF_WIDTH - 0.3);
    slot.baseY = (pseudoRandom(world.spawnCursor, 29) * 2 - 1) * (FIELD_HALF_HEIGHT - 0.2);
    slot.x = slot.baseX;
    slot.y = slot.baseY;
    slot.z = SPAWN_Z + pseudoRandom(world.spawnCursor, 43) * 4;
  }, []);

  const spawnNoise = useCallback((world: GateWorld) => {
    const slot = world.noises.find((orb) => !orb.active);
    if (!slot) return;
    world.spawnCursor += 1;
    slot.active = true;
    slot.seed = pseudoRandom(world.spawnCursor, 53);
    slot.baseX = (pseudoRandom(world.spawnCursor, 61) * 2 - 1) * (FIELD_HALF_WIDTH - 0.2);
    slot.baseY = (pseudoRandom(world.spawnCursor, 71) * 2 - 1) * (FIELD_HALF_HEIGHT - 0.15);
    slot.x = slot.baseX;
    slot.y = slot.baseY;
    slot.z = SPAWN_Z + pseudoRandom(world.spawnCursor, 83) * 6;
  }, []);

  const stepWorld = useCallback(
    (world: GateWorld, delta: number) => {
      const reduced = reducedMotionRef.current;
      world.elapsed += delta;

      const targetSpeed =
        Math.min(MAX_SPEED, BASE_SPEED + world.charge * SPEED_PER_CHARGE) * (reduced ? 0.72 : 1);
      world.speed += (targetSpeed - world.speed) * Math.min(1, delta * 2);

      // Player follows the pointer target; arrow keys nudge the target for
      // keyboard-only play.
      const keys = keysRef.current;
      const keyboardX = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      const keyboardY = (keys.up ? 1 : 0) - (keys.down ? 1 : 0);
      if (keyboardX !== 0 || keyboardY !== 0) {
        pointerTargetRef.current.x = Math.max(
          -1,
          Math.min(1, pointerTargetRef.current.x + (keyboardX * KEYBOARD_UNITS_PER_SECOND * delta) / FIELD_HALF_WIDTH),
        );
        pointerTargetRef.current.y = Math.max(
          -1,
          Math.min(1, pointerTargetRef.current.y + (keyboardY * KEYBOARD_UNITS_PER_SECOND * delta) / FIELD_HALF_HEIGHT),
        );
      }
      const targetX = pointerTargetRef.current.x * FIELD_HALF_WIDTH;
      const targetY = pointerTargetRef.current.y * FIELD_HALF_HEIGHT;
      const follow = Math.min(1, delta * 11);
      world.playerX += (targetX - world.playerX) * follow;
      world.playerY += (targetY - world.playerY) * follow;

      // Spawning.
      const activeSynapses = world.nodes.filter((node) => node.active && !node.ignited).length;
      if (world.elapsed >= world.nextSynapseAt && activeSynapses < MAX_ACTIVE_SYNAPSES) {
        spawnSynapse(world);
        world.nextSynapseAt = world.elapsed + 0.5 + pseudoRandom(world.spawnCursor, 3) * 0.35;
      }
      const noiseReady = world.charge >= NOISE_UNLOCK_CHARGE;
      if (world.nextNoiseAt === 0 && noiseReady) world.nextNoiseAt = world.elapsed + 0.8;
      const activeNoise = world.noises.filter((orb) => orb.active).length;
      if (noiseReady && world.elapsed >= world.nextNoiseAt && activeNoise < MAX_ACTIVE_NOISE) {
        spawnNoise(world);
        const interval = Math.max(0.95, 1.6 - world.charge * 0.05);
        world.nextNoiseAt = world.elapsed + interval + pseudoRandom(world.spawnCursor, 5) * 0.4;
      }

      // Advance synapses and detect ignition.
      for (const node of world.nodes) {
        if (!node.active) continue;
        node.z += world.speed * delta;
        node.x = node.baseX + Math.sin(world.elapsed * 0.7 + node.seed * 12) * 0.24;
        node.y = node.baseY + Math.cos(world.elapsed * 0.6 + node.seed * 9) * 0.16;
        if (node.z > DESPAWN_Z) {
          node.active = false;
          continue;
        }
        if (node.ignited || node.z < COLLISION_NEAR_Z || node.z > COLLISION_FAR_Z) continue;
        const dx = node.x - world.playerX;
        const dy = node.y - world.playerY;
        if (dx * dx + dy * dy < IGNITE_RADIUS * IGNITE_RADIUS) {
          node.ignited = true;
          node.ignitedAt = world.elapsed;
          world.lastIgniteAt = world.elapsed;
          const socket = world.charge;
          world.charge += 1;
          const transfer = world.transfers.find((candidate) => !candidate.active) ?? world.transfers[0];
          transfer.fromX = node.x;
          transfer.fromY = node.y;
          transfer.fromZ = node.z;
          transfer.socket = socket;
          transfer.startedAt = world.elapsed;
          transfer.active = true;
          audioRef.current?.cueIgnite(socket);
          if (world.charge >= world.chargeTarget) {
            world.clearedAt = world.elapsed;
            updatePhase("cleared");
            setClearSeconds(world.elapsed.toFixed(1));
            audioRef.current?.cueVictory();
          }
        }
      }

      // Advance noise orbs and detect hits.
      const invulnerable = world.lastHitAt > 0 && world.elapsed - world.lastHitAt < INVULN_SECONDS;
      for (const orb of world.noises) {
        if (!orb.active) continue;
        orb.z += world.speed * 1.06 * delta;
        orb.x = orb.baseX + Math.sin(world.elapsed * 1.1 + orb.seed * 17) * 0.34;
        orb.y = orb.baseY + Math.cos(world.elapsed * 0.9 + orb.seed * 11) * 0.22;
        if (orb.z > DESPAWN_Z) {
          orb.active = false;
          continue;
        }
        if (invulnerable || orb.z < COLLISION_NEAR_Z || orb.z > COLLISION_FAR_Z) continue;
        const dx = orb.x - world.playerX;
        const dy = orb.y - world.playerY;
        if (dx * dx + dy * dy < NOISE_RADIUS * NOISE_RADIUS) {
          orb.active = false;
          world.integrity -= 1;
          world.lastHitAt = world.elapsed;
          audioRef.current?.cueHit();
          if (world.integrity <= 0) {
            world.failedAt = world.elapsed;
            updatePhase("failed");
            audioRef.current?.cueFail();
          }
          break;
        }
      }

      // Retire finished transfer sparks.
      for (const transfer of world.transfers) {
        if (transfer.active && world.elapsed - transfer.startedAt > 0.85) transfer.active = false;
      }
    },
    [spawnNoise, spawnSynapse, updatePhase],
  );

  // Renderer + simulation loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let frame: number | null = null;
    let lastTimestamp: number | null = null;

    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = reducedMotionQuery.matches;
    const onReducedMotionChange = (event: MediaQueryListEvent) => {
      reducedMotionRef.current = event.matches;
    };
    reducedMotionQuery.addEventListener("change", onReducedMotionChange);

    const compact =
      window.matchMedia("(max-width: 720px)").matches ||
      window.matchMedia("(pointer: coarse)").matches;

    const loop = (timestamp: number) => {
      if (disposed) return;
      frame = window.requestAnimationFrame(loop);
      if (lastTimestamp === null) {
        lastTimestamp = timestamp;
        return;
      }
      const delta = Math.min((timestamp - lastTimestamp) / 1000, MAX_SIM_DELTA);
      lastTimestamp = timestamp;

      const world = worldRef.current;
      const currentPhase = phaseRef.current;
      if (currentPhase === "active") {
        stepWorld(world, delta);
        setHudCharge((previous) => (previous === world.charge ? previous : world.charge));
        setHudIntegrity((previous) => (previous === world.integrity ? previous : world.integrity));
        if (world.elapsed > SKIP_AFTER_SECONDS) {
          setShowSkip((previous) => (previous ? previous : true));
        }
      } else if (currentPhase === "cleared" || currentPhase === "briefing") {
        // Keep ambient time flowing so the nebula breathes behind overlays.
        world.elapsed += delta;
      }

      rendererRef.current?.render(world, currentPhase, reducedMotionRef.current, delta);
    };

    void import("./fableGateRenderer")
      .then(({ createFableGateRenderer }) => {
        if (disposed) return;
        try {
          rendererRef.current = createFableGateRenderer(canvas, { compact });
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

  // Keyboard steering.
  useEffect(() => {
    const setKey = (event: KeyboardEvent, pressed: boolean) => {
      const keys = keysRef.current;
      switch (event.key) {
        case "ArrowLeft":
        case "a":
          keys.left = pressed;
          break;
        case "ArrowRight":
        case "d":
          keys.right = pressed;
          break;
        case "ArrowUp":
        case "w":
          keys.up = pressed;
          break;
        case "ArrowDown":
        case "s":
          keys.down = pressed;
          break;
        default:
          return;
      }
      if (phaseRef.current === "active") event.preventDefault();
    };
    const onKeyDown = (event: KeyboardEvent) => setKey(event, true);
    const onKeyUp = (event: KeyboardEvent) => setKey(event, false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(
    () => () => {
      audioRef.current?.dispose();
      if (exitTimerRef.current !== null) window.clearTimeout(exitTimerRef.current);
    },
    [],
  );

  const updatePointerTarget = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const normalizedX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const normalizedY = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    pointerTargetRef.current.x = Math.max(-1, Math.min(1, normalizedX * 1.08));
    pointerTargetRef.current.y = Math.max(-1, Math.min(1, normalizedY * 1.08));
  }, []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (phaseRef.current !== "active") return;
      stageRef.current?.setPointerCapture(event.pointerId);
      updatePointerTarget(event);
    },
    [updatePointerTarget],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (phaseRef.current !== "active") return;
      updatePointerTarget(event);
    },
    [updatePointerTarget],
  );

  const startGame = useCallback(() => {
    if (!audioRef.current) audioRef.current = createFableGateAudio();
    audioRef.current.setMuted(mutedRef.current);
    void audioRef.current.start();
    worldRef.current = createWorld();
    setHudCharge(0);
    setHudIntegrity(3);
    setShowSkip(false);
    updatePhase("active");
  }, [updatePhase]);

  const toggleMuted = useCallback(() => {
    setMuted((previous) => {
      const next = !previous;
      mutedRef.current = next;
      audioRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const finishGate = useCallback(() => {
    if (exitTimerRef.current !== null) return;
    setIsExiting(true);
    exitTimerRef.current = window.setTimeout(onComplete, VICTORY_EXIT_DURATION);
  }, [onComplete]);

  const integrityPips = Array.from({ length: 3 }, (_, index) => index < hudIntegrity);
  const chargePips = Array.from({ length: TARGET_CHARGE }, (_, index) => index < hudCharge);

  return (
    <div
      ref={stageRef}
      className={`fable-gate${isExiting ? " is-exiting" : ""}`}
      data-phase={phase}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
    >
      <canvas ref={canvasRef} className="fable-gate-canvas" aria-label={copy.canvasLabel} role="img" />
      <div className="fable-gate-vignette" aria-hidden="true" />

      <header className="fable-gate-header">
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
          <button
            type="button"
            className="fable-sound-toggle"
            onClick={toggleMuted}
            aria-label={copy.soundLabel}
            aria-pressed={!muted}
          >
            {muted ? copy.soundOff : copy.soundOn}
          </button>
        </div>
      </header>

      {phase === "active" || phase === "cleared" ? (
        <div className="fable-gate-hud" aria-live="polite">
          <div className="fable-hud-block">
            <span className="fable-hud-label">{copy.hudSynapses}</span>
            <div className="fable-hud-pips fable-hud-pips-charge" role="img" aria-label={`${hudCharge}/${TARGET_CHARGE}`}>
              {chargePips.map((lit, index) => (
                <i key={index} data-lit={lit} />
              ))}
            </div>
            <strong>
              {String(hudCharge).padStart(2, "0")}/{TARGET_CHARGE}
            </strong>
          </div>
          <div className="fable-hud-block">
            <span className="fable-hud-label">{copy.hudSignal}</span>
            <div className="fable-hud-pips fable-hud-pips-integrity" role="img" aria-label={`${hudIntegrity}/3`}>
              {integrityPips.map((lit, index) => (
                <i key={index} data-lit={lit} />
              ))}
            </div>
          </div>
          {showSkip && phase === "active" ? (
            <button type="button" className="fable-skip-link" onClick={finishGate}>
              {copy.skip} <span aria-hidden="true">→</span>
            </button>
          ) : null}
        </div>
      ) : null}

      {phase === "briefing" ? (
        <div className="fable-gate-overlay fable-gate-briefing">
          <p className="fable-gate-kicker">{copy.kicker}</p>
          <h1>{copy.title}</h1>
          <p className="fable-gate-lede">{copy.lede}</p>
          {rendererState === "unavailable" ? (
            <>
              <p className="fable-gate-note">{copy.unavailableBody}</p>
              <button type="button" className="fable-primary-button" onClick={finishGate}>
                {copy.enterAnyway} <span aria-hidden="true">→</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="fable-primary-button"
                onClick={startGame}
                disabled={rendererState === "loading"}
              >
                {rendererState === "loading" ? copy.loading : copy.start}
                {rendererState === "loading" ? null : <span aria-hidden="true"> ✦</span>}
              </button>
              <p className="fable-gate-note">{copy.controls}</p>
            </>
          )}
        </div>
      ) : null}

      {phase === "cleared" ? (
        <div className="fable-gate-overlay fable-gate-victory">
          <p className="fable-gate-kicker">{copy.kicker}</p>
          <h2>{copy.victoryHeading}</h2>
          <p className="fable-gate-lede">{copy.victoryBody(clearSeconds)}</p>
          <button type="button" className="fable-primary-button" onClick={finishGate} autoFocus>
            {copy.enter} <span aria-hidden="true">→</span>
          </button>
        </div>
      ) : null}

      {phase === "failed" ? (
        <div className="fable-gate-overlay fable-gate-failed">
          <h2>{copy.failedHeading}</h2>
          <p className="fable-gate-lede">{copy.failedBody}</p>
          <div className="fable-gate-actions">
            <button type="button" className="fable-primary-button" onClick={startGame} autoFocus>
              {copy.retry}
            </button>
            <button type="button" className="fable-skip-link" onClick={finishGate}>
              {copy.skip} <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
