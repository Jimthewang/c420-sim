import { describe, expect, it } from 'vitest';
import { BOAT_CONFIG as B } from '../config/boat';
import { foilGeometry, hullGeometry, hullSection, ovalLoft } from './geometry';

describe('molded boat geometry', () => {
  it('uses outward hull normals and keeps smooth sections inside the physical beam', () => {
    const hull = hullGeometry();
    const p = hull.getAttribute('position'), n = hull.getAttribute('normal');
    let side = 0;
    for (let i = 0; i < p.count; i++) {
      expect(Number.isFinite(n.getX(i) + n.getY(i) + n.getZ(i))).toBe(true);
      expect(Math.abs(p.getX(i))).toBeLessThanOrEqual(B.beamM / 2 + 0.003);
      if (p.getX(i) > 0.75 && p.getY(i) < 0.3 && Math.abs(p.getZ(i)) < 0.25) {
        expect(n.getX(i)).toBeGreaterThan(0); side++;
      }
    }
    expect(side).toBeGreaterThan(0);
    expect(hullSection(-B.lengthM / 2).halfWidth).toBeLessThan(0.02);
    hull.dispose();
  });
  it('closes smooth buoyancy lofts and gives foils rounded, metre-scale tips', () => {
    const loft = ovalLoft([{ z: -1, y: 0.3, width: 0.2, height: 0.1 }, { z: 0, y: 0.4, width: 0.3, height: 0.12 }, { z: 1, y: 0.3, width: 0.2, height: 0.1 }]);
    const edges = new Map<string, number>(), index = loft.index!;
    for (let i = 0; i < index.count; i += 3) for (let edge = 0; edge < 3; edge++) {
      const a = index.getX(i + edge), b = index.getX(i + (edge + 1) % 3);
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
    expect([...edges.values()].every(count => count === 2)).toBe(true);
    const foil = foilGeometry(1.1, 0.33, 0.035); foil.computeBoundingBox();
    const box = foil.boundingBox!;
    expect(box.max.x - box.min.x).toBeCloseTo(0.035, 4);
    expect(box.min.y).toBeLessThan(-1.09); expect(box.min.y).toBeGreaterThan(-1.13);
    expect(box.max.z - box.min.z).toBeLessThan(0.35);
    loft.dispose(); foil.dispose();
  });
});
