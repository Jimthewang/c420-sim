import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { attachOutline, buildOutlineGeometry, disposeOutlines, setOutlinesEnabled, toonMaterial, updateOutline } from './toon';

describe('toy shading and continuous outline shells', () => {
  it('uses three nearest-sampled light bands without mipmaps', () => {
    const material = toonMaterial(0xfffdf7);
    expect(material).toBeInstanceOf(THREE.MeshToonMaterial);
    expect((material.gradientMap!.image as { width: number }).width).toBe(3);
    expect(material.gradientMap!.minFilter).toBe(THREE.NearestFilter);
    expect(material.gradientMap!.magFilter).toBe(THREE.NearestFilter);
    expect(material.gradientMap!.generateMipmaps).toBe(false);
  });
  it('keeps all coincident vertices welded after expanding faceted geometry', () => {
    const source = new THREE.IcosahedronGeometry(1, 0);
    const original = source.getAttribute('position');
    const shell = buildOutlineGeometry(source, .05).getAttribute('position');
    const twins = new Map<string, number[]>();
    for (let i = 0; i < original.count; i++) {
      const key = [original.getX(i), original.getY(i), original.getZ(i)].join(',');
      const value = [shell.getX(i), shell.getY(i), shell.getZ(i)];
      if (twins.has(key)) expect(value).toEqual(twins.get(key));
      else twins.set(key, value);
      expect(Math.hypot(...value)).toBeCloseTo(1.05, 5);
    }
  });
  it('updates deforming geometry and applies the global toggle to new shells', () => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), toonMaterial(0xffffff));
    const shell = attachOutline(mesh);
    const before = shell.geometry.getAttribute('position').getY(0);
    mesh.geometry.translate(0, 2, 0); updateOutline(mesh);
    expect(shell.geometry.getAttribute('position').getY(0)).toBeCloseTo(before + 2);
    setOutlinesEnabled(false); expect(shell.visible).toBe(false);
    const second = new THREE.Mesh(new THREE.IcosahedronGeometry(1), toonMaterial(0xffffff));
    expect(attachOutline(second).visible).toBe(false);
    setOutlinesEnabled(true); expect(shell.visible).toBe(true);
    disposeOutlines(mesh); disposeOutlines(second);
  });
  it('shares instance transforms without applying colored instance tints to ink', () => {
    const source = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1), toonMaterial(0x5ce67c), 3);
    source.setColorAt(0, new THREE.Color(0xff0000));
    const outline = attachOutline(source) as THREE.InstancedMesh;
    expect(outline.instanceMatrix).toBe(source.instanceMatrix);
    expect(outline.instanceColor).toBeNull();
    disposeOutlines(source);
  });
  it('reuses dynamic shell storage without rebuilding geometry after topology is established', () => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 3, 4, 5), toonMaterial(0xffffff));
    const shell = attachOutline(mesh), geometry = shell.geometry, position = geometry.getAttribute('position');
    updateOutline(mesh);
    const clone = vi.spyOn(THREE.BufferGeometry.prototype, 'clone');
    mesh.geometry.translate(0, .4, 0); updateOutline(mesh);
    expect(clone).not.toHaveBeenCalled(); clone.mockRestore();
    expect(shell.geometry).toBe(geometry); expect(shell.geometry.getAttribute('position')).toBe(position);
    const expected = buildOutlineGeometry(mesh.geometry, .025);
    expect(Array.from(position.array)).toEqual(Array.from(expected.getAttribute('position').array));
    expected.dispose(); disposeOutlines(mesh);
  });
  it('defers hidden shell work and catches up when ink is enabled', () => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 3), toonMaterial(0xffffff));
    const shell = attachOutline(mesh), position = shell.geometry.getAttribute('position'), before = position.getY(0);
    setOutlinesEnabled(false); mesh.geometry.translate(0, 2, 0); updateOutline(mesh);
    const hiddenY = position.getY(0);
    setOutlinesEnabled(true);
    expect(hiddenY).toBe(before); expect(position.getY(0)).toBeCloseTo(before + 2);
    disposeOutlines(mesh);
  });
  it('establishes welds after a collapsed sail receives its first real positions', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3));
    geometry.setIndex([0, 1, 2, 1, 3, 2]);
    const mesh = new THREE.Mesh(geometry, toonMaterial(0xffffff)), shell = attachOutline(mesh);
    updateOutline(mesh);
    geometry.getAttribute('position').array.set([0, 0, 0, 1, 0, .2, 0, 1, 0, 1, 1, .2]);
    geometry.getAttribute('position').needsUpdate = true; updateOutline(mesh);
    const expected = buildOutlineGeometry(geometry, .025);
    expect(Array.from(shell.geometry.getAttribute('position').array)).toEqual(Array.from(expected.getAttribute('position').array));
    expected.dispose(); disposeOutlines(mesh);
  });
});
