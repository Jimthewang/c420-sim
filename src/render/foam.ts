import * as THREE from 'three';
import type { BoatState, SailingSettings, Vec2 } from '../physics/types';
import { sampleWind } from '../physics/sailing';
import { KNOTS_TO_MPS } from '../config/environment';
import { toonMaterial } from './toon';
import { sampleWave } from './waves';

interface Particle { x: number; z: number; vx: number; vz: number; vy: number; born: number; life: number; size: number }

/** Two reusable instanced meshes: small 3D hull spray and a pulsing broken shoreline. */
export function createFoamSystem() {
  const object = new THREE.Group(), capacity = 480, shorelineCapacity = 900;
  const geometry = new THREE.IcosahedronGeometry(1, 0), material = toonMaterial(0xffffff);
  const spray = new THREE.InstancedMesh(geometry, material, capacity);
  const shore = new THREE.InstancedMesh(geometry, material, shorelineCapacity);
  spray.instanceMatrix.setUsage(THREE.DynamicDrawUsage); shore.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  spray.frustumCulled = shore.frustumCulled = false;
  spray.count = shore.count = 0;
  object.add(spray, shore);
  const particles: Particle[] = [];
  const emission = new WeakMap<BoatState, { credit: number; tack: number }>();
  const transform = new THREE.Object3D(), wave = { height: 0, normal: new THREE.Vector3() };
  let shoreline: Vec2[] = [], seed = 19;
  const random = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };

  function emit(boat: BoatState, bow: boolean, burst = false) {
    if (particles.length >= capacity) return;
    const forwardX = Math.sin(boat.heading), forwardZ = -Math.cos(boat.heading);
    const rightX = Math.cos(boat.heading), rightZ = Math.sin(boat.heading);
    const side = random() < 0.5 ? -1 : 1, speed = Math.hypot(boat.velocity.x, boat.velocity.z);
    const along = bow ? 1.65 : -1.8;
    particles.push({
      x: boat.position.x + forwardX * along + rightX * side * (bow ? 0.42 : 0.45),
      z: boat.position.z + forwardZ * along + rightZ * side * (bow ? 0.42 : 0.45),
      vx: boat.velocity.x * (bow ? 0.25 : 0.06) + rightX * side * (burst ? 1.3 : 0.35),
      vz: boat.velocity.z * (bow ? 0.25 : 0.06) + rightZ * side * (burst ? 1.3 : 0.35),
      vy: burst ? 0.9 + random() * 1.4 : bow ? 0.3 + speed * 0.13 : 0.12,
      born: boat.time, life: bow ? 0.7 + random() * 0.7 : 2.2 + random() * 1.8,
      size: (bow ? 0.07 : 0.12) + random() * (burst ? 0.16 : 0.09),
    });
  }

  function setShoreline(points: Vec2[]) {
    const stride = Math.max(1, Math.ceil(points.length / shorelineCapacity));
    shoreline = points.filter((_, index) => index % stride === 0).slice(0, shorelineCapacity);
    shore.count = shoreline.length;
  }

  function update(boats: BoatState[], time: number, dt: number, settings: SailingSettings) {
    for (const boat of boats) {
      let previous = emission.get(boat);
      if (!previous) { previous = { credit: 0, tack: boat.tackCount }; emission.set(boat, previous); }
      const speed = Math.hypot(boat.velocity.x, boat.velocity.z);
      previous.credit += Math.max(0, Math.min(dt, 0.1)) * (speed > 0.4 ? 3 + speed * 4 + boat.planing * 8 : 0);
      while (previous.credit >= 1) { emit(boat, random() < 0.45); previous.credit--; }
      if (boat.tackCount !== previous.tack && speed > 0.6) for (let i = 0; i < 14; i++) emit(boat, i % 2 === 0, true);
      previous.tack = boat.tackCount;
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
    shoreline.forEach((point, index) => {
      const wind = sampleWind(point.x, point.z, time, settings);
      sampleWave(point.x, point.z, time, wind.speed / KNOTS_TO_MPS, wind.direction, wave);
      const pulse = 0.6 + Math.sin(time * 1.6 + index * 1.7) * 0.25;
      transform.position.set(point.x, Math.max(0.03, wave.height + 0.05), point.z);
      transform.rotation.set(0, index * 2.1, 0);
      transform.scale.set((0.3 + index % 4 * 0.1) * pulse, 0.08 * pulse, 0.45 * pulse);
      transform.updateMatrix(); shore.setMatrixAt(index, transform.matrix);
    });
    shore.instanceMatrix.needsUpdate = true;
  }

  function reset() { particles.length = 0; spray.count = 0; }
  function dispose() { geometry.dispose(); material.dispose(); object.removeFromParent(); }
  return { object, setShoreline, update, reset, dispose };
}
