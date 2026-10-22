import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../config/environment';
import { getTelemetry } from '../physics/sailing';
import { createRace } from './race';
import { createSailingLog } from './sailing-log';

function setup() {
  const race = createRace({ mode: 'race', difficulty: 'beginner', aiCount: 0, courseLength: 120, laps: 1 }, { ...DEFAULT_SETTINGS });
  const state = race.racers[0].state;
  return { race, state, telemetry: { ...getTelemetry(state, DEFAULT_SETTINGS), speedKnots: 5 } };
}
describe('sailing debrief log', () => {
  it('records only after a legal start, integrates time and distance, and freezes at finish', () => {
    const { race, state, telemetry } = setup(), log = createSailingLog();
    state.time = 180; state.tackCount = 3; log.update(race, telemetry);
    expect(log.snapshot().samples).toHaveLength(0);
    race.racers[0].started = true; race.phase = 'racing'; log.update(race, telemetry);
    state.time += 2; state.position.x += 4; state.tackCount++; log.update(race, telemetry);
    state.time += 2; state.position.z += 3; state.gybeCount++; telemetry.speedKnots = 7;
    race.racers[0].finishedAt = 4; log.update(race, telemetry);
    const final = log.snapshot();
    expect(final).toMatchObject({ duration: 4, distanceM: 7, meanSpeedKnots: 6, maxSpeedKnots: 7, tacks: 1, gybes: 1 });
    state.time += 10; state.position.x += 100; log.update(race, telemetry);
    expect(log.snapshot()).toEqual(final);
  });
  it('does not collect duplicate paused samples and resets for a new race', () => {
    const { race, telemetry } = setup(), log = createSailingLog();
    race.racers[0].started = true; log.update(race, telemetry);
    for (let i = 0; i < 100; i++) log.update(race, telemetry);
    expect(log.snapshot().samples).toHaveLength(1);
    log.update(setup().race, telemetry);
    expect(log.snapshot()).toMatchObject({ samples: [], tacks: 0, distanceM: 0 });
  });
  it('keeps snapshots independent and memory bounded in long sessions', () => {
    const { race, state, telemetry } = setup(), log = createSailingLog();
    race.racers[0].started = true;
    const before = JSON.stringify(race);
    log.update(race, telemetry);
    expect(JSON.stringify(race)).toBe(before);
    const snapshot = log.snapshot(); snapshot.samples[0].x = 999;
    expect(log.snapshot().samples[0].x).not.toBe(999);
    for (let i = 1; i < 2500; i++) { state.time = i; log.update(race, telemetry); }
    expect(log.snapshot().samples.length).toBeLessThanOrEqual(1202);
    expect(log.snapshot().samples[0].time).toBe(0);
    expect(log.snapshot().samples.at(-1)?.time).toBe(2499);
  });
});
