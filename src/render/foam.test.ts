import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createFoamSystem } from './foam';
import { createBoatState } from '../physics/sailing';
import { DEFAULT_SETTINGS } from '../config/environment';

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
});
