// Procedural WebAudio soundtrack for the Fable gate. No external audio
// assets: a slow ambient drone underpins pentatonic chimes that climb with
// each ignited synapse, so progress is audible as a rising melody.

export type FableGateAudio = {
  start: () => Promise<boolean>;
  setMuted: (muted: boolean) => void;
  cueIgnite: (chargeIndex: number) => void;
  cueHit: () => void;
  cueVictory: () => void;
  cueFail: () => void;
  dispose: () => void;
};

type AudioContextConstructor = typeof AudioContext;

type WindowWithWebkitAudio = Window & {
  webkitAudioContext?: AudioContextConstructor;
};

// D major pentatonic, climbing across two octaves — one step per synapse.
const IGNITE_SCALE_HZ = [
  293.66, 329.63, 369.99, 440.0, 493.88, 587.33, 659.25, 739.99, 880.0, 987.77, 1174.66, 1318.51,
];

const CUE_COOLDOWNS_MS: Record<string, number> = {
  ignite: 70,
  hit: 220,
  victory: 1200,
  fail: 1200,
};

export const createFableGateAudio = (): FableGateAudio => {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let droneNodes: Array<OscillatorNode | AudioScheduledSourceNode> = [];
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

    // Ambient drone: two slowly-beating sines through a breathing lowpass.
    const droneGain = context.createGain();
    droneGain.gain.value = 0.055;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 340;
    const lfo = context.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoDepth = context.createGain();
    lfoDepth.gain.value = 140;
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
      duration = 0.5,
      peak = 0.16,
      detune = 0,
      glideTo = 0,
    } = {},
  ) => {
    if (!context || !master || muted) return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (glideTo > 0) oscillator.frequency.exponentialRampToValueAtTime(glideTo, now + duration);
    oscillator.detune.value = detune;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(peak, now + 0.02);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(envelope);
    envelope.connect(master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.05);
  };

  const playNoiseBurst = (duration = 0.22, centerHz = 240) => {
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
    envelope.gain.setValueAtTime(0.22, now);
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
    cueIgnite: (chargeIndex: number) => {
      if (!cueAllowed("ignite")) return;
      const note = IGNITE_SCALE_HZ[Math.min(Math.max(chargeIndex, 0), IGNITE_SCALE_HZ.length - 1)];
      playTone(note, { duration: 0.55, peak: 0.15 });
      playTone(note * 2, { duration: 0.3, peak: 0.05, detune: 6 });
    },
    cueHit: () => {
      if (!cueAllowed("hit")) return;
      playNoiseBurst(0.24, 210);
      playTone(160, { type: "sawtooth", duration: 0.3, peak: 0.07, glideTo: 62 });
    },
    cueVictory: () => {
      if (!cueAllowed("victory") || !context) return;
      const chord = [293.66, 369.99, 440.0, 587.33, 739.99];
      chord.forEach((frequency, index) => {
        window.setTimeout(() => playTone(frequency, { duration: 1.3, peak: 0.12 }), index * 105);
      });
    },
    cueFail: () => {
      if (!cueAllowed("fail")) return;
      playTone(220, { duration: 0.9, peak: 0.1, glideTo: 110 });
      playTone(261.63, { duration: 0.9, peak: 0.07, glideTo: 130.81 });
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
