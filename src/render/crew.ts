import * as THREE from 'three';
import type { BoatState } from '../physics/types';
import { computeCrewPose, POSE, type BoomSweep } from './crew-pose';
import { attachOutline, toonMaterial } from './toon';

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
  const torso = mesh(new THREE.CapsuleGeometry(POSE.torsoRadius, 0.2, 4, segments), vest);
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
  const up = new THREE.Vector3(0, 1, 0);
  let duck = 0, lastTime: number | undefined;
  let pose: ReturnType<typeof computeCrewPose>;
  function segment(index: number, a: THREE.Vector3, b: THREE.Vector3) {
    limbTransform.position.copy(a).add(b).multiplyScalar(0.5);
    limbTransform.scale.y = a.distanceTo(b);
    limbTransform.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
    limbTransform.updateMatrix(); limbs.setMatrixAt(index, limbTransform.matrix);
  }

  function update(boat: BoatState, role: 'skipper' | 'crew', sweep: Omit<BoomSweep, 'previousDuck'>) {
    const dt = lastTime === undefined || boat.time < lastTime ? 0 : boat.time - lastTime;
    if (lastTime === undefined || boat.time < lastTime) duck = 0;
    lastTime = boat.time;
    pose = computeCrewPose(boat, role, { ...sweep, previousDuck: Math.max(0, duck - dt * 3.5) });
    duck = pose.duck;
    object.position.set(0, 0, 0); object.rotation.set(0, 0, 0);
    if (boat.capsized) {
      object.position.set(0, -0.62, role === 'skipper' ? 0.48 : -0.05);
      object.rotation.z = boat.heel;
    }
    const { hip, shoulder, facing, across } = pose;
    torso.position.copy(hip).lerp(shoulder, 0.5);
    torso.scale.y = hip.distanceTo(shoulder) / (POSE.torsoRadius * 2 + 0.2);
    torso.quaternion.setFromUnitVectors(up, shoulder.clone().sub(hip).normalize());
    head.position.copy(pose.head);
    neck.position.copy(shoulder).lerp(pose.head, 0.3);
    cap.position.copy(pose.head).add(new THREE.Vector3(0, 0.02, 0));
    brim.position.copy(pose.head).addScaledVector(facing, 0.075).add(new THREE.Vector3(0, 0.06, 0));
    brim.rotation.y = Math.atan2(-facing.x, -facing.z);
    eyes.forEach((eye, i) => eye.position.copy(pose.head).addScaledVector(facing, 0.105).addScaledVector(across, i ? 0.037 : -0.037).add(new THREE.Vector3(0, 0.01, 0)));
    if (zip) {
      zip.position.copy(torso.position).addScaledVector(facing, 0.127);
      zip.quaternion.copy(torso.quaternion); zip.scale.y = torso.scale.y;
    }
    for (let side = 0; side < 2; side++) {
      const offset = side === 0 ? -0.115 : 0.115;
      const hipJoint = hip.clone().addScaledVector(across, offset);
      segment(side * 2, hipJoint, pose.knees[side]);
      segment(side * 2 + 1, pose.knees[side], pose.ankles[side]);
      shoes[side].position.copy(pose.ankles[side]).addScaledVector(facing, 0.03);
      shoes[side].rotation.y = Math.atan2(-facing.x, -facing.z);
      const shoulderJoint = shoulder.clone().addScaledVector(across, offset).add(new THREE.Vector3(0, -0.035, 0));
      const hand = pose.hands[side]; hands[side].position.copy(hand);
      const elbow = shoulderJoint.clone().lerp(hand, 0.55).add(new THREE.Vector3(0, -0.08, 0));
      if (role === 'skipper') elbow.y = Math.max(elbow.y, 0.52);
      segment(4 + side * 2, shoulderJoint, elbow);
      segment(5 + side * 2, elbow, hand);
    }
    limbs.instanceMatrix.needsUpdate = true;
    return pose;
  }
  return { object, update, get pose() { return pose; } };
}
