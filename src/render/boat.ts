import * as THREE from 'three';
import { BOAT_CONFIG } from '../config/boat';
import type { BoatState } from '../physics/types';

/** The model faces local north (-z); its dimensions are in metres. */
export function createDinghy() {
  const { lengthM: length, beamM: beam, mastHeightM: mastTop, boomHeightM: boomHeight, mainFootM: mainFoot } = BOAT_CONFIG;
  const boat = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf1f0e8, roughness: 0.42 });
  const cockpit = new THREE.MeshStandardMaterial({ color: 0xd2d8d4, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x253b43, roughness: 0.65 });
  const aluminum = new THREE.MeshStandardMaterial({ color: 0x9daeb4, metalness: 0.75, roughness: 0.3 });
  const rope = new THREE.LineBasicMaterial({ color: 0x525b58, transparent: true, opacity: 0.62 });
  const halfLength = length / 2;
  const halfBeam = beam / 2;
  const mastZ = -length * 0.16;

  function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent = boat) {
    const object = new THREE.Mesh(geometry, material);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }

  function spar(start: THREE.Vector3, end: THREE.Vector3, radius: number, material = aluminum, parent = boat) {
    const object = mesh(new THREE.CylinderGeometry(radius, radius, start.distanceTo(end), 10), material, parent);
    object.position.copy(start).add(end).multiplyScalar(0.5);
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
    return object;
  }

  function line(points: number[][], material = rope, parent = boat) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(...p as [number, number, number])));
    const object = new THREE.Line(geometry, material);
    parent.add(object);
    return object;
  }

  // Rounded sections narrow into the stem and flatten across the transom.
  const stations = [
    [-1, 0.015, 0.53], [-0.88, 0.30, 0.48], [-0.65, 0.62, 0.43],
    [-0.35, 0.87, 0.40], [0, 1, 0.38], [0.35, 0.99, 0.38],
    [0.7, 0.87, 0.39], [1, 0.69, 0.4],
  ];
  const vertices: number[] = [];
  const indices: number[] = [];
  for (const [z, width, height] of stations) {
    const w = width * halfBeam;
    const bottom = -0.19 + 0.15 * Math.pow(Math.abs(z), 3);
    for (const [x, y] of [[-w, height], [-w * 0.88, 0.02], [-w * 0.48, bottom + 0.035], [0, bottom], [w * 0.48, bottom + 0.035], [w * 0.88, 0.02], [w, height]]) {
      vertices.push(x, y, z * halfLength);
    }
  }
  for (let s = 0; s < stations.length - 1; s++) {
    for (let j = 0; j < 6; j++) {
      const a = s * 7 + j;
      indices.push(a, a + 7, a + 1, a + 1, a + 7, a + 8);
    }
  }
  const hullGeometry = new THREE.BufferGeometry();
  hullGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  hullGeometry.setIndex(indices);
  hullGeometry.computeVertexNormals();
  // Double-sided shell also shows the inside above the cockpit sole.
  const hullMaterial = white.clone();
  hullMaterial.side = THREE.DoubleSide;
  mesh(hullGeometry, hullMaterial);

  // Side decks leave an actual open cockpit, with a raised forward buoyancy tank.
  for (const side of [-1, 1]) {
    const deck: number[] = [];
    for (const [z, width, height] of stations) {
      const outer = side * width * halfBeam;
      const inner = outer * (z < -0.65 ? 0 : 0.73);
      deck.push(outer, height, z * halfLength, inner, height - 0.012, z * halfLength);
    }
    const deckIndices: number[] = [];
    for (let i = 0; i < stations.length - 1; i++) deckIndices.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(deck, 3));
    geometry.setIndex(deckIndices);
    geometry.computeVertexNormals();
    mesh(geometry, hullMaterial);
    const rail = stations.map(([z, width, height]) => new THREE.Vector3(side * width * halfBeam, height + 0.012, z * halfLength));
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rail), 36, 0.018, 5, false), dark);
  }
  const sole = mesh(new THREE.BoxGeometry(beam * 0.62, 0.035, length * 0.65), cockpit);
  sole.position.set(0, 0.04, length * 0.15);
  const transom = mesh(new THREE.BoxGeometry(beam * 0.69, 0.38, 0.045), white);
  transom.position.set(0, 0.2, halfLength - 0.025);
  const foreTank = mesh(new THREE.BoxGeometry(beam * 0.8, 0.22, 0.48), cockpit);
  foreTank.position.set(0, 0.24, -length * 0.23);
  const thwart = mesh(new THREE.BoxGeometry(beam * 0.8, 0.055, 0.19), white);
  thwart.position.set(0, 0.28, 0.12);
  const trunk = mesh(new THREE.BoxGeometry(0.12, 0.25, 1.08), white);
  trunk.position.set(0, 0.18, -0.02);
  for (const x of [-0.25, 0.25]) {
    const strap = mesh(new THREE.BoxGeometry(0.065, 0.018, 1.55), dark);
    strap.position.set(x, 0.11, 0.72);
  }
  const board = mesh(new THREE.BoxGeometry(0.035, 1.1, 0.33), white);
  board.position.set(0, -0.63, 0.02);
  const rudder = new THREE.Group();
  rudder.position.set(0, 0.18, halfLength + 0.035);
  boat.add(rudder);
  const blade = mesh(new THREE.BoxGeometry(0.035, 0.8, 0.28), white, rudder);
  blade.position.set(0, -0.38, 0.06);
  spar(new THREE.Vector3(0, 0.07, 0), new THREE.Vector3(0, 0.14, -0.92), 0.022, dark, rudder);
  spar(new THREE.Vector3(0, 0.14, -0.8), new THREE.Vector3(-0.47, 0.18, -1.27), 0.012, dark, rudder);

  spar(new THREE.Vector3(0, 0.31, mastZ), new THREE.Vector3(0, mastTop, mastZ), 0.033);
  const spreaderY = mastTop * 0.52;
  for (const side of [-1, 1]) {
    spar(new THREE.Vector3(0, spreaderY, mastZ), new THREE.Vector3(side * 0.42, spreaderY - 0.025, mastZ + 0.08), 0.012);
    line([[0, mastTop * 0.79, mastZ], [side * 0.42, spreaderY - 0.025, mastZ + 0.08], [side * halfBeam * 0.85, 0.4, mastZ + 0.31]]);
  }
  const jibTackZ = -length * 0.445;
  const jibTop = mastTop * 0.79;
  line([[0, 0.49, jibTackZ], [0, jibTop, mastZ]]);

  const sailCanvas = document.createElement('canvas');
  sailCanvas.width = 512;
  sailCanvas.height = 1024;
  const paint = sailCanvas.getContext('2d')!;
  paint.fillStyle = '#f6f5eb';
  paint.fillRect(0, 0, 512, 1024);
  paint.strokeStyle = 'rgba(130,140,137,.34)';
  paint.lineWidth = 1;
  for (let y = 90; y < 1024; y += 145) {
    paint.beginPath(); paint.moveTo(0, y); paint.lineTo(512, y + 13); paint.stroke();
    paint.beginPath(); paint.moveTo(0, y + 4); paint.lineTo(512, y + 17); paint.stroke();
  }
  paint.fillStyle = '#31454c';
  paint.font = '500 78px Arial';
  paint.fillText('420', 30, 305);
  paint.font = '500 73px Arial';
  paint.fillText('USA', 45, 505);
  paint.font = '500 92px Arial';
  paint.fillText('14', 75, 610);
  const sailTexture = new THREE.CanvasTexture(sailCanvas);
  sailTexture.colorSpace = THREE.SRGBColorSpace;
  sailTexture.anisotropy = 4;
  const sailMaterial = new THREE.MeshStandardMaterial({
    map: sailTexture, side: THREE.DoubleSide, roughness: 0.9, metalness: 0,
  });
  const jibMaterial = new THREE.MeshStandardMaterial({ color: 0xefeee4, side: THREE.DoubleSide, roughness: 0.9 });

  const mainRig = new THREE.Group();
  mainRig.position.set(0, boomHeight, mastZ);
  boat.add(mainRig);
  spar(new THREE.Vector3(), new THREE.Vector3(0, 0, mainFoot + 0.05), 0.028, aluminum, mainRig);
  const mainHeight = mastTop - boomHeight - 0.04;
  const rows = 18;
  const columns = 12;
  const sailIndex: number[] = [];
  const uv: number[] = [];
  for (let row = 0; row <= rows; row++) {
    const h = row / rows;
    for (let column = 0; column <= columns; column++) {
      const f = column / columns;
      const chord = mainFoot * (1 - h) + 0.24 * Math.sin(h * Math.PI);
      uv.push((chord / mainFoot) * f, h);
      if (row < rows && column < columns) {
        const a = row * (columns + 1) + column;
        sailIndex.push(a, a + 1, a + columns + 1, a + 1, a + columns + 2, a + columns + 1);
      }
    }
  }
  const mainGeometry = new THREE.BufferGeometry();
  mainGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((rows + 1) * (columns + 1) * 3), 3));
  mainGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  mainGeometry.setIndex(sailIndex);
  mesh(mainGeometry, sailMaterial, mainRig);
  const jibGeometry = mainGeometry.clone();
  mesh(jibGeometry, jibMaterial);
  const telltales = [-1, 1].map((side) => ({
    side,
    main: line([[0, 0, 0], [0, 0, 0]], new THREE.LineBasicMaterial({ color: side > 0 ? 0x43805c : 0xb95c4d }), mainRig),
    jib: line([[0, 0, 0], [0, 0, 0]], new THREE.LineBasicMaterial({ color: side > 0 ? 0x43805c : 0xb95c4d })),
  }));
  const mainSheet = line([[0, boomHeight, 1], [0, 0.3, 0.8]]);
  const jibSheets = [-1, 1].map((side) => line([[0, 0.55, -0.45], [side * 0.57, 0.39, 0.03]]));

  function update(state: BoatState) {
    boat.position.set(state.position.x, 0, state.position.z);
    boat.rotation.y = -state.heading;
    rudder.rotation.y = state.rudder;
    mainRig.rotation.y = state.main.angle;
    const mainPosition = mainGeometry.getAttribute('position') as THREE.BufferAttribute;
    const jibPosition = jibGeometry.getAttribute('position') as THREE.BufferAttribute;
    const mainSide = Math.sign(state.main.angle) || 1;
    const jibSide = Math.sign(state.jib.angle) || 1;
    for (let row = 0; row <= rows; row++) {
      const h = row / rows;
      for (let column = 0; column <= columns; column++) {
        const f = column / columns;
        const index = row * (columns + 1) + column;
        const chord = mainFoot * (1 - h) + 0.24 * Math.sin(h * Math.PI);
        const flutter = state.main.status === 'luffing' ? Math.sin(state.time * 23 + h * 17 + f * 8) * 0.055 * f : 0;
        const mainCamber = mainSide * 0.11 * chord * Math.sin(f * Math.PI) * Math.sin((h * 0.9 + 0.05) * Math.PI);
        mainPosition.setXYZ(index, mainCamber + flutter, mainHeight * h + Math.sin(f * Math.PI) * 0.04, chord * f);
        const jibChord = BOAT_CONFIG.jibFootM * (1 - h);
        const jibFlutter = state.jib.status === 'luffing' ? Math.sin(state.time * 29 + h * 12 + f * 8) * 0.045 * f : 0;
        jibPosition.setXYZ(index,
          Math.sin(state.jib.angle) * jibChord * f + jibSide * 0.12 * jibChord * Math.sin(f * Math.PI) + jibFlutter,
          0.53 + (jibTop - 0.55) * h + 0.16 * f * (1 - h),
          jibTackZ + (mastZ - jibTackZ) * h + Math.cos(state.jib.angle) * jibChord * f);
      }
    }
    mainPosition.needsUpdate = true;
    jibPosition.needsUpdate = true;
    mainGeometry.computeVertexNormals();
    jibGeometry.computeVertexNormals();
    jibGeometry.computeBoundingSphere();
    for (const { side, main, jib } of telltales) {
      const h = 0.5;
      const chord = mainFoot * (1 - h) + 0.24;
      const x = mainSide * 0.1 * chord + side * 0.012;
      const luff = state.main.status === 'luffing' ? Math.sin(state.time * 28 + side) * 0.14 : 0;
      const stall = state.main.status === 'stalled' && side === mainSide ? -0.15 : 0;
      main.geometry.setFromPoints([new THREE.Vector3(x, mainHeight * h, chord * 0.5), new THREE.Vector3(x + luff, mainHeight * h + luff + stall, chord * 0.5 + 0.19)]);
      const jibIndex = Math.round(rows * 0.5) * (columns + 1) + 5;
      const start = new THREE.Vector3().fromBufferAttribute(jibPosition, jibIndex);
      start.x += side * 0.012;
      const jibLuff = state.jib.status === 'luffing' ? Math.sin(state.time * 30 + side) * 0.12 : 0;
      const end = start.clone().add(new THREE.Vector3(Math.sin(state.jib.angle) * 0.17 + jibLuff, jibLuff + (state.jib.status === 'stalled' ? -0.1 : 0), Math.cos(state.jib.angle) * 0.17));
      jib.geometry.setFromPoints([start, end]);
    }
    const sheetPoint = new THREE.Vector3(0, 0, mainFoot * 0.78).applyAxisAngle(new THREE.Vector3(0, 1, 0), state.main.angle);
    mainSheet.geometry.setFromPoints([new THREE.Vector3(sheetPoint.x, boomHeight, mastZ + sheetPoint.z), new THREE.Vector3(0, 0.3, 0.8)]);
    const clew = new THREE.Vector3().fromBufferAttribute(jibPosition, columns);
    jibSheets.forEach((sheet, index) => sheet.geometry.setFromPoints([clew, new THREE.Vector3(index === 0 ? -0.57 : 0.57, 0.39, 0.03)]));
  }

  return { object: boat, update, sailTexture };
}
