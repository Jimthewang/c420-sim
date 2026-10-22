import * as THREE from 'three';
import type { Vec2 } from '../physics/types';
import type { RenderCourse } from './types';
import { ENVIRONMENT_CONFIG as E } from '../config/environment';
import { ovalLoft } from './geometry';
import { attachOutline, disposeOutlines, toonMaterial } from './toon';

export function disposeObject(object: THREE.Object3D) {
  disposeOutlines(object);
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Sprite) {
      if ('geometry' in child) geometries.add(child.geometry);
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) materials.add(material);
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => {
    if ('map' in material && material.map instanceof THREE.Texture) material.map.dispose();
    material.dispose();
  });
  object.removeFromParent();
}

export function boatMarker(color: number, label = '') {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const paint = canvas.getContext('2d')!;
  paint.beginPath();
  paint.moveTo(64, 12); paint.lineTo(96, 102); paint.lineTo(64, 86); paint.lineTo(32, 102); paint.closePath();
  paint.strokeStyle = '#f7f5e9'; paint.lineWidth = 10; paint.lineJoin = 'round'; paint.stroke();
  paint.fillStyle = `#${new THREE.Color(color).getHexString()}`; paint.fill();
  if (label) { paint.font = 'bold 25px Arial'; paint.fillStyle = '#ffffff'; paint.textAlign = 'center'; paint.fillText(label, 64, 70); }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthTest: false, depthWrite: false }));
  sprite.renderOrder = 5;
  return sprite;
}

function labelSprite(text: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const paint = canvas.getContext('2d')!;
  paint.fillStyle = 'rgba(250,249,241,.94)';
  paint.beginPath(); paint.roundRect(1, 1, 254, 62, 12); paint.fill();
  paint.fillStyle = '#253b43'; paint.font = '500 26px Arial'; paint.textAlign = 'center';
  paint.fillText(text, 128, 41);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthTest: false, depthWrite: false }));
  sprite.scale.set(18, 4.5, 1);
  sprite.renderOrder = 4;
  return sprite;
}

