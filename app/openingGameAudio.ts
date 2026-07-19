export type OpeningGameAudioCue =
  | "fire"
  | "enemyHit"
  | "enemyDestroy"
  | "asteroidDestroy"
  | "asteroidImpact"
  | "playerDamage"
  | "stage"
  | "clear"
  | "fail";

export type OpeningGameAudio = {
  /**
   * Must be called directly from a user gesture (the first Start / Retry
   * interaction). It lazily creates and resumes the AudioContext, so importing
   * this module never trips a browser autoplay policy.
   */
  start: () => Promise<boolean>;
  /** Resume a context that was paused after an earlier user gesture. */
  resume: () => Promise<boolean>;
  /** Pause the looping score without tearing down the engine. */
  suspend: () => Promise<void>;
  /** Play a short, rate-limited game cue. Calls before start are intentionally no-ops. */
  play: (cue: OpeningGameAudioCue) => void;
  setMuted: (muted: boolean) => void;
  toggleMuted: () => boolean;
  isMuted: () => boolean;
  dispose: () => void;
};

type AudioContextConstructor = new () => AudioContext;
type SourceGroup = "music" | "sfx";

const MUSIC_STEP_SECONDS = 60 / 104 / 2;
const MUSIC_LOOKAHEAD_SECONDS = 0.24;
const MUSIC_SCHEDULE_INTERVAL = 110;

// A deliberately sparse, original 16-step phrase. It suggests an FC-era
// arpeggio without competing with the black-and-white visual field.
const MELODY: Array<number | null> = [0, null, 7, null, 3, null, 10, null, 0, null, 7, null, 12, null, 10, null];
const BASS: Array<number | null> = [0, null, null, null, -5, null, null, null, -2, null, null, null, -7, null, null, null];

const CUE_COOLDOWNS: Record<OpeningGameAudioCue, number> = {
  fire: 72,
  enemyHit: 46,
  enemyDestroy: 110,
  asteroidDestroy: 120,
  asteroidImpact: 90,
  playerDamage: 300,
  stage: 450,
  clear: 900,
  fail: 900,
};

const midiToFrequency = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

const stopSource = (source: AudioScheduledSourceNode, at: number) => {
  try {
    source.stop(at);
  } catch {
    // A scheduled oscillator may already have ended. There is nothing to clean
    // up in that case and throwing during an unmount would be counterproductive.
  }
};

/**
 * Small, fully procedural Web Audio engine for the opening game. It uses a
 * handful of short-lived oscillator nodes rather than decoded audio files,
 * keeping both download size and mobile memory use effectively zero.
 */
