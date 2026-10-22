import type { BoatState, Telemetry } from './physics/types';

/** All sounds are generated locally; creating/resuming audio requires a user gesture. */
export function createSailingAudio() {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let enabled = true;
  let paused = false;
  let disposed = false;
  let previousTime = -1;
  let previousSheet = 0;
  let previousTacks = 0;
  let previousGybes = 0;
  const sources: AudioScheduledSourceNode[] = [];
  const channels: { gain: GainNode; filter: BiquadFilterNode }[] = [];
  let whistle: OscillatorNode | null = null;
  let whistleGain: GainNode | null = null;

  function silence() {
    if (!context || !master) return;
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setTargetAtTime(enabled && !paused ? 0.48 : 0, context.currentTime, 0.015);
  }

  async function unlock(): Promise<void> {
    if (disposed) return;
    try {
      if (!context) {
        const Constructor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Constructor) return;
        context = new Constructor();
        master = context.createGain();
        master.gain.value = enabled && !paused ? 0.48 : 0;
        master.connect(context.destination);
        const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
        const noise = buffer.getChannelData(0);
        let smooth = 0;
        for (let i = 0; i < noise.length; i++) {
          smooth = smooth * 0.96 + (Math.random() * 2 - 1) * 0.2;
          noise[i] = Math.max(-1, Math.min(1, smooth + (Math.random() * 2 - 1) * 0.3));
        }
        for (const frequency of [650, 900, 2800, 1200, 1900]) {
          const source = context.createBufferSource();
          const filter = context.createBiquadFilter();
          const gain = context.createGain();
          source.buffer = buffer;
          source.loop = true;
          filter.type = 'bandpass';
          filter.frequency.value = frequency;
          filter.Q.value = 0.6;
          gain.gain.value = 0;
          source.connect(filter).connect(gain).connect(master);
          source.start(0, Math.random());
          sources.push(source);
          channels.push({ gain, filter });
        }
        whistle = context.createOscillator();
        whistle.type = 'sine';
        whistle.frequency.value = 100;
        whistleGain = context.createGain();
        whistleGain.gain.value = 0;
        whistle.connect(whistleGain).connect(master);
        whistle.start();
        sources.push(whistle);
      }
      if (context.state === 'suspended') await context.resume();
      silence();
    } catch {
      // Browsers may refuse audio; sailing continues and a later gesture can retry.
    }
  }

  function tone(frequency: number, duration: number, gain: number, type: OscillatorType = 'sine') {
    if (!context || !master || !enabled || paused || context.state !== 'running') return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.98, now + duration);
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(gain, now + Math.min(0.035, duration / 4));
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(envelope).connect(master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.03);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
  }

  function update(boat: BoatState, telemetry: Telemetry, dt: number) {
    const firstFrame = previousTime < 0 || boat.time < previousTime;
    const sheetSpeed = firstFrame || dt <= 0 ? 0 : Math.min(1, Math.abs(boat.mainSheet - previousSheet) / dt);
    if (!firstFrame && (boat.tackCount > previousTacks || boat.gybeCount > previousGybes)) {
      tone(105, 0.16, boat.gybeCount > previousGybes ? 0.16 : 0.08, 'triangle');
      tone(240, 0.075, 0.045, 'triangle');
    }
    previousTime = boat.time;
    previousSheet = boat.mainSheet;
    previousTacks = boat.tackCount;
    previousGybes = boat.gybeCount;
    if (!context || channels.length !== 5 || paused || !enabled) return;
    const now = context.currentTime;
    const wind = Math.min(1.5, telemetry.apparentWindKnots / 20);
    const speed = Math.min(1.5, telemetry.speedKnots / 10);
    const flutter = boat.main.status === 'luffing' || boat.jib.status === 'luffing';
    const levels = [
      wind * wind * 0.14,
      speed * 0.2,
      boat.planing * speed * 0.17,
      flutter && !boat.capsized ? wind * (0.035 + 0.055 * (0.5 + 0.5 * Math.sin(boat.time * 37))) : 0,
      sheetSpeed * 0.055,
    ];
    channels.forEach((channel, index) => channel.gain.gain.setTargetAtTime(levels[index], now, index === 3 ? 0.018 : 0.1));
    channels[0].filter.frequency.setTargetAtTime(250 + wind * 1100, now, 0.2);
    channels[1].filter.frequency.setTargetAtTime(350 + speed * 1000, now, 0.2);
    channels[2].filter.frequency.setTargetAtTime(1700 + speed * 1700, now, 0.2);
    whistle?.frequency.setTargetAtTime(85 + wind * 180, now, 0.25);
    whistleGain?.gain.setTargetAtTime(Math.max(0, wind - 0.5) * 0.006, now, 0.2);
  }

  return {
    unlock,
    setEnabled(value: boolean) { enabled = value; silence(); },
    setPaused(value: boolean) { paused = value; silence(); },
    update,
    horn() { tone(185, 0.95, 0.13, 'sawtooth'); tone(247, 0.95, 0.055, 'triangle'); },
    beep() { tone(840, 0.11, 0.06); },
    dispose() {
      disposed = true;
      for (const source of sources) { try { source.stop(); source.disconnect(); } catch { /* Already stopped. */ } }
      channels.forEach(({ gain, filter }) => { gain.disconnect(); filter.disconnect(); });
      master?.disconnect();
      void context?.close().catch(() => undefined);
      context = null;
    },
  };
}
