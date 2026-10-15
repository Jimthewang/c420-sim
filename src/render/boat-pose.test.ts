import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBoatState } from '../physics/sailing';
import { createDinghy } from './boat';
import { hullSection } from './geometry';
import { getWaveHeight } from './waves';
import { disposeObject } from './course';

const canvas = () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fillText() {} }) });
afterEach(() => vi.unstubAllGlobals());
describe('boat follows the rendered sea', () => {
  it('fits four shared wave samples, keeps upright gunwales clear and leaves physics state unchanged', () => {
    vi.stubGlobal('document', { createElement: canvas });
    const warn = vi.spyOn(console, 'warn');
    const dinghy = createDinghy({ simplified: true }), state = createBoatState();
    const seenPitch: number[] = [];
    for (const wind of [4, 10, 20]) for (const heading of [0, 0.9, 2]) for (const time of [0, 1.2, 4.4]) {
      state.time = time; state.heading = heading; state.position = { x: 4, z: -9 };
      const before = structuredClone(state);
      dinghy.update(state, false, 90, wind, 0.3); dinghy.object.updateMatrixWorld(true);
      seenPitch.push(Math.abs(dinghy.object.rotation.x));
      for (const z of [-1.4, 0, 1.7]) for (const side of [-1, 1]) {
        const section = hullSection(z);
        const rail = dinghy.object.localToWorld(new THREE.Vector3(side * section.halfWidth, section.railY, z));
        const sea = getWaveHeight(rail.x, rail.z, time, wind, 0.3).height;
        expect(rail.y - sea, `wind=${wind} heading=${heading} time=${time}`).toBeGreaterThan(0.12);
      }
      expect(state).toEqual(before);
    }
    expect(Math.max(...seenPitch)).toBeGreaterThan(0.02);
    state.capsized = true; state.heel = 1.53;
    dinghy.update(state, false, 90, 20, 0.3);
    expect(dinghy.object.rotation.z).toBe(-state.heel);
    expect(warn).not.toHaveBeenCalled(); warn.mockRestore();
    disposeObject(dinghy.object);
  });
});
