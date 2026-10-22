import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createBoatState } from '../physics/sailing';
import { createSailor } from './crew';
import { boomClearance, computeCrewPose, POSE } from './crew-pose';
import { tillerJoint, TILLER_EXTENSION_LENGTH } from './rigging';
import { disposeObject } from './course';

describe('continuous articulated crew', () => {
  it('keeps a rigid torso through hiking and ducking', () => {
    const boat = createBoatState();
    const lengths: number[] = [];
    for (const role of ['skipper', 'crew'] as const) for (const x of [-.95, -.4, 0, .4, .95]) for (const angle of [-1.4, -.35, 0, .35, 1.4]) {
      boat.crew.skipperX = boat.crew.crewX = x;
      const p = computeCrewPose(boat, role, { from: angle, to: angle, predicted: angle, anticipation: 0, previousDuck: 0 });
      lengths.push(p.hip.distanceTo(p.shoulder));
    }
    expect(Math.max(...lengths) - Math.min(...lengths)).toBeLessThan(.002);
  });
  it.each(['skipper', 'crew'] as const)('moves %s continuously during a real-speed boom sweep while keeping clearance', (role) => {
    const boat = createBoatState(), sailor = createSailor(0xff6b6b, true);
    boat.crew.skipperX = boat.crew.crewX = .95;
    let previous: THREE.Vector3 | undefined;
    for (let i = 0; i <= 700; i++) {
      const angle = -1.4 + i * .004;
      boat.time = i / 60; boat.main.angle = angle;
      const p = sailor.update(boat, role, { from: angle - .004, to: angle, predicted: angle + .14, anticipation: 1 });
      if (previous) expect(p.head.distanceTo(previous), `${role} angle=${angle}`).toBeLessThan(.045);
      expect(boomClearance(p.head, angle)).toBeGreaterThan(POSE.headRadius + POSE.boomRadius + .02);
      previous = p.head.clone();
    }
    disposeObject(sailor.object);
  });
  it('preserves upper/lower arm and leg lengths throughout a crossing', () => {
    const boat = createBoatState(), sailor = createSailor(0xff6b6b, true);
    let limbs!: THREE.InstancedMesh; sailor.object.traverse(part => { if (part instanceof THREE.InstancedMesh && part.count === 8) limbs = part; });
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion();
    const lengths = [.36, .36, .36, .36, .26, .25, .26, .25];
    for (let i = 0; i <= 90; i++) {
      boat.time = i / 60; boat.crew.skipperX = -.95 + i / 90 * 1.9; boat.main.angle = .6;
      sailor.update(boat, 'skipper', { from: .6, to: .6, predicted: .6, anticipation: 0 });
      for (let j = 0; j < 8; j++) { limbs.getMatrixAt(j, matrix); matrix.decompose(position, rotation, scale); expect(scale.y).toBeCloseTo(lengths[j], 3); }
    }
    disposeObject(sailor.object);
  });
  it('works the jib sheet when automatic trim moves the actual jib angle', () => {
    const boat = createBoatState(), sailor = createSailor(0xffe144, true);
    boat.crew.crewX = -.6;
    const sweep = { from: 1, to: 1, predicted: 1, anticipation: 0 };
    const initial = sailor.update(boat, 'crew', sweep).hands[0].clone();
    let travel = 0;
    for (let i = 1; i <= 24; i++) { boat.time = i / 60; boat.jib.angle += .008; sailor.update(boat, 'crew', sweep); travel = Math.max(travel, sailor.pose.hands[0].distanceTo(initial)); }
    expect(travel).toBeGreaterThan(.04);
    disposeObject(sailor.object);
  });
  it('clears a prior duck when a replacement race starts at the same zero clock', () => {
    const reused = createSailor(0xff6b6b, true), fresh = createSailor(0xff6b6b, true);
    reused.update(createBoatState(), 'skipper', { from: 0, to: 0, predicted: 0, anticipation: 1 });
    const reset = createBoatState(), sweep = { from: 1, to: 1, predicted: 1, anticipation: 0 };
    expect(reused.update(reset, 'skipper', sweep)).toEqual(fresh.update(reset, 'skipper', sweep));
    disposeObject(reused.object); disposeObject(fresh.object);
  });
  it('resets accumulated trim, duck and stepping on a new simulation', () => {
    const boat = createBoatState(), reused = createSailor(0xff6b6b, true), fresh = createSailor(0xff6b6b, true);
    const sweep = { from: 1, to: 1, predicted: 1, anticipation: 0 };
    for (let i = 0; i < 30; i++) { boat.time = i / 60; boat.mainSheet += .003; boat.crew.skipperX = -.6 + i * .015; reused.update(boat, 'skipper', sweep); }
    const reset = createBoatState();
    const a = reused.update(reset, 'skipper', sweep), b = fresh.update(reset, 'skipper', sweep);
    expect(a).toEqual(b);
    disposeObject(reused.object); disposeObject(fresh.object);
  });
  it('uses the same crossing foot path at 30, 60 and 120 frames per second', () => {
    function simulate(fps: number) {
      const boat = createBoatState(), sailor = createSailor(0xffe144, true), samples: THREE.Vector3[][] = [];
      for (let frame = 0; frame <= fps; frame++) {
        boat.time = frame / fps; boat.crew.crewX = .95 - 1.9 * Math.exp(-boat.time / .42);
        const pose = sailor.update(boat, 'crew', { from: .8, to: .8, predicted: .8, anticipation: 0 });
        if (frame % (fps / 5) === 0) samples.push(pose.ankles.map(foot => foot.clone()));
      }
      disposeObject(sailor.object); return samples;
    }
    const slow = simulate(30), medium = simulate(60), fast = simulate(120);
    for (let i = 0; i < fast.length; i++) for (let foot = 0; foot < 2; foot++) {
      expect(slow[i][foot].distanceTo(fast[i][foot]), `30 vs 120 frame=${i} foot=${foot}`).toBeLessThan(.1);
      expect(medium[i][foot].distanceTo(fast[i][foot])).toBeLessThan(.1);
    }
  });
  it('keeps a reachable tiller grip at full legal helm and hiking range', () => {
    for (const rudder of [-28, -14, 0, 14, 28]) for (const x of [-.95, -.5, 0, .5, .95]) for (const foreAft of [0, .2, .4]) for (const angle of [-1.4, 0, 1.4]) {
      const boat = createBoatState(), sailor = createSailor(0xff6b6b, true);
      boat.rudder = rudder * Math.PI / 180; boat.crew.skipperX = x; boat.crew.foreAft = foreAft; boat.main.angle = angle;
      const pose = sailor.update(boat, 'skipper', { from: angle, to: angle, predicted: angle, anticipation: 0 });
      expect(pose.hands[1].distanceTo(tillerJoint(boat)), `rudder=${rudder} x=${x} aft=${foreAft} angle=${angle}`).toBeLessThanOrEqual(TILLER_EXTENSION_LENGTH + .001);
      expect(pose.hip.distanceTo(pose.shoulder)).toBeCloseTo(POSE.torsoLength, 5);
      disposeObject(sailor.object);
    }
  });
  it('keeps planted feet still while trimming and visibly works the sheet hand', () => {
    const boat = createBoatState(), sailor = createSailor(0xff6b6b, true);
    boat.crew.skipperX = -.6; boat.main.angle = 1;
    const sweep = { from: 1, to: 1, predicted: 1, anticipation: 0 };
    const before = sailor.update(boat, 'skipper', sweep);
    const feet = before.ankles.map(p => p.clone()), hand = before.hands[0].clone();
    let maxHandTravel = 0, maxFootDrift = 0;
    for (let i = 1; i <= 30; i++) { boat.time = i / 60; boat.mainSheet += .003; boat.crew.skipperX = -.6 + Math.sin(i * .2) * .012; sailor.update(boat, 'skipper', sweep); maxFootDrift = Math.max(maxFootDrift, ...sailor.pose.ankles.map((foot, j) => foot.distanceTo(feet[j]))); maxHandTravel = Math.max(maxHandTravel, sailor.pose.hands[0].distanceTo(hand)); }
    expect(maxFootDrift).toBeLessThan(.005);
    expect(maxHandTravel).toBeGreaterThan(.04);
    disposeObject(sailor.object);
  });
});