export function createCourseScene(course: RenderCourse) {
  const object = new THREE.Group();
  const labels: THREE.Sprite[] = [];
  const marks: THREE.Group[] = [];
  const coral = toonMaterial(0xff6b6b);
  const lemon = toonMaterial(0xffe144);
  const charcoal = toonMaterial(0x263649);
  const white = toonMaterial(0xfffdf7);
  const glass = toonMaterial(0x7bcad2);
  function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Group, outline = 0.018) {
    const part = new THREE.Mesh(geometry, material);
    part.castShadow = true; part.receiveShadow = true;
    parent.add(part); attachOutline(part, outline); return part;
  }
  function mark(position: Vec2, name: string) {
    const group = new THREE.Group();
    const r = E.markRadiusM - 0.022;
    const profile = [[0, -0.05], [r * 0.75, -0.04], [r * 0.96, 0.12], [r, 0.4], [r * 0.93, 0.91], [r * 0.74, 1.18], [r * 0.4, 1.27], [0, 1.29]];
    mesh(new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 28), coral, group);
    const band = mesh(new THREE.TorusGeometry(r * 0.95, 0.026, 6, 28), lemon, group, 0.008);
    band.rotation.x = Math.PI / 2; band.position.y = 0.78;
    const base = mesh(new THREE.TorusGeometry(r * 0.87, 0.035, 6, 28), charcoal, group, 0.008);
    base.rotation.x = Math.PI / 2; base.position.y = 0.09;
    group.position.set(position.x, 0, position.z);
    object.add(group); marks.push(group);
    const label = labelSprite(name);
    label.position.set(position.x, 4, position.z - 5);
    object.add(label); labels.push(label);
  }
  mark(course.startPin, 'Pin / finish');
  mark(course.windward, 'Windward');
  mark(course.gatePort, 'Gate');
  mark(course.gateStarboard, 'Gate');
  const committee = new THREE.Group();
  const halfLength = E.committeeLengthM / 2, halfBeam = E.committeeBeamM / 2;
  // The same 4.4 by 2 metre footprint is used by collision detection.
  mesh(ovalLoft([
    { z: -halfLength + 0.03, y: 0.45, width: 0.015, height: 0.10 },
    { z: -halfLength * 0.65, y: 0.28, width: halfBeam * 0.68, height: 0.32 },
    { z: -halfLength * 0.2, y: 0.26, width: halfBeam * 0.96, height: 0.34 },
    { z: halfLength * 0.5, y: 0.26, width: halfBeam * 0.95, height: 0.34 },
    { z: halfLength - 0.04, y: 0.30, width: halfBeam * 0.78, height: 0.27 },
  ], 36, 20), white, committee, 0.022);
  for (const side of [-1, 1]) {
    const stripe = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.54, -halfLength + 0.035),
      new THREE.Vector3(side * halfBeam * 0.7, 0.48, -halfLength * 0.62),
      new THREE.Vector3(side * halfBeam * 0.94, 0.45, -halfLength * 0.2),
      new THREE.Vector3(side * halfBeam * 0.92, 0.45, halfLength * 0.5),
      new THREE.Vector3(side * halfBeam * 0.77, 0.48, halfLength - 0.06),
    ]);
    mesh(new THREE.TubeGeometry(stripe, 32, 0.022, 6), coral, committee, 0.008);
  }
  const cabin = mesh(new THREE.SphereGeometry(1, 24, 16), white, committee);
  cabin.scale.set(0.69, 0.62, 1.02); cabin.position.set(0, 0.95, 0.22);
  const windows = mesh(new THREE.SphereGeometry(1, 24, 8, 0, Math.PI * 2, 0.68, 0.56), glass, committee, 0.01);
  windows.scale.set(0.699, 0.63, 1.03); windows.position.copy(cabin.position);
  const roof = mesh(new THREE.SphereGeometry(1, 20, 8), lemon, committee, 0.014);
  roof.scale.set(0.59, 0.07, 0.9); roof.position.set(0, 1.57, 0.22);
  const mast = mesh(new THREE.CylinderGeometry(0.025, 0.03, 3.2, 10), charcoal, committee, 0.008);
  mast.position.set(-0.70, 1.97, -0.7);
  const flagShape = new THREE.Shape();
  flagShape.moveTo(0, 0); flagShape.quadraticCurveTo(0.37, 0.12, 0.75, 0.02);
  flagShape.lineTo(0.72, -0.4); flagShape.quadraticCurveTo(0.37, -0.28, 0, -0.42); flagShape.closePath();
  const flag = mesh(new THREE.ShapeGeometry(flagShape, 12), toonMaterial(0xff6b6b, { side: THREE.DoubleSide }), committee, 0.004);
  flag.position.set(-0.70, 3.48, -0.7);
  committee.position.set(course.committee.x, 0, course.committee.z);
  committee.rotation.y = -course.windDirectionDeg * Math.PI / 180;
  object.add(committee);
  const committeeLabel = labelSprite('Committee');
  committeeLabel.position.set(course.committee.x, 4, course.committee.z - 5);
  object.add(committeeLabel); labels.push(committeeLabel);
  const start = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(course.startPin.x, 0.12, course.startPin.z),
    new THREE.Vector3(course.committee.x, 0.12, course.committee.z),
  ]), new THREE.LineDashedMaterial({ color: 0xe7ecdf, dashSize: 1.6, gapSize: 1.2, transparent: true, opacity: 0.7 }));
  start.computeLineDistances(); object.add(start);

  function update(time: number, tactical: boolean, assists: boolean, labelScale: number) {
    labels.forEach((label) => { label.visible = tactical; label.scale.set(18 * labelScale, 4.5 * labelScale, 1); });
    marks.forEach((mark, index) => { mark.rotation.z = Math.sin(time * 0.8 + index) * 0.025; });
    start.visible = assists;
  }
  return { object, update };
}
