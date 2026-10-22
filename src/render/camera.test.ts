import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { clampCameraToSurface, createCameraRig, orbitPosition, panOffset } from './camera';
import { createBoatState } from '../physics/sailing';
import { DEFAULT_SETTINGS } from '../config/environment';

describe('free camera navigation', () => {
  it('orbits a focus through a full circle without changing distance', () => {
    const focus = new THREE.Vector3(40, 1, -20);
    for (const yaw of [0, Math.PI / 2, Math.PI, Math.PI * 2]) {
      const position = orbitPosition(focus, yaw, .4, 25);
      expect(position.distanceTo(focus)).toBeCloseTo(25);
    }
    expect(orbitPosition(focus, 0, .4, 25).distanceTo(orbitPosition(focus, Math.PI * 2, .4, 25))).toBeLessThan(1e-10);
  });
  it('pans on the horizontal plane in camera-relative directions', () => {
    const offset = panOffset(100, 50, 0, 1);
    expect(offset).toEqual(new THREE.Vector3(-100, 0, -50));
    const rotated = panOffset(100, 0, Math.PI / 2, 1);
    expect(rotated.x).toBeCloseTo(0);
    expect(rotated.z).toBeCloseTo(100);
  });
  it('never crosses water or elevated terrain even after an orbit interpolation', () => {
    const position = new THREE.Vector3(0, -3, 0);
    clampCameraToSurface(position, .4, -5);
    expect(position.y).toBe(1);
    clampCameraToSurface(position, .4, 25);
    expect(position.y).toBe(25.6);
    position.y = 40;
    clampCameraToSurface(position, 0, 25);
    expect(position.y).toBe(40);
  });
  it('retains pan and orbit, bounds wheel zoom, and recenters even with paused physics', () => {
    let time = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => time);
    const canvas = new EventTarget() as EventTarget & Record<string, unknown>;
    Object.assign(canvas, { clientWidth: 1280, clientHeight: 800, style: {}, setPointerCapture() {}, hasPointerCapture() { return true; }, releasePointerCapture() {}, focus() {} });
    const rig = createCameraRig(canvas as unknown as HTMLCanvasElement), state = createBoatState();
    state.position = { x: 0, z: 0 };
    const settle = () => { for (let i = 0; i < 200; i++) { time += 16; rig.update(state, 'chase', 0, DEFAULT_SETTINGS); } };
    const event = (type: string, properties: Record<string, number | boolean>) => {
      const e = new Event(type, { cancelable: true }); Object.assign(e, properties); canvas.dispatchEvent(e);
    };
    settle(); const initial = rig.camera.position.clone();
    event('pointerdown', { button: 0, pointerId: 1, clientX: 600, clientY: 400, shiftKey: false });
    event('pointermove', { pointerId: 1, clientX: 750, clientY: 400 });
    event('pointerup', { pointerId: 1 }); settle();
    expect(rig.camera.position.distanceTo(initial)).toBeGreaterThan(5);
    const orbit = rig.camera.position.clone();
    event('pointerdown', { button: 2, pointerId: 2, clientX: 600, clientY: 400, shiftKey: false });
    event('pointermove', { pointerId: 2, clientX: 850, clientY: 480 });
    event('pointerup', { pointerId: 2 }); settle();
    expect(rig.camera.position.distanceTo(orbit)).toBeGreaterThan(3);
    rig.reset(); settle(); expect(rig.camera.position.distanceTo(orbit)).toBeLessThan(.001);
    event('wheel', { deltaY: 100000, deltaMode: 0 }); settle();
    expect(rig.camera.position.distanceTo(new THREE.Vector3(0, .75, 0))).toBeCloseTo(180, 2);
    event('wheel', { deltaY: -100000, deltaMode: 0 }); settle();
    expect(rig.camera.position.distanceTo(new THREE.Vector3(0, .75, 0))).toBeCloseTo(4, 2);
    rig.dispose(); clock.mockRestore();
  });
  it('frames the full showcase boat on the right of desktop and centrally on narrow screens without changing state', () => {
    for (const [width, height] of [[1280, 720], [390, 844], [319, 812], [760, 500]]) {
      const canvas = new EventTarget() as EventTarget & Record<string, unknown>;
      Object.assign(canvas, { clientWidth: width, clientHeight: height, style: {}, setPointerCapture() {}, hasPointerCapture() { return false; }, releasePointerCapture() {}, focus() {} });
      const rig = createCameraRig(canvas as unknown as HTMLCanvasElement), state = createBoatState(), before = structuredClone(state);
      rig.resize(width, height); rig.setShowcase({ yaw: .7, time: 12, reducedMotion: true });
      rig.update(state, 'chase', 1 / 60, DEFAULT_SETTINGS); rig.camera.updateMatrixWorld(true);
      const points = [[0, 6.26, -.67], [-.82, 0, 0], [.82, 0, 0], [0, 0, -2.1], [0, 0, 2.3]].map(p => new THREE.Vector3(...p as [number, number, number]).project(rig.camera));
      expect(points.every(p => Math.abs(p.y) < .92 && Math.abs(p.x) < .96)).toBe(true);
      const center = new THREE.Vector3(0, 2.7, 0).project(rig.camera);
      expect(center.x).toBeCloseTo(width > 760 ? .44 : 0, 2);
      if (width <= 760) for (const point of points) {
        const pixelY = (1 - point.y) * height / 2;
        expect(pixelY).toBeGreaterThan(80); expect(pixelY).toBeLessThan(height * .32);
      }
      expect(state).toEqual(before);
      rig.setShowcase(null); rig.update(state, 'chase', 1 / 60, DEFAULT_SETTINGS);
      expect(rig.camera.view?.enabled ?? false).toBe(false); rig.dispose();
    }
  });
});
