import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createTerrainScene } from './terrain';
import { createSeaPatch } from './world';
import { configureTerrainCourse, getTerrainHeight, protectTerrainPoints, setTerrainSeed } from '../world/terrain';
import { DEFAULT_SETTINGS, KNOTS_TO_MPS } from '../config/environment';
import { getWaveHeight } from './waves';
import { sampleWind } from '../physics/sailing';

describe('NPR island and water meshes', () => {
  it('uses the exact physical height at every rendered ground vertex and flat triangle normals', () => {
    setTerrainSeed(420); configureTerrainCourse(null); protectTerrainPoints([]);
    const terrain = createTerrainScene(), ground = terrain.object.children[0] as THREE.Mesh;
    const position = ground.geometry.getAttribute('position'), normal = ground.geometry.getAttribute('normal');
    expect(ground.geometry.index).toBeNull(); expect(position.count).toBeGreaterThan(1000);
    for (let i = 0; i < position.count; i++) expect(position.getY(i)).toBeCloseTo(getTerrainHeight(position.getX(i), position.getZ(i)), 4);
    for (let i = 0; i < normal.count; i += 3) {
      expect(normal.getX(i)).toBe(normal.getX(i + 1)); expect(normal.getY(i)).toBe(normal.getY(i + 2));
    }
    expect(terrain.shoreline.length).toBeGreaterThan(20); terrain.dispose();
  });
  it('has toon materials, saturated scenery colors and black expanded outline shells', () => {
    const terrain = createTerrainScene();
    const palette = new Set([0xffffff, 0xffe144, 0x5ce67c, 0x28b5a8, 0xff6b6b, 0xfffdf7, 0x238c67]);
    let outlines = 0;
    terrain.object.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const material = object.material as THREE.Material;
      if (object.userData.isOutline) {
        outlines++; expect(material.side).toBe(THREE.BackSide);
        expect((material as THREE.MeshBasicMaterial).color.getHex()).toBe(0x141414);
      } else {
        expect(material).toBeInstanceOf(THREE.MeshToonMaterial);
        expect(palette.has((material as THREE.MeshToonMaterial).color.getHex())).toBe(true);
      }
    });
    expect(outlines).toBeGreaterThan(5); terrain.dispose();
  });
  it('makes nonplanar translucent water matching the shared wave sample', () => {
    const patch = createSeaPatch(36, 18);
    patch.update(60, -60, 7, DEFAULT_SETTINGS);
    const position = patch.mesh.geometry.getAttribute('position'), heights = new Set<number>();
    expect(patch.mesh.geometry.index).toBeNull();
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i) + 60, z = position.getZ(i) - 60, wind = sampleWind(x, z, 7, DEFAULT_SETTINGS);
      const height = getWaveHeight(x, z, 7, wind.speed / KNOTS_TO_MPS, wind.direction).height;
      expect(position.getY(i)).toBeCloseTo(height, 5); heights.add(position.getY(i));
    }
    expect(heights.size).toBeGreaterThan(100);
    expect(patch.mesh.material).toBeInstanceOf(THREE.MeshToonMaterial);
    expect(patch.mesh.material.transparent).toBe(true); expect(patch.mesh.material.opacity).toBeCloseTo(0.94);
    expect(patch.mesh.material.depthWrite).toBe(true);
    patch.dispose();
  });
  it.each([60, 100])('keeps the distant water outside the near patch at %s segments', segments => {
    const patch = createSeaPatch(1200, segments, 180), position = patch.mesh.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) expect(Math.abs(position.getX(i)) >= 180 || Math.abs(position.getZ(i)) >= 180).toBe(true);
    expect(patch.mesh.renderOrder).toBe(1); patch.dispose();
  });
  it.each([[360, 96, 0], [1200, 60, 180]])('keeps wind-puff tint continuous across duplicated triangle edges (%sm)', (span, segments, hole) => {
    const patch = createSeaPatch(span, segments, hole);
    patch.update(0, 0, 12, { ...DEFAULT_SETTINGS, gusts: true });
    const position = patch.mesh.geometry.getAttribute('position'), color = patch.mesh.geometry.getAttribute('color');
    const tints = new Map<string, number>();
    let compared = 0;
    for (let i = 0; i < position.count; i++) {
      const key = `${position.getX(i)},${position.getZ(i)}`;
      if (tints.has(key)) { expect(color.getX(i)).toBe(tints.get(key)); compared++; }
      else tints.set(key, color.getX(i));
    }
    expect(compared).toBeGreaterThan(1000);
    patch.dispose();
  });
  it('preserves the full shared wave surface within the boat domain on the production medium grid', () => {
    const patch = createSeaPatch(360, 96), time = 31;
    const settings = { ...DEFAULT_SETTINGS, windSpeedKnots: 18, gusts: true, shifts: true };
    patch.update(60, -60, time, settings);
    const position = patch.mesh.geometry.getAttribute('position');
    let checked = 0;
    for (let i = 0; i < position.count; i++) {
      if (Math.abs(position.getX(i)) > 60 || Math.abs(position.getZ(i)) > 60) continue;
      const x = position.getX(i) + 60, z = position.getZ(i) - 60;
      const wind = sampleWind(x, z, time, settings);
      expect(position.getY(i)).toBeCloseTo(getWaveHeight(x, z, time, wind.speed / KNOTS_TO_MPS, wind.direction).height, 5);
      checked++;
    }
    expect(checked).toBeGreaterThan(1000);
    patch.dispose();
  });
  it.each([[72, 60], [96, 60], [144, 100]])('shares the same interpolated height and color edge at quality %i/%i', (nearSegments, farSegments) => {
    const near = createSeaPatch(360, nearSegments), far = createSeaPatch(1200, farSegments, 180, near.boundary);
    const settings = { ...DEFAULT_SETTINGS, windSpeedKnots: 20, gusts: false, shifts: false };
    near.update(0, 0, 7, settings); far.update(0, 0, 7, settings);
    for (const axis of ['x', 'z'] as const) for (const side of [-1, 1]) {
      const edge = (geometry: THREE.BufferGeometry) => {
        const position = geometry.getAttribute('position'), color = geometry.getAttribute('color'), points = new Map<number, number[]>();
        for (let i = 0; i < position.count; i++) {
          const across = axis === 'x' ? position.getX(i) : position.getZ(i), along = axis === 'x' ? position.getZ(i) : position.getX(i);
          if (across === side * 180 && Math.abs(along) <= 180) points.set(along, [position.getY(i), color.getX(i), color.getY(i), color.getZ(i)]);
        }
        return [...points].sort((a, b) => a[0] - b[0]);
      };
      const a = edge(near.mesh.geometry), b = edge(far.mesh.geometry);
      const sample = (points: [number, number[]][], x: number, channel: number) => {
        const right = points.findIndex(point => point[0] >= x);
        if (right === 0) return points[0][1][channel];
        const [x0, y0] = points[right - 1], [x1, y1] = points[right];
        return y0[channel] + (y1[channel] - y0[channel]) * (x - x0) / (x1 - x0);
      };
      for (let x = -180; x <= 180; x += .75) for (let channel = 0; channel < 4; channel++) expect(sample(a, x, channel)).toBeCloseTo(sample(b, x, channel), 6);
    }
    near.dispose(); far.dispose();
  });
  it('skips frozen sea updates but invalidates on local wind changes', () => {
    const patch = createSeaPatch(36, 18), settings = { ...DEFAULT_SETTINGS, windShadows: [{ position: { x: 0, z: 0 }, heading: 0 }] };
    patch.update(0, 0, 1, settings);
    const position = patch.mesh.geometry.getAttribute('position') as THREE.BufferAttribute, version = position.version;
    patch.update(0, 0, 1, structuredClone(settings));
    expect(position.version).toBe(version);
    settings.windShadows[0].position.x = 8; patch.update(0, 0, 1, settings);
    expect(position.version).toBeGreaterThan(version); patch.dispose();
  });
  it('keeps the optimized water normals equal to flat geometric face normals', () => {
    const patch = createSeaPatch(36, 18); patch.update(60, -60, 9, DEFAULT_SETTINGS);
    const reference = patch.mesh.geometry.clone(); reference.computeVertexNormals();
    const actual = patch.mesh.geometry.getAttribute('normal'), expected = reference.getAttribute('normal');
    for (let i = 0; i < actual.count; i++) {
      expect(actual.getX(i)).toBeCloseTo(expected.getX(i), 6);
      expect(actual.getY(i)).toBeCloseTo(expected.getY(i), 6);
      expect(actual.getZ(i)).toBeCloseTo(expected.getZ(i), 6);
    }
    reference.dispose(); patch.dispose();
  });
  it('adds distinct shallow-water hues without changing physical wave height', () => {
    setTerrainSeed(420); configureTerrainCourse(null); protectTerrainPoints([]);
    const patch = createSeaPatch(360, 72); patch.update(120, -60, 3, DEFAULT_SETTINGS);
    const color = patch.mesh.geometry.getAttribute('color'), position = patch.mesh.geometry.getAttribute('position');
    const deep: number[] = [], shallow: number[] = [];
    for (let i = 0; i < position.count; i++) {
      const depth = getTerrainHeight(position.getX(i) + 120, position.getZ(i) - 60), hue = color.getY(i) / color.getZ(i);
      if (depth < -7) deep.push(hue);
      else if (depth > -2 && depth < 0) shallow.push(hue);
    }
    expect(deep.length).toBeGreaterThan(100); expect(shallow.length).toBeGreaterThan(5);
    expect(Math.min(...shallow)).toBeGreaterThan(Math.max(...deep) + .2);
    const heights = Array.from(position.array), colors = Array.from(color.array);
    configureTerrainCourse({ windDirectionDeg: 90, length: 300 }); patch.invalidateTerrain(); patch.update(120, -60, 3, DEFAULT_SETTINGS);
    expect(Array.from(position.array)).toEqual(heights); expect(Array.from(color.array)).not.toEqual(colors);
    configureTerrainCourse(null); patch.dispose();
  });
});
