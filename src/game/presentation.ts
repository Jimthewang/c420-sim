import { BOAT_CONFIG as B } from '../config/boat';
import { DEG_TO_RAD as D, KNOTS_TO_MPS as K } from '../config/environment';
import type { Telemetry, Vec2 } from '../physics/types';
import { getNavigationTarget, type RaceState } from './race';
import { formatTime } from './records';

export interface RacePresentation {
  stageLabel: string; lap: number; totalLaps: number;
  legs: { id: 'start' | 'windward' | 'gate' | 'finish'; label: string; status: 'upcoming' | 'current' | 'complete' }[];
  navigation: { bearingDeg: number; relativeBearingDeg: number; distanceM: number; closingSpeedKnots: number } | null;
  /** Positive means the entire hull remains below the line; ETA assumes constant velocity and heading. */
  startLine: { signedDistanceM: number; etaSeconds: number | null } | null;
}
export interface Announcement {
  id: number; time: number; expiresAt: number;
  title: string; detail: string; kind: 'info' | 'success' | 'warning';
}
const playerOf = (race: RaceState) => race.racers.find(racer => racer.isPlayer) ?? race.racers[0];
const dot = (a: Vec2, b: Vec2) => a.x * b.x + a.z * b.z;

/** Read-only instruments. Navigation targets and completion come from the race's existing rules. */
export function getRacePresentation(race: RaceState, telemetry: Telemetry): RacePresentation {
  const player = playerOf(race), state = player.state, free = race.options.mode === 'free';
  const totalLaps = race.options.laps, lap = Math.min(totalLaps, player.lap + 1);
  const current = !player.started ? 0 : { start: 0, windward: 1, gate: 2, finish: 3, done: 4 }[player.stage];
  const ids = ['start', 'windward', 'gate', 'finish'] as const;
  const labels = ['Start', 'Windward mark', 'Leeward gate', 'Finish'];
  const legs: RacePresentation['legs'] = free ? [] : ids.map((id, index) => ({ id, label: labels[index],
    status: player.finishedAt !== null || index < current ? 'complete' : index === current ? 'current' : 'upcoming' }));
  if (race.options.mode === 'start') legs.splice(1);
  const stageLabel = free ? 'Free sailing' : player.dnf ? 'Did not finish' : player.finishedAt !== null ? 'Finished'
    : !player.started ? player.ocs ? 'Return below the start line' : 'Cross the start line upwind'
    : race.options.mode === 'start' ? 'Clean start · return below the line'
    : player.stage === 'windward' ? 'Windward mark · leave to port'
    : player.stage === 'gate' ? player.markPhase === 0 ? 'Leeward gate · pass between the marks' : 'Round outside the gate mark'
    : 'Finish · cross downwind';
  const target = free ? null : getNavigationTarget(player, race);
  let navigation: RacePresentation['navigation'] = null;
  if (target) {
    const dx = target.x - state.position.x, dz = target.z - state.position.z, distanceM = Math.hypot(dx, dz);
    const bearingDeg = distanceM > 1e-9 ? (Math.atan2(dx, -dz) / D + 360) % 360 : telemetry.headingDeg;
    const relative = (bearingDeg - telemetry.headingDeg) * D;
    navigation = { bearingDeg, relativeBearingDeg: Math.atan2(Math.sin(relative), Math.cos(relative)) / D, distanceM,
      closingSpeedKnots: distanceM > 1e-9 ? (state.velocity.x * dx + state.velocity.z * dz) / distanceM / K : 0 };
  }
  let startLine: RacePresentation['startLine'] = null;
  if (!free && !player.started && !player.dnf && race.phase !== 'finished') {
    const normal = { x: Math.sin(race.course.windDirectionDeg * D), z: -Math.cos(race.course.windDirectionDeg * D) };
    const segment = { x: race.course.committee.x - race.course.startPin.x, z: race.course.committee.z - race.course.startPin.z };
    const length = Math.hypot(segment.x, segment.z), tangent = { x: segment.x / length, z: segment.z / length };
    const forward = { x: Math.sin(state.heading), z: -Math.cos(state.heading) }, right = { x: Math.cos(state.heading), z: Math.sin(state.heading) };
    // The same five hull points used for start/OCS judging; this calculation never awards a legal start.
    const points = [[0, B.lengthM / 2], [B.beamM / 2, 0], [B.beamM * .345, -B.lengthM / 2], [-B.beamM * .345, -B.lengthM / 2], [-B.beamM / 2, 0]]
      .map(([across, along]) => ({ x: state.position.x + right.x * across + forward.x * along - race.course.startPin.x,
        z: state.position.z + right.z * across + forward.z * along - race.course.startPin.z }));
    const signedDistanceM = -Math.max(...points.map(point => dot(point, normal))), closing = dot(state.velocity, normal);
    let etaSeconds: number | null = null;
    if (signedDistanceM >= 0 && closing > 1e-9) for (const point of points) {
      const time = -dot(point, normal) / closing;
      const across = dot({ x: point.x + state.velocity.x * time, z: point.z + state.velocity.z * time }, tangent);
      if (across >= 0 && across <= length && (etaSeconds === null || time < etaSeconds)) etaSeconds = time;
    }
    startLine = { signedDistanceM, etaSeconds };
  }
  return { stageLabel, lap, totalLaps, legs, navigation, startLine };
}

