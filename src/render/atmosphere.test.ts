import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createAtmosphere, getShowcasePlacement } from './atmosphere';
import { configureTerrainCourse, getTerrainHeight, getTerrainIslands, protectTerrainPoints, setTerrainSeed } from '../world/terrain';
import { DEFAULT_SETTINGS } from '../config/environment';
import { createCameraRig } from './camera';
import { createBoatState } from '../physics/sailing';
import { getWaveHeight } from './waves';

describe('coastal presentation', () => {
  it('anchors the showcase offshore with an existing raised island behind the boat across several seeded bays', () => {
    for (const seed of [420, 18, 73, 196, 859]) {
      setTerrainSeed(seed); configureTerrainCourse({ windDirectionDeg: 0, length: 300 }); protectTerrainPoints([{ x: 0, z: 0 }]);
      const place = getShowcasePlacement();
      expect(getTerrainHeight(place.x, place.z)).toBeLessThan(-3);
      const visibleCoast = getTerrainIslands().some(island => {
        const dx = island.x - place.x, dz = island.z - place.z;
        return getTerrainHeight(island.x, island.z) > 3 && dx * -Math.sin(place.yaw) + dz * -Math.cos(place.yaw) > 30;
      });
      expect(visibleCoast).toBe(true);
      const canvas = new EventTarget() as EventTarget & Record<string, unknown>;
      Object.assign(canvas, { clientWidth: 1280, clientHeight: 720, style: {}, setPointerCapture() {}, hasPointerCapture() { return false; }, releasePointerCapture() {}, focus() {} });
      const rig = createCameraRig(canvas as unknown as HTMLCanvasElement), state = createBoatState();
      state.position = { x: place.x, z: place.z };
      rig.setShowcase({ yaw: place.yaw, time: 0, reducedMotion: true }); rig.update(state, 'chase', 0, DEFAULT_SETTINGS);
      rig.camera.updateMatrixWorld(true);
      const island = [...getTerrainIslands()].sort((a, b) => getTerrainHeight(b.x, b.z) - getTerrainHeight(a.x, a.z))[0];
      const summit = new THREE.Vector3(island.x, getTerrainHeight(island.x, island.z) + 15, island.z).project(rig.camera);
      expect(summit.y).toBeLessThan(.8); expect(summit.y).toBeGreaterThan(-.4);
      expect(rig.camera.position.y).toBeGreaterThan(getTerrainHeight(rig.camera.position.x, rig.camera.position.z) + .59);
      expect(rig.camera.position.y).toBeGreaterThan(getWaveHeight(rig.camera.position.x, rig.camera.position.z, 0, DEFAULT_SETTINGS.windSpeedKnots).height + .59);
      rig.dispose();
    }
    setTerrainSeed(420); configureTerrainCourse(null); protectTerrainPoints([]);
  });
  it('freezes glints on repeated simulation time and releases geometry on disposal', () => {
    const atmosphere = createAtmosphere(), position = { x: 0, z: 0 };
    atmosphere.update(position, 2, DEFAULT_SETTINGS, 1, 0, false, false);
    const mesh = atmosphere.object.getObjectByName('surface-glints') as THREE.InstancedMesh;
    const version = mesh.instanceMatrix.version;
    atmosphere.update(position, 2, DEFAULT_SETTINGS, 1, 0, false, false);
    expect(mesh.instanceMatrix.version).toBe(version);
    const matrix = new THREE.Matrix4();
    const transforms = () => {
      const values = new Map<string, number[]>();
      for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, matrix); values.set(`${matrix.elements[12]},${matrix.elements[14]}`, [...matrix.elements]); }
      return values;
    };
    const before = transforms();
    atmosphere.update({ x: 10, z: 0 }, 2, DEFAULT_SETTINGS, 1, 0, false, false);
    const after = transforms(), shared = [...before.keys()].filter(key => after.has(key));
    expect(shared).toHaveLength(140);
    for (const key of shared) expect(after.get(key)).toEqual(before.get(key));
    atmosphere.update(position, 3, DEFAULT_SETTINGS, 1, 0, false, false);
    expect(mesh.instanceMatrix.version).toBeGreaterThan(version);
    const scene = new THREE.Scene(); scene.add(atmosphere.object); atmosphere.dispose(); expect(scene.children).toHaveLength(0);
  });
});
