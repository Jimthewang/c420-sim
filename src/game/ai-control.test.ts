import { describe, expect, it } from 'vitest';
import { aiControls } from './ai';
import { createRace } from './race';
import { DEFAULT_SETTINGS, DEG_TO_RAD } from '../config/environment';
import { getTelemetry, sampleWind, stepBoat } from '../physics/sailing';

describe('AI recovery with a moving rig', () => {
  it('eases and retries when a wind shift defeats its sheeted-in escape', () => {
    const settings = { ...DEFAULT_SETTINGS, gusts: false, shifts: false };
    const race = createRace({ mode: 'race', difficulty: 'realistic', aiCount: 0, courseLength: 120, laps: 1 }, settings);
    const racer = race.racers[0];
    racer.state.heading = -28 * DEG_TO_RAD; racer.state.velocity = { x: 0, z: .3 };
    expect(aiControls(racer, race, settings, 1 / 30).mainSheet).toBe(0);
    // The hull has backed onto the other tack: the pilot begins taking in the main.
    racer.state.heading = 39 * DEG_TO_RAD;
    expect(aiControls(racer, race, settings, 1 / 30).mainSheet).toBe(1);
    // A subsequent lift returns it to no-go before forward flow develops.
    racer.state.heading = 30 * DEG_TO_RAD;
    const retry = aiControls(racer, race, settings, 1 / 30);
    expect(retry.mainSheet).toBe(0);
    expect(retry.steer).toBe(1);
  });
  it('recovers actual backward flow in shifting wind without rapidly alternating trim phases', () => {
    const settings = { ...DEFAULT_SETTINGS, gusts: true, shifts: true, windDirectionDeg: 270 };
    const race = createRace({ mode: 'race', difficulty: 'realistic', aiCount: 0, courseLength: 120, laps: 1 }, settings);
    const racer = race.racers[0], state = racer.state;
    state.time = 200;
    state.heading = sampleWind(state.position.x, state.position.z, state.time, settings).direction - 28 * DEG_TO_RAD;
    state.velocity = { x: .29, z: -.06 };
    let recovered = false, trimChanges = 0, previousSheet = 0;
    for (let t = 0; t < 120; t += 1 / 30) {
      const controls = aiControls(racer, race, settings, 1 / 30);
      if (controls.mainSheet !== previousSheet) trimChanges++;
      previousSheet = controls.mainSheet;
      stepBoat(state, controls, settings, 1 / 30);
      const telemetry = getTelemetry(state, settings);
      const forward = state.velocity.x * Math.sin(state.heading) - state.velocity.z * Math.cos(state.heading);
      if (forward > .4 && Math.abs(telemetry.trueWindAngleDeg) > 48) { recovered = true; break; }
    }
    expect(recovered).toBe(true);
    expect(trimChanges).toBeLessThan(10);
  });
  it('retries an eased escape that has stopped rotating on the target tack', () => {
    const settings = { ...DEFAULT_SETTINGS, windSpeedKnots: 18, gusts: false, shifts: false };
    const race = createRace({ mode: 'race', difficulty: 'realistic', aiCount: 0, courseLength: 350, laps: 1 }, settings);
    const racer = race.racers[0], state = racer.state;
    state.heading = -28 * DEG_TO_RAD; state.velocity = { x: 0, z: .3 };
    aiControls(racer, race, settings, 1 / 30);
    // Actual state captured at 120 s of the strong-wind fleet regression, after backing onto the target side.
    state.position = { x: -24.766, z: 92.744 }; state.velocity = { x: -.138326, z: .554166 };
    state.heading = .505697; state.yawRate = -.001676; state.time = 120;
    state.mainSheet = 0; state.rudder = -.488692; state.main.angle = .522635; state.jib.angle = .174533;
    state.rigInitialized = true; state.heel = .04868; state.crew.skipperX = state.crew.crewX = -.090807;
    let recovered = false;
    for (let t = 0; t < 60; t += 1 / 30) {
      stepBoat(state, aiControls(racer, race, settings, 1 / 30), settings, 1 / 30);
      const forward = state.velocity.x * Math.sin(state.heading) - state.velocity.z * Math.cos(state.heading);
      if (forward > .4 && Math.abs(getTelemetry(state, settings).trueWindAngleDeg) > 48) { recovered = true; break; }
    }
    expect(recovered).toBe(true);
  });
});
