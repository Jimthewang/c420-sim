import { describe, expect, it } from 'vitest';
import { BOAT_CONFIG as B } from '../config/boat';
import { DEFAULT_SETTINGS, DEG_TO_RAD as D, KNOTS_TO_MPS as K } from '../config/environment';
import { getTelemetry } from '../physics/sailing';
import { beginSequence, coursePoint, createRace, issuePenalty, requestPenaltyTurn, startTutorialRounding, stepRace } from './race';
import { createRaceAnnouncements, getRacePresentation } from './presentation';

function fixture(direction = 0, laps = 1, aiCount = 0) {
  const settings = { ...DEFAULT_SETTINGS, windDirectionDeg: direction, shifts: false, gusts: false };
  const race = createRace({ mode: 'race', difficulty: 'beginner', aiCount, courseLength: 120, laps }, settings);
  const player = race.racers[0]; player.state.heading = direction * D;
  const view = () => getRacePresentation(race, getTelemetry(player.state, settings));
  const announce = (announcements: ReturnType<typeof createRaceAnnouncements>) => announcements.update(race, getTelemetry(player.state, settings));
  return { race, player, settings, view, announce };
}

describe('race presentation', () => {
  it.each([0, 37, 90, 225, 359])('uses the hull bow and a finite start line on a %s degree course', direction => {
    const { race, player, view } = fixture(direction);
    player.state.position = coursePoint(race.course, 0, -10);
    player.state.velocity = coursePoint(race.course, 0, 2);
    expect(view().startLine!.signedDistanceM).toBeCloseTo(10 - B.lengthM / 2, 10);
    expect(view().startLine!.etaSeconds).toBeCloseTo((10 - B.lengthM / 2) / 2, 10);
    player.state.heading += Math.PI / 2;
    expect(view().startLine!.signedDistanceM).toBeCloseTo(10 - B.beamM / 2, 10);
  });

  it('reports no ETA for stationary, departing, past-line, or out-of-segment boats', () => {
    const { race, player, view } = fixture();
    player.state.position = coursePoint(race.course, 0, -10);
    for (const speed of [0, -2]) {
      player.state.velocity = coursePoint(race.course, 0, speed);
      expect(view().startLine!.etaSeconds).toBeNull();
    }
    player.state.velocity = coursePoint(race.course, 0, 2);
    player.state.position = coursePoint(race.course, 0, -1);
    expect(view().startLine!.signedDistanceM).toBeLessThan(0);
    expect(view().startLine!.etaSeconds).toBeNull();
    player.state.position = coursePoint(race.course, 100, -10);
    expect(view().startLine!.etaSeconds).toBeNull();
  });

  it('predicts the first actual hull point to cross within the segment, including diagonal approach', () => {
    const { race, player, view } = fixture();
    const halfLine = race.course.committee.x;
    player.state.position = coursePoint(race.course, halfLine + .4, -10);
    player.state.velocity = coursePoint(race.course, 0, 2);
    // The bow crosses beyond the committee end; the port beam is the first valid hull point.
    expect(view().startLine!.etaSeconds).toBeCloseTo(5, 10);
    player.state.position = coursePoint(race.course, halfLine + 5, -10);
    player.state.velocity = coursePoint(race.course, -2, 2);
    expect(view().startLine!.etaSeconds).toBeCloseTo(3.95, 10);
  });

  it('reports target closing speed and bearing without calling downwind progress negative', () => {
    const { race, player, view } = fixture(37);
    player.started = true; player.stage = 'finish';
    player.state.position = coursePoint(race.course, 0, 20);
    player.state.velocity = coursePoint(race.course, 0, -2);
    const navigation = view().navigation!;
    expect(navigation.bearingDeg).toBeCloseTo(217, 10);
    expect(Math.abs(navigation.relativeBearingDeg)).toBeCloseTo(180, 10);
    expect(navigation.distanceM).toBeCloseTo(34, 10);
    expect(navigation.closingSpeedKnots).toBeCloseTo(2 / K, 10);
    expect(view().startLine).toBeNull();
  });

  it('resets windward/gate progress each lap and completes every leg only after finishing', () => {
    const { player, view } = fixture(0, 2);
    expect(view().legs.map(leg => leg.status)).toEqual(['current', 'upcoming', 'upcoming', 'upcoming']);
    player.started = true; player.stage = 'gate';
    expect(view().legs.map(leg => leg.status)).toEqual(['complete', 'complete', 'current', 'upcoming']);
    player.lap = 1; player.stage = 'windward';
    expect(view().lap).toBe(2); expect(view().totalLaps).toBe(2);
    expect(view().legs.map(leg => leg.status)).toEqual(['complete', 'current', 'upcoming', 'upcoming']);
    player.stage = 'done'; player.lap = 2; player.finishedAt = 210;
    expect(view().lap).toBe(2);
    expect(view().legs.every(leg => leg.status === 'complete')).toBe(true);
    expect(view().navigation).toBeNull();
  });

  it('does not mutate authoritative race, telemetry, or queued events', () => {
    const { race, player, settings } = fixture(90, 2, 2);
    const telemetry = getTelemetry(player.state, settings), before = structuredClone({ race, telemetry });
    getRacePresentation(race, telemetry);
    expect({ race, telemetry }).toEqual(before);
  });
});

