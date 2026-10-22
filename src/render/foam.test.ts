import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createFoamSystem } from './foam';
import { createBoatState } from '../physics/sailing';
import { DEFAULT_SETTINGS } from '../config/environment';
import { getWaveHeight } from './waves';

describe('foam simulation clock', () => {
  it('does not emit from positive frame dt when the boat clock is frozen', () => {
    const foam = createFoamSystem(), state = createBoatState(); state.velocity.x = 3;
    foam.update([state], state.time, 1 / 60, DEFAULT_SETTINGS);
    const spray = foam.object.children[0] as THREE.InstancedMesh, version = spray.instanceMatrix.version;
    for (let i = 0; i < 180; i++) foam.update([state], state.time, 1 / 60, DEFAULT_SETTINGS);
    expect(spray.count).toBe(0); expect(spray.instanceMatrix.version).toBe(version); foam.dispose();
  });
  it('emits on forward boat time and resets its emitter history', () => {
    const foam = createFoamSystem(), state = createBoatState(); state.velocity.x = 3;
    for (let i = 0; i < 60; i++) { state.time = i / 60; foam.update([state], state.time, 1 / 60, DEFAULT_SETTINGS); }
    expect((foam.object.children[0] as THREE.InstancedMesh).count).toBeGreaterThan(5);
    foam.reset();
    foam.update([state], state.time, 1 / 60, DEFAULT_SETTINGS);
    expect((foam.object.children[0] as THREE.InstancedMesh).count).toBe(0); foam.dispose();
  });
  it('leaves thin world-anchored wake ribbons that freeze while paused and clear on restart', () => {
    const foam = createFoamSystem(), state = createBoatState(); state.velocity.z = -3;
    for (let i = 0; i < 90; i++) { state.time = i / 60; state.position.z = -state.time * 3; foam.update([state], state.time, 1 / 60, DEFAULT_SETTINGS); }
    const wake = foam.object.getObjectByName('wake-ribbons') as THREE.InstancedMesh;
    expect(wake.count).toBeGreaterThan(4);
    const matrix = new THREE.Matrix4(), scale = new THREE.Vector3(); wake.getMatrixAt(0, matrix); scale.setFromMatrixScale(matrix);
    expect(scale.y).toBeLessThan(.04); expect(scale.z).toBeGreaterThan(scale.y * 10);
    const before = Array.from(wake.instanceMatrix.array), version = wake.instanceMatrix.version;
    state.position.x = 40; foam.update([state], state.time, 1 / 60, DEFAULT_SETTINGS);
    expect(Array.from(wake.instanceMatrix.array)).toEqual(before); expect(wake.instanceMatrix.version).toBe(version);
    foam.reset(); expect(wake.count).toBe(0); foam.dispose();
  });
  it('keeps wake ribbon normals aligned to steep waves at every boat heading', () => {
    for (const windDirectionDeg of [0, 90, 180, 270]) for (const headingDeg of [0, 45, 90, 180, 270]) {
      const foam = createFoamSystem(), state = createBoatState();
      const settings = { ...DEFAULT_SETTINGS, windSpeedKnots: 20, windDirectionDeg, gusts: false, shifts: false };
      state.heading = headingDeg * Math.PI / 180;
      state.velocity = { x: Math.sin(state.heading) * 4, z: -Math.cos(state.heading) * 4 };
      for (let i = 0; i < 90; i++) {
        state.time = i / 60; state.position.x = state.velocity.x * state.time; state.position.z = state.velocity.z * state.time;
        foam.update([state], state.time, 1 / 60, settings);
      }
      const wake = foam.object.getObjectByName('wake-ribbons') as THREE.InstancedMesh;
      const matrix = new THREE.Matrix4(), normalMatrix = new THREE.Matrix3(), position = new THREE.Vector3(), vertex = new THREE.Vector3();
      const geometry = wake.geometry.getAttribute('position');
      expect(wake.count).toBeGreaterThan(4);
      for (let i = 0; i < wake.count; i++) {
        wake.getMatrixAt(i, matrix); position.setFromMatrixPosition(matrix); normalMatrix.getNormalMatrix(matrix);
        const normal = new THREE.Vector3(0, 1, 0).applyNormalMatrix(normalMatrix);
        const surface = getWaveHeight(position.x, position.z, state.time, 20, windDirectionDeg * Math.PI / 180);
        expect(normal.angleTo(surface.normal)).toBeLessThan(1e-6);
        for (let j = 0; j < geometry.count; j++) {
          vertex.fromBufferAttribute(geometry, j).applyMatrix4(matrix);
          const height = getWaveHeight(vertex.x, vertex.z, state.time, 20, windDirectionDeg * Math.PI / 180).height;
          expect(vertex.y - height).toBeGreaterThan(0);
        }
      }
      foam.dispose();
    }
  });

});
