import type { Telemetry, Vec2 } from '../physics/types';
import type { RaceState } from './race';

export interface SailingSample extends Vec2 { time: number; speedKnots: number }
export interface SailingDebrief {
  samples: readonly SailingSample[];
  duration: number;
  distanceM: number;
  maxSpeedKnots: number;
  meanSpeedKnots: number;
  tacks: number;
  gybes: number;
}

/** A bounded, session-only record of sailing after the player's legal start. */
export function createSailingLog() {
  let session: RaceState | null = null, beganAt: number | null = null, lastTime = 0;
  let distanceM = 0, speedIntegral = 0, maxSpeedKnots = 0, initialTacks = 0, initialGybes = 0;
  let tacks = 0, gybes = 0, ended = false;
  let previous: Vec2 = { x: 0, z: 0 };
  const samples: SailingSample[] = [];

  function reset(race: RaceState) {
    session = race; beganAt = null; lastTime = 0; distanceM = 0; speedIntegral = 0;
    maxSpeedKnots = 0; initialTacks = initialGybes = tacks = gybes = 0; ended = false;
    samples.length = 0;
  }
  function update(race: RaceState, telemetry: Telemetry) {
    if (session !== race) reset(race);
    const racer = race.racers[0], state = racer.state;
    if (!racer.started || ended || race.options.mode === 'free') return;
    if (beganAt === null) {
      beganAt = lastTime = state.time; previous = { ...state.position };
      initialTacks = state.tackCount; initialGybes = state.gybeCount;
    }
    const dt = Math.max(0, state.time - lastTime);
    distanceM += Math.hypot(state.position.x - previous.x, state.position.z - previous.z);
    speedIntegral += telemetry.speedKnots * dt;
    maxSpeedKnots = Math.max(maxSpeedKnots, telemetry.speedKnots);
    tacks = Math.max(0, state.tackCount - initialTacks); gybes = Math.max(0, state.gybeCount - initialGybes);
    previous.x = state.position.x; previous.z = state.position.z; lastTime = state.time;
    const time = state.time - beganAt;
    const finished = racer.finishedAt !== null || racer.dnf || race.phase === 'finished';
    if (!samples.length || time - samples[samples.length - 1].time >= 1 || finished && time > samples[samples.length - 1].time) {
      samples.push({ ...state.position, time, speedKnots: telemetry.speedKnots });
      // The longest race is twenty minutes. Decimation also bounds a future extended session.
      if (samples.length > 1202) samples.splice(1, 1);
    }
    ended = finished;
  }
  function snapshot(): SailingDebrief {
    const duration = beganAt === null ? 0 : Math.max(0, lastTime - beganAt);
    return { samples: samples.map(sample => ({ ...sample })), duration, distanceM, maxSpeedKnots,
      meanSpeedKnots: duration > 0 ? speedIntegral / duration : 0, tacks, gybes };
  }
  return { reset, update, snapshot };
}
