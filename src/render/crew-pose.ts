import * as THREE from 'three';
import { BOAT_CONFIG as B } from '../config/boat';
import type { BoatState } from '../physics/types';
import { tillerJoint, TILLER_EXTENSION_LENGTH } from './rigging';
import { hullSection } from './geometry';

export const POSE = { headRadius: 0.14, torsoRadius: 0.145, boomRadius: 0.035, clearance: 0.035, torsoLength: 0.38, upperArm: 0.26, forearm: 0.25, thigh: 0.36, shin: 0.36 };
export interface BoomSweep { from: number; to: number; predicted: number; anticipation: number; previousDuck: number }
const mastZ = -B.lengthM * 0.16;
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

function distanceToSweep(point: THREE.Vector3, from: number, to: number) {
  const x = point.x, z = point.z - mastZ;
  const r = Math.hypot(x, z), angle = Math.atan2(x, z);
  const sweep = wrap(to - from), offset = wrap(angle - from);
  if (Math.sign(offset) === Math.sign(sweep) && Math.abs(offset) <= Math.abs(sweep)) return Math.max(0, r - B.mainFootM);
  function endpoint(a: number) {
    const along = THREE.MathUtils.clamp(x * Math.sin(a) + z * Math.cos(a), 0, B.mainFootM);
    return Math.hypot(x - Math.sin(a) * along, z - Math.cos(a) * along);
  }
  return Math.min(endpoint(from), endpoint(to));
}

export function boomClearance(point: THREE.Vector3, angle: number) {
  return Math.hypot(distanceToSweep(point, angle, angle), point.y - B.boomHeightM);
}

