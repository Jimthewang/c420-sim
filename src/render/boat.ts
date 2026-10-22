import * as THREE from 'three';
import { BOAT_CONFIG } from '../config/boat';
import type { BoatState } from '../physics/types';
import { createSailor } from './crew';
import { buoyancyTankGeometry, foilGeometry, hullGeometry, hullSection, ovalLoft } from './geometry';
import { attachOutline, toonMaterial, updateOutline } from './toon';
import { getBoatWavePose } from '../world/waves';
import { tillerJoint, TILLER_EXTENSION_LENGTH } from './rigging';

/** The model faces local north (-z); its dimensions are in metres. */
export function createDinghy(options: { simplified?: boolean; color?: number } = {}) {
  const { lengthM: length, beamM: beam, mastHeightM: mastTop, boomHeightM: boomHeight, mainFootM: mainFoot } = BOAT_CONFIG;
  const boat = new THREE.Group();
  const white = toonMaterial(0xfffdf7);
  const cockpit = toonMaterial(0xdcebed);
  const accent = toonMaterial(options.color ?? 0xff6b6b);
  const lemon = toonMaterial(0xffe144);
  const dark = toonMaterial(0x263649);
  const aluminum = toonMaterial(0xf1f3e8);
  const rope = new THREE.LineBasicMaterial({ color: 0x525b58, transparent: true, opacity: 0.62 });
  const halfLength = length / 2;
  const halfBeam = beam / 2;
  const mastZ = -length * 0.16;

  function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent = boat, outline = 0.012) {
    const object = new THREE.Mesh(geometry, material);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    attachOutline(object, outline);
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

  // A continuous double skin and molded side tanks leave a real, curved cockpit.
  mesh(hullGeometry(length, beam, !options.simplified), white, boat, 0.022);
  const railSteps = options.simplified ? 12 : 24;
  for (const side of [-1, 1]) {
    mesh(buoyancyTankGeometry(side, !options.simplified), white).name = 'crew-obstacle-tank';
    const rail = Array.from({ length: 23 }, (_, i) => {
      const z = -halfLength + 0.015 + i / 22 * (length - 0.03), section = hullSection(z);
      return new THREE.Vector3(side * section.halfWidth, section.railY, z);
    });
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rail), railSteps * 2, 0.021, 6, false), accent);
  }
  mesh(ovalLoft([
    { z: -halfLength + 0.025, y: 0.465, width: 0.018, height: 0.075 },
    { z: -1.65, y: 0.34, width: 0.34, height: 0.15 },
    { z: -1.15, y: 0.29, width: 0.56, height: 0.145 },
    { z: -0.8, y: 0.285, width: 0.61, height: 0.13 },
  ], railSteps, 12), white);
  mesh(ovalLoft([
    { z: -0.77, y: 0.07, width: 0.41, height: 0.03 },
    { z: 0.35, y: 0.065, width: 0.54, height: 0.035 },
    { z: 1.84, y: 0.075, width: 0.38, height: 0.035 },
  ], railSteps, 10), cockpit);
  const transomSection = hullSection(halfLength);
  const transomShape = new THREE.Shape();
  transomShape.moveTo(-transomSection.halfWidth + 0.025, transomSection.railY);
  transomShape.bezierCurveTo(-transomSection.halfWidth, 0.02, -0.27, -0.08, 0, -0.08);
  transomShape.bezierCurveTo(0.27, -0.08, transomSection.halfWidth, 0.02, transomSection.halfWidth - 0.025, transomSection.railY);
  transomShape.closePath();
  const transom = mesh(new THREE.ExtrudeGeometry(transomShape, { depth: 0.045, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.01, bevelSegments: 3, curveSegments: 12 }), white);
  transom.position.z = halfLength - 0.06;
  const thwart = mesh(new THREE.CylinderGeometry(1, 1, beam * 0.78, 16), white);
  thwart.geometry.scale(0.033, 1, 0.09); thwart.rotation.z = Math.PI / 2; thwart.position.set(0, 0.42, 0.65); thwart.name = 'crew-obstacle-thwart'; updateOutline(thwart);
  mesh(ovalLoft([
    { z: -0.6, y: 0.14, width: 0.055, height: 0.06 },
    { z: -0.05, y: 0.15, width: 0.075, height: 0.075 },
    { z: 0.5, y: 0.14, width: 0.055, height: 0.06 },
  ], 12, 10), white).name = 'crew-obstacle-case';
  if (!options.simplified) for (const x of [-0.25, 0.25]) {
    const strapCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(x, 0.10, -0.05), new THREE.Vector3(x, 0.145, 0.7), new THREE.Vector3(x, 0.11, 1.55)]);
    const strap = mesh(new THREE.TubeGeometry(strapCurve, 12, 0.027, 6), dark);
    strap.scale.y = 0.55; strap.position.y = 0.055;
  }
  const board = mesh(foilGeometry(BOAT_CONFIG.boardLengthM, 0.33, 0.035), lemon);
  board.position.set(0, BOAT_CONFIG.boardTopY, BOAT_CONFIG.boardAftM);
  const rudder = new THREE.Group();
  rudder.position.set(0, BOAT_CONFIG.rudderTopY, halfLength + BOAT_CONFIG.rudderAftOffsetM - 0.06); boat.add(rudder);
  const blade = mesh(foilGeometry(BOAT_CONFIG.rudderLengthM, 0.28, 0.035), accent, rudder);
  blade.position.set(0, 0, 0.06);
  spar(new THREE.Vector3(0, 0.07, 0), new THREE.Vector3(0, 0.14, -0.92), 0.022, dark, rudder);
  const tillerExtension = spar(new THREE.Vector3(0, 0.32, 1.35), new THREE.Vector3(-0.47, 0.49, 1.35), 0.012, dark);

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
  paint.fillStyle = '#fffdf7';
  paint.fillRect(0, 0, 512, 1024);
  paint.strokeStyle = 'rgba(42,55,64,.28)';
  paint.lineWidth = 1;
  for (let y = 90; y < 1024; y += 145) {
    paint.beginPath(); paint.moveTo(0, y); paint.lineTo(512, y + 13); paint.stroke();
    paint.beginPath(); paint.moveTo(0, y + 4); paint.lineTo(512, y + 17); paint.stroke();
  }
  paint.fillStyle = '#141414';
  paint.font = '800 78px Arial';
  paint.fillText('420', 30, 305);
  paint.font = '800 73px Arial';
  paint.fillText('USA', 45, 505);
  paint.font = '800 92px Arial';
  paint.fillText('14', 75, 610);
  paint.fillStyle = `#${new THREE.Color(options.color ?? 0xff6b6b).getHexString()}`;
  paint.fillRect(0, 900, 512, 52);
  paint.fillStyle = '#ffe144'; paint.fillRect(0, 960, 512, 64);
  const sailTexture = new THREE.CanvasTexture(sailCanvas);
  sailTexture.colorSpace = THREE.SRGBColorSpace;
  sailTexture.anisotropy = 4;
  const sailMaterial = toonMaterial(0xfffdf7, { map: sailTexture, side: THREE.DoubleSide });
  const jibMaterial = toonMaterial(0xfffdf7, { side: THREE.DoubleSide });

  const mainRig = new THREE.Group();
  mainRig.position.set(0, boomHeight, mastZ);
  boat.add(mainRig);
  spar(new THREE.Vector3(), new THREE.Vector3(0, 0, mainFoot + 0.05), 0.028, aluminum, mainRig);
  const mainHeight = mastTop - boomHeight - 0.04;
  const rows = options.simplified ? 9 : 18;
  const columns = options.simplified ? 6 : 12;
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
  const mainSail = mesh(mainGeometry, sailMaterial, mainRig, 0.004);
  const jibGeometry = mainGeometry.clone();
  const jibSail = mesh(jibGeometry, jibMaterial, boat, 0.004);
  // Thin, double-sided cloth still casts a shadow, but does not self-shadow into moire bands.
  mainSail.receiveShadow = jibSail.receiveShadow = false;
  function telltale(color: number, name: string, parent = boat) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(30), 3));
    geometry.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4, 4, 5, 6, 5, 7, 6, 6, 7, 8, 7, 9, 8]);
    const ribbon = new THREE.Mesh(geometry, toonMaterial(color, { side: THREE.DoubleSide }));
    ribbon.name = name; parent.add(ribbon); return ribbon;
  }
  const telltales = [-1, 1].map((side) => ({
    side,
    main: telltale(side > 0 ? 0x258e52 : 0xd94135, `main-telltale-${side}`, mainRig),
    jib: telltale(side > 0 ? 0x258e52 : 0xd94135, `jib-telltale-${side}`),
  }));
  function updateTelltale(ribbon: THREE.Mesh, start: THREE.Vector3, flow: THREE.Vector3, status: BoatState['main']['status'], side: number, loadedSide: number, time: number) {
    const positions = ribbon.geometry.getAttribute('position') as THREE.BufferAttribute;
    const separated = status === 'stalled' && side === loadedSide;
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const flutter = Math.sin(time * (status === 'luffing' ? 23 : 8) + i * 1.4 + side);
      const run = 0.24 * t * (separated ? 0.36 : 1);
      const wave = status === 'luffing' ? flutter * 0.085 * t : separated ? -Math.sin(t * Math.PI / 2) * 0.16 : flutter * 0.009 * t;
      for (let edge = 0; edge < 2; edge++) positions.setXYZ(i * 2 + edge,
        start.x + flow.x * run, start.y + wave + (edge ? 1 : -1) * 0.007 * (1 - t * 0.45), start.z + flow.z * run);
    }
    positions.needsUpdate = true; ribbon.geometry.computeVertexNormals(); ribbon.geometry.computeBoundingSphere();
  }
  const mainSheet = line([[0, boomHeight, 1], [0, 0.3, 0.8], [0, 0.49, 0.67]]);
  const jibSheets = [-1, 1].map((side) => line([[0, 0.55, -0.45], [side * 0.57, 0.39, 0.03], [0, 0.49, -0.48]]));

  const skipper = createSailor(options.color ?? 0xff6b6b, !!options.simplified);
  const crew = createSailor(0xffe144, !!options.simplified);
  boat.add(skipper.object, crew.object);
  const spinGeometry = new THREE.BufferGeometry();
  const spinPositions: number[] = [];
  const spinColors: number[] = [];
  const spinIndices: number[] = [];
  for (let row = 0; row <= 12; row++) {
    const h = row / 12;
    for (let column = 0; column <= 16; column++) {
      const f = column / 16;
      spinPositions.push(Math.sin(h * Math.PI / 2) * 1.45 * (f * 2 - 1), jibTop - 3.55 * h,
        mastZ - 0.2 - 1.35 * Math.sin(h * Math.PI) * Math.sin(f * Math.PI) - h * 0.85);
      const color = new THREE.Color(f < 0.33 ? 0xff6b6b : f > 0.66 ? 0xffe144 : 0xfffdf7);
      spinColors.push(color.r, color.g, color.b);
      if (row < 12 && column < 16) {
        const a = row * 17 + column;
        spinIndices.push(a, a + 17, a + 1, a + 1, a + 17, a + 18);
      }
    }
  }
  spinGeometry.setAttribute('position', new THREE.Float32BufferAttribute(spinPositions, 3));
  spinGeometry.setAttribute('color', new THREE.Float32BufferAttribute(spinColors, 3));
  spinGeometry.setIndex(spinIndices);
  spinGeometry.computeVertexNormals();
  const spinnaker = mesh(spinGeometry, toonMaterial(0xffffff, { vertexColors: true, side: THREE.DoubleSide }), boat, 0.004);
  spinnaker.receiveShadow = false;
  spinnaker.visible = false;
  const poleStart = new THREE.Vector3(0, boomHeight + 0.15, mastZ);
  const poleEnd = new THREE.Vector3(-1.45, jibTop - 3.55, mastZ - 1.05);
  const poleLength = poleStart.distanceTo(poleEnd);
  const pole = spar(poleStart, poleEnd, 0.018);
  const spinSheets = [-1, 1].map((side) => line([[side * 1.45, jibTop - 3.55, mastZ - 1.05], [side * 0.65, 0.42, 0.4]]));

  let previousBoom = 0, previousTime: number | undefined, previousState: BoatState | undefined;
  function update(state: BoatState, deploySpinnaker = false, trueWindAngleDeg = 0, windSpeedKnots = 10, windDirectionRad = 0) {
    const wave = getBoatWavePose(state, windSpeedKnots, windDirectionRad);
    boat.position.set(state.position.x, wave.height, state.position.z);
    boat.rotation.set(wave.pitch, -state.heading, -state.heel + wave.roll, 'YXZ');
    board.scale.y = BOAT_CONFIG.boardMinExtension + state.centerboard * (1 - BOAT_CONFIG.boardMinExtension);
    const dt = previousState !== state || previousTime === undefined || state.time < previousTime ? 0 : state.time - previousTime;
    if (!dt) previousBoom = state.main.angle;
    const rate = state.mainAngularVelocity;
    const windAngle = Math.abs(trueWindAngleDeg);
    const turning = Math.min(1, Math.abs(state.yawRate) / 0.06);
    const gybeSoon = THREE.MathUtils.smoothstep(windAngle, 158, 174) * turning;
    const tackSoon = (1 - THREE.MathUtils.smoothstep(windAngle, 8, 30)) * turning;
    const anticipation = Math.max(gybeSoon, tackSoon);
    const predicted = anticipation > 0 ? -state.main.angle : THREE.MathUtils.clamp(state.main.angle + rate * 0.28, -1.5, 1.5);
    const sweep = { from: previousBoom, to: state.main.angle, predicted, anticipation: Math.max(anticipation, Math.min(1, Math.abs(rate) * 0.25)) };
    const skipperPose = skipper.update(state, 'skipper', sweep);
    const crewPose = crew.update(state, 'crew', sweep);
    previousBoom = state.main.angle; previousTime = state.time; previousState = state;
    spinnaker.visible = deploySpinnaker && Math.abs(trueWindAngleDeg) > BOAT_CONFIG.spinnakerMinAngleDeg && !state.capsized;
    pole.visible = spinnaker.visible && !options.simplified;
    spinSheets.forEach((sheet) => { sheet.visible = pole.visible; });
    rudder.rotation.y = state.rudder;
    mainRig.rotation.y = state.main.angle;
    const mainPosition = mainGeometry.getAttribute('position') as THREE.BufferAttribute;
    const jibPosition = jibGeometry.getAttribute('position') as THREE.BufferAttribute;
    const mainSide = Math.sign(state.main.angle) || 1;
    poleEnd.x = -mainSide * 1.45;
    pole.position.copy(poleStart).lerp(poleEnd, 0.5);
    pole.scale.y = poleStart.distanceTo(poleEnd) / poleLength;
    pole.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), poleEnd.clone().sub(poleStart).normalize());
    const breeze = THREE.MathUtils.clamp(windSpeedKnots / 20, 0, 1.5);
    const mainLoad = THREE.MathUtils.clamp(Math.hypot(state.main.lift, state.main.drag) / (BOAT_CONFIG.mainAreaM2 * 45), 0, 1);
    const jibLoad = THREE.MathUtils.clamp(Math.hypot(state.jib.lift, state.jib.drag) / (BOAT_CONFIG.jibAreaM2 * 45), 0, 1);
    // Cloth settles to the load; the foot and actual rig angle remain physics-owned.
    const mainFill = state.main.status === 'luffing' ? 0.22 : 1;
    const jibFill = state.jib.status === 'luffing' ? 0.22 : 1;
    for (let row = 0; row <= rows; row++) {
      const h = row / rows;
      for (let column = 0; column <= columns; column++) {
        const f = column / columns;
        const index = row * (columns + 1) + column;
        const chord = mainFoot * (1 - h) + 0.24 * Math.sin(h * Math.PI);
        const windFlutter = Math.min(1.5, breeze + 0.3);
        const flutter = state.main.status === 'luffing' ? Math.sin(state.time * (16 + breeze * 10) + h * 17 + f * 8) * 0.055 * f * windFlutter : 0;
        const mainCamber = Math.tanh(state.main.angle * 8) * (0.075 + 0.045 * mainLoad) * mainFill * chord * Math.sin(f * Math.PI) * Math.sin((h * 0.9 + 0.05) * Math.PI);
        const mainTwist = Math.tanh(state.main.angle * 8) * THREE.MathUtils.degToRad(BOAT_CONFIG.mainEffectiveTwistDeg) * h ** 1.4 * (0.55 + 0.45 * breeze);
        const draft = mainCamber + flutter, aft = chord * f;
        mainPosition.setXYZ(index, draft * Math.cos(mainTwist) + aft * Math.sin(mainTwist), mainHeight * h + Math.sin(f * Math.PI) * 0.04, aft * Math.cos(mainTwist) - draft * Math.sin(mainTwist));
        const jibChord = BOAT_CONFIG.jibFootM * (1 - h);
        const jibFlutter = state.jib.status === 'luffing' ? Math.sin(state.time * (21 + breeze * 10) + h * 12 + f * 8) * 0.045 * f * windFlutter : 0;
        const jibTwist = Math.tanh(state.jib.angle * 8) * THREE.MathUtils.degToRad(BOAT_CONFIG.jibEffectiveTwistDeg) * h ** 1.4 * (0.55 + 0.45 * breeze);
        const jibAngle = state.jib.angle + jibTwist;
        const jibDraft = Math.tanh(state.jib.angle * 8) * (0.075 + 0.055 * jibLoad) * jibFill * jibChord * Math.sin(f * Math.PI) + jibFlutter;
        jibPosition.setXYZ(index,
          Math.sin(jibAngle) * jibChord * f + Math.cos(jibAngle) * jibDraft,
          0.53 + (jibTop - 0.55) * h + 0.16 * f * (1 - h),
          jibTackZ + (mastZ - jibTackZ) * h + Math.cos(jibAngle) * jibChord * f - Math.sin(jibAngle) * jibDraft);
      }
    }
    mainPosition.needsUpdate = true;
    jibPosition.needsUpdate = true;
    mainGeometry.computeVertexNormals();
    jibGeometry.computeVertexNormals();
    mainGeometry.computeBoundingSphere();
    jibGeometry.computeBoundingSphere();
    updateOutline(mainSail); updateOutline(jibSail);
    const airflow = new THREE.Vector3(-Math.sin(windDirectionRad) * windSpeedKnots * 0.514444 - state.velocity.x, 0,
      Math.cos(windDirectionRad) * windSpeedKnots * 0.514444 - state.velocity.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), state.heading).normalize();
    const mainFlow = airflow.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -state.main.angle);
    // Wool follows the along-cloth apparent flow; its free tail lifts while luffing
    // and the leeward tail drops into separated air when the sail stalls.
    mainFlow.set(mainFlow.x * 0.12, 0, mainFlow.z).normalize();
    const jibAlong = new THREE.Vector3(Math.sin(state.jib.angle), 0, Math.cos(state.jib.angle));
    const jibFlow = jibAlong.multiplyScalar(airflow.dot(jibAlong) >= 0 ? 1 : -1);
    const telltaleIndex = Math.round(rows * 0.5) * (columns + 1) + Math.round(columns * 0.33);
    for (const { side, main, jib } of telltales) {
      const mainStart = new THREE.Vector3().fromBufferAttribute(mainPosition, telltaleIndex); mainStart.x += side * 0.018;
      const jibStart = new THREE.Vector3().fromBufferAttribute(jibPosition, telltaleIndex);
      jibStart.x += side * Math.cos(state.jib.angle) * 0.018; jibStart.z -= side * Math.sin(state.jib.angle) * 0.018;
      updateTelltale(main, mainStart, mainFlow, state.main.status, side, mainSide, state.time);
      updateTelltale(jib, jibStart, jibFlow, state.jib.status, side, Math.sign(state.jib.angle) || 1, state.time);
    }
    const sheetPoint = new THREE.Vector3(0, 0, mainFoot * 0.78).applyAxisAngle(new THREE.Vector3(0, 1, 0), state.main.angle);

    mainSheet.geometry.setFromPoints([new THREE.Vector3(sheetPoint.x, boomHeight, mastZ + sheetPoint.z), new THREE.Vector3(0, 0.3, 0.8), skipperPose.hands[0]]);
    const tillerTip = tillerJoint(state);
    const tillerHand = skipperPose.hands[1].clone().sub(tillerTip).normalize().multiplyScalar(TILLER_EXTENSION_LENGTH).add(tillerTip);
    tillerExtension.position.copy(tillerTip).lerp(tillerHand, 0.5);
    tillerExtension.scale.y = TILLER_EXTENSION_LENGTH / Math.hypot(0.47, 0.17);
    tillerExtension.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tillerHand.sub(tillerTip).normalize());
    const clew = new THREE.Vector3().fromBufferAttribute(jibPosition, columns);
    jibSheets.forEach((sheet, index) => sheet.geometry.setFromPoints([clew, new THREE.Vector3(index === 0 ? -0.57 : 0.57, 0.39, 0.03), crewPose.hands[index]]));
  }

  return { object: boat, update, sailTexture };
}
