import { describe, expect, it } from 'vitest';
import { chartProjection } from './race-chart';

describe('north-up course chart projection', () => {
  it('fits rotated courses and remote boats without distorting distances', () => {
    const points = [{ x: -300, z: 140 }, { x: 42, z: -400 }, { x: 750, z: 50 }];
    const projection = chartProjection(points, 320, 250);
    for (const p of points) {
      const q = projection.point(p);
      expect(q.x).toBeGreaterThanOrEqual(30); expect(q.x).toBeLessThanOrEqual(290);
      expect(q.y).toBeGreaterThanOrEqual(30); expect(q.y).toBeLessThanOrEqual(220);
      expect(projection.world(q.x, q.y).x).toBeCloseTo(p.x, 8);
      expect(projection.world(q.x, q.y).z).toBeCloseTo(p.z, 8);
    }
    expect(projection.point({ x: 0, z: -10 }).y).toBeLessThan(projection.point({ x: 0, z: 0 }).y);
    expect(projection.point({ x: 10, z: 0 }).x - projection.point({ x: 0, z: 0 }).x)
      .toBeCloseTo(projection.point({ x: 0, z: 10 }).y - projection.point({ x: 0, z: 0 }).y, 8);
  });
  it('handles coincident or absent positions without NaN or infinite scale', () => {
    for (const points of [[], [{ x: 0, z: 0 }]]) {
      const projection = chartProjection(points, 320, 250);
      expect(Number.isFinite(projection.scale)).toBe(true);
      expect(projection.point({ x: 0, z: 0 })).toEqual({ x: 160, y: 125 });
    }
  });
});
