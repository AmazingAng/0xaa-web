// Procedural WebAudio for 0xAA WORLD. No audio assets ship with the site: an
// ambient drone underpins short synthesized cues for jumping, coins, block
// reveals, stomps, hurts, portals, and the finale fanfare.

export type FableWorldAudio = {
  start: () => Promise<boolean>;
  setMuted: (muted: boolean) => void;
  cueJump: () => void;
  cueCoin: () => void;
  cueBump: () => void;
  cueReveal: (revealIndex: number) => void;
  cueStomp: () => void;
  cueHurt: () => void;
  cueFall: () => void;
  cuePortal: () => void;
  cueVictory: () => void;
  dispose: () => void;
};

type AudioContextConstructor = typeof AudioContext;

type WindowWithWebkitAudio = Window & {
  webkitAudioContext?: AudioContextConstructor;
};

// D major pentatonic — block reveals climb this ladder as the run progresses.
const REVEAL_SCALE_HZ = [293.66, 329.63, 369.99, 440.0, 493.88, 587.33, 659.25, 739.99, 880.0, 987.77];

const CUE_COOLDOWNS_MS: Record<string, number> = {
  jump: 90,
  coin: 50,
  bump: 120,
  reveal: 120,
  stomp: 120,
  hurt: 250,
  fall: 400,
  portal: 400,
  victory: 1500,
};

export const createFableWorldAudio = (): FableWorldAudio => {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let droneNodes: AudioScheduledSourceNode[] = [];
  let muted = false;
  let disposed = false;
  const lastCueAt = new Map<string, number>();

  const cueAllowed = (name: string) => {
    const now = performance.now();
    const last = lastCueAt.get(name) ?? -Infinity;
    if (now - last < (CUE_COOLDOWNS_MS[name] ?? 100)) return false;
    lastCueAt.set(name, now);
    return true;
  };

  const start = async (): Promise<boolean> => {
    if (disposed) return false;
    if (context) {
      if (context.state === "suspended") {
        try {
          await context.resume();
        } catch {
          return false;
        }
      }
      return context.state === "running";
    }

    const Constructor =
      window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
    if (!Constructor) return false;

    try {
      context = new Constructor();
      if (context.state === "suspended") await context.resume();
    } catch {
      context = null;
      return false;
    }

    master = context.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(context.destination);

    const droneGain = context.createGain();
    droneGain.gain.value = 0.045;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 320;
    const lfo = context.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoDepth = context.createGain();
    lfoDepth.gain.value = 130;
    lfo.connect(lfoDepth);
    lfoDepth.connect(filter.frequency);
    for (const frequency of [73.42, 110.3, 146.83]) {
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      oscillator.connect(filter);
      oscillator.start();
      droneNodes.push(oscillator);
    }
    lfo.start();
    droneNodes.push(lfo);
    filter.connect(droneGain);
    droneGain.connect(master);

    return true;
  };

  const playTone = (
    frequency: number,
    {
      type = "triangle" as OscillatorType,
      duration = 0.4,
      peak = 0.14,
      glideTo = 0,
      delaySeconds = 0,
    } = {},
  ) => {
    if (!context || !master || muted) return;
    const at = context.currentTime + delaySeconds;
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    if (glideTo > 0) oscillator.frequency.exponentialRampToValueAtTime(glideTo, at + duration);
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(peak, at + 0.015);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(envelope);
    envelope.connect(master);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.05);
  };

  const playNoiseBurst = (duration = 0.2, centerHz = 240) => {
    if (!context || !master || muted) return;
    const now = context.currentTime;
    const length = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      channel[index] = (Math.random() * 2 - 1) * (1 - index / length);
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    const bandpass = context.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.value = centerHz;
    bandpass.Q.value = 0.9;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.2, now);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(bandpass);
    bandpass.connect(envelope);
    envelope.connect(master);
    source.start(now);
  };

  return {
    start,
    setMuted: (nextMuted: boolean) => {
      muted = nextMuted;
      if (master && context) {
        master.gain.setTargetAtTime(nextMuted ? 0 : 0.5, context.currentTime, 0.05);
      }
    },
    cueJump: () => {
      if (!cueAllowed("jump")) return;
      playTone(330, { type: "square", duration: 0.16, peak: 0.05, glideTo: 620 });
    },
    cueCoin: () => {
      if (!cueAllowed("coin")) return;
      playTone(1318.51, { duration: 0.16, peak: 0.08 });
      playTone(1975.53, { duration: 0.24, peak: 0.06, delaySeconds: 0.07 });
    },
    cueBump: () => {
      if (!cueAllowed("bump")) return;
      playTone(196, { type: "square", duration: 0.12, peak: 0.06, glideTo: 130 });
    },
    cueReveal: (revealIndex: number) => {
      if (!cueAllowed("reveal")) return;
      const note = REVEAL_SCALE_HZ[Math.min(Math.max(revealIndex - 1, 0), REVEAL_SCALE_HZ.length - 1)];
      playTone(note, { duration: 0.5, peak: 0.13 });
      playTone(note * 1.5, { duration: 0.4, peak: 0.07, delaySeconds: 0.09 });
      playTone(note * 2, { duration: 0.5, peak: 0.05, delaySeconds: 0.18 });
    },
    cueStomp: () => {
      if (!cueAllowed("stomp")) return;
      playTone(240, { type: "square", duration: 0.18, peak: 0.09, glideTo: 90 });
      playNoiseBurst(0.12, 900);
    },
    cueHurt: () => {
      if (!cueAllowed("hurt")) return;
      playNoiseBurst(0.24, 210);
      playTone(180, { type: "sawtooth", duration: 0.3, peak: 0.07, glideTo: 66 });
    },
    cueFall: () => {
      if (!cueAllowed("fall")) return;
      playTone(520, { type: "triangle", duration: 0.6, peak: 0.09, glideTo: 110 });
    },
    cuePortal: () => {
      if (!cueAllowed("portal")) return;
      playTone(440, { duration: 0.5, peak: 0.09, glideTo: 880 });
      playNoiseBurst(0.3, 1400);
    },
    cueVictory: () => {
      if (!cueAllowed("victory")) return;
      const fanfare = [293.66, 369.99, 440.0, 587.33, 739.99, 880.0];
      fanfare.forEach((frequency, index) => {
        playTone(frequency, { duration: 1.1, peak: 0.11, delaySeconds: index * 0.1 });
      });
    },
    dispose: () => {
      disposed = true;
      for (const node of droneNodes) {
        try {
          node.stop();
        } catch {
          // Already stopped.
        }
      }
      droneNodes = [];
      if (context) {
        void context.close().catch(() => {});
        context = null;
        master = null;
      }
    },
  };
};
