import * as THREE from 'three';
import type { BoatState } from '../physics/types';
import { computeCrewPose, POSE, solveTwoBone, type BoomSweep } from './crew-pose';
import { attachOutline, toonMaterial } from './toon';
import { tillerGrip } from './rigging';

/** Molded, articulated sailors with seated knees and feet held inside the cockpit. */
export function createSailor(vestColor: number, simplified: boolean) {
  const object = new THREE.Group();
  const wetsuit = toonMaterial(0x263649);
  const skin = toonMaterial(0xe9b38b);
  const vest = toonMaterial(vestColor);
  const cream = toonMaterial(0xfffdf7);
  function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, outline = 0.012) {
    const part = new THREE.Mesh(geometry, material);
    part.castShadow = true; part.receiveShadow = true;
    object.add(part); attachOutline(part, outline);
    return part;
  }
  const segments = simplified ? 8 : 12;
  const torso = mesh(new THREE.LatheGeometry([[0, -.19], [.07, -.175], [.11, -.145], [.135, -.09], [.145, -.02], [.145, .055], [.13, .11], [.09, .16], [0, .19]].map(([radius, y]) => new THREE.Vector2(radius, y)), segments), vest);
  torso.name = 'sailor-torso'; torso.scale.z = 0.85;
  const head = mesh(new THREE.SphereGeometry(0.115, segments, 8), skin);
  head.name = 'sailor-head';
  const neck = mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 8), skin, 0.007);
  const cap = mesh(new THREE.SphereGeometry(0.119, segments, 6, 0, Math.PI * 2, 0, Math.PI / 2), cream, 0.008);
  const brim = mesh(new THREE.SphereGeometry(1, segments, 6), cream, 0.008);
  brim.scale.set(0.09, 0.014, 0.065);
  const limbGeometry = new THREE.CapsuleGeometry(0.047, 0.906, 3, simplified ? 6 : 10);
  const limbs = new THREE.InstancedMesh(limbGeometry, wetsuit, 8);
  limbs.castShadow = true; limbs.frustumCulled = false; object.add(limbs); attachOutline(limbs, 0.008);
  const limbTransform = new THREE.Object3D();
  const hands = Array.from({ length: 2 }, () => mesh(new THREE.SphereGeometry(0.045, 8, 6), skin, 0.006));
  const shoes = Array.from({ length: 2 }, () => {
    const shoe = mesh(new THREE.SphereGeometry(1, 8, 6), wetsuit, 0.008);
    shoe.scale.set(0.062, 0.045, 0.105); return shoe;
  });
  const eyes = simplified ? [] : [-1, 1].map(() => mesh(new THREE.SphereGeometry(0.012, 6, 4), wetsuit, 0));
  const zip = simplified ? undefined : mesh(new THREE.CapsuleGeometry(0.008, 0.2, 2, 5), cream, 0);
  neck.name = 'sailor-neck'; cap.name = 'sailor-cap'; brim.name = 'sailor-brim';
  hands.forEach((hand, i) => { hand.name = `sailor-hand-${i}`; });
  shoes.forEach((shoe, i) => { shoe.name = `sailor-shoe-${i}`; });
  const up = new THREE.Vector3(0, 1, 0);
  let lastState: BoatState | undefined;
  let duck = 0, lastTime: number | undefined, lastSheet: number | undefined, lastJibAngle: number | undefined, trimCycle = 0, trimActivity = 0;
  let pose: ReturnType<typeof computeCrewPose>;
  let feet: THREE.Vector3[] | undefined, previousFootTargets: THREE.Vector3[] | undefined, stepFoot = -1, stepTime = 0, nextFoot = 0;
  let lastRole = '', wasCapsized = false;
  const stepStart = new THREE.Vector3(), stepTarget = new THREE.Vector3();
  function segment(index: number, a: THREE.Vector3, b: THREE.Vector3) {
    limbTransform.position.copy(a).add(b).multiplyScalar(0.5);
    limbTransform.scale.y = a.distanceTo(b);
    limbTransform.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
    limbTransform.updateMatrix(); limbs.setMatrixAt(index, limbTransform.matrix);
  }

  function update(boat: BoatState, role: 'skipper' | 'crew', sweep: Omit<BoomSweep, 'previousDuck'>) {
    const resetTime = boat !== lastState || lastTime === undefined || boat.time < lastTime;
    const dt = resetTime ? 0 : boat.time - lastTime!;
    if (resetTime) { duck = 0; lastSheet = undefined; lastJibAngle = undefined; trimCycle = 0; trimActivity = 0; nextFoot = 0; }
    lastTime = boat.time; lastState = boat;
    const sheet = role === 'skipper' ? boat.mainSheet : boat.jibSheet;
    const rigChange = role === 'crew' && lastJibAngle !== undefined ? Math.atan2(Math.sin(boat.jib.angle - lastJibAngle), Math.cos(boat.jib.angle - lastJibAngle)) * 0.5 : 0;
    const sheetChange = lastSheet === undefined || !dt ? 0 : sheet - lastSheet + rigChange;
    trimCycle += Math.abs(sheetChange) * Math.PI * 12;
    trimActivity = Math.max(Math.abs(sheetChange) / Math.max(dt, 0.001) * 3, trimActivity * Math.exp(-dt * 5));
    lastSheet = sheet; lastJibAngle = boat.jib.angle;
    pose = computeCrewPose(boat, role, { ...sweep, previousDuck: Math.max(0, duck - dt * 3.5) });
    duck = pose.duck;
    const pull = Math.sin(trimCycle) * Math.min(1, trimActivity) * 0.10;
    pose.hands[0].z += pull; pose.hands[0].y += Math.abs(pull) * 0.35;
    object.position.set(0, 0, 0); object.rotation.set(0, 0, 0);
    if (boat.capsized) {
      object.position.set(0, -0.62, role === 'skipper' ? 0.48 : -0.05);
      object.rotation.z = boat.heel;
    }
    const { hip, shoulder, facing, across } = pose;
    const resetFeet = resetTime || lastRole !== role || wasCapsized !== boat.capsized;
    if (!feet || resetFeet) {
      feet = pose.ankles.map(point => point.clone());
      previousFootTargets = pose.ankles.map(point => point.clone()); stepFoot = -1;
    }
    // Use bounded time slices and interpolated foot targets so display cadence does
    // not choose a different first step or restart the gait during a fast crossing.
    const slices = Math.max(1, Math.ceil(dt * 120 - 1e-6)), sliceDt = dt / slices;
    for (let slice = 1; slice <= slices && !boat.capsized; slice++) {
      const targets = pose.ankles.map((target, i) => previousFootTargets![i].clone().lerp(target, slice / slices));
      if (stepFoot < 0) {
        for (const i of [nextFoot, 1 - nextFoot]) if (feet[i].distanceTo(targets[i]) > 0.09) {
          stepFoot = i; stepTime = 0; stepStart.copy(feet[i]); stepTarget.copy(targets[i]); break;
        }
      }
      if (stepFoot >= 0 && sliceDt > 0) {
        stepTime += sliceDt; const t = Math.min(1, stepTime / 0.24);
        feet[stepFoot].copy(stepStart).lerp(stepTarget, THREE.MathUtils.smoothstep(t, 0, 1));
        const crossesCase = role === 'crew' && Math.min(Math.abs(stepStart.x), Math.abs(stepTarget.x)) < 0.3;
        feet[stepFoot].y += Math.sin(t * Math.PI) * (crossesCase ? 0.20 : 0.07);
        if (t === 1) { nextFoot = 1 - stepFoot; stepFoot = -1; }
      }
    }
    previousFootTargets!.forEach((target, i) => target.copy(pose.ankles[i]));
    if (!boat.capsized) pose.ankles.forEach((foot, i) => foot.copy(feet![i]));
    lastRole = role; wasCapsized = boat.capsized;

    torso.position.copy(hip).lerp(shoulder, 0.5);
    torso.scale.y = 1;
    const spine = shoulder.clone().sub(hip).normalize();
    const chest = facing.clone().addScaledVector(spine, -facing.dot(spine)).normalize();
    const lateral = spine.clone().cross(chest).normalize();
    torso.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(lateral, spine, chest));
    head.position.copy(pose.head);
    neck.position.copy(shoulder).lerp(pose.head, 0.3);
    cap.position.copy(pose.head).add(new THREE.Vector3(0, 0.02, 0));
    brim.position.copy(pose.head).addScaledVector(facing, 0.075).add(new THREE.Vector3(0, 0.06, 0));
    brim.rotation.y = Math.atan2(-facing.x, -facing.z);
    eyes.forEach((eye, i) => eye.position.copy(pose.head).addScaledVector(facing, 0.105).addScaledVector(across, i ? 0.037 : -0.037).add(new THREE.Vector3(0, 0.01, 0)));
    if (zip) {
      zip.position.set(0, 0, 0.127).applyQuaternion(torso.quaternion).add(torso.position);
      zip.quaternion.copy(torso.quaternion); zip.scale.y = torso.scale.y;
    }
    for (let side = 0; side < 2; side++) {
      const offset = side === 0 ? -0.115 : 0.115;
      const hipJoint = hip.clone().addScaledVector(across, offset);
      const leg = solveTwoBone(hipJoint, pose.ankles[side], POSE.thigh, POSE.shin, new THREE.Vector3(facing.x * (role === 'skipper' ? 1 : 0.2), 1, role === 'skipper' ? 0.5 : facing.z * 0.2));
      const caseSide = role === 'crew' && hipJoint.x * leg.end.x > 0 && Math.min(Math.abs(hipJoint.x), Math.abs(leg.end.x)) > 0.16
        && Math.min(hipJoint.y, leg.end.y) < 0.30 ? Math.sign(hipJoint.x) : 0;
      const tankSide = role === 'crew' && leg.joint.y < 0.52 && Math.abs(leg.joint.x) > 0.42 ? Math.sign(leg.joint.x) : 0;
      const planeNormal = role === 'skipper' ? new THREE.Vector3(0, 0, 1) : tankSide ? new THREE.Vector3(-tankSide, 0, 0) : caseSide ? new THREE.Vector3(caseSide, 0, 0) : new THREE.Vector3(0, 1, 0);
      const kneeLimit = role === 'skipper' ? 0.83 : tankSide ? -0.42 : caseSide ? 0.17 : 0.31;
      if (!boat.capsized && leg.joint.dot(planeNormal) < kneeLimit) {
        // Keep the knee on its exact two-bone circle. Behind the thwart for
        // the skipper; on the planted foot's side of the case for a low leg,
        // or above the case when stepping across it.
        const axis = leg.end.clone().sub(hipJoint).normalize();
        const center = hipJoint.clone().lerp(leg.end, 0.5), radius = leg.joint.distanceTo(center);
        const plane = planeNormal.clone().addScaledVector(axis, -planeNormal.dot(axis));
        const limit = THREE.MathUtils.clamp((kneeLimit - center.dot(planeNormal)) / (radius * plane.length()), -1, 1); plane.normalize();
        const tangent = leg.joint.clone().sub(center); tangent.addScaledVector(plane, -tangent.dot(plane));
        if (tangent.lengthSq() < 1e-10) tangent.copy(axis).cross(plane);
        tangent.normalize();
        leg.joint.copy(center).addScaledVector(plane, radius * limit).addScaledVector(tangent, radius * Math.sqrt(1 - limit * limit));
      }
      pose.knees[side].copy(leg.joint); pose.ankles[side].copy(leg.end);
      segment(side * 2, hipJoint, pose.knees[side]);
      segment(side * 2 + 1, pose.knees[side], pose.ankles[side]);
      shoes[side].position.copy(pose.ankles[side]).addScaledVector(facing, 0.03);
      shoes[side].rotation.y = Math.atan2(-facing.x, -facing.z);
      const shoulderJoint = shoulder.clone().addScaledVector(across, offset).add(new THREE.Vector3(0, -0.035, 0));
      if (role === 'skipper' && side === 1 && !boat.capsized) pose.hands[side].copy(tillerGrip(boat, shoulderJoint, pose.hands[side], POSE.upperArm + POSE.forearm - 0.02));
      const arm = solveTwoBone(shoulderJoint, pose.hands[side], POSE.upperArm, POSE.forearm,
        (role === 'skipper' ? new THREE.Vector3(0, -0.2, 1) : new THREE.Vector3(0, 0.2, 0).addScaledVector(facing, 1)).addScaledVector(across, side ? 0.2 : -0.2));
      const hand = pose.hands[side]; hand.copy(arm.end); hands[side].position.copy(hand);
      const elbow = arm.joint;
      segment(4 + side * 2, shoulderJoint, elbow);
      segment(5 + side * 2, elbow, hand);
    }
    limbs.instanceMatrix.needsUpdate = true;
    return pose;
  }
  return { object, update, get pose() { return pose; } };
}
