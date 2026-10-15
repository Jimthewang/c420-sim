import type { BoatState, CameraMode, Telemetry } from './physics/types';

export interface Actions {
  start(): void;
  pause(): void;
  reset(): void;
  camera(): void;
  settings(): void;
  help(): void;
  debug(): void;
  sheet(value: number): void;
}

const helmIcon = `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M15 3v23M12 6 3 23h9ZM18 8l10 15H18Z"/><path d="M3 27h25l-4 3H8Z"/></svg>`;

export function createUI(actions: Actions) {
  const app = document.querySelector<HTMLDivElement>('#app')!;
  app.innerHTML = `
    <header class="identity"><span class="brand-mark">${helmIcon}</span><div><span class="brand-name">C420<span class="brand-divider">/</span><span class="brand-subtitle">Free sail</span></span><span class="session-label"><i></i> Open water · College rig</span></div></header>

    <aside class="wind-panel" aria-label="Wind instruments">
      <div class="compass" aria-hidden="true"><span class="north">N</span><span class="east">E</span><span class="south">S</span><span class="west">W</span><div id="wind-needle" class="wind-needle"><span></span></div><div id="boat-needle" class="boat-needle"></div></div>
      <div class="wind-reading"><span>True wind</span><strong><b id="wind-speed">10.0</b><small>kn</small></strong><span id="wind-from">from 000° N</span></div>
    </aside>

    <section id="welcome" class="welcome">
      <div class="welcome-copy"><span class="intro-label">Take the helm</span><h1>Find your wind.</h1><p>A Club 420, open water, and you.<br>Learn the feel of the boat, one adjustment at a time.</p>
      <div class="first-controls"><div><span class="key-pair"><kbd>A</kbd><kbd>D</kbd></span><span>Steer the boat</span></div><div><span class="key-pair"><kbd>W</kbd><kbd>S</kbd></span><span>Trim & ease the mainsail</span></div></div>
      <button id="launch" class="primary">Start sailing <span aria-hidden="true">↗</span></button><span class="launch-hint">or press Enter · Keyboard recommended</span>
      <p class="phase-note">Phase 1 · Free sailing<br>Your jib trims itself. Racing comes in a later phase.</p></div>
    </section>

    <section id="sailing-hud" hidden>
      <div class="sailing-message" role="status" aria-live="polite"><span id="sail-status-dot"></span><span id="sail-message">Sails drawing</span></div>
      <section class="instruments" aria-label="Boat instruments"><div class="speed-readout"><span>Boat speed</span><strong><b id="boat-speed">0.0</b><small>kn</small></strong></div><div class="heading-readout"><span>Heading</span><strong id="boat-heading">090°</strong><span id="point-of-sail">Beam reach</span></div></section>
      <section class="sheet-panel" aria-label="Mainsheet control"><div class="sheet-header"><span>Mainsheet</span><span id="sheet-value">50%</span></div><label class="sr-only" for="main-sheet">Mainsheet: left to ease, right to trim</label><input id="main-sheet" type="range" min="0" max="100" value="50" step="1"/><div class="sheet-labels"><span><kbd>S</kbd> Ease</span><span>Trim <kbd>W</kbd></span></div></section>
    </section>

    <nav class="toolbar" aria-label="Sailing controls"><button id="camera-button" title="Change camera (C)"><kbd>C</kbd><span id="camera-label">Chase</span></button><button id="settings-button" aria-expanded="false" aria-controls="settings-shell" title="Open tuning (G)"><kbd>G</kbd> Tune</button><button id="help-button" aria-expanded="false" aria-controls="help-panel" title="Controls (H)"><kbd>H</kbd> Help</button><button id="pause-button" title="Pause (Escape)"><kbd>Esc</kbd><span id="pause-label">Pause</span></button></nav>
    <div id="settings-shell" class="settings-shell" hidden><div class="panel-heading"><h2>Wind & boat</h2><button id="settings-close" aria-label="Close settings">×</button></div><p>Changes take effect on the water.</p><div id="settings-mount"></div><p class="settings-note">College rig · spinnaker off<br>Heel and capsize arrive in Phase 2.</p></div>

    <aside id="debug-panel" class="debug-panel" hidden aria-label="Physics readout"><div class="panel-heading"><h2>Physics readout</h2><button id="debug-close" aria-label="Close physics readout">×</button></div><div id="debug-values"></div><p>VMG = speed made directly upwind.<br>Leeway = sideways drift through the water.<br>AoA = angle between the airflow and sail.</p><p class="debug-limit">Heel / righting moments: Phase 2</p></aside>

    <dialog id="help-panel" class="help-panel"><div class="panel-heading"><div><span class="intro-label">At the helm</span><h2>A little sail knowledge.</h2></div><button id="help-close" aria-label="Close controls help">×</button></div><p>Keep the wind to one side. Ease the mainsail until it flutters, then trim in slightly so it fills.</p><dl class="help-controls"><div><dt><kbd>A</kbd> / <kbd>←</kbd></dt><dd>Turn to port (left)</dd></div><div><dt><kbd>D</kbd> / <kbd>→</kbd></dt><dd>Turn to starboard (right)</dd></div><div><dt><kbd>W</kbd> / <kbd>S</kbd></dt><dd>Trim in / ease the mainsail</dd></div><div><dt><kbd>C</kbd></dt><dd>Chase / overhead camera</dd></div><div><dt><kbd>G</kbd></dt><dd>Wind & boat settings</dd></div><div><dt><kbd>F3</kbd></dt><dd>Detailed physics readout</dd></div><div><dt><kbd>Esc</kbd></dt><dd>Pause / resume</dd></div><div><dt><kbd>R</kbd></dt><dd>Reset to a beam reach</dd></div><div><dt><kbd>H</kbd></dt><dd>This help</dd></div></dl><p class="help-tip"><strong>Lost your speed?</strong> You cannot sail straight into the wind. Turn away until the sail fills. A stopped boat has very little steerage; press R for a fresh start.</p><p class="phase-note">Phase 1: centerboard fixed down, jib automatic, boat held upright. No sound or racing yet.</p><button id="help-done" class="primary">Back to the water</button></dialog>

    <div id="pause-screen" class="pause-screen" hidden><div><span class="intro-label">Take a breath</span><h2>On hold.</h2><p>The wind will wait.</p><button id="resume" class="primary">Resume sailing</button><button id="restart" class="text-button">Start a fresh sail <span>R</span></button></div></div>
    <div id="error-screen" class="error-screen" hidden role="alert"><h1>The water couldn’t load.</h1><p id="error-message"></p><button id="reload" class="primary">Try again</button></div>
    <span class="build-label">C420 / Phase 1</span>
  `;

  const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  const onClick = (id: string, handler: () => void) => element(id).addEventListener('click', handler);
  onClick('launch', actions.start);
  onClick('pause-button', actions.pause);
  onClick('resume', actions.pause);
  onClick('restart', actions.reset);
  onClick('camera-button', actions.camera);
  onClick('settings-button', actions.settings);
  onClick('settings-close', actions.settings);
  onClick('help-button', actions.help);
  onClick('help-close', actions.help);
  onClick('help-done', actions.help);
  onClick('debug-close', actions.debug);
  onClick('reload', () => location.reload());
  const sheet = element<HTMLInputElement>('main-sheet');
  sheet.addEventListener('input', () => actions.sheet(Number(sheet.value) / 100));
  sheet.addEventListener('pointerup', () => element<HTMLCanvasElement>('ocean').focus({ preventScroll: true }));
  const help = element<HTMLDialogElement>('help-panel');
  help.addEventListener('cancel', event => { event.preventDefault(); actions.help(); });

  const readouts = ['True wind', 'Apparent wind', 'Apparent angle', 'Main AoA', 'Jib AoA', 'Leeway', 'VMG upwind', 'Drive force', 'Side force', 'Hull drag'];
  element('debug-values').innerHTML = readouts.map((name, i) => `<div class="debug-row"><span>${name}</span><output id="debug-${i}"></output></div>`).join('');
  let previousMessage = '';

  return {
    mount: element('settings-mount'),
    showStarted() { element('welcome').hidden = true; element('sailing-hud').hidden = false; },
    showPaused(paused: boolean) { element('pause-screen').hidden = !paused; element('pause-label').textContent = paused ? 'Resume' : 'Pause'; },
    showSettings(open: boolean) { element('settings-shell').hidden = !open; element('settings-button').setAttribute('aria-expanded', String(open)); },
    showDebug(open: boolean) { element('debug-panel').hidden = !open; },
    showHelp(open: boolean) { if (open) help.showModal(); else help.close(); element('help-button').setAttribute('aria-expanded', String(open)); },
    setCamera(mode: CameraMode) { element('camera-label').textContent = mode === 'chase' ? 'Chase' : 'Overhead'; },
    showError(message: string) { element('error-message').textContent = message; element('error-screen').hidden = false; },
    update(state: BoatState, data: Telemetry, camera: CameraMode) {
      element('boat-speed').textContent = data.speedKnots.toFixed(1);
      element('boat-heading').textContent = `${Math.round(data.headingDeg).toString().padStart(3, '0')}°`;
      element('wind-speed').textContent = data.trueWindKnots.toFixed(1);
      const direction = ((Math.round(data.trueWindDirectionDeg) % 360) + 360) % 360;
      const cardinal = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(direction / 45) % 8];
      element('wind-from').textContent = `from ${direction.toString().padStart(3, '0')}° ${cardinal}`;
      element('wind-needle').style.transform = `rotate(${data.trueWindDirectionDeg + 180}deg)`;
      element('boat-needle').style.transform = `rotate(${data.headingDeg}deg)`;
      element('wind-needle').title = 'Arrow points downwind';
      const angle = Math.abs(data.trueWindAngleDeg);
      element('point-of-sail').textContent = angle < 40 ? 'Head to wind' : angle < 60 ? 'Close hauled' : angle < 80 ? 'Close reach' : angle < 110 ? 'Beam reach' : angle < 155 ? 'Broad reach' : 'Running';
      sheet.value = String(Math.round(state.mainSheet * 100));
      element('sheet-value').textContent = `${Math.round(state.mainSheet * 100)}%`;
      const status = data.main.status;
      const message = angle < 35 ? 'Head to wind · bear away to fill the sails' : status === 'luffing' ? 'Mainsail luffing · trim in or bear away' : status === 'stalled' && angle > 150 && state.mainSheet < 0.15 ? 'Running · wind pushing on the sails' : status === 'stalled' ? 'Mainsail stalled · ease the sheet' : 'Sails drawing';
      if (message !== previousMessage) {
        element('sail-message').textContent = message;
        element('sail-status-dot').dataset.status = status;
        previousMessage = message;
      }
      if (!element('debug-panel').hidden) {
        const values = [
          `${data.trueWindKnots.toFixed(1)} kn / ${direction}°`,
          `${data.apparentWindKnots.toFixed(1)} kn`,
          `${data.apparentWindAngleDeg.toFixed(1)}°`,
          `${(data.main.angleOfAttack * 180 / Math.PI).toFixed(1)}° · ${data.main.status}`,
          `${(data.jib.angleOfAttack * 180 / Math.PI).toFixed(1)}° · ${data.jib.status}`,
          `${data.leewayDeg.toFixed(1)}°`, `${data.vmgKnots.toFixed(2)} kn`,
          `${data.driveForce.toFixed(0)} N`, `${data.sideForce.toFixed(0)} N`, `${data.hullDrag.toFixed(0)} N`,
        ];
        values.forEach((value, i) => { element(`debug-${i}`).textContent = value; });
      }
      app.dataset.camera = camera;
    },
  };
}
