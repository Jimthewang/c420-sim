import * as THREE from 'three';
import { getTerrainGradient, getTerrainHeight, getTerrainIslands, getTerrainSeed } from '../world/terrain';
import type { Vec2 } from '../physics/types';
import { attachOutline, disposeOutlines, toonMaterial } from './toon';

/** Build only after the terrain seed, course reservation or protected positions change. */
export function createTerrainScene() {
  const object = new THREE.Group(), islands = getTerrainIslands(), shoreline: Vec2[] = [];
  const positions: number[] = [], colors: number[] = [], cell = 3;
  const sand = new THREE.Color(0xffe144), grass = new THREE.Color(0x5ce67c), rock = new THREE.Color(0x28b5a8), snow = new THREE.Color(0xffffff);
  const snowHeight = 24;
  let seed = getTerrainSeed() | 0;
  const random = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
  const vertex = (x: number, z: number) => new THREE.Vector3(x, getTerrainHeight(x, z), z);
  const edgeA = new THREE.Vector3(), edgeB = new THREE.Vector3(), normal = new THREE.Vector3();
  function triangle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) {
    const height = (a.y + b.y + c.y) / 3;
    edgeA.subVectors(b, a); edgeB.subVectors(c, a); normal.crossVectors(edgeA, edgeB).normalize();
    const palette = height < 1.3 ? sand : height > snowHeight ? snow : normal.y < 0.74 || height > snowHeight * 0.65 ? rock : grass;
    for (const point of [a, b, c]) { positions.push(point.x, point.y, point.z); colors.push(palette.r, palette.g, palette.b); }
  }
  function shoreEdge(a: THREE.Vector3, b: THREE.Vector3) {
    if ((a.y > 0) === (b.y > 0)) return;
    const fraction = -a.y / (b.y - a.y);
    shoreline.push({ x: a.x + (b.x - a.x) * fraction, z: a.z + (b.z - a.z) * fraction });
  }
  for (const island of islands) {
    const minX = Math.floor((island.x - island.radius) / cell) * cell, maxX = Math.ceil((island.x + island.radius) / cell) * cell;
    const minZ = Math.floor((island.z - island.radius) / cell) * cell, maxZ = Math.ceil((island.z + island.radius) / cell) * cell;
    for (let x = minX; x < maxX; x += cell) for (let z = minZ; z < maxZ; z += cell) {
      const cx = x + cell / 2, cz = z + cell / 2;
      // Shared grid ownership avoids overlapping terrain meshes where island bounds meet.
      const owner = islands.find(candidate => cx >= candidate.x - candidate.radius && cx <= candidate.x + candidate.radius && cz >= candidate.z - candidate.radius && cz <= candidate.z + candidate.radius);
      if (owner !== island) continue;
      const a = vertex(x, z), b = vertex(x, z + cell), c = vertex(x + cell, z), d = vertex(x + cell, z + cell);
      if (Math.max(a.y, b.y, c.y, d.y) < -1.8) continue;
      triangle(a, b, c); triangle(c, b, d);
      shoreEdge(a, b); shoreEdge(a, c);
    }
  }
  const indexedGeometry = new THREE.BufferGeometry();
  indexedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  indexedGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  indexedGeometry.setIndex(Array.from({ length: positions.length / 3 }, (_, index) => index));
  const geometry = indexedGeometry.toNonIndexed(); indexedGeometry.dispose();
  geometry.computeVertexNormals();
  const land = new THREE.Mesh(geometry, toonMaterial(0xffffff, { vertexColors: true, side: THREE.DoubleSide }));
  land.castShadow = land.receiveShadow = true;
  attachOutline(land, 0.075); object.add(land);

  const treePositions: { x: number; y: number; z: number; size: number; angle: number; broad: boolean }[] = [];
  const rockPositions: { x: number; y: number; z: number; size: number; angle: number }[] = [];
  for (const island of islands) {
    for (let i = 0; i < 85; i++) {
      const angle = random() * Math.PI * 2, radius = Math.sqrt(random()) * island.radius * 0.83;
      const x = island.x + Math.cos(angle) * radius, z = island.z + Math.sin(angle) * radius, y = getTerrainHeight(x, z);
      const slope = getTerrainGradient(x, z);
      if (y < 1.7 || Math.hypot(slope.x, slope.z) > 0.65) continue;
      if (i % 4 === 0) rockPositions.push({ x, y, z, size: 0.4 + random() * 1.2, angle });
      else treePositions.push({ x, y, z, size: 0.65 + random() * 0.9, angle, broad: i % 3 === 0 });
    }
  }
  const transform = new THREE.Object3D();
  function instances(shape: THREE.BufferGeometry, color: number, count: number, thickness = 0.025) {
    const mesh = new THREE.InstancedMesh(shape, toonMaterial(color), count);
    mesh.castShadow = mesh.receiveShadow = true;
    attachOutline(mesh, thickness); object.add(mesh); return mesh;
  }
  const trunks = instances(new THREE.CylinderGeometry(0.18, 0.27, 3.7, 5), 0x238c67, treePositions.length);
  const firs = treePositions.filter(tree => !tree.broad), broadleaf = treePositions.filter(tree => tree.broad);
  const needles = instances(new THREE.ConeGeometry(1.7, 4.2, 5), 0x238c67, firs.length * 2, 0.04);
  const leaves = instances(new THREE.IcosahedronGeometry(1.8, 0), 0x5ce67c, broadleaf.length * 2, 0.04);
  treePositions.forEach((tree, index) => {
    transform.position.set(tree.x, tree.y + 1.8 * tree.size, tree.z); transform.rotation.set(0, tree.angle, 0); transform.scale.setScalar(tree.size);
    transform.updateMatrix(); trunks.setMatrixAt(index, transform.matrix);
  });
  firs.forEach((tree, index) => {
    for (let layer = 0; layer < 2; layer++) {
      transform.position.set(tree.x, tree.y + (3.3 + layer * 1.5) * tree.size, tree.z);
      transform.rotation.set(0, tree.angle + layer * 0.4, 0); transform.scale.setScalar(tree.size * (layer ? 0.72 : 1));
      transform.updateMatrix(); needles.setMatrixAt(index * 2 + layer, transform.matrix);
    }
  });
  broadleaf.forEach((tree, index) => {
    for (let layer = 0; layer < 2; layer++) {
      transform.position.set(tree.x + layer * 0.8 * tree.size, tree.y + (3.7 + layer * 0.9) * tree.size, tree.z);
      transform.rotation.set(0, tree.angle, layer * 0.2); transform.scale.setScalar(tree.size * (layer ? 0.72 : 1));
      transform.updateMatrix(); leaves.setMatrixAt(index * 2 + layer, transform.matrix);
    }
  });
  const rocks = instances(new THREE.IcosahedronGeometry(1, 0), 0x28b5a8, rockPositions.length, 0.035);
  rockPositions.forEach((stone, index) => {
    transform.position.set(stone.x, stone.y + stone.size * 0.3, stone.z); transform.rotation.set(0.2, stone.angle, 0.3); transform.scale.set(stone.size, stone.size * 0.7, stone.size * 1.3);
    transform.updateMatrix(); rocks.setMatrixAt(index, transform.matrix);
  });
  for (const mesh of [trunks, needles, leaves, rocks]) { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); }

  // A single striped navigation light anchors the archipelago's silhouette.
  const lighthouse = new THREE.Group();
  let lighthouseGround = -Infinity;
  for (const island of islands) {
    const height = getTerrainHeight(island.x, island.z);
    if (height > lighthouseGround) { lighthouseGround = height; lighthouse.position.set(island.x, height, island.z); }
  }
  const beacon = new THREE.PointLight(0xffdd91, 0, 55, 1.3);
  if (lighthouseGround > 2) {
    function towerPart(shape: THREE.BufferGeometry, color: number, y: number, params?: THREE.MeshToonMaterialParameters) {
      const mesh = new THREE.Mesh(shape, toonMaterial(color, params)); mesh.position.y = y; mesh.castShadow = mesh.receiveShadow = true;
      attachOutline(mesh, 0.055); lighthouse.add(mesh); return mesh;
    }
    towerPart(new THREE.CylinderGeometry(3.1, 3.7, 1.2, 8), 0x28b5a8, 0.6);
    for (let band = 0; band < 4; band++) towerPart(new THREE.CylinderGeometry(1.7 - band * 0.12, 1.82 - band * 0.12, 2.5, 10), band % 2 ? 0xff6b6b : 0xfffdf7, 2.45 + band * 2.5);
    towerPart(new THREE.CylinderGeometry(2.0, 1.9, 0.5, 10), 0x238c67, 11.4);
    towerPart(new THREE.CylinderGeometry(1.2, 1.2, 1.8, 8), 0xffe144, 12.45, { emissive: 0xffe144, emissiveIntensity: 0.5 });
    towerPart(new THREE.ConeGeometry(2.1, 1.6, 10), 0xff6b6b, 14.1);
    for (let post = 0; post < 8; post++) {
      const bar = towerPart(new THREE.CylinderGeometry(0.07, 0.07, 1.9, 4), 0x238c67, 12.45);
      bar.position.x = Math.sin(post * Math.PI / 4) * 1.25; bar.position.z = Math.cos(post * Math.PI / 4) * 1.25;
    }
    beacon.position.y = 12.5; lighthouse.add(beacon); object.add(lighthouse);
  }
  function update(time: number, night: number) { beacon.intensity = night * (5 + Math.max(0, Math.sin(time * 0.65)) * 25); }
  function dispose() {
    disposeOutlines(object);
    const meshes = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    object.traverse(child => { if (child instanceof THREE.Mesh) { meshes.add(child.geometry); (Array.isArray(child.material) ? child.material : [child.material]).forEach(material => materials.add(material)); } });
    meshes.forEach(shape => shape.dispose()); materials.forEach(material => material.dispose()); object.removeFromParent();
  }
  return { object, shoreline, update, dispose };
}