/** State transitions only: race.events remains available to audio and other consumers. */
export function createRaceAnnouncements() {
  const snapshot = (race: RaceState) => {
    const player = playerOf(race);
    return { time: race.time, phase: race.phase, started: player.started, ocs: player.ocs, penalties: player.penalties,
      penaltyTurns: player.penaltyTurns, roundings: player.roundings, stage: player.stage,
      finishedAt: player.finishedAt, dnf: player.dnf, capsized: player.state.capsized };
  };
  let source: RaceState | undefined, previous: ReturnType<typeof snapshot> | undefined;
  let active: Announcement | null = null, nextId = 1;
  let warningSource: 'capsize' | 'ocs' | 'penalty' | 'dnf' | null = null;
  function reset(race: RaceState) { source = race; previous = snapshot(race); active = null; warningSource = null; }
  return {
    reset,
    update(race: RaceState, telemetry: Telemetry): Announcement | null {
      if (source !== race || !previous || race.time < previous.time) { reset(race); return null; }
      const now = snapshot(race), player = playerOf(race);
      if (active && (race.time >= active.expiresAt || warningSource === 'capsize' && !now.capsized
        || warningSource === 'ocs' && !now.ocs || warningSource === 'penalty' && !now.penaltyTurns)) {
        active = null; warningSource = null;
      }
      let next: Pick<Announcement, 'title' | 'detail' | 'kind'> | null = null;
      let nextWarning: typeof warningSource = null;
      if (!previous.capsized && now.capsized) {
        next = { title: 'Capsized', detail: race.options.difficulty === 'beginner' ? 'Automatic recovery is helping you upright.' : 'Ease the main, lower the board, and hold F.', kind: 'warning' }; nextWarning = 'capsize';
      } else if (!previous.dnf && now.dnf) {
        next = { title: 'Time limit reached', detail: 'Your race is recorded as DNF.', kind: 'warning' }; nextWarning = 'dnf';
      } else if (!previous.ocs && now.ocs) {
        next = { title: 'Over the line early', detail: 'Return fully below the line, then cross upwind.', kind: 'warning' }; nextWarning = 'ocs';
      } else if (now.penalties > previous.penalties) {
        next = { title: 'Penalty required', detail: player.message || 'Complete a penalty turn before finishing.', kind: 'warning' }; nextWarning = 'penalty';
      } else if (previous.finishedAt === null && now.finishedAt !== null) {
        next = { title: 'Finished', detail: `Your elapsed time: ${formatTime(now.finishedAt)}.`, kind: 'success' };
      } else if (previous.capsized && !now.capsized) {
        next = { title: 'Back upright', detail: 'Fill the sails and rebuild speed.', kind: 'success' };
      } else if (now.penaltyTurns < previous.penaltyTurns) {
        next = { title: 'Penalty complete', detail: now.penaltyTurns ? `${now.penaltyTurns} turn${now.penaltyTurns === 1 ? '' : 's'} still required.` : 'Return to your course.', kind: 'success' };
      } else if (!previous.started && now.started && !now.ocs && race.options.mode !== 'tutorial') {
        next = { title: 'Good start', detail: `Crossed at ${telemetry.speedKnots.toFixed(1)} kn. ${race.options.mode === 'start' ? 'Clean start recorded.' : 'Head toward the windward mark.'}`, kind: 'success' };
      } else if (now.roundings > previous.roundings) {
        next = { title: 'Mark rounded', detail: previous.stage === 'windward' ? 'Windward mark clear.' : 'Leeward gate clear.', kind: 'success' };
      } else if (previous.ocs && !now.ocs) {
        next = { title: 'Clear of the line', detail: 'Cross upwind to start legally.', kind: 'info' };
      } else if (previous.phase !== 'countdown' && now.phase === 'countdown') {
        next = { title: 'Start sequence', detail: `${formatTime(Math.ceil(race.countdown))} until the starting signal.`, kind: 'info' };
      }
      previous = now;
      if (next && (next.kind === 'warning' || active?.kind !== 'warning')) {
        active = { ...next, id: nextId++, time: race.time, expiresAt: race.time + 4 }; warningSource = nextWarning;
      }
      return active;
    },
  };
}
