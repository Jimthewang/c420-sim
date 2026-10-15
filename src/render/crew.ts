import * as THREE from 'three';
import type { BoatState } from '../physics/types';

export function createSailor(vestColor: number, simplified: boolean) {
  const object = new THREE.Group();
  const wetsuit = new THREE.MeshStandardMaterial({ color: 0x273b43, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xb78969, roughness: 0.92 });
  const vest = new THREE.MeshStandardMaterial({ color: vestColor, roughness: 0.9 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.24, 3, 7), vest);
  torso.scale.set(1, 1, 0.78);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 8, 6), skin);
  head.scale.y = 1.12;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.13, 6), skin);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), wetsuit);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.012, 0.12), wetsuit);
  object.add(torso, head, neck, cap, brim);
  const limbGeometry = new THREE.CylinderGeometry(0.045, 0.05, 1, 6);
  const limbs = Array.from({ length: simplified ? 0 : 8 }, () => {
    const limb = new THREE.Mesh(limbGeometry, wetsuit);
    object.add(limb);
    return limb;
  });
  const hands = Array.from({ length: simplified ? 0 : 2 }, () => {
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.046, 6, 4), skin);
    object.add(hand);
    return hand;
  });
  object.traverse((part) => { if (part instanceof THREE.Mesh) part.castShadow = true; });
  const up = new THREE.Vector3(0, 1, 0);
  function segment(index: number, a: THREE.Vector3, b: THREE.Vector3) {
    const limb = limbs[index];
    if (!limb) return;
    limb.position.copy(a).add(b).multiplyScalar(0.5);
    limb.scale.y = a.distanceTo(b);
    limb.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
  }

  /** The physics supplies actual lateral centres of mass; joints reach back into the boat. */
  function update(boat: BoatState, role: 'skipper' | 'crew') {
    const x = role === 'skipper' ? boat.crew.skipperX : boat.crew.crewX;
    const z = (role === 'skipper' ? 1.0 : -0.15) + boat.crew.foreAft;
    object.position.set(0, 0, z);
    object.rotation.set(0, 0, 0);
    const hipX = THREE.MathUtils.clamp(x, -0.65, 0.65);
    const hiking = Math.min(1, Math.abs(x) / 0.95);
    const sideFacing = Math.min(1, Math.abs(x) / 0.45);
    const facing = new THREE.Vector3(-Math.sign(x) * sideFacing, 0, -(1 - sideFacing)).normalize();
    const across = new THREE.Vector3(-facing.z, 0, facing.x);
    const hipY = 0.31 + Math.min(1, Math.abs(x) / 0.4) * 0.14;
    const hip = new THREE.Vector3(hipX, hipY, 0);
    const shoulder = new THREE.Vector3(x * 1.65 - hipX * 0.65, hipY + 0.43 - hiking * 0.22, 0.015);
    if (boat.capsized) {
      // Stand on the exposed board during recovery, keeping heads above the water.
      object.position.set(0, -0.62, role === 'skipper' ? 0.48 : -0.05);
      object.rotation.z = boat.heel;
      hip.set(0, 0.46, 0);
      shoulder.set(-Math.sign(boat.heel) * 0.15, 0.87, 0.02);
    }
    torso.position.copy(hip).lerp(shoulder, 0.5);
    torso.scale.y = hip.distanceTo(shoulder) / 0.56;
    torso.quaternion.setFromUnitVectors(up, shoulder.clone().sub(hip).normalize());
    neck.position.copy(shoulder).add(new THREE.Vector3(0, 0.05, 0));
    head.position.copy(shoulder).add(new THREE.Vector3(0, 0.17, 0));
    cap.position.copy(head.position).add(new THREE.Vector3(0, 0.055, 0));
    brim.position.copy(head.position).addScaledVector(facing, 0.09).add(new THREE.Vector3(0, 0.065, 0));
    brim.rotation.y = Math.atan2(-facing.x, -facing.z);
    for (let side = 0; side < 2; side++) {
      const offset = side === 0 ? -0.12 : 0.12;
      const hipJoint = hip.clone().addScaledVector(across, offset);
      const knee = hipJoint.clone().addScaledVector(facing, 0.34);
      knee.y = hipY - 0.015;
      const ankle = knee.clone().addScaledVector(facing, 0.07);
      ankle.y = 0.105;
      if (boat.capsized) {
        knee.set(0.05, 0.27, offset);
        ankle.set(0.08, 0.08, offset + 0.07);
      }
      segment(side * 2, hipJoint, knee);
      segment(side * 2 + 1, knee, ankle);
      const shoulderJoint = shoulder.clone().addScaledVector(across, offset).add(new THREE.Vector3(0, -0.03, 0));
      const hand = new THREE.Vector3(hipX * 0.5, 0.48, side === 0 ? -0.42 : role === 'skipper' ? 0.45 : -0.32);
      hands[side]?.position.copy(hand);
      const elbow = shoulderJoint.clone().lerp(hand, 0.58).add(new THREE.Vector3(0, -0.12, 0));
      segment(4 + side * 2, shoulderJoint, elbow);
      segment(5 + side * 2, elbow, hand);
    }
  }
  return { object, update };
}
