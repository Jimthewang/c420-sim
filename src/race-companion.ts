import type { Telemetry } from './physics/types';
import type { RaceState } from './game/race';
import { createRaceAnnouncements, getRacePresentation } from './game/presentation';
import type { SailingDebrief } from './game/sailing-log';
import { createCourseChart } from './render/race-chart';

const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const compass = (value: number) => `${String(Math.round(value) % 360).padStart(3, '0')}°`;

export function createRaceCompanion() {
  const panel = element('race-companion'), body = element('chart-body'), toggle = element<HTMLButtonElement>('chart-toggle');
  const chart = createCourseChart(element<HTMLCanvasElement>('course-chart'));
  const announcements = createRaceAnnouncements();
  const desktop = window.matchMedia('(min-width: 1100px)');
  let expanded = desktop.matches, progressKey = '', lastAnnouncement = -1;
  function setExpanded(value: boolean) {
    expanded = value; body.hidden = !value; toggle.setAttribute('aria-expanded', String(value));
    toggle.textContent = value ? 'Hide · M' : 'Chart · M';
    panel.dataset.expanded = String(value);
  }
  setExpanded(expanded);
  desktop.addEventListener('change', event => setExpanded(event.matches));
  toggle.addEventListener('click', () => { setExpanded(!expanded); element('ocean').focus({ preventScroll: true }); });
  function update(race: RaceState, telemetry: Telemetry, visible: boolean, showCourse: boolean, difficulty: string) {
    const presentation = getRacePresentation(race, telemetry);
    panel.hidden = !visible || !showCourse || difficulty === 'realistic';
    if (!panel.hidden) {
      chart.record(race);
      if (expanded) chart.update(race, telemetry);
      element('chart-title').textContent = `Course · lap ${presentation.lap}/${presentation.totalLaps}`;
      element('chart-caption').textContent = '▲ You · colored boats: fleet · coral: your track';
      const key = presentation.legs.map(leg => `${leg.id}:${leg.status}`).join(',');
      if (key !== progressKey) {
        progressKey = key;
        const strip = element('race-leg-strip'); strip.replaceChildren();
        for (const leg of presentation.legs) {
          const span = document.createElement('span'); span.textContent = { start: 'Start', windward: 'Beat', gate: 'Run', finish: 'Finish' }[leg.id]; span.title = leg.label; span.setAttribute('aria-label', leg.label);
          span.className = `is-${leg.status}`;
          if (leg.status === 'current') span.setAttribute('aria-current', 'step');
          strip.append(span);
        }
      }
      const reading = element('navigation-reading');
      const navigation = presentation.navigation, line = presentation.startLine;
      let primary = presentation.stageLabel, secondary = '';
      if (line && difficulty === 'beginner') {
        primary = line.signedDistanceM < 0 ? `${Math.abs(line.signedDistanceM).toFixed(0)} m over the line` : `${line.signedDistanceM.toFixed(0)} m below the line`;
        secondary = line.etaSeconds !== null ? `Est. ${line.etaSeconds < 120 ? `${Math.ceil(line.etaSeconds)} s` : '> 2 min'} to line at current velocity` : 'No projected crossing at current velocity';
      } else if (navigation) {
        primary = `${presentation.stageLabel} · ${Math.round(navigation.distanceM)} m`;
        secondary = `${compass(navigation.bearingDeg)} bearing · ${navigation.closingSpeedKnots.toFixed(1)} kn closing`;
      }
      reading.replaceChildren();
      const strong = document.createElement('strong'); strong.className = 'navigation-primary'; strong.textContent = primary;
      const detail = document.createElement('span'); detail.className = 'navigation-secondary'; detail.textContent = secondary;
      reading.append(strong, detail);
    }
    const announcement = announcements.update(race, telemetry), banner = element('race-announcement');
    banner.hidden = !visible || !announcement;
    if (announcement && announcement.id !== lastAnnouncement) {
      lastAnnouncement = announcement.id;
      banner.dataset.kind = announcement.kind;
      element('announcement-kicker').textContent = announcement.kind === 'warning' ? 'Heads up' : announcement.kind === 'success' ? 'Nicely sailed' : 'On the water';
      element('announcement-title').textContent = announcement.title;
      element('announcement-detail').textContent = announcement.detail;
    }
  }
  return { update, toggle() { if (!panel.hidden) toggle.click(); } };
}