/** Pure joint placement. Anticipated rig sweep lowers the sailor before the boom arrives. */
export function computeCrewPose(boat: BoatState, role: 'skipper' | 'crew', sweep: BoomSweep) {
  const z = (role === 'skipper' ? 1 : -0.15) + boat.crew.foreAft;
  const physicalX = role === 'skipper' ? boat.crew.skipperX : boat.crew.crewX;
  const section = hullSection(z), railX = section.halfWidth - 0.13;
  const hipX = THREE.MathUtils.clamp(physicalX, -railX, railX);
  const hiking = Math.min(1, Math.abs(physicalX) / B.crewMaxLeverM);
  const edge = THREE.MathUtils.smoothstep(Math.abs(hipX), 0.1, railX - 0.12);
  const hip = new THREE.Vector3(hipX, THREE.MathUtils.lerp(role === 'crew' ? 0.30 : 0.275, section.railY + 0.12, edge), z);
  const uprightAxis = new THREE.Vector3(Math.sign(physicalX) * hiking * 0.88, 1 - hiking * 0.55, 0).normalize();
  const restingShoulder = hip.clone().addScaledVector(uprightAxis, POSE.torsoLength);
  const restingHead = restingShoulder.clone().add(new THREE.Vector3(0, 0.16, 0));
  const sweptClearance = Math.min(
    Math.hypot(distanceToSweep(restingHead, sweep.from, sweep.to), restingHead.y - B.boomHeightM),
    Math.hypot(distanceToSweep(restingShoulder, sweep.from, sweep.to), restingShoulder.y - B.boomHeightM));
  const predictedDistance = Math.min(distanceToSweep(restingHead, sweep.to, sweep.predicted), distanceToSweep(restingShoulder, sweep.to, sweep.predicted));
  // A stationary boom only requires ducking when its actual 3D clearance is small.
  // Broad horizontal prediction is reserved for a moving rig, so the forward crew
  // can sit upright on a reach even though their seat is close to the mast.
  const near = 1 - THREE.MathUtils.smoothstep(sweptClearance, 0.215, 0.30);
  const anticipate = (1 - THREE.MathUtils.smoothstep(predictedDistance, 0.65, 1.15)) * sweep.anticipation;
  const duck = Math.max(near, anticipate, sweep.previousDuck);
  const fold = THREE.MathUtils.smoothstep(duck, 0, 1);
  hip.y = THREE.MathUtils.lerp(hip.y, Math.max(0.51, hip.y + 0.05), fold);
  // Slide behind the thwart before folding a full-length torso over the knees.
  if (role === 'skipper') hip.z += 0.18 * fold;
  const torsoAxis = uprightAxis.lerp(new THREE.Vector3(0, 0.1, -Math.sqrt(0.99)), fold).normalize();
  const inward = Math.min(1, Math.abs(hipX) / 0.42);
  const facing = new THREE.Vector3(-Math.sign(hipX) * inward, 0, -(1 - inward)).normalize();
  const across = new THREE.Vector3(-facing.z, 0, facing.x);
  const neckOffset = new THREE.Vector3(0, THREE.MathUtils.lerp(0.16, 0.075, fold), -0.09 * fold);
  const shoulder = hip.clone().addScaledVector(torsoAxis, POSE.torsoLength);
  const head = shoulder.clone().add(neckOffset);
  // Rotate the rigid torso into the common working range of arm and tiller. A
  // fully hiked sailor must come slightly inboard at extreme opposite helm.
  const reachTarget = tillerJoint(boat).addScaledVector(across, -0.115).add(new THREE.Vector3(0, 0.035, 0));
  const reachAxis = reachTarget.clone().sub(hip), reachDistance = reachAxis.length(); reachAxis.normalize();
  const reach = TILLER_EXTENSION_LENGTH + POSE.upperArm + POSE.forearm - 0.045;
  const minReachDot = (reachDistance ** 2 + POSE.torsoLength ** 2 - reach ** 2) / (2 * reachDistance * POSE.torsoLength);
  for (let constraint = 0; constraint < 8 && !boat.capsized; constraint++) {
    if (role === 'skipper' && torsoAxis.dot(reachAxis) < minReachDot) {
      const lateral = torsoAxis.clone().addScaledVector(reachAxis, -torsoAxis.dot(reachAxis)).normalize();
      torsoAxis.copy(reachAxis).multiplyScalar(minReachDot).addScaledVector(lateral, Math.sqrt(Math.max(0, 1 - minReachDot ** 2))).normalize();
      shoulder.copy(hip).addScaledVector(torsoAxis, POSE.torsoLength); head.copy(shoulder).add(neckOffset);
    }
    let adjusted = false;
    for (const [point, radius, offset] of [[head, POSE.headRadius, neckOffset], [shoulder, POSE.torsoRadius, new THREE.Vector3()]] as const) {
      const angle = Math.atan2(point.x, point.z - mastZ), span = wrap(sweep.to - sweep.from), relative = wrap(angle - sweep.from);
      const nearestAngle = Math.sign(relative) === Math.sign(span) && Math.abs(relative) <= Math.abs(span)
        ? angle : distanceToSweep(point, sweep.from, sweep.from) < distanceToSweep(point, sweep.to, sweep.to) ? sweep.from : sweep.to;
      const along = THREE.MathUtils.clamp(point.x * Math.sin(nearestAngle) + (point.z - mastZ) * Math.cos(nearestAngle), 0, B.mainFootM);
      const clear = point.clone().sub(new THREE.Vector3(Math.sin(nearestAngle) * along, B.boomHeightM, mastZ + Math.cos(nearestAngle) * along));
      const safe = radius + POSE.boomRadius + POSE.clearance;
      if (clear.length() >= safe) continue;
      clear.setLength(safe - clear.length());
      torsoAxis.copy(point).add(clear).sub(offset).sub(hip).normalize();
      shoulder.copy(hip).addScaledVector(torsoAxis, POSE.torsoLength); head.copy(shoulder).add(neckOffset); adjusted = true;
    }
    if (!adjusted) break;
  }
  const knees: THREE.Vector3[] = [], ankles: THREE.Vector3[] = [], hands: THREE.Vector3[] = [];
  for (const side of [-1, 1]) {
    const knee = hip.clone().addScaledVector(across, side * 0.115).addScaledVector(facing, 0.3);
    knee.y = Math.max(0.27, hip.y - 0.015);
    const ankle = knee.clone().addScaledVector(facing, 0.07); ankle.y = 0.135;
    for (const point of [knee, ankle]) {
      point.z = THREE.MathUtils.clamp(point.z, -0.73, B.lengthM / 2 - 0.25);
      const inside = Math.max(0.1, hullSection(point.z).halfWidth - 0.24);
      point.x = THREE.MathUtils.clamp(point.x, -inside, inside);
    }
    {
      // Lift the complete lower leg over the board case when feet cross the centreline.
      const closestX = knee.x * ankle.x <= 0 ? 0 : Math.min(Math.abs(knee.x), Math.abs(ankle.x));
      const footWidth = Math.abs(facing.x) * 0.135 + Math.abs(across.x) * 0.062;
      const footDepth = Math.abs(facing.z) * 0.135 + Math.abs(across.z) * 0.062;
      const beyondCase = Math.max(0, Math.min(knee.z, ankle.z) - footDepth - 0.5, -0.6 - Math.max(knee.z, ankle.z) - footDepth);
      const step = (1 - THREE.MathUtils.smoothstep(closestX, 0.10 + footWidth, 0.20 + footWidth))
        * (1 - THREE.MathUtils.smoothstep(beyondCase, 0.02, 0.12));
      knee.y = Math.max(knee.y, THREE.MathUtils.lerp(0.27, 0.32, step));
      ankle.y = THREE.MathUtils.lerp(0.135, 0.31, step);
    }
    if (role === 'skipper') ankle.z = Math.max(0.85, ankle.z - 0.18 * fold);
    knees.push(knee); ankles.push(ankle);
    hands.push(new THREE.Vector3(hip.x * 0.5, role === 'skipper' ? 0.54 : 0.49, z + (role === 'skipper' && side === 1 ? 0.35 : -0.33)));
  }
  if (boat.capsized) {
    hip.set(0, 0.47, 0); shoulder.copy(hip).addScaledVector(new THREE.Vector3(-Math.sign(boat.heel) * 0.16, 0.38, 0).normalize(), POSE.torsoLength); head.copy(shoulder).add(new THREE.Vector3(0, 0.16, 0));
    knees.forEach((point, i) => point.set(0.04, 0.27, i ? 0.12 : -0.12));
    ankles.forEach((point, i) => point.set(0.08, 0.11, i ? 0.12 : -0.12));
    hands.forEach((point, i) => point.set(-0.1, 0.55, i ? 0.24 : -0.24));
  }
  return { hip, shoulder, head, knees, ankles, hands, facing, across, duck };
}

/** Analytic two-bone solve: preserve limb lengths instead of stretching cylinders. */
export function solveTwoBone(root: THREE.Vector3, target: THREE.Vector3, upper: number, lower: number, bend: THREE.Vector3) {
  const axis = target.clone().sub(root);
  const distance = THREE.MathUtils.clamp(axis.length(), Math.abs(upper - lower) + 0.001, upper + lower - 0.001);
  if (axis.lengthSq() < 1e-10) axis.set(0, -1, 0); else axis.normalize();
  const end = root.clone().addScaledVector(axis, distance);
  const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
  const perpendicular = bend.clone().addScaledVector(axis, -bend.dot(axis));
  if (perpendicular.lengthSq() < 1e-8) perpendicular.set(1, 0, 0).addScaledVector(axis, -axis.x);
  perpendicular.normalize();
  const joint = root.clone().addScaledVector(axis, along).addScaledVector(perpendicular, Math.sqrt(Math.max(0, upper * upper - along * along)));
  return { joint, end };
}
