import * as THREE from 'three';
import type { BoatState, CameraMode, SailingSettings } from '../physics/types';
import type { RenderCourse } from './types';
import { getTerrainHeight } from '../world/terrain';
import { getWaveHeight } from './waves';
import { sampleWind } from '../physics/sailing';
import { KNOTS_TO_MPS } from '../config/environment';

export function orbitPosition(focus: THREE.Vector3, yaw: number, pitch: number, distance: number) {
  return new THREE.Vector3(
    focus.x + Math.sin(yaw) * Math.cos(pitch) * distance,
    focus.y + Math.sin(pitch) * distance,
    focus.z + Math.cos(yaw) * Math.cos(pitch) * distance,
  );
}

export function panOffset(dx: number, dy: number, yaw: number, scale: number) {
  return new THREE.Vector3((-dx * Math.cos(yaw) - dy * Math.sin(yaw)) * scale, 0, (dx * Math.sin(yaw) - dy * Math.cos(yaw)) * scale);
}

export function clampCameraToSurface(position: THREE.Vector3, waveHeight: number, terrainHeight: number) {
  position.y = Math.max(position.y, waveHeight + .6, terrainHeight + .6);
}

interface View { yaw: number; pitch: number; distance: number; pan: THREE.Vector3 }

export function createCameraRig(canvas: HTMLCanvasElement) {
  const camera = new THREE.PerspectiveCamera(48, 1, .25, 2000);
  const views: Record<CameraMode, View> = {
    chase: { yaw: .6, pitch: .37, distance: 16, pan: new THREE.Vector3() },
    diorama: { yaw: Math.PI / 4, pitch: Math.atan(1 / Math.sqrt(2)), distance: 180, pan: new THREE.Vector3() },
    tactical: { yaw: 0, pitch: Math.PI / 2 - .015, distance: 180, pan: new THREE.Vector3() },
  };
  let mode: CameraMode = 'chase';
  const followsBoat: Record<CameraMode, boolean> = { chase: true, diorama: true, tactical: false };
  let initialized = false;
  let pointer: { id: number; x: number; y: number; pan: boolean } | null = null;
  const focus = new THREE.Vector3();
  const home = new THREE.Vector3();
  const smoothPan = new THREE.Vector3();
  let smoothDistance = views.chase.distance, smoothYaw = views.chase.yaw, smoothPitch = views.chase.pitch;
  let lastUpdate = performance.now();

  function pointerDown(event: PointerEvent) {
    if (event.button > 2) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, pan: event.button !== 0 || event.shiftKey };
    canvas.setPointerCapture(event.pointerId);
    canvas.focus({ preventScroll: true }); event.preventDefault();
    canvas.style.cursor = pointer.pan ? 'move' : 'grabbing';
  }
  function pointerMove(event: PointerEvent) {
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
    pointer.x = event.clientX; pointer.y = event.clientY;
    const view = views[mode];
    if (pointer.pan || event.shiftKey) {
      const scale = view.distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 2 / Math.max(canvas.clientHeight, 1);
      view.pan.add(panOffset(dx, dy, view.yaw, scale));
    } else {
      view.yaw -= dx * .006;
      view.pitch = THREE.MathUtils.clamp(view.pitch + dy * .005, .035, Math.PI / 2 - .015);
    }
    event.preventDefault();
  }
  function pointerUp(event: PointerEvent) {
    if (pointer?.id !== event.pointerId) return;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    pointer = null; canvas.style.cursor = 'grab';
  }
  function wheel(event: WheelEvent) {
    event.preventDefault();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1);
    views[mode].distance = THREE.MathUtils.clamp(views[mode].distance * Math.exp(delta * .0015), 4, 180);
  }
  function reset() { views[mode].pan.set(0, 0, 0); followsBoat[mode] = true; }
  const contextMenu = (event: Event) => event.preventDefault();
  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('pointercancel', pointerUp);
  canvas.addEventListener('wheel', wheel, { passive: false });
  canvas.addEventListener('dblclick', reset);
  canvas.addEventListener('contextmenu', contextMenu);
  canvas.style.touchAction = 'none'; canvas.style.cursor = 'grab';

  return {
    camera,
    reset,
    resize(width: number, height: number) { camera.aspect = width / height; camera.updateProjectionMatrix(); },
    update(state: BoatState, nextMode: CameraMode, _dt: number, settings: SailingSettings, course?: RenderCourse | null) {
      // Navigation remains live while sailing is paused, without advancing simulation time.
      const now = performance.now();
      const delta = Math.min(.05, Math.max(1 / 240, (now - lastUpdate) / 1000)); lastUpdate = now;
      const ease = 1 - Math.exp(-delta * 9);
      if (mode !== nextMode) { mode = nextMode; pointer = null; }
      const view = views[mode];
      home.set(state.position.x, .75, state.position.z);
      if (mode === 'tactical' && course && !followsBoat[mode]) {
        home.set((course.startPin.x + course.committee.x + course.windward.x * 2) / 4, 0, (course.startPin.z + course.committee.z + course.windward.z * 2) / 4);
      }
      if (!initialized) {
        focus.copy(home); smoothPan.copy(view.pan); smoothYaw = view.yaw; smoothPitch = view.pitch; smoothDistance = view.distance;
      }
      focus.lerp(home, ease); smoothPan.lerp(view.pan, ease);
      smoothYaw += (view.yaw - smoothYaw) * ease;
      smoothPitch += (view.pitch - smoothPitch) * ease;
      smoothDistance += (view.distance - smoothDistance) * ease;
      const target = focus.clone().add(smoothPan);
      target.y = Math.max(target.y, getTerrainHeight(target.x, target.z) + .8);
      const desired = orbitPosition(target, smoothYaw, smoothPitch, smoothDistance);
      if (!initialized) camera.position.copy(desired);
      else camera.position.lerp(desired, ease);
      const wind = sampleWind(camera.position.x, camera.position.z, state.time, settings);
      const wave = getWaveHeight(camera.position.x, camera.position.z, state.time, wind.speed / KNOTS_TO_MPS, wind.direction);
      clampCameraToSurface(camera.position, wave.height, getTerrainHeight(camera.position.x, camera.position.z));
      camera.lookAt(target);
      const fov = mode === 'tactical' ? 100 : mode === 'diorama' ? 50 : 48;
      camera.fov += (fov - camera.fov) * ease;
      camera.updateProjectionMatrix();
      initialized = true;
    },
    dispose() {
      canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerup', pointerUp); canvas.removeEventListener('pointercancel', pointerUp);
      canvas.removeEventListener('wheel', wheel); canvas.removeEventListener('dblclick', reset); canvas.removeEventListener('contextmenu', contextMenu);
    },
  };
}