export const createOpeningGameAudio = (): OpeningGameAudio => {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let musicBus: GainNode | null = null;
  let sfxBus: GainNode | null = null;
  let compressor: DynamicsCompressorNode | null = null;
  let disposed = false;
  let muted = false;
  let musicTimer: number | null = null;
  let nextMusicAt = 0;
  let musicStep = 0;
  const lastCueAt = new Map<OpeningGameAudioCue, number>();
  const musicSources = new Set<AudioScheduledSourceNode>();
  const sfxSources = new Set<AudioScheduledSourceNode>();

  const sourceSet = (group: SourceGroup) => (group === "music" ? musicSources : sfxSources);

  const getAudioContext = () => {
    if (context || disposed || typeof window === "undefined") return context;

    const audioWindow = window as Window & { webkitAudioContext?: AudioContextConstructor };
    const Constructor = window.AudioContext ?? audioWindow.webkitAudioContext;
    if (!Constructor) return null;

    try {
      context = new Constructor();
      master = context.createGain();
      musicBus = context.createGain();
      sfxBus = context.createGain();
      compressor = context.createDynamicsCompressor();

      // The master bus leaves enough headroom for several coincident hit cues,
      // while the compressor only catches their short peaks.
      master.gain.setValueAtTime(0.72, context.currentTime);
      musicBus.gain.setValueAtTime(0.36, context.currentTime);
      sfxBus.gain.setValueAtTime(0.5, context.currentTime);
      compressor.threshold.setValueAtTime(-20, context.currentTime);
      compressor.knee.setValueAtTime(14, context.currentTime);
      compressor.ratio.setValueAtTime(7, context.currentTime);
      compressor.attack.setValueAtTime(0.008, context.currentTime);
      compressor.release.setValueAtTime(0.12, context.currentTime);

      musicBus.connect(master);
      sfxBus.connect(master);
      master.connect(compressor);
      compressor.connect(context.destination);
      return context;
    } catch {
      // Some privacy-constrained web views expose the constructor but reject
      // construction. The game remains fully playable without sound.
      context = null;
      master = null;
      musicBus = null;
      sfxBus = null;
      compressor = null;
      return null;
    }
  };

  const stopMusicScheduler = () => {
    if (musicTimer !== null) {
      window.clearInterval(musicTimer);
      musicTimer = null;
    }
  };

  const stopSources = (sources: Set<AudioScheduledSourceNode>, at: number) => {
    for (const source of sources) stopSource(source, at);
    sources.clear();
  };

  const makeTone = ({
    frequency,
    at,
    duration,
    volume,
    type,
    group,
    slideTo,
    detune = 0,
  }: {
    frequency: number;
    at: number;
    duration: number;
    volume: number;
    type: OscillatorType;
    group: SourceGroup;
    slideTo?: number;
    detune?: number;
  }) => {
    const audio = context;
    const destination = group === "music" ? musicBus : sfxBus;
    if (!audio || !destination || disposed) return;

    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const set = sourceSet(group);
    const releaseAt = at + Math.max(0.015, duration);
    const stopAt = releaseAt + 0.045;

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(1, frequency), at);
    oscillator.detune.setValueAtTime(detune, at);
    if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), releaseAt);

    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), at + Math.min(0.014, duration * 0.3));
    gain.gain.exponentialRampToValueAtTime(0.0001, releaseAt);

    oscillator.connect(gain);
    gain.connect(destination);
    set.add(oscillator);
    oscillator.addEventListener(
      "ended",
      () => {
        set.delete(oscillator);
        oscillator.disconnect();
        gain.disconnect();
      },
      { once: true },
    );
    oscillator.start(at);
    oscillator.stop(stopAt);
  };

  const scheduleMusicStep = (at: number, step: number) => {
    const melody = MELODY[step % MELODY.length];
    const bass = BASS[step % BASS.length];

    if (melody !== null) {
      makeTone({
        frequency: midiToFrequency(69 + melody),
        at,
        duration: MUSIC_STEP_SECONDS * 0.65,
        volume: step % 8 === 0 ? 0.064 : 0.043,
        type: "triangle",
        group: "music",
        detune: step % 4 === 0 ? -2 : 0,
      });
    }
    if (bass !== null) {
      makeTone({
        frequency: midiToFrequency(45 + bass),
        at,
        duration: MUSIC_STEP_SECONDS * 1.5,
        volume: 0.045,
        type: "sine",
        group: "music",
      });
    }
    // A barely audible pulse on the off-beat provides forward motion without
    // turning the background score into a busy rhythm track.
    if (step % 4 === 2) {
      makeTone({
        frequency: 92,
        at,
        duration: 0.032,
        volume: 0.016,
        type: "square",
        group: "music",
        slideTo: 74,
      });
    }
  };

  const scheduleMusic = () => {
    const audio = context;
    if (!audio || audio.state !== "running" || muted || disposed) return;
    const horizon = audio.currentTime + MUSIC_LOOKAHEAD_SECONDS;

    while (nextMusicAt < horizon) {
      scheduleMusicStep(nextMusicAt, musicStep);
      nextMusicAt += MUSIC_STEP_SECONDS;
      musicStep = (musicStep + 1) % MELODY.length;
    }
  };

  const startMusicScheduler = () => {
    const audio = context;
    if (!audio || audio.state !== "running" || muted || disposed || musicTimer !== null) return;
    nextMusicAt = audio.currentTime + 0.06;
    musicStep = 0;
    scheduleMusic();
    musicTimer = window.setInterval(scheduleMusic, MUSIC_SCHEDULE_INTERVAL);
  };

  const resume = async () => {
    const audio = getAudioContext();
    if (!audio || disposed) return false;

    try {
      if (audio.state === "suspended") await audio.resume();
      if (audio.state !== "running") return false;
      startMusicScheduler();
      return true;
    } catch {
      return false;
    }
  };

  const start = async () => resume();

  const suspend = async () => {
    const audio = context;
    if (!audio || disposed) return;
    stopMusicScheduler();
    stopSources(musicSources, audio.currentTime);
    try {
      if (audio.state === "running") await audio.suspend();
    } catch {
      // The context may already be closed during a rapid unmount.
    }
  };

  const setMuted = (nextMuted: boolean) => {
    muted = nextMuted;
    const audio = context;
    const masterBus = master;
    if (!audio || !masterBus || disposed) return;

    const now = audio.currentTime;
    masterBus.gain.cancelScheduledValues(now);
    masterBus.gain.setValueAtTime(masterBus.gain.value, now);
    masterBus.gain.linearRampToValueAtTime(nextMuted ? 0.0001 : 0.72, now + 0.045);

    if (nextMuted) {
      stopMusicScheduler();
      stopSources(musicSources, now + 0.05);
    } else if (audio.state === "running") {
      startMusicScheduler();
    }
  };

  const play = (cue: OpeningGameAudioCue) => {
    const audio = context;
    if (!audio || audio.state !== "running" || muted || disposed) return;

    const now = audio.currentTime;
    const lastAt = lastCueAt.get(cue) ?? -Infinity;
    const cooldown = CUE_COOLDOWNS[cue] / 1000;
    if (now - lastAt < cooldown) return;
    lastCueAt.set(cue, now);

    switch (cue) {
      case "fire":
        makeTone({ frequency: 980, at: now, duration: 0.055, volume: 0.075, type: "square", group: "sfx", slideTo: 1540 });
        makeTone({ frequency: 210, at: now, duration: 0.032, volume: 0.018, type: "triangle", group: "sfx", slideTo: 340 });
        break;
      case "enemyHit":
        makeTone({ frequency: 510, at: now, duration: 0.045, volume: 0.052, type: "square", group: "sfx", slideTo: 330 });
        break;
      case "enemyDestroy":
        makeTone({ frequency: 340, at: now, duration: 0.12, volume: 0.09, type: "sawtooth", group: "sfx", slideTo: 72 });
        makeTone({ frequency: 720, at: now + 0.018, duration: 0.07, volume: 0.035, type: "square", group: "sfx", slideTo: 210, detune: 9 });
        break;
      case "asteroidDestroy":
        makeTone({ frequency: 250, at: now, duration: 0.1, volume: 0.07, type: "sawtooth", group: "sfx", slideTo: 58, detune: -12 });
        makeTone({ frequency: 730, at: now + 0.012, duration: 0.032, volume: 0.028, type: "square", group: "sfx", slideTo: 190, detune: 17 });
        break;
      case "asteroidImpact":
        makeTone({ frequency: 110, at: now, duration: 0.12, volume: 0.07, type: "triangle", group: "sfx", slideTo: 42 });
        break;
      case "playerDamage":
        makeTone({ frequency: 170, at: now, duration: 0.19, volume: 0.105, type: "sawtooth", group: "sfx", slideTo: 48 });
        makeTone({ frequency: 62, at: now + 0.025, duration: 0.18, volume: 0.075, type: "square", group: "sfx", slideTo: 36 });
        break;
      case "stage":
        [0, 4, 7].forEach((offset, index) => {
          makeTone({
            frequency: midiToFrequency(62 + offset),
            at: now + index * 0.07,
            duration: 0.13,
            volume: 0.052,
            type: "triangle",
            group: "sfx",
          });
        });
        break;
      case "clear":
        [0, 4, 7, 12].forEach((offset, index) => {
          makeTone({
            frequency: midiToFrequency(57 + offset),
            at: now + index * 0.075,
            duration: 0.31,
            volume: 0.072,
            type: "triangle",
            group: "sfx",
          });
        });
        break;
      case "fail":
        makeTone({ frequency: 240, at: now, duration: 0.22, volume: 0.1, type: "sawtooth", group: "sfx", slideTo: 70 });
        makeTone({ frequency: 94, at: now + 0.09, duration: 0.26, volume: 0.075, type: "square", group: "sfx", slideTo: 38 });
        break;
      default: {
        const exhaustiveCue: never = cue;
        return exhaustiveCue;
      }
    }
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    stopMusicScheduler();
    const audio = context;
    if (audio) {
      stopSources(musicSources, audio.currentTime);
      stopSources(sfxSources, audio.currentTime);
      try {
        musicBus?.disconnect();
        sfxBus?.disconnect();
        master?.disconnect();
        compressor?.disconnect();
        if (audio.state !== "closed") void audio.close();
      } catch {
        // Closing a context is best-effort; the browser owns the final release.
      }
    }
    context = null;
    master = null;
    musicBus = null;
    sfxBus = null;
    compressor = null;
    lastCueAt.clear();
  };

  return {
    start,
    resume,
    suspend,
    play,
    setMuted,
    toggleMuted: () => {
      setMuted(!muted);
      return muted;
    },
    isMuted: () => muted,
    dispose,
  };
};
