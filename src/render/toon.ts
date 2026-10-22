import * as THREE from 'three';

let gradient: THREE.Texture | undefined;
let outlinesEnabled = true;
const outlines = new Set<THREE.Mesh>();
interface DynamicShell {
  groups: Uint32Array; corners: Uint32Array; normals: Float64Array; previous: Float32Array;
  position: THREE.BufferAttribute; index: THREE.BufferAttribute | null; version: number;
}
const shells = new WeakMap<THREE.Mesh, { shell: THREE.Mesh; thickness: number; dynamic?: DynamicShell; pending?: boolean }>();

/** Three discrete lighting bands, shared by every physical scene material. */
function toonGradient() {
  if (gradient) return gradient;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 3; canvas.height = 1;
    const context = canvas.getContext('2d')!;
    [92, 177, 255].forEach((value, x) => {
      context.fillStyle = `rgb(${value},${value},${value})`;
      context.fillRect(x, 0, 1, 1);
    });
    gradient = new THREE.CanvasTexture(canvas);
  } else {
    // Geometry tests run without a browser; the live renderer uses the canvas above.
    gradient = new THREE.DataTexture(new Uint8Array([92, 92, 92, 255, 177, 177, 177, 255, 255, 255, 255, 255]), 3, 1);
    gradient.needsUpdate = true;
  }
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.colorSpace = THREE.NoColorSpace;
  return gradient;
}

export function toonMaterial(color: THREE.ColorRepresentation, parameters: THREE.MeshToonMaterialParameters = {}) {
  return new THREE.MeshToonMaterial({ color, ...parameters, gradientMap: toonGradient() });
}

/** Weld coincident positions before splitting faces, so faceted corners cannot crack. */
export function buildOutlineGeometry(source: THREE.BufferGeometry, thickness: number) {
  const position = source.getAttribute('position');
  const index = source.getIndex();
  const groups = new Map<string, THREE.Vector3>();
  const keys: string[] = [];
  for (let i = 0; i < position.count; i++) {
    const key = `${Math.round(position.getX(i) * 1e5)},${Math.round(position.getY(i) * 1e5)},${Math.round(position.getZ(i) * 1e5)}`;
    keys.push(key);
    if (!groups.has(key)) groups.set(key, new THREE.Vector3());
  }
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3();
  const count = index?.count ?? position.count;
  for (let i = 0; i < count; i += 3) {
    const ia = index ? index.getX(i) : i;
    const ib = index ? index.getX(i + 1) : i + 1;
    const ic = index ? index.getX(i + 2) : i + 2;
    a.fromBufferAttribute(position, ia); b.fromBufferAttribute(position, ib); c.fromBufferAttribute(position, ic);
    ab.subVectors(b, a).cross(ac.subVectors(c, a));
    groups.get(keys[ia])!.add(ab); groups.get(keys[ib])!.add(ab); groups.get(keys[ic])!.add(ab);
  }
  for (const normal of groups.values()) normal.normalize();
  const expanded = source.clone();
  const target = expanded.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const normal = groups.get(keys[i])!;
    target.setXYZ(i, position.getX(i) + normal.x * thickness, position.getY(i) + normal.y * thickness, position.getZ(i) + normal.z * thickness);
  }
  const result = expanded.index ? expanded.toNonIndexed() : expanded;
  if (result !== expanded) expanded.dispose();
  result.computeVertexNormals();
  result.computeBoundingSphere();
  return result;
}

export function attachOutline(mesh: THREE.Mesh, thickness = .025): THREE.Mesh {
  if (shells.has(mesh)) return shells.get(mesh)!.shell;
  const geometry = buildOutlineGeometry(mesh.geometry, thickness);
  const material = new THREE.MeshBasicMaterial({ color: 0x141414, side: THREE.BackSide, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 });
  let shell: THREE.Mesh;
  if (mesh instanceof THREE.InstancedMesh) {
    const instances = new THREE.InstancedMesh(geometry, material, mesh.count);
    instances.instanceMatrix = mesh.instanceMatrix;
    instances.count = mesh.count;
    shell = instances;
  } else shell = new THREE.Mesh(geometry, material);
  shell.name = 'inverted-hull-outline';
  shell.userData.isOutline = true;
  shell.visible = outlinesEnabled;
  shell.frustumCulled = mesh.frustumCulled;
  mesh.add(shell);
  outlines.add(shell); shells.set(mesh, { shell, thickness });
  return shell;
}

