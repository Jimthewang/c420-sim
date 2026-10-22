import * as THREE from 'three';
import type { Vec2, SailingSettings } from '../physics/types';
import { getTerrainHeight, getTerrainIslands } from '../world/terrain';
import { sampleWind } from '../physics/sailing';
import { KNOTS_TO_MPS } from '../config/environment';
import { sampleWave } from './waves';
import { toonMaterial } from './toon';

/** The display anchorage uses existing shore geometry, never changes the playable terrain. */
export function getShowcasePlacement(hour = 14) {
  const islands = [...getTerrainIslands()].sort((a, b) => getTerrainHeight(b.x, b.z) - getTerrainHeight(a.x, a.z));
  const island = islands.find(candidate => getTerrainHeight(candidate.x, candidate.z) > 3);
  if (!island) return { x: 0, z: 0, yaw: .6 };
  const sunAngle = (hour - 6) / 24 * Math.PI * 2;
  const sunX = Math.cos(sunAngle) * .8, length = Math.hypot(sunX, .5), dx = sunX / length, dz = -.5 / length;
  // Leave room above the lighthouse and place its skyline beside, rather than behind, the rig.
  let distance = Math.max(island.radius + 100, (getTerrainHeight(island.x, island.z) + 15) / Math.tan(.16));
  const position = () => ({ x: island.x + dx * distance + dz * distance * .14, z: island.z + dz * distance - dx * distance * .14 });
  while (getTerrainHeight(position().x, position().z) > -3) distance += 5;
  return { ...position(), yaw: Math.atan2(dx, dz) };
}

/** A gradient sky and two instanced surface details add depth without postprocessing or new fluid motion. */
export function createAtmosphere() {
  const object = new THREE.Group();
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { zenith: { value: new THREE.Color(0x55b9e6) }, horizon: { value: new THREE.Color(0xd6f1ec) } },
    vertexShader: `varying float altitude; void main() { altitude = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 zenith; uniform vec3 horizon; varying float altitude;
      void main() { gl_FragColor = vec4(mix(horizon, zenith, smoothstep(-0.05, 0.72, altitude)), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 24, 12), skyMaterial);
  sky.renderOrder = -10; sky.frustumCulled = false; object.add(sky);
  const glints = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 4).rotateX(-Math.PI / 2),
    toonMaterial(0xeaffee, { transparent: true, opacity: .64, depthWrite: false, emissive: 0x73bbba, emissiveIntensity: .25 }), 150);
  glints.name = 'surface-glints'; glints.renderOrder = 4; glints.frustumCulled = false;
  glints.instanceMatrix.setUsage(THREE.DynamicDrawUsage); object.add(glints);
  const transform = new THREE.Object3D(), wave = { height: 0, normal: new THREE.Vector3() };
  const up = new THREE.Vector3(0, 1, 0), spin = new THREE.Quaternion();
  const dusk = new THREE.Color(0xf8cba8), night = new THREE.Color(0x142947), nightHorizon = new THREE.Color(0x324e6b);
  let lastInputs: number[] = [];
  function update(position: Vec2, time: number, settings: SailingSettings, day: number, twilight: number, reducedMotion: boolean, tactical: boolean) {
    sky.position.set(position.x, 0, position.z);
    skyMaterial.uniforms.zenith.value.setHex(0x55b9e6).lerp(night, 1 - day);
    skyMaterial.uniforms.horizon.value.setHex(0xd6f1ec).lerp(nightHorizon, 1 - day).lerp(dusk, twilight * .65);
    glints.visible = day > .2 && !tactical;
    if (!glints.visible) return;
    const centerX = Math.floor(position.x / 10), centerZ = Math.floor(position.z / 10);
    const inputs = [centerX, centerZ, time, day, Number(reducedMotion), settings.windSpeedKnots, settings.windDirectionDeg, Number(settings.gusts), Number(settings.shifts)];
    for (const shadow of settings.windShadows ?? []) inputs.push(shadow.position.x, shadow.position.z);
    if (inputs.length === lastInputs.length && inputs.every((value, index) => value === lastInputs[index])) return;
    lastInputs = inputs;
    for (let i = 0; i < glints.count; i++) {
      // Stable world cells avoid a screen-space texture sliding along with the boat.
      const cellX = centerX + i % 15 - 7, cellZ = centerZ + Math.floor(i / 15) - 5;
      const hash = (Math.imul(cellX, 73856093) ^ Math.imul(cellZ, 19349663)) >>> 0;
      const x = cellX * 10 + (hash % 71) * .1, z = cellZ * 10 + ((hash >>> 8) % 71) * .1;
      const wind = sampleWind(x, z, time, settings);
      sampleWave(x, z, time, wind.speed / KNOTS_TO_MPS, wind.direction, wave);
      const pulse = reducedMotion ? .45 : Math.max(0, Math.sin(time * 1.4 + (hash % 628) * .01)) ** 8;
      const size = (.05 + hash % 4 * .015) * pulse;
      transform.position.set(x, wave.height + .025, z);
      transform.quaternion.setFromUnitVectors(up, wave.normal);
      spin.setFromAxisAngle(up, wind.direction); transform.quaternion.multiply(spin);
      transform.scale.set(size * 3.8, 1, size); transform.updateMatrix(); glints.setMatrixAt(i, transform.matrix);
    }
    glints.instanceMatrix.needsUpdate = true;
  }
  function dispose() { sky.geometry.dispose(); skyMaterial.dispose(); glints.geometry.dispose(); glints.material.dispose(); object.removeFromParent(); }
  return { object, update, dispose };
}
