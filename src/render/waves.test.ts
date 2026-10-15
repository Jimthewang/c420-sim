import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getWaveHeight, sampleWave } from './waves';

describe('shared sea surface', () => {
  it('has a unit normal matching the numerical surface gradient', () => {
    const x = 17, z = -8, t = 4, wind = 13, direction = 0.8, epsilon = 0.001;
    const wave = getWaveHeight(x, z, t, wind, direction);
    const dx = (getWaveHeight(x + epsilon, z, t, wind, direction).height - getWaveHeight(x - epsilon, z, t, wind, direction).height) / (2 * epsilon);
    const dz = (getWaveHeight(x, z + epsilon, t, wind, direction).height - getWaveHeight(x, z - epsilon, t, wind, direction).height) / (2 * epsilon);
    const expected = new THREE.Vector3(-dx, 1, -dz).normalize();
    expect(wave.normal.distanceTo(expected)).toBeLessThan(0.00001);
    expect(wave.normal.length()).toBeCloseTo(1);
  });
  it('is deterministic, bounded, and grows with wind', () => {
    let low = 0, high = 0;
    for (let i = 0; i < 100; i++) {
      low += getWaveHeight(i, i / 2, 0, 4).height ** 2;
      const wave = getWaveHeight(i, i / 2, 0, 20);
      high += wave.height ** 2;
      expect(Math.abs(wave.height)).toBeLessThanOrEqual(0.54);
      expect(wave.height).toBe(getWaveHeight(i, i / 2, 0, 20).height);
    }
    expect(high).toBeGreaterThan(low * 4);
  });
  it('fills the supplied sample without allocating a replacement', () => {
    const sample = { height: 0, normal: new THREE.Vector3() }, normal = sample.normal;
    expect(sampleWave(2, 7, 5, 10, 0, sample)).toBe(sample);
    expect(sample.normal).toBe(normal);
  });
});
