import * as THREE from 'three';
import { BOAT_CONFIG as B } from '../config/boat';
import type { BoatState } from '../physics/types';
import { hullSection } from './geometry';

export const POSE = { headRadius: 0.14, torsoRadius: 0.145, boomRadius: 0.035, clearance: 0.035 };
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
  const hip = new THREE.Vector3(hipX, THREE.MathUtils.lerp(0.255, section.railY + 0.12, edge), z);
  const shoulder = new THREE.Vector3(physicalX * 1.5 - hipX * 0.5, hip.y + 0.4 - hiking * 0.22, z + 0.01);
  const head = shoulder.clone().add(new THREE.Vector3(0, 0.185, 0));
  const sweptDistance = Math.min(distanceToSweep(head, sweep.from, sweep.to), distanceToSweep(shoulder, sweep.from, sweep.to));
  const predictedDistance = Math.min(distanceToSweep(head, sweep.to, sweep.predicted), distanceToSweep(shoulder, sweep.to, sweep.predicted));
  const near = 1 - THREE.MathUtils.smoothstep(sweptDistance, 0.32, 0.57);
  const anticipate = (1 - THREE.MathUtils.smoothstep(predictedDistance, 0.32, 0.62)) * sweep.anticipation;
  let duck = Math.max(near, anticipate, sweep.previousDuck);
  // Move into the cockpit before lowering; this clears the curved tank's full surface.
  const inwardRoom = Math.max(0.04, section.halfWidth - 0.29 - POSE.torsoRadius);
  const crouchedX = THREE.MathUtils.clamp(hipX * 0.55, -inwardRoom, inwardRoom);
  const pullIn = THREE.MathUtils.smoothstep(duck, 0, 0.55);
  const lower = THREE.MathUtils.smoothstep(duck, 0.5, 1);
  hip.x = THREE.MathUtils.lerp(hip.x, crouchedX, pullIn);
  hip.y = THREE.MathUtils.lerp(hip.y, 0.245, lower);
  shoulder.x = THREE.MathUtils.lerp(shoulder.x, crouchedX, pullIn);
  shoulder.y = THREE.MathUtils.lerp(shoulder.y, 0.51, lower);
  head.copy(shoulder).add(new THREE.Vector3(0, 0.185, 0));
  const currentDanger = distanceToSweep(head, sweep.from, sweep.to) < POSE.headRadius + 0.15
    || distanceToSweep(shoulder, sweep.from, sweep.to) < POSE.torsoRadius + 0.15;
  if (currentDanger) {
    duck = 1;
    hip.set(crouchedX, 0.245, z);
    shoulder.set(crouchedX, 0.51, z + 0.01);
    head.copy(shoulder).add(new THREE.Vector3(0, 0.185, 0));
    head.y = Math.min(head.y, B.boomHeightM - POSE.headRadius - POSE.boomRadius - POSE.clearance - 0.01);
    shoulder.y = Math.min(shoulder.y, head.y - 0.185);
  }
  if (role === 'crew') hip.y = Math.max(hip.y, 0.30);
  const inward = Math.min(1, Math.abs(hipX) / 0.42);
  const facing = new THREE.Vector3(-Math.sign(hipX) * inward, 0, -(1 - inward)).normalize();
  const across = new THREE.Vector3(-facing.z, 0, facing.x);
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
    knees.push(knee); ankles.push(ankle);
    hands.push(new THREE.Vector3(hip.x * 0.5, role === 'skipper' ? 0.54 : 0.49, z + (role === 'skipper' && side === 1 ? 0.35 : -0.33)));
  }
  if (boat.capsized) {
    hip.set(0, 0.47, 0); shoulder.set(-Math.sign(boat.heel) * 0.16, 0.85, 0); head.copy(shoulder).add(new THREE.Vector3(0, 0.185, 0));
    knees.forEach((point, i) => point.set(0.04, 0.27, i ? 0.12 : -0.12));
    ankles.forEach((point, i) => point.set(0.08, 0.11, i ? 0.12 : -0.12));
    hands.forEach((point, i) => point.set(-0.1, 0.55, i ? 0.24 : -0.24));
  }
  return { hip, shoulder, head, knees, ankles, hands, facing, across, duck };
}
