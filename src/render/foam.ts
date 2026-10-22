import * as THREE from 'three';
import type { BoatState, SailingSettings, Vec2 } from '../physics/types';
import { sampleWind } from '../physics/sailing';
import { KNOTS_TO_MPS } from '../config/environment';
import { toonMaterial } from './toon';
import { sampleWave } from './waves';

interface Wake { x: number; z: number; dx: number; dz: number; yaw: number; born: number; life: number; width: number; length: number }
interface Emitter { credit: number; tack: number; time: number; wakeX: number; wakeZ: number }
interface Particle { x: number; z: number; vx: number; vz: number; vy: number; born: number; life: number; size: number }

/** Small bow spray and thin, persistent ribbons stay in world space after the hull has passed. */
export function createFoamSystem() {
  const object = new THREE.Group(), capacity = 240, shorelineCapacity = 900, wakeCapacity = 900;
  const geometry = new THREE.IcosahedronGeometry(1, 0), material = toonMaterial(0xffffff);
  const spray = new THREE.InstancedMesh(geometry, material, capacity);
  const shore = new THREE.InstancedMesh(geometry, material, shorelineCapacity);
  spray.instanceMatrix.setUsage(THREE.DynamicDrawUsage); shore.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  spray.frustumCulled = shore.frustumCulled = false;
  spray.count = shore.count = 0;
  const ribbonGeometry = new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2);
  const ribbonMaterial = toonMaterial(0xe6fffa, { transparent: true, opacity: .66, depthWrite: false });
  const wake = new THREE.InstancedMesh(ribbonGeometry, ribbonMaterial, wakeCapacity);
  wake.name = 'wake-ribbons'; wake.frustumCulled = false; wake.count = 0; wake.renderOrder = 3;
  wake.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  object.add(spray, shore, wake);
  const particles: Particle[] = [], ribbons: Wake[] = [];
  let emission = new WeakMap<BoatState, Emitter>();
  const transform = new THREE.Object3D(), wave = { height: 0, normal: new THREE.Vector3() };
  const up = new THREE.Vector3(0, 1, 0), headingRotation = new THREE.Quaternion();
  let shoreline: Vec2[] = [], seed = 19, lastInputs: number[] = [];
  const random = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };

  function emit(boat: BoatState, burst = false) {
    if (particles.length >= capacity) return;
    const forwardX = Math.sin(boat.heading), forwardZ = -Math.cos(boat.heading);
    const rightX = Math.cos(boat.heading), rightZ = Math.sin(boat.heading);
    const side = random() < 0.5 ? -1 : 1, speed = Math.hypot(boat.velocity.x, boat.velocity.z);
    const along = 1.65;
    particles.push({
      x: boat.position.x + forwardX * along + rightX * side * .42,
      z: boat.position.z + forwardZ * along + rightZ * side * .42,
      vx: boat.velocity.x * .18 + rightX * side * (burst ? .75 : .3),
      vz: boat.velocity.z * .18 + rightZ * side * (burst ? .75 : .3),
      vy: burst ? .55 + random() * .5 : .18 + speed * .1,
      born: boat.time, life: .45 + random() * .45,
      size: .018 + random() * (burst ? .045 : .03),
    });
  }

  function setShoreline(points: Vec2[]) {
    const stride = Math.max(1, Math.ceil(points.length / shorelineCapacity));
    shoreline = points.filter((_, index) => index % stride === 0).slice(0, shorelineCapacity);
    shore.count = shoreline.length;
    lastInputs = [];
  }

  function update(boats: BoatState[], time: number, dt: number, settings: SailingSettings) {
    const inputs = [time, settings.windSpeedKnots, settings.windDirectionDeg, Number(settings.gusts), Number(settings.shifts)];
    for (const boat of boats) inputs.push(boat.time);
    for (const shadow of settings.windShadows ?? []) inputs.push(shadow.position.x, shadow.position.z);
    if (inputs.length === lastInputs.length && inputs.every((value, index) => value === lastInputs[index])) return;
    lastInputs = inputs;
    for (const boat of boats) {
      let previous = emission.get(boat);
      if (!previous) { previous = { credit: 0, tack: boat.tackCount, time: boat.time, wakeX: boat.position.x, wakeZ: boat.position.z }; emission.set(boat, previous); }
      const advance = Math.max(0, Math.min(dt, boat.time - previous.time, 0.1));
      previous.time = boat.time;
      const speed = Math.hypot(boat.velocity.x, boat.velocity.z);
      previous.credit += advance * (speed > 0.4 ? 3 + speed * 4 + boat.planing * 8 : 0);
      while (previous.credit >= 1) { emit(boat); previous.credit--; }
      if (advance > 0 && boat.tackCount !== previous.tack && speed > 0.6) for (let i = 0; i < 10; i++) emit(boat, true);
      previous.tack = boat.tackCount;
      const travel = Math.hypot(boat.position.x - previous.wakeX, boat.position.z - previous.wakeZ);
      if (advance > 0 && travel > .28) {
        // A teleport starts a new trace instead of drawing a streak across the bay.
        if (speed > .4 && travel < 3) {
          const rightX = Math.cos(boat.heading), rightZ = Math.sin(boat.heading);
          const aftX = -Math.sin(boat.heading) * 1.75, aftZ = Math.cos(boat.heading) * 1.75;
          for (const side of [-1, 1]) if (ribbons.length < wakeCapacity) ribbons.push({
            x: (boat.position.x + previous.wakeX) / 2 + aftX + rightX * side * .48,
            z: (boat.position.z + previous.wakeZ) / 2 + aftZ + rightZ * side * .48,
            dx: rightX * side * (.1 + speed * .025), dz: rightZ * side * (.1 + speed * .025),
            yaw: -boat.heading, born: boat.time, life: 4.5 + boat.planing, width: .045 + speed * .009, length: travel * .7 + .12,
          });
        }
        previous.wakeX = boat.position.x; previous.wakeZ = boat.position.z;
      }
    }
    let count = 0;
    for (let index = particles.length - 1; index >= 0; index--) {
      const particle = particles[index], age = time - particle.born;
      if (age < 0 || age > particle.life) { particles.splice(index, 1); continue; }
      const x = particle.x + particle.vx * age, z = particle.z + particle.vz * age;
      const wind = sampleWind(x, z, time, settings);
      sampleWave(x, z, time, wind.speed / KNOTS_TO_MPS, wind.direction, wave);
      const size = particle.size * Math.min(1, (particle.life - age) * 1.6);
      transform.position.set(x, wave.height + 0.06 + Math.max(0, particle.vy * age - age * age * 1.6), z);
      transform.rotation.set(age * 0.7, particle.born, age * 0.35);
      transform.scale.set(size * (1 + age * 0.25), size * 0.65, size);
      transform.updateMatrix(); spray.setMatrixAt(count++, transform.matrix);
    }
    spray.count = count; spray.instanceMatrix.needsUpdate = true;
    count = 0;
    for (let index = ribbons.length - 1; index >= 0; index--) {
      const ribbon = ribbons[index], age = time - ribbon.born;
      if (age < 0 || age > ribbon.life) { ribbons.splice(index, 1); continue; }
      const x = ribbon.x + ribbon.dx * age, z = ribbon.z + ribbon.dz * age;
      const wind = sampleWind(x, z, time, settings);
      sampleWave(x, z, time, wind.speed / KNOTS_TO_MPS, wind.direction, wave);
      const fade = Math.min(1, (ribbon.life - age) / 1.3);
      transform.position.set(x, wave.height + .022, z);
      transform.quaternion.setFromUnitVectors(up, wave.normal);
      headingRotation.setFromAxisAngle(up, ribbon.yaw); transform.quaternion.multiply(headingRotation);
      transform.scale.set(ribbon.width * (1 + age * .3) * fade, .01, ribbon.length * (1 + age * .08) * fade);
      transform.updateMatrix(); wake.setMatrixAt(count++, transform.matrix);
    }
    wake.count = count; wake.instanceMatrix.needsUpdate = true;
    shoreline.forEach((point, index) => {
      const wind = sampleWind(point.x, point.z, time, settings);
      sampleWave(point.x, point.z, time, wind.speed / KNOTS_TO_MPS, wind.direction, wave);
      const pulse = 0.6 + Math.sin(time * 1.6 + index * 1.7) * 0.25;
      transform.position.set(point.x, Math.max(0.03, wave.height + 0.05), point.z);
      transform.rotation.set(0, index * 2.1, 0);
      transform.scale.set((0.3 + index % 4 * 0.1) * pulse, 0.025 * pulse, 0.45 * pulse);
      transform.updateMatrix(); shore.setMatrixAt(index, transform.matrix);
    });
    shore.instanceMatrix.needsUpdate = true;
  }

  function reset() { particles.length = ribbons.length = 0; spray.count = wake.count = 0; emission = new WeakMap(); lastInputs = []; }
  function dispose() { geometry.dispose(); material.dispose(); ribbonGeometry.dispose(); ribbonMaterial.dispose(); object.removeFromParent(); }
  return { object, setShoreline, update, reset, dispose };
}
