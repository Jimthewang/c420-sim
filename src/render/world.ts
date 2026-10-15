import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { BOAT_CONFIG } from '../config/boat';
import { ENVIRONMENT_CONFIG } from '../config/environment';
import { sampleWind } from '../physics/sailing';
import type { BoatState, CameraMode, SailingSettings, Telemetry } from '../physics/types';
import { createDinghy } from './boat';
import { boatMarker, createCourseScene, disposeObject } from './course';
import type { GraphicsQuality, RenderCourse, RenderExtras } from './types';

function makeWaterNormals() {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size * Math.PI * 2;
      const v = y / size * Math.PI * 2;
      const dx = Math.cos(u * 11 + v * 3) * 0.24 + Math.cos(u * 23 - v * 7) * 0.13 + Math.cos(u * 31 + v * 19) * 0.08;
      const dy = Math.cos(u * 3 + v * 13) * 0.23 + Math.cos(u * 17 - v * 29) * 0.11;
      const n = new THREE.Vector3(dx, dy, 1).normalize();
      const index = (y * size + x) * 4;
      data[index] = Math.round((n.x * 0.5 + 0.5) * 255);
      data[index + 1] = Math.round((n.y * 0.5 + 0.5) * 255);
      data[index + 2] = Math.round((n.z * 0.5 + 0.5) * 255);
      data[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export function createWorld(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.91;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xb7d2d7, 0.00065);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 7000);
  const normalTexture = makeWaterNormals();
  const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(52), THREE.MathUtils.degToRad(220));
  const water = new Water(new THREE.PlaneGeometry(10000, 10000), {
    textureWidth: 256,
    textureHeight: 256,
    waterNormals: normalTexture,
    sunDirection: sun,
    sunColor: 0xfff5dc,
    waterColor: 0x1d7584,
    distortionScale: 1.7,
    fog: true,
  });
  water.rotation.x = -Math.PI / 2;
  scene.add(water);
  const sky = new Sky();
  sky.scale.setScalar(5000);
  sky.material.uniforms.turbidity.value = 3.2;
  sky.material.uniforms.rayleigh.value = 1.6;
  sky.material.uniforms.mieCoefficient.value = 0.003;
  sky.material.uniforms.mieDirectionalG.value = 0.78;
  sky.material.uniforms.sunPosition.value.copy(sun);
  scene.add(sky);
  scene.add(new THREE.HemisphereLight(0xd9edf4, 0x729182, 2.1));
  const sunlight = new THREE.DirectionalLight(0xfff2d6, 3.0);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(1024, 1024);
  sunlight.shadow.camera.left = -7;
  sunlight.shadow.camera.right = 7;
  sunlight.shadow.camera.top = 8;
  sunlight.shadow.camera.bottom = -7;
  sunlight.shadow.camera.near = 1;
  sunlight.shadow.camera.far = 45;
  sunlight.shadow.bias = -0.0003;
  sunlight.shadow.normalBias = 0.025;
  scene.add(sunlight, sunlight.target);
  const dinghy = createDinghy();
  scene.add(dinghy.object);
  const playerMarker = boatMarker(0x3c5359, 'Y');
  playerMarker.scale.set(7, 7, 1);
  scene.add(playerMarker);
  const fleet = new Map<string, { model: ReturnType<typeof createDinghy>; marker: THREE.Sprite }>();
  let currentCourse: RenderCourse | null = null;
  let courseScene: ReturnType<typeof createCourseScene> | null = null;
  let quality: GraphicsQuality = 'medium';
  let reflectionFrame = 0;
  const reflectWater = water.onBeforeRender;
  water.onBeforeRender = (...args) => {
    if (quality !== 'low' || reflectionFrame++ % 2 === 0) reflectWater.apply(water, args);
  };
  const laylines = [-1, 1].map((side) => {
    const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({
      color: side < 0 ? 0xb5c8a0 : 0xcdd8c4, dashSize: 2, gapSize: 2, transparent: true, opacity: 0.58,
    }));
    scene.add(line);
    return line;
  });
  const courseArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(), 1, 0xe5d9a4, 2.5, 1.2);
  scene.add(courseArrow);

  // A low distant shore gives a stable horizon without introducing a course.
  const shorePositions: number[] = [];
  const shoreIndices: number[] = [];
  for (let i = 0; i <= 48; i++) {
    const x = -1800 + i * 75;
    const z = -1800 + Math.sin(i * 0.19) * 180;
    const height = 5 + 35 * Math.pow(Math.sin(i * 0.13), 2) + 7 * Math.sin(i * 1.9);
    shorePositions.push(x, -4, z, x, height, z + 90);
    if (i < 48) shoreIndices.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const shoreGeometry = new THREE.BufferGeometry();
  shoreGeometry.setAttribute('position', new THREE.Float32BufferAttribute(shorePositions, 3));
  shoreGeometry.setIndex(shoreIndices);
  shoreGeometry.computeVertexNormals();
  const shore = new THREE.Mesh(shoreGeometry, new THREE.MeshStandardMaterial({ color: 0x748d83, roughness: 1, side: THREE.DoubleSide }));
  scene.add(shore);

  // This texture samples the same moving puffs as the force model.
  const puffSize = 48;
  const puffSpan = 320;
  const puffData = new Uint8Array(puffSize * puffSize * 4);
  const puffTexture = new THREE.DataTexture(puffData, puffSize, puffSize);
  puffTexture.minFilter = puffTexture.magFilter = THREE.LinearFilter;
  const puffs = new THREE.Mesh(new THREE.PlaneGeometry(puffSpan, puffSpan), new THREE.MeshBasicMaterial({
    map: puffTexture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
  }));
  puffs.rotation.x = -Math.PI / 2;
  puffs.position.y = 0.012;
  scene.add(puffs);
  let lastPuffUpdate = -Infinity;

  const wakeCount = 48;
  const trail: { x: number; z: number; time: number }[] = [];
  const wakeGeometry = new THREE.BufferGeometry();
  const wakePositions = new Float32Array(wakeCount * 6);
  const wakeAlphas = new Float32Array(wakeCount * 2);
  wakeGeometry.setAttribute('position', new THREE.BufferAttribute(wakePositions, 3));
  wakeGeometry.setAttribute('alpha', new THREE.BufferAttribute(wakeAlphas, 1));
  const wakeIndices: number[] = [];
  for (let i = 0; i < wakeCount - 1; i++) wakeIndices.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  wakeGeometry.setIndex(wakeIndices);
  const wake = new THREE.Mesh(wakeGeometry, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: 'attribute float alpha; varying float vAlpha; void main(){vAlpha=alpha; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'varying float vAlpha; void main(){gl_FragColor=vec4(0.88,0.97,0.96,vAlpha);}',
  }));
  wake.frustumCulled = false;
  scene.add(wake);
  const target = new THREE.Vector3();
  const desiredPosition = new THREE.Vector3();
  const viewTarget = new THREE.Vector3();
  let previousMode: CameraMode | null = null;
  let lastTime = -1;

  function resize() {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function setQuality(next: GraphicsQuality) {
    quality = next;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, next === 'low' ? 1 : next === 'medium' ? 1.4 : 1.8));
    renderer.shadowMap.enabled = next !== 'low';
    renderer.shadowMap.needsUpdate = true;
    resize();
  }

  function render(state: BoatState, telemetry: Telemetry, settings: SailingSettings, cameraMode: CameraMode, dt: number, extras: RenderExtras = {}) {
    if (extras.quality && extras.quality !== quality) setQuality(extras.quality);
    const reset = state.time < lastTime;
    lastTime = state.time;
    const spin = extras.spinnaker ?? settings.spinnaker;
    dinghy.update(state, spin, telemetry.trueWindAngleDeg);
    const tactical = cameraMode === 'tactical';
    const assists = (extras.difficulty ?? 'beginner') !== 'realistic';
    if ((extras.course ?? null) !== currentCourse) {
      if (courseScene) disposeObject(courseScene.object);
      currentCourse = extras.course ?? null;
      courseScene = currentCourse ? createCourseScene(currentCourse) : null;
      if (courseScene) scene.add(courseScene.object);
    }
    const opponentIds = new Set(extras.opponents?.map((opponent) => opponent.id) ?? []);
    for (const [id, opponent] of fleet) {
      if (!opponentIds.has(id)) { disposeObject(opponent.model.object); disposeObject(opponent.marker); fleet.delete(id); }
    }
    for (const opponent of extras.opponents ?? []) {
      let entry = fleet.get(opponent.id);
      if (!entry) {
        const color = opponent.color ?? 0x78614b;
        entry = { model: createDinghy({ simplified: true, color }), marker: boatMarker(color) };
        fleet.set(opponent.id, entry);
        scene.add(entry.model.object, entry.marker);
      }
      const wind = sampleWind(opponent.boat.position.x, opponent.boat.position.z, opponent.boat.time, settings);
      const angle = Math.atan2(Math.sin(wind.direction - opponent.boat.heading), Math.cos(wind.direction - opponent.boat.heading)) * 180 / Math.PI;
      entry.model.update(opponent.boat, spin, angle);
      entry.marker.position.set(opponent.boat.position.x, 1, opponent.boat.position.z);
      entry.marker.material.rotation = -opponent.boat.heading;
      entry.marker.visible = tactical;
    }
    playerMarker.position.set(state.position.x, 1.5, state.position.z);
    playerMarker.material.rotation = -state.heading;
    playerMarker.visible = tactical;
    const navigationTarget = extras.target;
    laylines.forEach((line) => { line.visible = !!navigationTarget && assists; });
    courseArrow.visible = !!navigationTarget && (extras.difficulty ?? 'beginner') === 'beginner';
    if (navigationTarget) {
      const dx = navigationTarget.x - state.position.x;
      const dz = navigationTarget.z - state.position.z;
      const wind = telemetry.trueWindDirectionDeg * Math.PI / 180;
      const upwind = dx * Math.sin(wind) - dz * Math.cos(wind) >= 0;
      const courseHeading = wind + (upwind ? 0 : Math.PI);
      const guideLength = currentCourse ? currentCourse.length * 1.25 : 120;
      laylines.forEach((line, index) => {
        const angle = courseHeading + (index === 0 ? -1 : 1) * Math.PI / 4;
        line.geometry.setFromPoints([new THREE.Vector3(navigationTarget.x, 0.09, navigationTarget.z),
          new THREE.Vector3(navigationTarget.x - Math.sin(angle) * guideLength, 0.09, navigationTarget.z + Math.cos(angle) * guideLength)]);
        line.computeLineDistances();
      });
      const distance = Math.hypot(dx, dz);
      if (distance > 1) {
        courseArrow.position.set(state.position.x, 0.15, state.position.z);
        courseArrow.setDirection(new THREE.Vector3(dx / distance, 0, dz / distance));
        courseArrow.setLength(distance, Math.min(3, distance * 0.15), Math.min(1.5, distance * 0.07));
      } else courseArrow.visible = false;
    }
    const boatPoint = new THREE.Vector3(state.position.x, 0, state.position.z);
    sunlight.position.copy(boatPoint).addScaledVector(sun, 24);
    sunlight.target.position.copy(boatPoint);
    water.position.set(Math.round(state.position.x / 1000) * 1000, 0, Math.round(state.position.z / 1000) * 1000);
    sky.position.copy(boatPoint);
    water.material.uniforms.time.value = state.time * (ENVIRONMENT_CONFIG.waveTimeBase + settings.windSpeedKnots / ENVIRONMENT_CONFIG.waveTimeWindDivisor);
    water.material.uniforms.distortionScale.value = ENVIRONMENT_CONFIG.waveDistortionBase + settings.windSpeedKnots * ENVIRONMENT_CONFIG.waveDistortionPerKnot;
    water.material.uniforms.size.value = ENVIRONMENT_CONFIG.waveTextureScaleBase + settings.windSpeedKnots * ENVIRONMENT_CONFIG.waveTextureScalePerKnot;

    if (reset || state.time - lastPuffUpdate >= (quality === 'low' ? 0.5 : 0.25) || lastPuffUpdate === -Infinity) {
      lastPuffUpdate = state.time;
      puffs.position.x = Math.round(state.position.x / 16) * 16;
      puffs.position.z = Math.round(state.position.z / 16) * 16;
      for (let row = 0; row < puffSize; row++) {
        for (let column = 0; column < puffSize; column++) {
          const u = column / (puffSize - 1);
          const v = row / (puffSize - 1);
          const wind = sampleWind(puffs.position.x + (u - 0.5) * puffSpan, puffs.position.z + (0.5 - v) * puffSpan, state.time, settings);
          const fade = Math.min(1, Math.min(u, v, 1 - u, 1 - v) * 10);
          const index = (row * puffSize + column) * 4;
          puffData[index] = 5; puffData[index + 1] = 50; puffData[index + 2] = 62;
          puffData[index + 3] = Math.min(55, Math.max(0, wind.gust) * 170) * fade;
        }
      }
      puffTexture.needsUpdate = true;
    }
    puffs.visible = settings.gusts;

    if (reset) trail.length = 0;
    const latest = trail[0];
    const sternX = state.position.x - Math.sin(state.heading) * BOAT_CONFIG.lengthM * 0.46;
    const sternZ = state.position.z + Math.cos(state.heading) * BOAT_CONFIG.lengthM * 0.46;
    if ((!latest || state.time - latest.time > 0.14) && telemetry.speedKnots > 0.4) {
      trail.unshift({ x: sternX, z: sternZ, time: state.time });
      if (trail.length > wakeCount) trail.pop();
    }
    for (let i = 0; i < wakeCount; i++) {
      const point = trail[i] ?? trail[trail.length - 1] ?? { x: sternX, z: sternZ, time: state.time - 10 };
      const before = trail[Math.max(0, i - 1)] ?? point;
      const after = trail[Math.min(trail.length - 1, i + 1)] ?? point;
      const dx = before.x - after.x;
      const dz = before.z - after.z;
      const distance = Math.hypot(dx, dz) || 1;
      const age = Math.max(0, state.time - point.time);
      const width = 0.12 + Math.min(age, 5) * 0.11;
      for (let side = 0; side < 2; side++) {
        const factor = side === 0 ? -1 : 1;
        const index = i * 6 + side * 3;
        wakePositions[index] = point.x + factor * dz / distance * width;
        wakePositions[index + 1] = 0.026;
        wakePositions[index + 2] = point.z - factor * dx / distance * width;
        wakeAlphas[i * 2 + side] = Math.max(0, 1 - age / 6.5) ** 2 * Math.min(0.14, telemetry.speedKnots * 0.028);
      }
    }
    wakeGeometry.attributes.position.needsUpdate = true;
    wakeGeometry.attributes.alpha.needsUpdate = true;
    wake.visible = trail.length > 2;

    const portraitScale = camera.aspect < 1 ? 1.3 : 1;
    if (tactical && currentCourse) {
      const points = [state.position, currentCourse.startPin, currentCourse.committee, currentCourse.windward, currentCourse.gatePort, currentCourse.gateStarboard];
      const minX = Math.min(...points.map((point) => point.x)) - 16;
      const maxX = Math.max(...points.map((point) => point.x)) + 16;
      const minZ = Math.min(...points.map((point) => point.z)) - 24;
      const maxZ = Math.max(...points.map((point) => point.z)) + 24;
      const field = Math.tan(camera.fov * Math.PI / 360) * 2;
      const altitude = Math.max(65, (maxZ - minZ) / field, (maxX - minX) / (field * camera.aspect)) * 1.14;
      target.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
      desiredPosition.set(target.x, altitude, target.z + 0.01);
      camera.up.set(0, 0, -1);
    } else if (tactical) {
      desiredPosition.set(state.position.x, 48 * portraitScale, state.position.z + 0.01);
      target.set(state.position.x, 0, state.position.z);
      camera.up.set(0, 0, -1);
    } else {
      desiredPosition.set(4.1 * portraitScale, 5.1 * portraitScale, 10.5 * portraitScale).applyAxisAngle(new THREE.Vector3(0, 1, 0), -state.heading).add(boatPoint);
      target.set(state.position.x, 2.2, state.position.z);
      camera.up.set(0, 1, 0);
    }
    const snap = previousMode !== cameraMode || reset;
    const damping = snap ? 1 : 1 - Math.exp(-Math.max(0, dt) * 4);
    camera.position.lerp(desiredPosition, damping);
    viewTarget.lerp(target, damping);
    camera.lookAt(viewTarget);
    previousMode = cameraMode;
    const iconSize = tactical ? Math.max(4.5, desiredPosition.y * 0.025) : 7;
    playerMarker.scale.set(iconSize, iconSize, 1);
    fleet.forEach((opponent) => opponent.marker.scale.set(iconSize * 0.85, iconSize * 0.85, 1));
    courseScene?.update(state.time, tactical, assists, Math.max(0.65, desiredPosition.y / 380));
    renderer.render(scene, camera);
  }

  function dispose() {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Sprite) {
        geometries.add(object.geometry);
        (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => materials.add(material));
      }
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => {
      if ('map' in material && material.map instanceof THREE.Texture) material.map.dispose();
      material.dispose();
    });
    normalTexture.dispose(); puffTexture.dispose(); dinghy.sailTexture.dispose();
    water.material.uniforms.mirrorSampler.value.dispose();
    sunlight.shadow.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  resize();
  return { resize, render, setQuality, dispose };
}