/** Dynamic sail cloth keeps the exact same welded expansion as rigid models. */
export function updateOutline(mesh: THREE.Mesh) {
  const entry = shells.get(mesh);
  if (!entry) return;
  if (!outlinesEnabled) { entry.pending = true; return; }
  entry.pending = false;
  const position = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  const index = mesh.geometry.getIndex();
  let dynamic = entry.dynamic;
  if (!dynamic || dynamic.position !== position || dynamic.index !== index) {
    // Empty sail buffers are populated on their first update; welding them now would merge every vertex.
    let hasArea = false;
    const count = index?.count ?? position.count;
    for (let i = 0; i < count && !hasArea; i += 3) {
      const a = index ? index.getX(i) : i, b = index ? index.getX(i + 1) : i + 1, c = index ? index.getX(i + 2) : i + 2;
      const ux = position.getX(b) - position.getX(a), uy = position.getY(b) - position.getY(a), uz = position.getZ(b) - position.getZ(a);
      const vx = position.getX(c) - position.getX(a), vy = position.getY(c) - position.getY(a), vz = position.getZ(c) - position.getZ(a);
      hasArea = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) > 1e-12;
    }
    if (!hasArea) return;
    const welds = new Map<string, number>(), groups = new Uint32Array(position.count);
    for (let i = 0; i < position.count; i++) {
      const key = `${Math.round(position.getX(i) * 1e5)},${Math.round(position.getY(i) * 1e5)},${Math.round(position.getZ(i) * 1e5)}`;
      if (!welds.has(key)) welds.set(key, welds.size);
      groups[i] = welds.get(key)!;
    }
    const corners = new Uint32Array(count);
    for (let i = 0; i < count; i++) corners[i] = index ? index.getX(i) : i;
    dynamic = entry.dynamic = { groups, corners, normals: new Float64Array(welds.size * 3), previous: new Float32Array(position.count * 3).fill(NaN), position, index, version: -1 };
    if (entry.shell.geometry.getAttribute('position').count !== count) {
      entry.shell.geometry.dispose(); entry.shell.geometry = buildOutlineGeometry(mesh.geometry, entry.thickness);
    }
  }
  if (dynamic.version === position.version) return;
  dynamic.version = position.version;
  const { groups, corners, normals, previous } = dynamic;
  let changed = false;
  for (let i = 0; i < position.count; i++) {
    const offset = i * 3, x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    if (previous[offset] !== x || previous[offset + 1] !== y || previous[offset + 2] !== z) changed = true;
    previous[offset] = x; previous[offset + 1] = y; previous[offset + 2] = z;
  }
  if (!changed) return;
  normals.fill(0);
  for (let i = 0; i < corners.length; i += 3) {
    const a = corners[i] * 3, b = corners[i + 1] * 3, c = corners[i + 2] * 3;
    const ux = previous[b] - previous[a], uy = previous[b + 1] - previous[a + 1], uz = previous[b + 2] - previous[a + 2];
    const vx = previous[c] - previous[a], vy = previous[c + 1] - previous[a + 1], vz = previous[c + 2] - previous[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (let corner = 0; corner < 3; corner++) {
      const group = groups[corners[i + corner]] * 3; normals[group] += nx; normals[group + 1] += ny; normals[group + 2] += nz;
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= length; normals[i + 1] /= length; normals[i + 2] /= length;
  }
  const target = entry.shell.geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < corners.length; i++) {
    const vertex = corners[i], offset = vertex * 3, group = groups[vertex] * 3;
    target.setXYZ(i, previous[offset] + normals[group] * entry.thickness, previous[offset + 1] + normals[group + 1] * entry.thickness, previous[offset + 2] + normals[group + 2] * entry.thickness);
  }
  target.needsUpdate = true;
  entry.shell.geometry.computeBoundingSphere();
}

export function setOutlinesEnabled(enabled: boolean) {
  if (enabled === outlinesEnabled) return;
  outlinesEnabled = enabled;
  for (const shell of outlines) {
    shell.visible = enabled;
    if (enabled && shell.parent instanceof THREE.Mesh && shells.get(shell.parent)?.pending) updateOutline(shell.parent);
  }
}

/** Call before disposing a scene subtree to release the visibility registry. */
export function disposeOutlines(object: THREE.Object3D) {
  object.traverse(child => {
    if (child instanceof THREE.Mesh) {
      if (child.userData.isOutline) outlines.delete(child);
      shells.delete(child);
    }
  });
}
