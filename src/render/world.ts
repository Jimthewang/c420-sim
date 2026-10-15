import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { BOAT_CONFIG } from '../config/boat';
import { ENVIRONMENT_CONFIG } from '../config/environment';
import { sampleWind } from '../physics/sailing';
import type { BoatState, CameraMode, SailingSettings, Telemetry } from '../physics/types';
import { createDinghy } from './boat';

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

  function render(state: BoatState, telemetry: Telemetry, settings: SailingSettings, cameraMode: CameraMode, dt: number) {
    const reset = state.time < lastTime;
    lastTime = state.time;
    dinghy.update(state);
    const boatPoint = new THREE.Vector3(state.position.x, 0, state.position.z);
    sunlight.position.copy(boatPoint).addScaledVector(sun, 24);
    sunlight.target.position.copy(boatPoint);
    water.position.set(Math.round(state.position.x / 1000) * 1000, 0, Math.round(state.position.z / 1000) * 1000);
    sky.position.copy(boatPoint);
    water.material.uniforms.time.value = state.time * (ENVIRONMENT_CONFIG.waveTimeBase + settings.windSpeedKnots / ENVIRONMENT_CONFIG.waveTimeWindDivisor);
    water.material.uniforms.distortionScale.value = ENVIRONMENT_CONFIG.waveDistortionBase + settings.windSpeedKnots * ENVIRONMENT_CONFIG.waveDistortionPerKnot;
    water.material.uniforms.size.value = ENVIRONMENT_CONFIG.waveTextureScaleBase + settings.windSpeedKnots * ENVIRONMENT_CONFIG.waveTextureScalePerKnot;

    if (reset || state.time - lastPuffUpdate >= 0.25 || lastPuffUpdate === -Infinity) {
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
    if (cameraMode === 'tactical') {
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
    renderer.render(scene, camera);
  }

  function dispose() {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        geometries.add(object.geometry);
        (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => materials.add(material));
      }
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    normalTexture.dispose(); puffTexture.dispose(); dinghy.sailTexture.dispose();
    water.material.uniforms.mirrorSampler.value.dispose();
    sunlight.shadow.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  resize();
  return { resize, render, dispose };
}
