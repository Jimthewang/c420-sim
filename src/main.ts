import GUI from 'lil-gui';
import { BOAT_CONFIG } from './config/boat';
import { DEFAULT_SETTINGS, DEG_TO_RAD, ENVIRONMENT_CONFIG } from './config/environment';
import { createBoatState, getTelemetry, stepBoat } from './physics/sailing';
import type { CameraMode } from './physics/types';
import { createWorld } from './render/world';
import { createUI } from './ui';
import './style.css';

const settings = { ...DEFAULT_SETTINGS };
let boat = createBoatState();
let cameraMode: CameraMode = 'chase';
let started = false;
let paused = false;
let helpOpen = false;
let settingsOpen = false;
let debugOpen = false;
let accumulator = 0;
let previousFrame = 0;
let hudTimer = 0;
const keys = new Set<string>();
const canvas = document.querySelector<HTMLCanvasElement>('#ocean')!;

function clearInput() {
  keys.clear();
  boat.rudder = 0;
}

function start() {
  if (!started) boat.heading = (BOAT_CONFIG.initialHeadingDeg + settings.windDirectionDeg) * DEG_TO_RAD;
  started = true;
  paused = false;
  ui.showStarted();
  ui.showPaused(false);
  canvas.focus({ preventScroll: true });
}

function togglePause() {
  if (!started || helpOpen) return;
  paused = !paused;
  clearInput();
  accumulator = 0;
  ui.showPaused(paused);
}

function reset() {
  boat = createBoatState();
  boat.heading += settings.windDirectionDeg * DEG_TO_RAD;
  clearInput();
  accumulator = 0;
  if (helpOpen) { helpOpen = false; ui.showHelp(false); }
  start();
}

const ui = createUI({
  start,
  pause: togglePause,
  reset,
  camera() {
    cameraMode = cameraMode === 'chase' ? 'tactical' : 'chase';
    ui.setCamera(cameraMode);
  },
  settings() {
    settingsOpen = !settingsOpen;
    clearInput();
    ui.showSettings(settingsOpen);
  },
  help() {
    helpOpen = !helpOpen;
    clearInput();
    accumulator = 0;
    ui.showHelp(helpOpen);
  },
  debug() { debugOpen = !debugOpen; ui.showDebug(debugOpen); },
  sheet(value) { boat.mainSheet = value; },
});

const gui = new GUI({ container: ui.mount, title: 'Wind & boat', width: 250 });
gui.add(settings, 'windSpeedKnots', ENVIRONMENT_CONFIG.windSpeedMinKnots, ENVIRONMENT_CONFIG.windSpeedMaxKnots, 1).name('Wind (knots)');
gui.add(settings, 'windDirectionDeg', 0, 359, 1).name('Wind from (°)');
gui.add(settings, 'crewWeightKg', ENVIRONMENT_CONFIG.crewWeightMinKg, ENVIRONMENT_CONFIG.crewWeightMaxKg, 5).name('Crew weight (kg)');
gui.add(settings, 'shifts').name('Wind shifts');
gui.add(settings, 'gusts').name('Puffs & lulls');

function editingControl(target: EventTarget | null) {
  return target instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);
}

const sailingKeys = ['a', 'd', 'w', 's', 'arrowleft', 'arrowright'];
window.addEventListener('keydown', event => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key === 'escape') {
    if (helpOpen) return; // The native dialog's cancel event closes help.
    event.preventDefault();
    if (settingsOpen) { settingsOpen = false; ui.showSettings(false); clearInput(); return; }
    if (!event.repeat) togglePause();
    return;
  }
  if (editingControl(event.target)) return;
  if (key === 'enter' && !started) { event.preventDefault(); start(); return; }
  if (sailingKeys.includes(key)) {
    event.preventDefault();
    if (started && !paused && !helpOpen) keys.add(key);
    return;
  }
  if (event.repeat) return;
  if (key === 'r') { event.preventDefault(); reset(); }
  else if (key === 'c') document.querySelector<HTMLButtonElement>('#camera-button')!.click();
  else if (key === 'g') document.querySelector<HTMLButtonElement>('#settings-button')!.click();
  else if (key === 'h') document.querySelector<HTMLButtonElement>('#help-button')!.click();
  else if (key === 'f3') { event.preventDefault(); debugOpen = !debugOpen; ui.showDebug(debugOpen); }
});
window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => {
  clearInput();
  if (started && !paused) { paused = true; ui.showPaused(true); }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearInput();
    if (started) { paused = true; ui.showPaused(true); }
    accumulator = 0;
  }
});

try {
  const world = createWorld(canvas);
  window.addEventListener('resize', world.resize);
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    paused = true;
    ui.showError('The browser lost its graphics connection. Close a few other tabs, then try again.');
  });

  function frame(timestamp: number) {
    const dt = previousFrame === 0 ? 0 : Math.min((timestamp - previousFrame) / 1000, ENVIRONMENT_CONFIG.maxFrameDelta);
    previousFrame = timestamp;
    const running = started && !paused && !helpOpen;
    if (running) {
      accumulator += dt;
      while (accumulator >= ENVIRONMENT_CONFIG.fixedTimeStep) {
        const step = ENVIRONMENT_CONFIG.fixedTimeStep;
        const steer = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
        const trim = Number(keys.has('w')) - Number(keys.has('s'));
        const mainSheet = Math.min(1, Math.max(0, boat.mainSheet + trim * BOAT_CONFIG.mainSheetRatePerSecond * step));
        stepBoat(boat, { steer, mainSheet }, settings, step);
        accumulator -= step;
      }
    } else accumulator = 0;
    const telemetry = getTelemetry(boat, settings);
    boat.main = telemetry.main;
    boat.jib = telemetry.jib;
    world.render(boat, telemetry, settings, cameraMode, running || !started ? dt : 0);
    hudTimer += dt;
    if (hudTimer >= 0.1 || !started || paused) {
      ui.update(boat, telemetry, cameraMode);
      hudTimer = 0;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
} catch (error) {
  console.error('Unable to initialize C420 renderer:', error);
  ui.showError('This game needs WebGL 2, the browser’s 3D graphics support. Try a recent Chrome or Safari with graphics acceleration enabled.');
}
