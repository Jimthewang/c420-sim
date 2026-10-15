import { createBoatState, sampleWind } from '../physics/sailing';
import { DEG_TO_RAD, ENVIRONMENT_CONFIG as E } from '../config/environment';
import { BOAT_CONFIG as B } from '../config/boat';
import type { BoatState, SailingSettings, Vec2 } from '../physics/types';
import { RACE_CONFIG as C } from './config';
import { resolveWorldCollisions, type StaticObstacle, type CollisionContact } from '../physics/collisions';
import { configureTerrainCourse } from '../world/terrain';

export interface RaceOptions {
  mode: 'race' | 'series' | 'free' | 'start' | 'time-trial' | 'tutorial';
  difficulty: 'beginner' | 'intermediate' | 'realistic';
  aiCount: number;
  courseLength: number;
  laps: number;
}
export interface Course {
  startPin: Vec2; committee: Vec2; windward: Vec2; gatePort: Vec2; gateStarboard: Vec2;
  windDirectionDeg: number; length: number;
}
export type RacePhase = 'free' | 'prestart' | 'countdown' | 'racing' | 'finished';
export type RaceStage = 'start' | 'windward' | 'gate' | 'finish' | 'done';
export interface Racer {
  id: string; name: string; color: number; isPlayer: boolean; state: BoatState;
  started: boolean; ocs: boolean; wasOcs: boolean; stage: RaceStage;
  lap: number; roundings: number; markPhase: number; gateSide: number;
  finishedAt: number | null; dnf: boolean; penalties: number; penaltyTurns: number;
  takingPenalty: boolean; penaltyProgress: number; message: string; messageUntil: number;
  previousPosition: Vec2; previousHeading: number;
}
export interface RaceEvent { type: 'horn' | 'start' | 'finish' | 'rounding' | 'penalty' | 'ocs' | 'practice-restart'; time: number; racerId?: string; message?: string }
export interface RaceState {
  options: RaceOptions; settings: SailingSettings; course: Course; racers: Racer[];
  phase: RacePhase; time: number; countdown: number; raceTime: number; startTime: number | null;
  timeLimit: number; practiceStarts: number; practiceRestartAt: number | null;
  events: RaceEvent[]; contacts: Map<string, { at: number; active: boolean; asternId: string | null }>;
}
export interface Standing { id: string; name: string; place: number; elapsed: number | null; penalties: number; ocs: boolean; finished: boolean; dnf: boolean }
export interface RaceView {
  phase: RacePhase; countdown: number; elapsed: number; standings: Standing[]; place: number;
  ocs: boolean; message: string; nextTarget: Vec2 | null; target: Vec2 | null; targetLabel: string;
  course: Course; lap: number; roundings: number; penalties: number; penaltyTurns: number;
  playerFinished: boolean; allFinished: boolean; practiceStarts: number; timeLimit: number;
}
const colors = [0xf4eee1, 0x397b99, 0xd77840, 0x6b8460, 0x9d6c9b, 0xb8a04c, 0x417e79, 0xb66363, 0x6c7baf];
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const dot = (a: Vec2, b: Vec2) => a.x * b.x + a.z * b.z;
const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
export function coursePoint(course: Course, across: number, upwind: number): Vec2 {
  const a = course.windDirectionDeg * DEG_TO_RAD;
  return { x: across * Math.cos(a) + upwind * Math.sin(a), z: across * Math.sin(a) - upwind * Math.cos(a) };
}
export function courseCoordinates(course: Course, point: Vec2): Vec2 {
  const a = course.windDirectionDeg * DEG_TO_RAD;
  return { x: point.x * Math.cos(a) + point.z * Math.sin(a), z: point.x * Math.sin(a) - point.z * Math.cos(a) };
}
/** Cross a finite segment in the direction of its supplied normal. */
export function crossedLine(previous: Vec2, current: Vec2, left: Vec2, right: Vec2, normal: Vec2): boolean {
  const a = dot({ x: previous.x - left.x, z: previous.z - left.z }, normal);
  const b = dot({ x: current.x - left.x, z: current.z - left.z }, normal);
  if (a > 0 || b <= 0 || b - a <= 1e-9) return false;
  const fraction = -a / (b - a);
  const crossing = { x: previous.x + (current.x - previous.x) * fraction - left.x, z: previous.z + (current.z - previous.z) * fraction - left.z };
  const segment = { x: right.x - left.x, z: right.z - left.z };
  const along = dot(crossing, segment) / dot(segment, segment);
  return along >= 0 && along <= 1;
}
/** A bounded hull outline, including the stem, beam and transom, in the boat's heading. */
function hullPoints(position: Vec2, heading: number): Vec2[] {
  const forward = { x: Math.sin(heading), z: -Math.cos(heading) }, right = { x: Math.cos(heading), z: Math.sin(heading) };
  return [[0, B.lengthM / 2], [B.beamM / 2, 0], [B.beamM * 0.345, -B.lengthM / 2], [-B.beamM * 0.345, -B.lengthM / 2], [-B.beamM / 2, 0]]
    .map(([across, along]) => ({ x: position.x + right.x * across + forward.x * along, z: position.z + right.z * across + forward.z * along }));
}
function hullUpwindExtent(racer: Racer, course: Course) {
  return Math.max(...hullPoints(racer.state.position, racer.state.heading).map(point => courseCoordinates(course, point).z));
}
function hullCrossedLine(racer: Racer, course: Course, normal: Vec2) {
  const previous = hullPoints(racer.previousPosition, racer.previousHeading), current = hullPoints(racer.state.position, racer.state.heading);
  return current.some((point, index) => crossedLine(previous[index], point, course.startPin, course.committee, normal));
}
function emit(race: RaceState, event: Omit<RaceEvent, 'time'>) {
  race.events.push({ ...event, time: race.time });
  if (race.events.length > 64) race.events.shift();
}
function say(race: RaceState, racer: Racer, message: string) { racer.message = message; racer.messageUntil = race.time + 7; }
export function createRace(options: RaceOptions, settings: SailingSettings): RaceState {
  const length = Math.max(60, options.courseLength);
  configureTerrainCourse(options.mode === 'free' ? null : { windDirectionDeg: settings.windDirectionDeg, length });
  const course: Course = { startPin: { x: 0, z: 0 }, committee: { x: 0, z: 0 }, windward: { x: 0, z: 0 }, gatePort: { x: 0, z: 0 }, gateStarboard: { x: 0, z: 0 }, windDirectionDeg: settings.windDirectionDeg, length };
  const count = Math.max(0, Math.min(8, Math.round(options.aiCount))) + 1;
  const halfLine = Math.max(C.minimumLineWidth, count * C.lineWidthPerBoat) / 2;
  course.startPin = coursePoint(course, -halfLine, 0); course.committee = coursePoint(course, halfLine, 0);
  course.windward = coursePoint(course, 0, length);
  course.gatePort = coursePoint(course, -C.gateWidth / 2, C.gateDistance);
  course.gateStarboard = coursePoint(course, C.gateWidth / 2, C.gateDistance);
  const racers: Racer[] = Array.from({ length: count }, (_, index) => {
    const state = createBoatState();
    state.position = coursePoint(course, (index - (count - 1) / 2) * 7, -24 - index * 6);
    state.heading = (settings.windDirectionDeg + 90) * DEG_TO_RAD;
    return { id: index === 0 ? 'player' : `ai-${index}`, name: index === 0 ? 'You' : `Boat ${index + 1}`, color: colors[index % colors.length], isPlayer: index === 0, state,
      started: false, ocs: false, wasOcs: false, stage: 'start', lap: 0, roundings: 0, markPhase: 0, gateSide: 1,
      finishedAt: null, dnf: false, penalties: 0, penaltyTurns: 0, takingPenalty: false, penaltyProgress: 0,
      message: '', messageUntil: 0, previousPosition: { ...state.position }, previousHeading: state.heading };
  });
  return { options: { ...options, laps: Math.max(1, Math.min(2, Math.round(options.laps))) }, settings, course, racers,
    phase: options.mode === 'free' || options.mode === 'tutorial' ? 'free' : 'prestart', time: 0, countdown: C.sequenceSeconds,
    raceTime: 0, startTime: null, timeLimit: C.raceTimeLimit,
    practiceStarts: 0, practiceRestartAt: null, events: [], contacts: new Map() };
}
function startGun(race: RaceState) {
  race.phase = 'racing'; race.countdown = 0; race.startTime = race.time; race.raceTime = 0;
  emit(race, { type: 'horn' }); emit(race, { type: 'start' });
  for (const racer of race.racers) {
    racer.ocs = hullUpwindExtent(racer, race.course) > 0;
    if (racer.ocs) { racer.wasOcs = true; say(race, racer, 'OCS · return below the line, then cross again'); emit(race, { type: 'ocs', racerId: racer.id }); }
    // The gun establishes a new crossing baseline, so an early crossing cannot count as a valid start.
    racer.previousPosition = { ...racer.state.position };
  }
}
export function beginSequence(race: RaceState) {
  if (race.phase === 'countdown' || race.phase === 'racing' || race.phase === 'finished' || race.options.mode === 'free') return;
  if (race.options.mode === 'time-trial') {
    race.phase = 'racing'; race.countdown = 0; race.startTime = null;
    for (const racer of race.racers) racer.ocs = hullUpwindExtent(racer, race.course) > 0;
    return;
  }
  race.phase = 'countdown'; race.countdown = C.sequenceSeconds; emit(race, { type: 'horn' });
}
export function startTutorialRounding(race: RaceState) {
  race.phase = 'racing'; race.startTime = race.time; race.raceTime = 0; race.countdown = 0;
  const racer = race.racers[0]; racer.started = true; racer.ocs = false; racer.stage = 'windward'; racer.markPhase = 0;
  racer.state = createBoatState(); racer.state.position = coursePoint(race.course, 48, race.course.length - 55);
  racer.state.heading = (race.course.windDirectionDeg - 50) * DEG_TO_RAD; racer.state.mainSheet = 1;
  racer.previousPosition = { ...racer.state.position }; racer.previousHeading = racer.state.heading;
}
export function requestPenaltyTurn(racer: Racer) {
  if (racer.penaltyTurns <= 0 || racer.takingPenalty) return;
  racer.takingPenalty = true; racer.penaltyProgress = 0; racer.previousHeading = racer.state.heading;
}
export const setPenaltyTurn = requestPenaltyTurn;
export function issuePenalty(race: RaceState, racer: Racer, reason: string) {
  if (racer.penaltyTurns >= C.maxPendingPenalties || racer.finishedAt !== null || racer.dnf) return;
  racer.penalties++; racer.penaltyTurns++; say(race, racer, `${reason} · sail one full penalty turn`);
  emit(race, { type: 'penalty', racerId: racer.id, message: reason });
}
function gateCross(previous: Vec2, current: Vec2, axis: 'x' | 'z', value: number, direction: number, min: number, max: number) {
  const other = axis === 'x' ? 'z' : 'x';
  const a = (previous[axis] - value) * direction, b = (current[axis] - value) * direction;
  if (a > 0 || b <= 0 || b - a < 1e-9) return false;
  const along = previous[other] + (current[other] - previous[other]) * (-a / (b - a));
  return along >= min && along <= max;
}
function markComplete(race: RaceState, racer: Racer, label: string) {
  racer.roundings++; racer.markPhase = 0; say(race, racer, `${label} clear`); emit(race, { type: 'rounding', racerId: racer.id, message: label });
}
function updateProgress(race: RaceState, racer: Racer) {
  const course = race.course, previous = courseCoordinates(course, racer.previousPosition), current = courseCoordinates(course, racer.state.position);
  const upwind = coursePoint(course, 0, 1), downwind = { x: -upwind.x, z: -upwind.z };
  if (!racer.started) {
    if (racer.ocs && hullUpwindExtent(racer, course) < -C.returnClearance) { racer.ocs = false; say(race, racer, 'Clear · cross the start line toward the wind'); }
    if (!racer.ocs && hullCrossedLine(racer, course, upwind)) {
      racer.started = true; racer.stage = 'windward';
      if (race.options.mode === 'time-trial' && racer.isPlayer && race.startTime === null) { race.startTime = race.time; race.raceTime = 0; }
      say(race, racer, 'Good start · windward mark to port');
      if (race.options.mode === 'start' && racer.isPlayer) { race.practiceStarts++; race.practiceRestartAt = race.time + C.practiceRepeatDelay; }
    }
    return;
  }
  if (race.options.mode === 'start') return;
  if (racer.stage === 'windward') {
    if (racer.markPhase === 0 && gateCross(previous, current, 'z', course.length, 1, 0, C.roundingZone)) racer.markPhase = 1;
    else if (racer.markPhase === 1 && gateCross(previous, current, 'x', 0, -1, course.length, course.length + C.roundingZone)) racer.markPhase = 2;
    else if (racer.markPhase === 2 && gateCross(previous, current, 'z', course.length, -1, -C.roundingZone, 0)) { markComplete(race, racer, 'Windward mark'); racer.stage = 'gate'; }
    else if (racer.markPhase === 0 && gateCross(previous, current, 'z', course.length, 1, -C.roundingZone, 0)) say(race, racer, 'Wrong side · leave the windward mark to port');
  } else if (racer.stage === 'gate') {
    const halfGate = C.gateWidth / 2;
    if (racer.markPhase === 0 && gateCross(previous, current, 'z', C.gateDistance, -1, -halfGate, halfGate)) {
      if (racer.lap + 1 >= race.options.laps) { markComplete(race, racer, 'Leeward gate'); racer.lap++; racer.stage = 'finish'; }
      else { racer.markPhase = 1; racer.gateSide = current.x < 0 ? -1 : 1; }
    } else if (racer.markPhase === 1 && gateCross(previous, current, 'x', racer.gateSide * halfGate, racer.gateSide, C.gateDistance - C.roundingZone, C.gateDistance)) racer.markPhase = 2;
    else if (racer.markPhase === 2 && gateCross(previous, current, 'z', C.gateDistance, 1, racer.gateSide < 0 ? -halfGate - C.roundingZone : halfGate, racer.gateSide < 0 ? -halfGate : halfGate + C.roundingZone)) {
      markComplete(race, racer, 'Leeward gate'); racer.lap++; racer.stage = 'windward';
    }
  } else if (racer.stage === 'finish' && hullCrossedLine(racer, course, downwind)) {
    if (racer.penaltyTurns > 0) { say(race, racer, 'Penalty still outstanding · complete the turn, then recross'); return; }
    racer.finishedAt = race.raceTime; racer.stage = 'done'; say(race, racer, 'Finished'); emit(race, { type: 'finish', racerId: racer.id });
  }
}
function checkContacts(race: RaceState, racers: Racer[], actualContacts?: CollisionContact[]) {
  for (let i = 0; i < racers.length; i++) for (let j = i + 1; j < racers.length; j++) {
    const a = racers[i], b = racers[j]; if (a.finishedAt !== null || b.finishedAt !== null || a.dnf || b.dnf) continue;
    const actual = actualContacts?.find(contact => contact.kind === 'boat' && contact.a === a.id && contact.b === b.id);
    if (actualContacts && !actual) continue;
    const positionA = actual?.positionA ?? a.state.position, positionB = actual?.positionB ?? b.state.position;
    const headingA = actual?.headingA ?? a.state.heading, headingB = actual?.headingB ?? b.state.heading;
    const key = `${a.id}/${b.id}`, old = race.contacts.get(key), separation = distance(positionA, positionB);
    if (separation > C.separationDistance) { if (old) { old.active = false; old.asternId = null; } continue; }
    const wind = sampleWind(positionA.x, positionA.z, a.state.time, race.settings);
    const aStarboard = Math.sin(wind.direction - headingA) > 0;
    const bStarboard = Math.sin(wind.direction - headingB) > 0;
    const contact = old ?? { at: -Infinity, active: false, asternId: null };
    // Remember a clear-astern approach through the hull overlap created by a rear-end collision.
    // A boat moving alongside establishes overlap and returns to the windward/leeward rule.
    const heading = Math.atan2(Math.sin(headingA) + Math.sin(headingB), Math.cos(headingA) + Math.cos(headingB));
    const dx = positionA.x - positionB.x, dz = positionA.z - positionB.z;
    const along = dx * Math.sin(heading) - dz * Math.cos(heading), across = dx * Math.cos(heading) + dz * Math.sin(heading);
    if (aStarboard !== bStarboard || Math.cos(headingA - headingB) <= 0 || Math.abs(across) >= B.beamM) contact.asternId = null;
    else if (Math.abs(along) >= B.lengthM) contact.asternId = along > 0 ? b.id : a.id;
    race.contacts.set(key, contact);
    if ((!actual && separation > C.contactDistance) || contact.active || race.time - contact.at < C.incidentCooldown) continue;
    let giveWay: Racer;
    if (aStarboard !== bStarboard) giveWay = aStarboard ? b : a;
    else if (contact.asternId) giveWay = contact.asternId === a.id ? a : b;
    else {
      const up = { x: Math.sin(wind.direction), z: -Math.cos(wind.direction) };
      giveWay = dot({ x: positionA.x - positionB.x, z: positionA.z - positionB.z }, up) > 0 ? a : b;
    }
    issuePenalty(race, giveWay, aStarboard !== bStarboard ? 'Port/starboard contact' : contact.asternId ? 'Clear-astern contact' : 'Windward/leeward contact');
    contact.at = race.time; contact.active = true;
  }
}
function courseObstacles(race: RaceState): StaticObstacle[] {
  if (race.options.mode === 'free' || race.options.mode === 'tutorial' && race.phase === 'free') return [];
  const c = race.course;
  return [
    ...(['startPin', 'windward', 'gatePort', 'gateStarboard'] as const).map(id => ({ id, kind: 'mark' as const, position: c[id], radius: E.markRadiusM })),
    { id: 'committee', kind: 'committee', position: c.committee, heading: c.windDirectionDeg * DEG_TO_RAD, length: E.committeeLengthM, beam: E.committeeBeamM },
  ];
}
function collide(race: RaceState, racers: Racer[], dt: number) {
  // Judge the original encounter before minimum translations can swap windward/leeward positions.
  if (race.phase === 'racing') checkContacts(race, racers);
  const obstacles = courseObstacles(race);
  const contacts = resolveWorldCollisions(racers.map(racer => ({ id: racer.id, state: racer.state, previousPosition: racer.previousPosition,
    previousHeading: racer.previousHeading, wind: sampleWind(racer.state.position.x, racer.state.position.z, racer.state.time, { ...race.settings, windShadows: racers.filter(other=>other!==racer).map(other=>({position:other.state.position,heading:other.state.heading})) }), massKg: B.hullMassKg + race.settings.crewWeightKg + B.addedMassKg })), obstacles, dt);
  if (race.phase !== 'racing') return;
  checkContacts(race, racers, contacts);
  for (const racer of racers) for (const obstacle of obstacles) {
    const key = `${racer.id}/obstacle:${obstacle.id}`, old = race.contacts.get(key);
    const hit = contacts.some(contact => contact.a === racer.id && contact.b === obstacle.id);
    const clearDistance = B.lengthM / 2 + (obstacle.kind === 'mark' ? obstacle.radius : Math.hypot(obstacle.length, obstacle.beam) / 2) + 1;
    if (!hit) { if (old && distance(racer.state.position, obstacle.position) > clearDistance) old.active = false; continue; }
    const contact = old ?? { at: -Infinity, active: false, asternId: null };
    if (!contact.active && race.time - contact.at >= C.incidentCooldown) {
      issuePenalty(race, racer, obstacle.kind === 'mark' ? 'Mark contact' : 'Committee boat contact');
      contact.at = race.time; contact.active = true;
    }
    race.contacts.set(key, contact);
  }
}
/** Call once AFTER every boat has advanced through the same physics timestep. */
export function stepRace(race: RaceState, racers: Racer[], dt: number) {
  if (dt <= 0) return;
  collide(race, racers, dt);
  if (race.phase === 'finished') {
    for (const racer of racers) { racer.previousPosition = { ...racer.state.position }; racer.previousHeading = racer.state.heading; }
    return;
  }
  race.time += dt;
  if (race.phase === 'countdown') {
    const previous = race.countdown; race.countdown = Math.max(0, previous - dt);
    for (const threshold of [120, 60]) if (previous > threshold && race.countdown <= threshold) emit(race, { type: 'horn' });
    if (race.countdown === 0) startGun(race);
  } else if (race.phase === 'racing') {
    race.raceTime = race.time - (race.startTime ?? race.time);
    for (const racer of racers) {
      if (racer.finishedAt !== null || racer.dnf) continue;
      if (racer.takingPenalty) {
        if (Math.hypot(racer.state.velocity.x, racer.state.velocity.z) >= C.penaltyMinSpeed) racer.penaltyProgress += wrap(racer.state.heading - racer.previousHeading);
        if (Math.abs(racer.penaltyProgress) >= Math.PI * 2 - 0.03) {
          racer.penaltyTurns--; racer.takingPenalty = false; racer.penaltyProgress = 0; say(race, racer, 'Penalty turn complete');
        }
      } else updateProgress(race, racer);
    }
    if (race.options.mode === 'start') {
      if (race.practiceRestartAt !== null && race.time >= race.practiceRestartAt) {
        race.phase = 'prestart'; race.practiceRestartAt = null; race.startTime = null;
        for (const racer of racers) { racer.started = false; racer.ocs = false; racer.stage = 'start'; }
        beginSequence(race); emit(race, { type: 'practice-restart' });
      }
    } else if (race.raceTime >= race.timeLimit || racers.every(r => r.finishedAt !== null || r.dnf)) {
      if (race.raceTime >= race.timeLimit) for (const racer of racers) if (racer.finishedAt === null) racer.dnf = true;
      race.phase = 'finished';
    }
  }
  for (const racer of racers) { racer.previousPosition = { ...racer.state.position }; racer.previousHeading = racer.state.heading; }
}
export function getNavigationTarget(racer: Racer, race: RaceState): Vec2 | null {
  const course = race.course, p = courseCoordinates(course, racer.state.position), radius = C.roundingRadius;
  if (racer.finishedAt !== null || racer.dnf) return null;
  if (!racer.started) return coursePoint(course, Math.max(-15, Math.min(15, p.x)), racer.ocs || p.z > 0 ? -14 : 14);
  if (race.options.mode === 'start') return coursePoint(course, 24, -35);
  if (racer.stage === 'windward') {
    if (racer.markPhase === 0) return coursePoint(course, radius, course.length + (p.z > course.length ? -radius : radius));
    if (racer.markPhase === 1) return coursePoint(course, p.x < 0 ? radius : -radius, course.length + radius);
    return coursePoint(course, -radius, course.length + (p.z < course.length ? radius : -radius));
  }
  if (racer.stage === 'gate') {
    if (racer.markPhase === 0) return coursePoint(course, 0, C.gateDistance + (p.z < C.gateDistance ? radius : -radius));
    return coursePoint(course, racer.gateSide * (C.gateWidth / 2 + radius), C.gateDistance + (racer.markPhase === 1 ? -radius : radius));
  }
  if (racer.stage === 'finish') return coursePoint(course, 0, p.z < 0 ? 12 : -14);
  return null;
}
export function getRaceView(race: RaceState, racers: Racer[] = race.racers): RaceView {
  const progress = (r: Racer) => r.started ? r.lap * 4 + ({ start: 0, windward: 1, gate: 2, finish: 3, done: 4 }[r.stage]) + r.markPhase * 0.15 - distance(r.state.position, getNavigationTarget(r, race) ?? r.state.position) / (race.course.length * 10) : -1;
  const ordered = [...racers].sort((a, b) => {
    if (a.finishedAt !== null || b.finishedAt !== null) return (a.finishedAt ?? Infinity) - (b.finishedAt ?? Infinity);
    if (a.dnf !== b.dnf) return a.dnf ? 1 : -1;
    return progress(b) - progress(a);
  });
  const standings: Standing[] = ordered.map((r, index) => ({ id: r.id, name: r.name, place: r.dnf ? racers.length + 1 : index + 1, elapsed: r.finishedAt, penalties: r.penalties, ocs: r.wasOcs, finished: r.finishedAt !== null, dnf: r.dnf }));
  const player = racers.find(r => r.isPlayer) ?? racers[0], nextTarget = getNavigationTarget(player, race);
  const targetLabel = !player.started ? player.ocs ? 'Return below the start line' : 'Cross the start line upwind' : player.stage === 'windward' ? 'Windward mark · leave to port' : player.stage === 'gate' ? 'Leeward gate · pass between the marks' : player.stage === 'finish' ? 'Finish · cross downwind' : 'Finished';
  return { phase: race.phase, countdown: race.countdown, elapsed: race.raceTime, standings, place: standings.find(s => s.id === player.id)!.place,
    ocs: player.ocs, message: race.time < player.messageUntil ? player.message : '', nextTarget, target: nextTarget, targetLabel, course: race.course,
    lap: player.lap, roundings: player.roundings, penalties: player.penalties, penaltyTurns: player.penaltyTurns, playerFinished: player.finishedAt !== null || player.dnf,
    allFinished: race.phase === 'finished', practiceStarts: race.practiceStarts, timeLimit: race.timeLimit };
}
