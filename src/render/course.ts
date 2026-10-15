import * as THREE from 'three';
import type { Vec2 } from '../physics/types';
import type { RenderCourse } from './types';

export function disposeObject(object: THREE.Object3D) {
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
  const orange = new THREE.MeshStandardMaterial({ color: 0xe57d31, roughness: 0.8 });
  const charcoal = new THREE.MeshStandardMaterial({ color: 0x36454b, roughness: 0.85 });
  function mark(position: Vec2, name: string, small = false) {
    const group = new THREE.Group();
    const size = small ? 0.8 : 1;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.46 * size, 0.66 * size, 1.35 * size, 12), orange);
    body.position.y = 0.58 * size;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.53 * size, 0.55 * size, 0.12, 12), charcoal);
    band.position.y = 0.72 * size;
    group.add(body, band);
    group.position.set(position.x, 0, position.z);
    object.add(group); marks.push(group);
    const label = labelSprite(name);
    label.position.set(position.x, 4, position.z - 5);
    object.add(label); labels.push(label);
  }
  mark(course.startPin, 'Pin / finish', true);
  mark(course.windward, 'Windward');
  mark(course.gatePort, 'Gate');
  mark(course.gateStarboard, 'Gate');
  const committee = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xecece0, roughness: 0.65 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x426b7c, metalness: 0.2, roughness: 0.28 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2, 0.65, 4.4), white);
  hull.position.y = 0.38;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 1.8), white);
  cabin.position.set(0, 1.1, 0.25);
  const windows = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.5, 1.82), glass);
  windows.position.set(0, 1.26, 0.25);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.13, 2.1), white);
  roof.position.set(0, 1.73, 0.25);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 3.8, 6), charcoal);
  mast.position.set(-0.72, 2.1, -0.7);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.45), orange);
  flag.position.set(-0.35, 3.6, -0.7);
  flag.material.side = THREE.DoubleSide;
  committee.add(hull, cabin, windows, roof, mast, flag);
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
