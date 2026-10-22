import * as THREE from 'three';
import { BOAT_CONFIG as B } from '../config/boat';

const widths = [0.012, 0.46, 0.76, 0.94, 1, 0.99, 0.93, 0.83, 0.7];
const rails = [0.56, 0.48, 0.44, 0.42, 0.415, 0.415, 0.42, 0.43, 0.44];
function smoothSample(values: number[], t: number) {
  const index = Math.min(values.length - 2, Math.floor(t * (values.length - 1)));
  const f = t * (values.length - 1) - index;
  const a = values[Math.max(0, index - 1)], b = values[index], c = values[index + 1], d = values[Math.min(values.length - 1, index + 2)];
  return b + 0.5 * f * (c - a + f * (2 * a - 5 * b + 4 * c - d + f * (3 * (b - c) + d - a)));
}

/** Shared smooth gunwale profile: the crew and shell use the same curve. */
export function hullSection(z: number, length = B.lengthM, beam = B.beamM) {
  const t = THREE.MathUtils.clamp(z / length + 0.5, 0, 1);
  return { halfWidth: Math.max(0.004, smoothSample(widths, t)) * beam / 2,
    railY: smoothSample(rails, t), bottomY: -0.22 + 0.14 * Math.abs(t * 2 - 1) ** 3 };
}

/** A rounded U-section is lofted from fine bow to broad transom, including its inner skin. */
export function hullGeometry(length = B.lengthM, beam = B.beamM, detailed = true) {
  const along = detailed ? 44 : 22, around = detailed ? 18 : 10;
  const positions: number[] = [], indices: number[] = [];
  const ring = (around + 1) * 2;
  for (let i = 0; i <= along; i++) {
    const z = (i / along - 0.5) * length;
    const { halfWidth, railY, bottomY } = hullSection(z, length, beam);
    for (let skin = 0; skin < 2; skin++) for (let j = 0; j <= around; j++) {
      const a = (skin ? 1 - j / around : j / around) * Math.PI;
      const width = Math.max(0.003, halfWidth - (skin ? 0.065 : 0));
      const top = railY - (skin ? 0.025 : 0);
      const bottom = bottomY + (skin ? 0.075 : 0);
      positions.push(width * Math.cos(a), top - (top - bottom) * Math.sin(a) ** 0.72, z);
    }
  }
  for (let i = 0; i < along; i++) for (let j = 0; j < ring; j++) {
    const a = i * ring + j, b = i * ring + (j + 1) % ring;
    indices.push(a, a + ring, b, b, a + ring, b + ring);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

export interface LoftSection { z: number; x?: number; y: number; width: number; height: number }
/** Elliptical cross sections follow a Catmull-Rom spine; end caps close the molded solid. */
export function ovalLoft(sections: LoftSection[], longitudinal = 32, radial = 16) {
  const centers = new THREE.CatmullRomCurve3(sections.map((s) => new THREE.Vector3(s.x ?? 0, s.y, s.z)));
  const radii = new THREE.CatmullRomCurve3(sections.map((s) => new THREE.Vector3(s.width, s.height, 0)));
  const positions: number[] = [], indices: number[] = [];
  for (let i = 0; i <= longitudinal; i++) {
    const center = centers.getPoint(i / longitudinal), radius = radii.getPoint(i / longitudinal);
    for (let j = 0; j < radial; j++) {
      const a = j / radial * Math.PI * 2;
      positions.push(center.x + Math.cos(a) * Math.max(0.003, radius.x), center.y + Math.sin(a) * Math.max(0.003, radius.y), center.z);
    }
  }
  for (let i = 0; i < longitudinal; i++) for (let j = 0; j < radial; j++) {
    const a = i * radial + j, b = i * radial + (j + 1) % radial;
    indices.push(a, b, a + radial, b, b + radial, a + radial);
  }
  for (const end of [0, longitudinal]) {
    const section = sections[end === 0 ? 0 : sections.length - 1];
    const center = positions.length / 3; positions.push(section.x ?? 0, section.y, section.z);
    for (let j = 0; j < radial; j++) {
      const a = end * radial + j, b = end * radial + (j + 1) % radial;
      if (end === 0) indices.push(center, b, a); else indices.push(center, a, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

/** The gunwale tanks are shared with pose-clearance tests, including their actual lofted skin. */
export function buoyancyTankGeometry(side: number, detailed = true) {
  const sections = Array.from({ length: 12 }, (_, i) => {
    const z = -B.lengthM * 0.35 + i / 11 * B.lengthM * 0.835;
    const section = hullSection(z);
    return { z, x: side * (section.halfWidth - 0.13), y: section.railY - 0.105, width: 0.135, height: 0.12 };
  });
  return ovalLoft(sections, detailed ? 24 : 12, 12);
}

/** Foils have an elliptical tip and a rounded leading edge, never a rectangular block. */
export function foilGeometry(span: number, chord: number, thickness: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-chord * 0.45, 0);
  shape.bezierCurveTo(-chord * 0.53, -span * 0.4, -chord * 0.42, -span, 0, -span);
  shape.bezierCurveTo(chord * 0.35, -span, chord * 0.48, -span * 0.75, chord * 0.5, 0);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness * 0.6, bevelEnabled: true, bevelSize: thickness * 0.2, bevelThickness: thickness * 0.2, bevelSegments: 3, curveSegments: 14, steps: 1 });
  geometry.translate(0, 0, -thickness * 0.3);
  geometry.rotateY(Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}
