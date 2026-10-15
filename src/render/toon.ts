import * as THREE from 'three';

let gradient: THREE.Texture | undefined;
let outlinesEnabled = true;
const outlines = new Set<THREE.Mesh>();
const shells = new WeakMap<THREE.Mesh, { shell: THREE.Mesh; thickness: number }>();

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
  const fresh = buildOutlineGeometry(mesh.geometry, entry.thickness);
  const oldPosition = entry.shell.geometry.getAttribute('position');
  const newPosition = fresh.getAttribute('position');
  if (oldPosition.count === newPosition.count) {
    (oldPosition.array as Float32Array).set(newPosition.array);
    oldPosition.needsUpdate = true;
    entry.shell.geometry.boundingSphere = fresh.boundingSphere;
    fresh.dispose();
  } else {
    entry.shell.geometry.dispose(); entry.shell.geometry = fresh;
  }
}

export function setOutlinesEnabled(enabled: boolean) {
  if (enabled === outlinesEnabled) return;
  outlinesEnabled = enabled;
  for (const shell of outlines) shell.visible = enabled;
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