export function showSailingDebrief(debrief: SailingDebrief) {
  const panel = element('sailing-debrief'); panel.replaceChildren(); panel.hidden = debrief.samples.length < 2;
  if (panel.hidden) return;
  const heading = document.createElement('h3'); heading.className = 'debrief-heading'; heading.textContent = 'Your race, in motion.';
  const layout = document.createElement('div'); layout.className = 'debrief-layout';
  const canvas = document.createElement('canvas'); canvas.className = 'debrief-chart'; canvas.width = 960; canvas.height = 200;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `Boat speed after your legal start. Peak ${debrief.maxSpeedKnots.toFixed(1)} knots; average ${debrief.meanSpeedKnots.toFixed(1)} knots across ${Math.round(debrief.duration)} seconds.`);
  const metrics = document.createElement('div'); metrics.className = 'debrief-metrics';
  const values = [
    ['Peak speed', debrief.maxSpeedKnots.toFixed(1), 'knots'],
    ['Average speed', debrief.meanSpeedKnots.toFixed(1), 'knots'],
    ['Distance sailed', debrief.distanceM >= 1000 ? (debrief.distanceM / 1000).toFixed(2) : Math.round(debrief.distanceM).toString(), debrief.distanceM >= 1000 ? 'kilometers' : 'meters'],
    ['Maneuvers', `${debrief.tacks} / ${debrief.gybes}`, 'tacks / gybes'],
  ];
  for (const [label, value, unit] of values) {
    const metric = document.createElement('div'); metric.className = 'debrief-metric';
    const name = document.createElement('small'); name.textContent = label;
    const number = document.createElement('strong'); number.textContent = value;
    const suffix = document.createElement('span'); suffix.textContent = unit;
    metric.append(name, number, suffix); metrics.append(metric);
  }
  const note = document.createElement('p'); note.className = 'debrief-note'; note.textContent = 'Speed trace from your legal start to your finish or the time limit. This race only.';
  layout.append(canvas, metrics); panel.append(heading, layout, note);
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  ctx.scale(2, 2);
  const width = 480, height = 100, left = 32, right = 12, top = 16, bottom = 24;
  const max = Math.max(2, Math.ceil(debrief.maxSpeedKnots / 2) * 2);
  const x = (time: number) => left + time / Math.max(1, debrief.duration) * (width - left - right);
  const y = (speed: number) => height - bottom - speed / max * (height - top - bottom);
  ctx.fillStyle = '#fffdf7'; ctx.fillRect(0, 0, width, height);
  ctx.font = '10px Arial'; ctx.fillStyle = '#424742'; ctx.textAlign = 'right';
  for (const level of [0, max / 2, max]) {
    ctx.strokeStyle = '#14141424'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(left, y(level)); ctx.lineTo(width - right, y(level)); ctx.stroke();
    ctx.fillText(`${level}`, left - 7, y(level) + 3);
  }
  ctx.textAlign = 'left'; ctx.fillText('kn', 6, 12);
  const trace = () => { ctx.beginPath(); debrief.samples.forEach((sample, i) => i ? ctx.lineTo(x(sample.time), y(sample.speedKnots)) : ctx.moveTo(x(sample.time), y(sample.speedKnots))); };
  trace(); ctx.lineTo(x(debrief.duration), y(0)); ctx.lineTo(x(0), y(0)); ctx.closePath(); ctx.fillStyle = '#2ec4b633'; ctx.fill();
  trace(); ctx.strokeStyle = '#16776f'; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.fillStyle = '#424742'; ctx.textAlign = 'left'; ctx.fillText('Your start', left, height - 7);
  ctx.textAlign = 'right'; ctx.fillText(`${Math.floor(debrief.duration / 60)}:${String(Math.floor(debrief.duration % 60)).padStart(2, '0')}`, width - right, height - 7);
}
