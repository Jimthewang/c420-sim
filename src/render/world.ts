import * as THREE from 'three';
import { sampleWind } from '../physics/sailing';
import { KNOTS_TO_MPS } from '../config/environment';
import type { BoatState, CameraMode, SailingSettings, Telemetry } from '../physics/types';
import { configureTerrainCourse, getTerrainHeight, getTerrainSeed, protectTerrainPoints, setTerrainSeed } from '../world/terrain';
import { createDinghy } from './boat';
import { createAtmosphere, getShowcasePlacement } from './atmosphere';
import { createCameraRig } from './camera';
import { boatMarker, createCourseScene, disposeObject } from './course';
import { createFoamSystem } from './foam';
import { createTerrainScene } from './terrain';
import { attachOutline, disposeOutlines, setOutlinesEnabled, toonMaterial } from './toon';
import { prepareWaveHeightSampler } from '../world/waves';
import type { GraphicsQuality, RenderCourse, RenderExtras } from './types';

interface SeaSample { height: number; tint: number; r: number; g: number; b: number }
interface SeaBoundary {
  segments: number; readonly version: number;
  sample(x: number, z: number, out: SeaSample): void;
}

/** Indexed sampling keeps wave evaluation cheap; the rendered surface has independent flat faces. */
export function createSeaPatch(span: number, segments: number, hole = 0, innerBoundary?: SeaBoundary) {
  const indexed = new THREE.PlaneGeometry(span, span, segments, segments).rotateX(-Math.PI / 2);
  if (hole) {
    const indices = indexed.index!.array, points = indexed.attributes.position, kept: number[] = [];
    const vertices = Array.from(points.array), lookup = new Map<string, number>();
    const add = (x: number, z: number) => {
      const key = `${x.toFixed(6)},${z.toFixed(6)}`;
      if (!lookup.has(key)) { lookup.set(key, vertices.length / 3); vertices.push(x, 0, z); }
      return lookup.get(key)!;
    };
    for (let i = 0; i < points.count; i++) lookup.set(`${points.getX(i).toFixed(6)},${points.getZ(i).toFixed(6)}`, i);
    for (let i = 0; i < indices.length; i += 6) {
      const quad = [indices[i], indices[i + 1], indices[i + 4], indices[i + 2]];
      const cx = quad.reduce((sum, vertex) => sum + points.getX(vertex), 0) / 4;
      const cz = quad.reduce((sum, vertex) => sum + points.getZ(vertex), 0) / 4;
      if (Math.abs(cx) < hole && Math.abs(cz) < hole) continue;
      const polygon: number[] = [];
      for (let edge = 0; edge < 4; edge++) {
        const a = quad[edge], b = quad[(edge + 1) % 4]; polygon.push(a);
        if (!innerBoundary) continue;
        const ax = points.getX(a), az = points.getZ(a), bx = points.getX(b), bz = points.getZ(b);
        const vertical = ax === bx && Math.abs(ax) === hole && Math.max(Math.abs(az), Math.abs(bz)) <= hole;
        const horizontal = az === bz && Math.abs(az) === hole && Math.max(Math.abs(ax), Math.abs(bx)) <= hole;
        if (!vertical && !horizontal) continue;
        const from = vertical ? az : ax, to = vertical ? bz : bx, step = hole * 2 / innerBoundary.segments;
        const splits: number[] = [];
        for (let knot = 1; knot < innerBoundary.segments; knot++) {
          const along = -hole + knot * step;
          if (along > Math.min(from, to) + 1e-6 && along < Math.max(from, to) - 1e-6) splits.push(along);
        }
        if (to < from) splits.reverse();
        for (const along of splits) polygon.push(add(vertical ? ax : along, vertical ? along : az));
      }
      if (polygon.length === 4) kept.push(...Array.from(indices.slice(i, i + 6)));
      else {
        // Only the single row around the hole needs extra triangles to share the fine mesh's edge knots.
        const center = add(cx, cz);
        for (let edge = 0; edge < polygon.length; edge++) kept.push(center, polygon[edge], polygon[(edge + 1) % polygon.length]);
      }
    }
    indexed.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    indexed.deleteAttribute('normal'); indexed.deleteAttribute('uv');
    indexed.setIndex(kept);
  }
  const source = indexed.attributes.position.array.slice() as Float32Array;
  const indices = new Uint32Array(indexed.index!.array);
  const geometry = indexed.toNonIndexed(); indexed.dispose();
  geometry.computeVertexNormals();
  const colors = new Float32Array(geometry.attributes.position.count * 3);
  const tints = new Float32Array(source.length / 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  (geometry.attributes.position as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  (geometry.attributes.normal as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  (geometry.attributes.color as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  const mesh = new THREE.Mesh(geometry, toonMaterial(0xffffff, { vertexColors: true, transparent: true, opacity: 0.94, depthWrite: true }));
  mesh.receiveShadow = true; mesh.frustumCulled = false;
  mesh.renderOrder = hole ? 1 : 2;
  const heights = new Float32Array(source.length / 3), used = new Uint8Array(heights.length), edgeSample: SeaSample = { height: 0, tint: 1, r: 0, g: 0, b: 0 };
  const red = new Float32Array(heights.length), green = new Float32Array(heights.length), blue = new Float32Array(heights.length);
  for (const vertex of indices) used[vertex] = 1;
  let lastInputs: number[] = [], version = 0;
  let depthX = NaN, depthZ = NaN, depthSeed = NaN;
  const depths = new Float32Array(heights.length);
  const deepColor = new THREE.Color(0x31c8df), shallowColor = new THREE.Color(0x86e4cf), waterColor = new THREE.Color();
  const boundary: SeaBoundary = {
    segments, get version() { return version; },
    sample(x, z, out) {
      const column = Math.max(0, Math.min(segments, (x / span + .5) * segments));
      const row = Math.max(0, Math.min(segments, (z / span + .5) * segments));
      const x0 = Math.floor(column), z0 = Math.floor(row), x1 = Math.min(segments, x0 + 1), z1 = Math.min(segments, z0 + 1);
      const u = column - x0, v = row - z0;
      const value = (values: Float32Array) => (values[z0 * (segments + 1) + x0] * (1 - u) + values[z0 * (segments + 1) + x1] * u) * (1 - v)
        + (values[z1 * (segments + 1) + x0] * (1 - u) + values[z1 * (segments + 1) + x1] * u) * v;
      out.height = value(heights); out.tint = value(tints);
      out.r = value(red); out.g = value(green); out.b = value(blue);
    },
  };
  function update(x: number, z: number, time: number, settings: SailingSettings) {
    const inputs = [x, z, time, getTerrainSeed(), settings.windSpeedKnots, settings.windDirectionDeg, Number(settings.gusts), Number(settings.shifts), innerBoundary?.version ?? 0];
    for (const shadow of settings.windShadows ?? []) inputs.push(shadow.position.x, shadow.position.z);
    if (inputs.length === lastInputs.length && inputs.every((value, index) => value === lastInputs[index])) return;
    lastInputs = inputs; version++;
    mesh.position.set(x, 0, z);
    if (depthX !== x || depthZ !== z || depthSeed !== getTerrainSeed()) {
      for (let i = 0; i < depths.length; i++) if (used[i]) depths[i] = getTerrainHeight(source[i * 3] + x, source[i * 3 + 2] + z);
      depthX = x; depthZ = z; depthSeed = getTerrainSeed();
    }
    // Direction is spatially uniform; gusts and boat shadows still supply each vertex's exact local speed.
    const heightAt = prepareWaveHeightSampler(time, sampleWind(x, z, time, settings).direction);
    for (let vertex = 0; vertex < heights.length; vertex++) {
      if (!used[vertex]) continue;
      const worldX = source[vertex * 3] + x, worldZ = source[vertex * 3 + 2] + z;
      const localX = source[vertex * 3], localZ = source[vertex * 3 + 2];
      if (innerBoundary && (Math.abs(localX) === hole && Math.abs(localZ) <= hole || Math.abs(localZ) === hole && Math.abs(localX) <= hole)) {
        innerBoundary.sample(localX, localZ, edgeSample); heights[vertex] = edgeSample.height; tints[vertex] = edgeSample.tint;
        red[vertex] = edgeSample.r; green[vertex] = edgeSample.g; blue[vertex] = edgeSample.b; continue;
      }
      const wind = sampleWind(worldX, worldZ, time, settings);
      const height = heightAt(worldX, worldZ, wind.speed / KNOTS_TO_MPS);
      heights[vertex] = height;
      const puff = settings.gusts ? 1 - Math.max(0, wind.gust) * 0.7 : 1;
      tints[vertex] = puff * (0.98 + Math.max(-0.54, Math.min(0.54, height)) * 0.20);
      const shallow = THREE.MathUtils.smoothstep(depths[vertex], -7, -0.6);
      waterColor.copy(deepColor).lerp(shallowColor, shallow).multiplyScalar(tints[vertex]);
      red[vertex] = waterColor.r; green[vertex] = waterColor.g; blue[vertex] = waterColor.b;
    }
    const positions = geometry.attributes.position.array as Float32Array;
    for (let vertex = 0; vertex < indices.length; vertex++) {
      const sourceIndex = indices[vertex], offset = vertex * 3;
      positions[offset + 1] = heights[sourceIndex];
      // Final RGB also crosses the shared boundary: depth-to-color is nonlinear.
      colors[offset] = red[sourceIndex]; colors[offset + 1] = green[sourceIndex]; colors[offset + 2] = blue[sourceIndex];
    }
    // Nonindexed flat faces share one normal: normalize once per triangle, not once per duplicate vertex.
    const normals = geometry.attributes.normal.array as Float32Array;
    for (let face = 0; face < positions.length; face += 9) {
      const ux = positions[face + 3] - positions[face], uy = positions[face + 4] - positions[face + 1], uz = positions[face + 5] - positions[face + 2];
      const vx = positions[face + 6] - positions[face], vy = positions[face + 7] - positions[face + 1], vz = positions[face + 8] - positions[face + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const length = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      for (let corner = 0; corner < 9; corner += 3) { normals[face + corner] = nx / length; normals[face + corner + 1] = ny / length; normals[face + corner + 2] = nz / length; }
    }
    geometry.attributes.position.needsUpdate = true; geometry.attributes.normal.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
  }
  return { mesh, boundary, update, invalidateTerrain() { depthSeed = NaN; lastInputs = []; }, dispose() { geometry.dispose(); mesh.material.dispose(); mesh.removeFromParent(); } };
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
  let nearSea = createSeaPatch(360, 96), farSea = createSeaPatch(1200, 60, 180, nearSea.boundary);
  const horizon = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000).rotateX(-Math.PI / 2), toonMaterial(0x31c8df));
  horizon.position.y = -0.6; horizon.receiveShadow = false;
  scene.add(horizon, farSea.mesh, nearSea.mesh);
  const foam = createFoamSystem(); scene.add(foam.object);
  let terrain: ReturnType<typeof createTerrainScene> | null = null;
  const atmosphere = createAtmosphere(); scene.add(atmosphere.object);

  const sun = new THREE.Mesh(new THREE.IcosahedronGeometry(13, 2), toonMaterial(0xffe144, { emissive: 0xffe144, emissiveIntensity: 1 }));
  const moon = new THREE.Mesh(new THREE.IcosahedronGeometry(9, 1), toonMaterial(0xffffff, { emissive: 0xcde7ff, emissiveIntensity: 0.8 }));
  scene.add(sun, moon);
  const cloudGeometry = new THREE.IcosahedronGeometry(1, 1), cloudMaterial = toonMaterial(0xffffff);
  const clouds = new THREE.InstancedMesh(cloudGeometry, cloudMaterial, 72); clouds.frustumCulled = false; scene.add(clouds);
  // Clouds keep soft cream edges so the ink contour remains focused on boats and the coast.
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
  let cloudTime = NaN;

  const dinghy = createDinghy(); scene.add(dinghy.object);
  const playerMarker = boatMarker(0x29444d, 'Y'); scene.add(playerMarker);
  const fleet = new Map<string, { model: ReturnType<typeof createDinghy>; marker: THREE.Sprite }>();
  let currentCourse: RenderCourse | null = null, courseKey = '', terrainSeed = NaN;
  let courseScene: ReturnType<typeof createCourseScene> | null = null;
  let showcaseBoat: BoatState | null = null, showcaseStart = 0, showcaseActive = false;
  let showcasePlacement = { x: 0, z: 0, yaw: .6 };
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
    farSea = createSeaPatch(1200, next === 'high' ? 100 : 60, 180, nearSea.boundary);
    scene.add(farSea.mesh, nearSea.mesh); resize();
  }

  function render(state: BoatState, telemetry: Telemetry, settings: SailingSettings, cameraMode: CameraMode, dt: number, extras: RenderExtras = {}) {
    if (extras.quality && extras.quality !== quality) setQuality(extras.quality);
    if ((extras.outlines ?? true) !== outlines) { outlines = extras.outlines ?? true; setOutlinesEnabled(outlines); }
    const showcase = extras.showcase ?? false;
    if (showcase !== showcaseActive) {
      showcaseActive = showcase; foam.reset();
      if (showcase) {
        showcaseBoat = structuredClone(state); showcaseStart = extras.presentationTime ?? 0;
        showcasePlacement = getShowcasePlacement(extras.daylight ?? 14);
      } else showcaseBoat = null;
    }
    const reset = state.time < lastTime; lastTime = state.time;
    if (reset) { foam.reset(); rig.reset(); }
    const nextCourse = extras.course ?? null, nextKey = nextCourse ? `${nextCourse.windDirectionDeg}/${nextCourse.length}` : 'free';
    const nextSeed = extras.terrainSeed ?? getTerrainSeed();
    if (nextKey !== courseKey || nextSeed !== terrainSeed) {
      protectTerrainPoints([state.position, ...(extras.opponents ?? []).map(opponent => opponent.boat.position)]);
      setTerrainSeed(nextSeed); configureTerrainCourse(nextCourse); terrainSeed = getTerrainSeed(); courseKey = nextKey;
      terrain?.dispose(); terrain = createTerrainScene(); scene.add(terrain.object); foam.setShoreline(terrain.shoreline);
      nearSea.invalidateTerrain(); farSea.invalidateTerrain();
      if (showcase) showcasePlacement = getShowcasePlacement(extras.daylight ?? 14);
    }
    if (nextCourse !== currentCourse) {
      if (courseScene) { disposeOutlines(courseScene.object); disposeObject(courseScene.object); }
      currentCourse = nextCourse; courseScene = currentCourse ? createCourseScene(currentCourse) : null;
      if (courseScene) scene.add(courseScene.object);
    }
    if (showcase && showcaseBoat) {
      const display = showcaseBoat;
      display.time = extras.reducedMotion ? 0 : Math.max(0, (extras.presentationTime ?? 0) - showcaseStart) * .65;
      display.position.x = showcasePlacement.x; display.position.z = showcasePlacement.z;
      display.heading = -showcasePlacement.yaw - .65;
      display.velocity.x = display.velocity.z = display.yawRate = display.rollRate = display.rudder = 0;
      display.heel = .035; display.capsized = false; display.planing = 0; display.rightingProgress = 0; display.centerboard = 1;
      display.mainSheet = display.jibSheet = .65;
      display.main.angle = .55; display.main.status = 'drawing'; display.main.lift = 140; display.main.angleOfAttack = .18;
      display.jib.angle = .36; display.jib.status = 'drawing'; display.jib.lift = 60; display.jib.angleOfAttack = .18;
      display.mainAngularVelocity = display.jibAngularVelocity = 0;
      display.crew.skipperX = -.38; display.crew.crewX = -.34; display.crew.hike = -.35; display.crew.foreAft = 0;
      display.rollTackPhase = 'idle';
      state = display;
    }
    rig.setShowcase(showcase ? { yaw: showcasePlacement.yaw, time: state.time, reducedMotion: extras.reducedMotion } : null);
    if (courseScene) courseScene.object.visible = !showcase;
    const opponents = showcase ? [] : extras.opponents ?? [];
    const spin = !showcase && (extras.spinnaker ?? settings.spinnaker);
    const boats = [state, ...opponents.map(opponent => opponent.boat)];
    const boatEnvironment = (boat: BoatState) => ({ ...settings, windShadows: boats.filter(other => other !== boat).map(other => ({ position: other.position, heading: other.heading })) });
    const waveWind = sampleWind(state.position.x, state.position.z, state.time, boatEnvironment(state));
    const waveKnots = waveWind.speed / KNOTS_TO_MPS;
    dinghy.update(state, spin, telemetry.trueWindAngleDeg, waveKnots, waveWind.direction);
    const tactical = !showcase && cameraMode === 'tactical', assists = (extras.difficulty ?? 'beginner') !== 'realistic';
    clouds.visible = !tactical;
    const opponentIds = new Set(opponents.map(opponent => opponent.id));
    for (const [id, opponent] of fleet) if (!opponentIds.has(id)) {
      disposeOutlines(opponent.model.object); disposeObject(opponent.model.object); disposeObject(opponent.marker); fleet.delete(id);
    }
    for (const opponent of opponents) {
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
    const navigationTarget = showcase ? null : extras.target;
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
    if (cloudTime !== state.time) {
      cloudTime = state.time;
      cloudSeeds.forEach((cloud, index) => {
        transform.position.set(cloud.x + Math.sin(state.time * .003 + index) * 8, cloud.y, cloud.z + Math.sin(state.time * .002) * 12);
        transform.rotation.set(0, index * .7, 0); transform.scale.set(cloud.size * 1.5, cloud.size * .6, cloud.size); transform.updateMatrix(); clouds.setMatrixAt(index, transform.matrix);
      }); clouds.instanceMatrix.needsUpdate = true;
    }
    terrain?.update(state.time, night);
    atmosphere.update(state.position, state.time, seaEnvironment, day, twilight, extras.reducedMotion ?? false, tactical);
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
    rig.dispose(); terrain?.dispose(); atmosphere.dispose(); foam.dispose(); nearSea.dispose(); farSea.dispose(); disposeOutlines(scene);
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
