import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBoatState } from '../physics/sailing';
import { createDinghy } from './boat';
import { disposeObject } from './course';
const canvas = () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fillText() {} }) });
afterEach(() => vi.unstubAllGlobals());
describe('sailing rig motion', () => {
  it('keeps the tiller extension a rigid spar throughout a crossing', () => {
    vi.stubGlobal('document', { createElement: canvas });
    const boat = createBoatState(), model = createDinghy();
    let extension!: THREE.Mesh;
    model.object.traverse(part => { if (part instanceof THREE.Mesh && part.geometry instanceof THREE.CylinderGeometry && part.geometry.parameters.height > .49 && part.geometry.parameters.height < .51) extension = part; });
    const lengths: number[] = [];
    for (let i = 0; i <= 30; i++) {
      boat.time = i / 60; boat.crew.skipperX = -.95 + i / 30 * 1.9; boat.rudder = Math.sin(i / 5) * .4;
      model.update(boat, false, 90, 10, 0);
      lengths.push((extension.geometry as THREE.CylinderGeometry).parameters.height * extension.scale.y);
    }
    expect(Math.max(...lengths) - Math.min(...lengths)).toBeLessThan(.005);
    expect(lengths[0]).toBeGreaterThan(.8); expect(lengths[0]).toBeLessThan(.95);
    disposeObject(model.object);
  });
  it('shows a separated leeward telltale without changing its attachment or topology', () => {
    vi.stubGlobal('document', { createElement: canvas });
    const boat = createBoatState(), model = createDinghy(); boat.main.angle = .65; boat.main.status = 'drawing';
    const ribbon = model.object.getObjectByName('main-telltale-1') as THREE.Mesh;
    model.update(boat, false, 90, 10, 0);
    const position = ribbon.geometry.getAttribute('position');
    const index = ribbon.geometry.index, start = new THREE.Vector3().fromBufferAttribute(position, 0);
    const drawing = new THREE.Vector3().fromBufferAttribute(position, 8).sub(start);
    boat.main.status = 'stalled'; model.update(boat, false, 90, 10, 0);
    const stalled = new THREE.Vector3().fromBufferAttribute(position, 8).sub(new THREE.Vector3().fromBufferAttribute(position, 0));
    expect(stalled.y).toBeLessThan(drawing.y - .1); expect(Math.abs(stalled.z)).toBeLessThan(Math.abs(drawing.z) * .5);
    expect(ribbon.geometry.index).toBe(index);
    disposeObject(model.object);
  });
  it('changes filled draft and upper-sail twist with wind/load while retaining topology', () => {
    vi.stubGlobal('document', { createElement: canvas });
    const boat = createBoatState(), model = createDinghy();
    boat.main.status = 'drawing'; boat.main.angle = .65; boat.main.lift = 20;
    let main!: THREE.Mesh;
    model.object.traverse(part => { if (part instanceof THREE.Mesh && (part.material as THREE.MeshToonMaterial).map) main = part; });
    model.update(boat, false, 90, 4, 0);
    const low = Array.from(main.geometry.getAttribute('position').array), index = main.geometry.index;
    boat.main.lift = 300; model.update(boat, false, 90, 20, 0);
    const high = main.geometry.getAttribute('position');
    expect(Math.max(...low.map((v, i) => Math.abs(v - high.array[i])))).toBeGreaterThan(.025);
    expect(main.geometry.index).toBe(index); expect(high.count * 3).toBe(low.length);
    disposeObject(model.object);
  });
});
