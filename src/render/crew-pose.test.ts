import { describe, expect, it } from 'vitest';
import { BOAT_CONFIG as B } from '../config/boat';
import { createBoatState } from '../physics/sailing';
import { boomClearance, computeCrewPose, POSE } from './crew-pose';
import { hullSection } from './geometry';

describe('crew and rig clearance', () => {
  it.each(['skipper', 'crew'] as const)('keeps %s head and torso below a continuously sweeping boom', (role) => {
    const boat = createBoatState();
    for (const aft of [0, 0.4]) for (const x of [-0.95, -0.3, 0, 0.3, 0.95]) {
      boat.crew = { skipperX: x, crewX: x, foreAft: aft, hike: x };
      for (let index = 0; index <= 90; index++) {
        const from = -1.48 + index / 90 * 2.96;
        const to = from + 2.96 / 90;
        const pose = computeCrewPose(boat, role, { from, to, predicted: to + 0.12, anticipation: 1, previousDuck: 0 });
        for (let sample = 0; sample <= 8; sample++) {
          const angle = from + (to - from) * sample / 8;
          expect(boomClearance(pose.head, angle)).toBeGreaterThanOrEqual(POSE.headRadius + POSE.boomRadius + POSE.clearance - 1e-7);
          expect(boomClearance(pose.shoulder, angle)).toBeGreaterThanOrEqual(POSE.torsoRadius + POSE.boomRadius + POSE.clearance - 1e-7);
        }
      }
    }
  });
  it.each(['skipper', 'crew'] as const)('keeps %s clear of a stationary boom without dynamic anticipation', (role) => {
    const boat = createBoatState();
    for (const x of [-.95, -.6, -.3, 0, .3, .6, .95]) for (const aft of [0, .2, .4]) for (let i = 0; i <= 50; i++) {
      const angle = -1.4 + i * 2.8 / 50; boat.crew = { skipperX: x, crewX: x, foreAft: aft, hike: x };
      const pose = computeCrewPose(boat, role, { from: angle, to: angle, predicted: angle, anticipation: 0, previousDuck: 0 });
      for (const [point, radius] of [[pose.head, POSE.headRadius], [pose.shoulder, POSE.torsoRadius]] as const)
        expect(boomClearance(point, angle), `${role} x=${x} aft=${aft} angle=${angle}`).toBeGreaterThanOrEqual(radius + POSE.boomRadius + .02);
    }
  });
  it('keeps a seated crew upright on a steady beam reach on a reach or close hauled when the boom is clear', () => {
    const boat = createBoatState();
    for (const side of [-1, 1]) for (const [opening, x] of [[.65, 0], [.65, .1], [.65, .25], [.14, .25], [.14, .5]]) {
      boat.crew.crewX = -side * x;
      const angle = side * opening;
      const pose = computeCrewPose(boat, 'crew', { from: angle, to: angle, predicted: angle, anticipation: 0, previousDuck: 0 });
      expect(pose.duck).toBeLessThan(.12);
      expect(pose.shoulder.y - pose.hip.y).toBeGreaterThan(.28);
      expect(pose.head.y).toBeGreaterThan(.78);
    }
  });
  it('ducks before a gybe reaches the sailor, including one-frame side changes', () => {
    const boat = createBoatState(); boat.crew.skipperX = 0;
    const pose = computeCrewPose(boat, 'skipper', { from: 1.4, to: 1.35, predicted: -1.4, anticipation: 1, previousDuck: 0 });
    expect(pose.duck).toBeGreaterThan(0.9);
    for (let angle = -1.4; angle <= 1.4; angle += 0.035) expect(boomClearance(pose.head, angle)).toBeGreaterThan(POSE.headRadius + POSE.boomRadius);
  });
  it('keeps seated hips on the curved rail and feet within the cockpit', () => {
    const boat = createBoatState();
    for (const role of ['skipper', 'crew'] as const) for (const aft of [0, 0.4]) for (const x of [-0.95, 0.95]) {
      boat.crew = { skipperX: x, crewX: x, foreAft: aft, hike: x };
      const pose = computeCrewPose(boat, role, { from: -Math.sign(x) * 1.4, to: -Math.sign(x) * 1.4, predicted: -Math.sign(x) * 1.4, anticipation: 0, previousDuck: 0 });
      expect(Math.abs(pose.hip.x)).toBeLessThan(hullSection(pose.hip.z).halfWidth);
      for (const ankle of pose.ankles) {
        expect(Math.abs(ankle.x) + 0.055).toBeLessThanOrEqual(hullSection(ankle.z).halfWidth - 0.13);
        expect(ankle.y).toBeGreaterThanOrEqual(0.12);
      }
    }
    expect(boat.heel).toBe(0);
    expect(B.lengthM).toBe(4.2);
  });
});
