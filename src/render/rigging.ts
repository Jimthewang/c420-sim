import * as THREE from 'three';
import { BOAT_CONFIG as B } from '../config/boat';
import type { BoatState } from '../physics/types';

/** A 33-inch extension is rigid; a sailor may grip slightly inside its end. */
export const TILLER_EXTENSION_LENGTH = 0.8382;
export function tillerJoint(boat: BoatState) {
  return new THREE.Vector3(-Math.sin(boat.rudder) * 0.8, B.rudderTopY + 0.14,
    B.lengthM / 2 + B.rudderAftOffsetM - 0.06 - Math.cos(boat.rudder) * 0.8);
}

export function tillerGrip(boat: BoatState, shoulder: THREE.Vector3, preferred: THREE.Vector3, reach: number) {
  const joint = tillerJoint(boat), axis = joint.clone().sub(shoulder), distance = axis.length();
  axis.normalize();
  // The hand can slide along the rigid extension. Keep a natural bent-elbow grip
  // whenever both the arm and spar can reach it, instead of forcing the endpoint.
  const relaxed = preferred.clone();
  if (relaxed.distanceTo(shoulder) > reach) relaxed.sub(shoulder).setLength(reach).add(shoulder);
  if (relaxed.distanceTo(joint) > TILLER_EXTENSION_LENGTH) relaxed.sub(joint).setLength(TILLER_EXTENSION_LENGTH).add(joint);
  if (relaxed.distanceTo(shoulder) <= reach && relaxed.y >= 0.53) return relaxed;
  const gripRadius = Math.min(TILLER_EXTENSION_LENGTH, distance + reach - 0.005);
  const along = (reach * reach - gripRadius * gripRadius + distance * distance) / (2 * distance);
  const center = shoulder.clone().addScaledVector(axis, along);
  const radius = Math.sqrt(Math.max(0, reach * reach - along * along));
  const radial = preferred.clone().sub(center); radial.addScaledVector(axis, -radial.dot(axis)).normalize();
  const high = new THREE.Vector3(0, 1, 0).addScaledVector(axis, -axis.y).normalize();
  const grip = center.clone().addScaledVector(radial, radius);
  // Keep the working hand above the transverse seat without stretching either arm bone.
  for (let i = 0; i < 12 && grip.y < 0.53; i++) { radial.lerp(high, 0.25).normalize(); grip.copy(center).addScaledVector(radial, radius); }
  return grip;
}