describe('player race announcements', () => {
  it('starts quietly, ignores existing and AI state, and preserves the event queue', () => {
    const { race, player, announce } = fixture(0, 1, 1), announcements = createRaceAnnouncements();
    player.started = true; player.ocs = true; player.penaltyTurns = 1; player.state.capsized = true;
    race.events.push({ type: 'rounding', time: 0, racerId: 'ai-1' });
    announcements.reset(race);
    expect(announce(announcements)).toBeNull();
    race.racers[1].finishedAt = 2; race.racers[1].roundings++; race.racers[1].state.capsized = true;
    const before = structuredClone(race);
    expect(announce(announcements)).toBeNull(); expect(race).toEqual(before);
  });

  it('announces a legal player crossing rather than the start gun', () => {
    const { race, player, announce } = fixture(), announcements = createRaceAnnouncements();
    announcements.reset(race); beginSequence(race); race.countdown = .001;
    stepRace(race, race.racers, 1 / 120);
    expect(announce(announcements)).toBeNull();
    player.previousPosition = coursePoint(race.course, 0, -5);
    player.state.position = coursePoint(race.course, 0, 5);
    stepRace(race, race.racers, 1 / 120);
    expect(player.started).toBe(true);
    expect(announce(announcements)?.title).toBe('Good start');
  });

  it('announces a new countdown once, but does not replay an existing sequence after reset', () => {
    const { race, announce } = fixture(), announcements = createRaceAnnouncements();
    announcements.reset(race); beginSequence(race); race.countdown = 59.5;
    const sequence = announce(announcements)!;
    expect(sequence.title).toBe('Start sequence'); expect(sequence.detail).toContain('1:00');
    race.time = 1; race.countdown--;
    expect(announce(announcements)).toBe(sequence);
    announcements.reset(race); expect(announce(announcements)).toBeNull();
  });

  it('keeps announcement IDs increasing across explicit resets and new races', () => {
    const first = fixture(), announcements = createRaceAnnouncements();
    announcements.reset(first.race); first.player.state.capsized = true;
    const firstId = first.announce(announcements)!.id;
    announcements.reset(first.race); first.player.state.capsized = false;
    const resetId = first.announce(announcements)!.id;
    expect(resetId).toBeGreaterThan(firstId);
    const next = fixture(); expect(next.announce(announcements)).toBeNull();
    next.player.state.capsized = true;
    expect(next.announce(announcements)!.id).toBeGreaterThan(resetId);
  });

  it('replaces a capsize warning immediately when the boat recovers', () => {
    const { race, player, announce } = fixture(), announcements = createRaceAnnouncements();
    announcements.reset(race); player.state.capsized = true;
    expect(announce(announcements)?.title).toBe('Capsized');
    race.time = .5; player.state.capsized = false;
    expect(announce(announcements)?.title).toBe('Back upright');
  });

  it('does not call tutorial rounding setup a legal start', () => {
    const { race, announce } = fixture(), announcements = createRaceAnnouncements();
    race.options.mode = 'tutorial'; announcements.reset(race);
    startTutorialRounding(race);
    expect(announce(announcements)).toBeNull();
  });

  it('prioritizes a fresh warning over rounding and keeps it through lower priority events', () => {
    const { race, player, announce } = fixture(), announcements = createRaceAnnouncements();
    announcements.reset(race); race.time = 1; player.roundings++;
    issuePenalty(race, player, 'Mark contact');
    const warning = announce(announcements)!;
    expect(warning.kind).toBe('warning'); expect(warning.title).toBe('Penalty required');
    race.time = 2; player.roundings++;
    expect(announce(announcements)).toBe(warning);
    expect(announce(announcements)).toBe(warning);
  });

  it('expires on race time, stays frozen during pause, and resets quietly on a new or rewound race', () => {
    const { race, player, announce } = fixture(), announcements = createRaceAnnouncements();
    announcements.reset(race); race.time = 10; player.state.capsized = true;
    const message = announce(announcements)!;
    expect(message.expiresAt).toBe(14);
    for (let frame = 0; frame < 100; frame++) expect(announce(announcements)).toBe(message);
    race.time = 14; expect(announce(announcements)).toBeNull();
    const next = fixture(); expect(next.announce(announcements)).toBeNull();
    next.race.time = 4; next.player.roundings++; expect(next.announce(announcements)).not.toBeNull();
    next.race.time = 0; expect(next.announce(announcements)).toBeNull();
    announcements.reset(race); expect(announce(announcements)).toBeNull();
  });

  it('announces OCS, recovery, served penalties, and a real finish from authoritative state transitions', () => {
    const { race, player, announce } = fixture(), announcements = createRaceAnnouncements();
    announcements.reset(race); player.state.position = coursePoint(race.course, 0, 5);
    player.previousPosition = { ...player.state.position }; beginSequence(race); race.countdown = .001;
    stepRace(race, race.racers, 1 / 120);
    expect(player.ocs).toBe(true); expect(announce(announcements)?.title).toBe('Over the line early');
    race.time += 5; player.ocs = false; player.state.capsized = true;
    expect(announce(announcements)?.title).toBe('Capsized');
    race.time += 5; player.state.capsized = false;
    expect(announce(announcements)?.title).toBe('Back upright');
    issuePenalty(race, player, 'Mark contact'); announce(announcements); requestPenaltyTurn(player);
    announce(announcements); race.time += 5; player.penaltyProgress = Math.PI * 2;
    player.state.velocity = { x: 1, z: 0 }; stepRace(race, race.racers, 1 / 120);
    expect(player.penaltyTurns).toBe(0); expect(announce(announcements)?.title).toBe('Penalty complete');
    race.time += 5; player.started = true; player.stage = 'finish'; player.previousHeading = player.state.heading = Math.PI;
    player.previousPosition = coursePoint(race.course, 0, 5); player.state.position = coursePoint(race.course, 0, -5);
    stepRace(race, race.racers, 1 / 120);
    expect(player.finishedAt).not.toBeNull(); expect(announce(announcements)?.title).toBe('Finished');
  });
});
