import { describe, expect, it } from 'vitest';
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
});
