import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBoatState } from '../physics/sailing';
import { createSailor } from './crew';
import { createDinghy } from './boat';
import { disposeObject } from './course';

afterEach(() => vi.unstubAllGlobals());
describe('sailor geometry clearance', () => {
  it('keeps actual sailor meshes and outlines outside the molded tanks, thwart and board case', () => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fillText() {} }) }) });
    const dinghy = createDinghy();
    const sailor = createSailor(0xff6b6b, false), boat = createBoatState();
    const tanks: THREE.Mesh[] = [];
    dinghy.object.traverse(child => {
      if (child instanceof THREE.Mesh && child.name.startsWith('crew-obstacle-')) {
        const collider = new THREE.Mesh(child.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
        collider.position.copy(child.position); collider.quaternion.copy(child.quaternion); collider.scale.copy(child.scale);
        collider.name = child.name; collider.updateMatrixWorld(true); tanks.push(collider);
      }
    });
    expect(tanks).toHaveLength(4);
    const ray = new THREE.Raycaster(), direction = new THREE.Vector3(0.23, 1, 0.17).normalize(), point = new THREE.Vector3(), matrix = new THREE.Matrix4();
    const bounds = tanks.map(tank => new THREE.Box3().setFromObject(tank));
    const meshes: THREE.Mesh[] = [];
    sailor.object.traverse(child => { if (child instanceof THREE.Mesh) meshes.push(child); });
    for (const role of ['skipper', 'crew'] as const) for (const aft of [0, 0.2, 0.4]) for (const x of [-0.95, -0.6, -0.4, -0.1, 0, 0.1, 0.4, 0.6, 0.95]) for (const angle of [-1.4, -0.7, -0.35, 0, 0.35, 0.7, 1.4]) {
      boat.time += 0.05; boat.crew = { skipperX: x, crewX: x, foreAft: aft, hike: x };
      sailor.update(boat, role, { from: angle - 0.04, to: angle, predicted: angle + 0.08, anticipation: 0.3 });
      sailor.object.updateMatrixWorld(true);
      for (const mesh of meshes) {
        const positions = mesh.geometry.getAttribute('position');
        const count = mesh instanceof THREE.InstancedMesh ? mesh.count : 1;
        for (let instance = 0; instance < count; instance++) {
          if (mesh instanceof THREE.InstancedMesh) { mesh.getMatrixAt(instance, matrix); matrix.premultiply(mesh.matrixWorld); }
          else matrix.copy(mesh.matrixWorld);
          for (let i = 0; i < positions.count; i++) {
            point.fromBufferAttribute(positions, i).applyMatrix4(matrix);
            for (let obstacle = 0; obstacle < tanks.length; obstacle++) {
              if (!bounds[obstacle].containsPoint(point)) continue;
              ray.set(point, direction);
              const hits = ray.intersectObject(tanks[obstacle], false).filter((hit, index, all) => index === 0 || Math.abs(hit.distance - all[index - 1].distance) > 1e-6);
              expect(hits.length % 2, `${role} x=${x} aft=${aft} angle=${angle} ${mesh.name || mesh.geometry.type} instance=${instance} point=${point.toArray()} obstacle=${tanks[obstacle].name}`).toBe(0);
            }
          }
        }
      }
    }
    disposeObject(sailor.object); tanks.forEach(tank => (tank.material as THREE.Material).dispose()); disposeObject(dinghy.object);
  }, 15000);
  it('separates the two recovering sailors after their actual role transforms', () => {
    const boat = createBoatState(); boat.capsized = true; boat.heel = 1.53;
    const skipper = createSailor(0xff6b6b, true), crew = createSailor(0xffe144, true);
    const sweep = { from: 1, to: 1, predicted: 1, anticipation: 0 };
    skipper.update(boat, 'skipper', sweep); crew.update(boat, 'crew', sweep);
    skipper.object.updateMatrixWorld(true); crew.object.updateMatrixWorld(true);
    const skipperHead = skipper.object.localToWorld(skipper.pose.head.clone()), crewHead = crew.object.localToWorld(crew.pose.head.clone());
    expect(skipperHead.distanceTo(crewHead)).toBeGreaterThan(0.5);
    disposeObject(skipper.object); disposeObject(crew.object);
  });
});
