import * as THREE from 'three';
import { sampleWind } from '../physics/sailing';
import { KNOTS_TO_MPS } from '../config/environment';
import type { BoatState, CameraMode, SailingSettings, Telemetry } from '../physics/types';
import { configureTerrainCourse, getTerrainSeed, protectTerrainPoints, setTerrainSeed } from '../world/terrain';
import { createDinghy } from './boat';
import { createCameraRig } from './camera';
import { boatMarker, createCourseScene, disposeObject } from './course';
import { createFoamSystem } from './foam';
import { createTerrainScene } from './terrain';
import { attachOutline, disposeOutlines, setOutlinesEnabled, toonMaterial } from './toon';
import { sampleWave } from './waves';
import type { GraphicsQuality, RenderCourse, RenderExtras } from './types';

/** Indexed sampling keeps wave evaluation cheap; the rendered surface has independent flat faces. */
export function createSeaPatch(span: number, segments: number, hole = 0) {
  const indexed = new THREE.PlaneGeometry(span, span, segments, segments).rotateX(-Math.PI / 2);
  if (hole) {
    const indices = indexed.index!.array, points = indexed.attributes.position, kept: number[] = [];
    for (let i = 0; i < indices.length; i += 3) {
      const x = (points.getX(indices[i]) + points.getX(indices[i + 1]) + points.getX(indices[i + 2])) / 3;
      const z = (points.getZ(indices[i]) + points.getZ(indices[i + 1]) + points.getZ(indices[i + 2])) / 3;
      if (Math.abs(x) >= hole || Math.abs(z) >= hole) kept.push(indices[i], indices[i + 1], indices[i + 2]);
    }
    indexed.setIndex(kept);
  }
  const source = indexed.attributes.position.array.slice() as Float32Array;
  const indices = new Uint32Array(indexed.index!.array);
  const geometry = indexed.toNonIndexed(); indexed.dispose();
  const colors = new Float32Array(geometry.attributes.position.count * 3);
  const tints = new Float32Array(source.length / 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  (geometry.attributes.position as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  const mesh = new THREE.Mesh(geometry, toonMaterial(0x2bc4ff, { vertexColors: true, transparent: true, opacity: 0.94, depthWrite: true }));
  mesh.receiveShadow = true; mesh.frustumCulled = false;
  mesh.renderOrder = hole ? 1 : 2;
  const heights = new Float32Array(source.length / 3), wave = { height: 0, normal: new THREE.Vector3() };
  function update(x: number, z: number, time: number, settings: SailingSettings) {
    mesh.position.set(x, 0, z);
    for (let vertex = 0; vertex < heights.length; vertex++) {
      const worldX = source[vertex * 3] + x, worldZ = source[vertex * 3 + 2] + z;
      const wind = sampleWind(worldX, worldZ, time, settings);
      sampleWave(worldX, worldZ, time, wind.speed / KNOTS_TO_MPS, wind.direction, wave);
      heights[vertex] = wave.height;
      const puff = settings.gusts ? 1 - Math.max(0, wind.gust) * 0.7 : 1;
      tints[vertex] = puff * (0.98 + Math.max(-0.54, Math.min(0.54, wave.height)) * 0.035);
    }
    const positions = geometry.attributes.position.array as Float32Array;
    for (let vertex = 0; vertex < indices.length; vertex++) {
      const sourceIndex = indices[vertex], offset = vertex * 3;
      positions[offset + 1] = heights[sourceIndex];
      // Shared vertices receive the same tint; interpolation avoids sawtooth wind-puff edges.
      colors[offset] = colors[offset + 1] = colors[offset + 2] = tints[sourceIndex];
    }
    geometry.attributes.position.needsUpdate = true; geometry.computeVertexNormals();
    geometry.attributes.color.needsUpdate = true;
  }
  return { mesh, update, dispose() { geometry.dispose(); mesh.material.dispose(); mesh.removeFromParent(); } };
}

export function createWorld(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.4));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene(), rig = createCameraRig(canvas), camera = rig.camera;
  scene.background = new THREE.Color(0x86dcff);
  const hemisphere = new THREE.HemisphereLight(0xd9f4ff, 0x527c88, 1.1); scene.add(hemisphere);
  const sunlight = new THREE.DirectionalLight(0xfff4dd, 2.0);
  sunlight.castShadow = true; sunlight.shadow.mapSize.set(2048, 2048);
  sunlight.shadow.camera.left = sunlight.shadow.camera.bottom = -58;
  sunlight.shadow.camera.right = sunlight.shadow.camera.top = 58;
  sunlight.shadow.camera.near = 1; sunlight.shadow.camera.far = 260;
  sunlight.shadow.bias = -0.00035; sunlight.shadow.normalBias = 0.06;
  scene.add(sunlight, sunlight.target);
  let nearSea = createSeaPatch(360, 96), farSea = createSeaPatch(1200, 60, 180);
  const horizon = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000).rotateX(-Math.PI / 2), toonMaterial(0x2bc4ff));
  horizon.position.y = -0.6; horizon.receiveShadow = false;
  scene.add(horizon, farSea.mesh, nearSea.mesh);
  const foam = createFoamSystem(); scene.add(foam.object);
  let terrain: ReturnType<typeof createTerrainScene> | null = null;

  const sun = new THREE.Mesh(new THREE.IcosahedronGeometry(13, 2), toonMaterial(0xffe144, { emissive: 0xffe144, emissiveIntensity: 1 }));
  const moon = new THREE.Mesh(new THREE.IcosahedronGeometry(9, 1), toonMaterial(0xffffff, { emissive: 0xcde7ff, emissiveIntensity: 0.8 }));
  scene.add(sun, moon);
  const cloudGeometry = new THREE.IcosahedronGeometry(1, 1), cloudMaterial = toonMaterial(0xffffff);
  const clouds = new THREE.InstancedMesh(cloudGeometry, cloudMaterial, 72); clouds.frustumCulled = false; scene.add(clouds);
  attachOutline(clouds, 0.025);
  const cloudSeeds: { x: number; y: number; z: number; size: number }[] = [];
  for (let cluster = 0; cluster < 18; cluster++) for (let lobe = 0; lobe < 4; lobe++) {
    const angle = cluster * 2.39996, radius = 160 + (cluster % 5) * 90;
    cloudSeeds.push({ x: Math.cos(angle) * radius + lobe * 8, y: 65 + cluster % 4 * 13 + (lobe % 2) * 4, z: Math.sin(angle) * radius, size: 8 + lobe % 3 * 3 });
  }
  const starGeometry = new THREE.IcosahedronGeometry(0.65, 0), starMaterial = toonMaterial(0xffffff, { emissive: 0xffffff, emissiveIntensity: 1 });
  const stars = new THREE.InstancedMesh(starGeometry, starMaterial, 70); stars.frustumCulled = false; scene.add(stars);
  const transform = new THREE.Object3D();
  for (let index = 0; index < stars.count; index++) {
    const angle = index * 2.39996, altitude = 0.2 + index % 11 / 11 * 1.2;
    transform.position.set(Math.cos(angle) * Math.cos(altitude) * 800, Math.sin(altitude) * 800, Math.sin(angle) * Math.cos(altitude) * 800);
    transform.scale.setScalar(0.6 + index % 3 * 0.3); transform.updateMatrix(); stars.setMatrixAt(index, transform.matrix);
  }
  stars.instanceMatrix.needsUpdate = true;
  const daySky = new THREE.Color(0x86dcff), twilightSky = new THREE.Color(0xf5b794), nightSky = new THREE.Color(0x102d59);
  const lightDirection = new THREE.Vector3(), color = new THREE.Color();

  const dinghy = createDinghy(); scene.add(dinghy.object);
  const playerMarker = boatMarker(0x29444d, 'Y'); scene.add(playerMarker);
  const fleet = new Map<string, { model: ReturnType<typeof createDinghy>; marker: THREE.Sprite }>();
  let currentCourse: RenderCourse | null = null, courseKey = '', terrainSeed = NaN;
  let courseScene: ReturnType<typeof createCourseScene> | null = null;
  let quality: GraphicsQuality = 'medium', outlines: boolean | undefined, lastTime = -1;
  const laylines = [-1, 1].map(side => {
    const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: side < 0 ? 0xffffff : 0xffe144, dashSize: 2.5, gapSize: 2.5, transparent: true, opacity: 0.7 }));
    scene.add(line); return line;
  });
  const courseArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(), 1, 0xffe144, 2.5, 1.2);
  (Array.isArray(courseArrow.cone.material) ? courseArrow.cone.material : [courseArrow.cone.material]).forEach(material => material.dispose());
  courseArrow.cone.material = toonMaterial(0xffe144); attachOutline(courseArrow.cone, 0.035); scene.add(courseArrow);
  const arrowDirection = new THREE.Vector3();

  function resize() {
    const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
    renderer.setSize(width, height, false); rig.resize(width, height);
  }
  function setQuality(next: GraphicsQuality) {
    if (next === quality) return;
    quality = next; renderer.setPixelRatio(Math.min(window.devicePixelRatio, next === 'low' ? 1 : next === 'medium' ? 1.4 : 1.8));
    renderer.shadowMap.enabled = next !== 'low'; renderer.shadowMap.needsUpdate = true;
    nearSea.dispose(); farSea.dispose();
    nearSea = createSeaPatch(360, next === 'low' ? 72 : next === 'medium' ? 96 : 144);
    farSea = createSeaPatch(1200, next === 'high' ? 100 : 60, 180);
    scene.add(farSea.mesh, nearSea.mesh); resize();
  }

  function render(state: BoatState, telemetry: Telemetry, settings: SailingSettings, cameraMode: CameraMode, dt: number, extras: RenderExtras = {}) {
    if (extras.quality && extras.quality !== quality) setQuality(extras.quality);
    if ((extras.outlines ?? true) !== outlines) { outlines = extras.outlines ?? true; setOutlinesEnabled(outlines); }
    const reset = state.time < lastTime; lastTime = state.time;
    if (reset) { foam.reset(); rig.reset(); }
    const nextCourse = extras.course ?? null, nextKey = nextCourse ? `${nextCourse.windDirectionDeg}/${nextCourse.length}` : 'free';
    const nextSeed = extras.terrainSeed ?? getTerrainSeed();
    if (nextKey !== courseKey || nextSeed !== terrainSeed) {
      protectTerrainPoints([state.position, ...(extras.opponents ?? []).map(opponent => opponent.boat.position)]);
      setTerrainSeed(nextSeed); configureTerrainCourse(nextCourse); terrainSeed = getTerrainSeed(); courseKey = nextKey;
      terrain?.dispose(); terrain = createTerrainScene(); scene.add(terrain.object); foam.setShoreline(terrain.shoreline);
    }
    if (nextCourse !== currentCourse) {
      if (courseScene) { disposeOutlines(courseScene.object); disposeObject(courseScene.object); }
      currentCourse = nextCourse; courseScene = currentCourse ? createCourseScene(currentCourse) : null;
      if (courseScene) scene.add(courseScene.object);
    }
    const spin = extras.spinnaker ?? settings.spinnaker;
    const boats = [state, ...(extras.opponents ?? []).map(opponent => opponent.boat)];
    const boatEnvironment = (boat: BoatState) => ({ ...settings, windShadows: boats.filter(other => other !== boat).map(other => ({ position: other.position, heading: other.heading })) });
    const waveWind = sampleWind(state.position.x, state.position.z, state.time, boatEnvironment(state));
    const waveKnots = waveWind.speed / KNOTS_TO_MPS;
    dinghy.update(state, spin, telemetry.trueWindAngleDeg, waveKnots, waveWind.direction);
    const tactical = cameraMode === 'tactical', assists = (extras.difficulty ?? 'beginner') !== 'realistic';
    clouds.visible = !tactical;
    const opponentIds = new Set(extras.opponents?.map(opponent => opponent.id) ?? []);
    for (const [id, opponent] of fleet) if (!opponentIds.has(id)) {
      disposeOutlines(opponent.model.object); disposeObject(opponent.model.object); disposeObject(opponent.marker); fleet.delete(id);
    }
    for (const opponent of extras.opponents ?? []) {
      let entry = fleet.get(opponent.id);
      if (!entry) {
        const color = opponent.color ?? 0xe57b55;
        entry = { model: createDinghy({ simplified: true, color }), marker: boatMarker(color) }; fleet.set(opponent.id, entry); scene.add(entry.model.object, entry.marker);
      }
      const wind = sampleWind(opponent.boat.position.x, opponent.boat.position.z, opponent.boat.time, boatEnvironment(opponent.boat));
      const angle = Math.atan2(Math.sin(wind.direction - opponent.boat.heading), Math.cos(wind.direction - opponent.boat.heading)) * 180 / Math.PI;
      entry.model.update(opponent.boat, spin, angle, wind.speed / KNOTS_TO_MPS, wind.direction);
      entry.marker.position.set(opponent.boat.position.x, 2, opponent.boat.position.z); entry.marker.material.rotation = -opponent.boat.heading; entry.marker.visible = tactical;
    }
    playerMarker.position.set(state.position.x, 2.3, state.position.z); playerMarker.material.rotation = -state.heading; playerMarker.visible = tactical;
    const navigationTarget = extras.target;
    laylines.forEach(line => { line.visible = !!navigationTarget && assists; });
    courseArrow.visible = !!navigationTarget && (extras.difficulty ?? 'beginner') === 'beginner';
    if (navigationTarget) {
      const dx = navigationTarget.x - state.position.x, dz = navigationTarget.z - state.position.z;
      const wind = telemetry.trueWindDirectionDeg * Math.PI / 180, upwind = dx * Math.sin(wind) - dz * Math.cos(wind) >= 0;
      const heading = wind + (upwind ? 0 : Math.PI), length = currentCourse ? currentCourse.length * 1.25 : 120;
      laylines.forEach((line, index) => {
        const angle = heading + (index === 0 ? -1 : 1) * Math.PI / 4;
        line.geometry.setFromPoints([new THREE.Vector3(navigationTarget.x, 0.7, navigationTarget.z), new THREE.Vector3(navigationTarget.x - Math.sin(angle) * length, 0.7, navigationTarget.z + Math.cos(angle) * length)]); line.computeLineDistances();
      });
      const distance = Math.hypot(dx, dz);
      if (distance > 1) { courseArrow.position.set(state.position.x, 0.8, state.position.z); courseArrow.setDirection(arrowDirection.set(dx / distance, 0, dz / distance)); courseArrow.setLength(distance, Math.min(3, distance * 0.15), Math.min(1.5, distance * 0.07)); }
      else courseArrow.visible = false;
    }
    const waterX = Math.round(state.position.x / 60) * 60, waterZ = Math.round(state.position.z / 60) * 60;
    const seaEnvironment = { ...settings, windShadows: boats.map(boat => ({ position: boat.position, heading: boat.heading })) };
    nearSea.update(waterX, waterZ, state.time, seaEnvironment);
    farSea.update(waterX, waterZ, state.time, seaEnvironment);
    horizon.position.x = waterX; horizon.position.z = waterZ;
    foam.update(boats, state.time, dt, seaEnvironment);

    const hour = (extras.daylight ?? 13) % 24;
    const sunAngle = (hour - 6) / 24 * Math.PI * 2, sunHeight = Math.sin(sunAngle);
    const day = THREE.MathUtils.smoothstep(sunHeight, -0.12, 0.28), night = 1 - day;
    const twilight = 1 - Math.min(1, Math.abs(sunHeight) * 5);
    color.copy(nightSky).lerp(daySky, day).lerp(twilightSky, twilight * 0.6); (scene.background as THREE.Color).copy(color);
    hemisphere.intensity = 0.35 + day * 0.75; hemisphere.color.setHex(0xd9f4ff).lerp(color.setHex(0x99baff), night * 0.6);
    sunlight.intensity = 0.3 + day * 1.7; sunlight.color.setHex(day > 0.5 ? 0xfff4dd : 0xaecbff);
    lightDirection.set(Math.cos(sunAngle) * 0.8, Math.max(0.3, Math.abs(sunHeight)), -0.5).normalize();
    sunlight.target.position.set(state.position.x, 0, state.position.z); sunlight.position.copy(sunlight.target.position).addScaledVector(lightDirection, 150);
    sun.position.set(state.position.x + Math.cos(sunAngle) * 520, sunHeight * 520, state.position.z - 240); sun.visible = sunHeight > -0.08;
    moon.position.set(state.position.x - Math.cos(sunAngle) * 520, -sunHeight * 520, state.position.z + 180); moon.visible = sunHeight < 0.05;
    stars.position.set(state.position.x, 0, state.position.z); stars.visible = night > 0.65;
    cloudSeeds.forEach((cloud, index) => {
      transform.position.set(state.position.x + cloud.x + Math.sin(state.time * 0.003 + index) * 8, cloud.y, state.position.z + cloud.z);
      transform.rotation.set(0, index * 0.7, 0); transform.scale.set(cloud.size * 1.5, cloud.size * 0.6, cloud.size); transform.updateMatrix(); clouds.setMatrixAt(index, transform.matrix);
    }); clouds.instanceMatrix.needsUpdate = true;
    terrain?.update(state.time, night);
    rig.update(state, cameraMode, dt, seaEnvironment, currentCourse ?? undefined);
    camera.getWorldDirection(arrowDirection);
    const pixelScale = 2 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, canvas.clientHeight);
    const markerSize = (marker: THREE.Sprite, pixels: number) => {
      const depth = Math.max(camera.near, (marker.position.x - camera.position.x) * arrowDirection.x + (marker.position.y - camera.position.y) * arrowDirection.y + (marker.position.z - camera.position.z) * arrowDirection.z);
      const size = depth * pixelScale * pixels; marker.scale.set(size, size, 1);
    };
    // The painted arrow occupies 100 of its texture's 128 pixels, leaving a transparent margin.
    if (tactical) { markerSize(playerMarker, 28); fleet.forEach(opponent => markerSize(opponent.marker, 24)); }
    courseScene?.update(state.time, tactical, assists, Math.max(0.65, camera.position.y / 380));
    renderer.render(scene, camera);
  }

  function dispose() {
    rig.dispose(); terrain?.dispose(); foam.dispose(); nearSea.dispose(); farSea.dispose(); disposeOutlines(scene);
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    scene.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Sprite) {
        if (object.geometry) geometries.add(object.geometry);
        (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material));
      }
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => { if ('map' in material && material.map instanceof THREE.Texture) material.map.dispose(); material.dispose(); });
    sunlight.shadow.dispose(); renderer.dispose(); renderer.forceContextLoss();
  }
  resize();
  return { resize, render, setQuality, resetCamera: rig.reset, dispose };
}
