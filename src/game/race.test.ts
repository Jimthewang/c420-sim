import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../config/environment';
import { beginSequence, createRace, crossedLine, stepRace } from './race';

const settings = { ...DEFAULT_SETTINGS, gusts: false, shifts: false };
const options = { mode: 'race' as const, difficulty: 'realistic' as const, aiCount: 0, courseLength: 120, laps: 1 };

describe('race chronology and geometry', () => {
  it('only counts a directional crossing within the actual line segment', () => {
    const left = { x: -10, z: 0 }, right = { x: 10, z: 0 };
    expect(crossedLine({ x: 0, z: 2 }, { x: 0, z: -2 }, left, right, { x: 0, z: -1 })).toBe(true);
    expect(crossedLine({ x: 0, z: -2 }, { x: 0, z: 2 }, left, right, { x: 0, z: -1 })).toBe(false);
    expect(crossedLine({ x: 12, z: 2 }, { x: 12, z: -2 }, left, right, { x: 0, z: -1 })).toBe(false);
  });

  it('allows free prestart sailing and starts only after the complete three minutes', () => {
    const race = createRace(options, settings);
    stepRace(race, race.racers, 10);
    expect(race.phase).toBe('prestart');
    beginSequence(race);
    stepRace(race, race.racers, 179.5);
    expect(race.phase).toBe('countdown');
    stepRace(race, race.racers, 0.5);
    expect(race.phase).toBe('racing');
    expect(race.raceTime).toBeCloseTo(0);
  });
});

import { aiControls, fleetSettings } from './ai';
import { stepBoat } from '../physics/sailing';
import { coursePoint, getRaceView, issuePenalty, requestPenaltyTurn, startTutorialRounding } from './race';
import type { RaceState } from './race';

function move(race: RaceState, across: number, upwind: number, dt = 0.1) {
  race.racers[0].state.position = coursePoint(race.course, across, upwind);
  stepRace(race, race.racers, dt);
}
function racing(laps = 1) {
  const race = createRace({ ...options, laps }, settings);
  beginSequence(race); stepRace(race, race.racers, 180);
  return race;
}
function legalStart(race: RaceState) { move(race, 0, -2); move(race, 0, 2); }
function roundWindward(race: RaceState) {
  const length = race.course.length;
  move(race, 12, length - 10); move(race, 12, length + 10);
  move(race, -12, length + 10); move(race, -12, length - 10);
}

describe('course and starts', () => {
  it('rotates the entire course with the selected wind', () => {
    const race = createRace(options, { ...settings, windDirectionDeg: 90 });
    expect(race.course.windward.x).toBeCloseTo(120);
    expect(race.course.windward.z).toBeCloseTo(0);
    expect(race.course.startPin.z).toBeLessThan(0);
    expect(race.course.committee.z).toBeGreaterThan(0);
  });
  it('flags early starters and requires return plus a legal new crossing', () => {
    const race = createRace(options, settings);
    race.racers[0].state.position = coursePoint(race.course, 0, 5);
    beginSequence(race); stepRace(race, race.racers, 180);
    expect(race.racers[0].ocs).toBe(true);
    move(race, 0, 20);
    expect(race.racers[0].started).toBe(false);
    move(race, 0, -5);
    expect(race.racers[0].ocs).toBe(false);
    expect(race.racers[0].started).toBe(false);
    move(race, 0, 5);
    expect(race.racers[0].started).toBe(true);
    expect(race.racers[0].wasOcs).toBe(true);
  });
  it('rejects a crossing outside the starting line', () => {
    const race = racing(); move(race, 50, -3); move(race, 50, 3);
    expect(race.racers[0].started).toBe(false);
  });
  it('flags a bow over the line and requires the entire hull to return', () => {
    const race = createRace(options, settings), racer = race.racers[0];
    racer.state.heading = 0; racer.state.position = coursePoint(race.course, 0, -0.5);
    beginSequence(race); stepRace(race, race.racers, 180);
    expect(racer.ocs).toBe(true);
    move(race, 0, -1.5); expect(racer.ocs).toBe(true);
    move(race, 0, -3.5); expect(racer.ocs).toBe(false);
    move(race, 0, -1); expect(racer.started).toBe(true);
  });
  it('starts when the bow crosses even though the hull centre remains behind', () => {
    const race = racing(), racer = race.racers[0]; racer.state.heading = 0;
    move(race, 0, -3); move(race, 0, -1);
    expect(racer.started).toBe(true);
  });
  it('rejects a bow crossing beyond the committee end of the finite line', () => {
    const race = racing(), racer = race.racers[0]; racer.state.heading = Math.PI / 4;
    move(race, 21.5, -3); move(race, 21.5, -1);
    expect(racer.started).toBe(false);
  });
  it('begins a time trial clock on the valid line crossing rather than the button press', () => {
    const race = createRace({ ...options, mode: 'time-trial' }, settings);
    beginSequence(race); stepRace(race, race.racers, 45);
    expect(race.raceTime).toBe(0);
    legalStart(race); expect(race.raceTime).toBe(0);
    stepRace(race, race.racers, 8);
    expect(race.raceTime).toBeCloseTo(8);
  });
  it('repeats a practice sequence after a legal start without moving the boat', () => {
    const race = createRace({ ...options, mode: 'start' }, settings);
    beginSequence(race); stepRace(race, race.racers, 180); legalStart(race);
    expect(race.practiceStarts).toBe(1);
    const position = { ...race.racers[0].state.position };
    stepRace(race, race.racers, 19);
    expect(race.phase).toBe('countdown'); expect(race.countdown).toBe(180);
    expect(race.racers[0].state.position).toEqual(position);
  });
  it('emits only the required sequence horns', () => {
    const race = createRace(options, settings); beginSequence(race);
    for (let i = 0; i < 180; i++) stepRace(race, race.racers, 1);
    expect(race.events.filter(event => event.type === 'horn')).toHaveLength(4);
  });
});

describe('ordered roundings and finish', () => {
  it('rejects the wrong side and then accepts the complete port rounding', () => {
    const race = racing(); legalStart(race);
    move(race, -12, 110); move(race, -12, 130); move(race, 12, 130); move(race, 12, 110);
    expect(race.racers[0].roundings).toBe(0);
    roundWindward(race);
    expect(race.racers[0].roundings).toBe(1); expect(race.racers[0].stage).toBe('gate');
  });
  it('requires the gate and a downwind crossing inside the finish segment', () => {
    const race = racing(); legalStart(race); roundWindward(race);
    move(race, 30, 35); move(race, 30, 10); move(race, 0, -5);
    expect(race.racers[0].finishedAt).toBeNull();
    move(race, 0, 35); move(race, 0, 15);
    expect(race.racers[0].stage).toBe('finish');
    move(race, 35, 4); move(race, 35, -4);
    expect(race.racers[0].finishedAt).toBeNull();
    // Route below the committee hull before returning to the middle of the line.
    move(race, 35, -14); move(race, 0, -14); move(race, 0, 4); move(race, 0, -4);
    expect(race.racers[0].finishedAt).not.toBeNull(); expect(race.phase).toBe('finished');
  });
  it('requires a gate-mark rounding before the second beat', () => {
    const race = racing(2); legalStart(race); roundWindward(race);
    move(race, 3, 35); move(race, 3, 15);
    expect(race.racers[0].markPhase).toBe(1);
    move(race, 25, 15); move(race, 25, 38);
    expect(race.racers[0].lap).toBe(1); expect(race.racers[0].stage).toBe('windward');
    expect(race.racers[0].roundings).toBe(2);
  });
  it('finishes when the bow crosses downwind before the hull centre', () => {
    const race = racing(); legalStart(race); roundWindward(race);
    move(race, 0, 35); move(race, 0, 15);
    race.racers[0].state.heading = Math.PI;
    move(race, 0, 4); move(race, 0, 1);
    expect(race.racers[0].finishedAt).not.toBeNull();
  });
  it('sets a tutorial near the mark with a legal start already established', () => {
    const race = createRace({ ...options, mode: 'tutorial' }, settings); startTutorialRounding(race);
    expect(race.racers[0].started).toBe(true); expect(race.racers[0].stage).toBe('windward');
    expect(race.racers[0].state.mainSheet).toBe(1);
  });
  it('assigns DNF after the time limit and ranks it behind actual finishers', () => {
    const race = racing(); stepRace(race, race.racers, race.timeLimit + 1);
    expect(race.phase).toBe('finished'); expect(getRaceView(race).standings[0].dnf).toBe(true);
    expect(getRaceView(race).standings[0].place).toBe(2);
  });
  it('bounds waiting for the fleet to twenty minutes even on a long light-air course', () => {
    const race = createRace({ ...options, courseLength: 350, laps: 2 }, { ...settings, windSpeedKnots: 4 });
    expect(race.timeLimit).toBe(1200);
  });
});

describe('simplified right of way and sailed penalties', () => {
  it('penalizes port at a port/starboard contact once per sustained encounter', () => {
    const race = createRace({ ...options, aiCount: 1 }, settings); beginSequence(race); stepRace(race, race.racers, 180);
    race.racers[0].state.position = { x: 0, z: 0 }; race.racers[0].state.heading = Math.PI / 4;
    race.racers[1].state.position = { x: 2, z: 0 }; race.racers[1].state.heading = -Math.PI / 4;
    for (let i = 0; i < 100; i++) stepRace(race, race.racers, 0.1);
    expect(race.racers[0].penalties).toBe(1); expect(race.racers[1].penalties).toBe(0);
  });
  it('penalizes the windward boat on the same tack', () => {
    const race = createRace({ ...options, aiCount: 1 }, settings); beginSequence(race); stepRace(race, race.racers, 180);
    race.racers[0].state.position = { x: 0, z: -2 }; race.racers[0].state.heading = Math.PI / 4;
    race.racers[1].state.position = { x: 0, z: 0 }; race.racers[1].state.heading = Math.PI / 4;
    stepRace(race, race.racers, 0.1);
    expect(race.racers[0].penalties).toBe(1); expect(race.racers[1].penalties).toBe(0);
  });
  it('penalizes the following boat after a clear-astern approach on the same tack', () => {
    const race = createRace({ ...options, aiCount: 1 }, settings); beginSequence(race); stepRace(race, race.racers, 180);
    const [front, following] = race.racers;
    front.state.heading = following.state.heading = Math.PI / 4;
    front.state.position = { x: 1.98, z: -1.98 };
    following.state.position = { x: front.state.position.x - 5 / Math.SQRT2, z: front.state.position.z + 5 / Math.SQRT2 };
    stepRace(race, race.racers, 0.1);
    following.state.position = { x: 0, z: 0 }; stepRace(race, race.racers, 0.1);
    expect(following.penalties).toBe(1); expect(front.penalties).toBe(0);
  });
  it('uses windward/leeward once a boat has moved alongside from astern', () => {
    const race = createRace({ ...options, aiCount: 1 }, settings); beginSequence(race); stepRace(race, race.racers, 180);
    const [front, following] = race.racers;
    front.state.heading = following.state.heading = Math.PI / 4;
    front.state.position = { x: 0, z: 0 };
    following.state.position = { x: -5 / Math.SQRT2, z: 5 / Math.SQRT2 };
    // This test places an encounter; do not sweep the setup move from the launch positions through it.
    for (const racer of race.racers) { racer.previousPosition = { ...racer.state.position }; racer.previousHeading = racer.state.heading; }
    stepRace(race, race.racers, 0.1);
    following.state.position = { x: 1 / Math.SQRT2, z: 3 / Math.SQRT2 }; stepRace(race, race.racers, 0.1);
    expect(front.penalties).toBe(1); expect(following.penalties).toBe(0);
  });
  it('has the following AI bear away from a same-tack boat directly ahead', () => {
    const race = createRace({ ...options, aiCount: 1 }, settings); beginSequence(race); stepRace(race, race.racers, 180);
    const [following, front] = race.racers;
    following.state.position = { x: 0, z: 10 }; following.state.heading = front.state.heading = Math.PI / 4;
    front.state.position = { x: 100, z: 100 };
    const clearHelm = aiControls(following, race, settings, 0).steer;
    front.state.position = { x: 5 / Math.SQRT2, z: 10 - 5 / Math.SQRT2 };
    expect(aiControls(following, race, settings, 0).steer).toBeGreaterThan(clearHelm + 0.2);
  });
  it('clears a penalty only by sailing an actual full turn with the shared physics', () => {
    const race = racing(); legalStart(race); const racer = race.racers[0];
    issuePenalty(race, racer, 'Test contact'); requestPenaltyTurn(racer);
    for (let t = 0; t < 100 && racer.penaltyTurns > 0; t += 1 / 30) {
      stepBoat(racer.state, aiControls(racer, race, settings, 1 / 30), settings, 1 / 30);
      stepRace(race, race.racers, 1 / 30);
    }
    expect(racer.penaltyTurns).toBe(0); expect(racer.penalties).toBe(1);
    expect(racer.takingPenalty).toBe(false);
  });
  it('recovers a capsized opponent by easing its sail and lowering its board', () => {
    const race = racing(), racer = race.racers[0];
    racer.state.capsized = true; racer.state.heel = 1.5; racer.state.centerboard = 0.2; racer.state.mainSheet = 1;
    for (let t = 0; t < 15 && racer.state.capsized; t += 1 / 30) {
      const controls = aiControls(racer, race, settings, 1 / 30);
      expect(controls.mainSheet).toBe(0); expect(controls.board).toBe(1);
      stepBoat(racer.state, controls, settings, 1 / 30);
    }
    expect(racer.state.capsized).toBe(false);
  });
  it('cannot clear a penalty by stationary rotations or rocking back and forth', () => {
    const race = racing(), racer = race.racers[0]; issuePenalty(race, racer, 'Test contact'); requestPenaltyTurn(racer);
    for (let i = 0; i < 100; i++) { racer.state.heading += 0.1; stepRace(race, race.racers, 0.1); }
    expect(racer.penaltyTurns).toBe(1);
    racer.state.velocity = { x: 1, z: 0 };
    for (let i = 0; i < 100; i++) { racer.state.heading += i % 2 ? -0.1 : 0.1; stepRace(race, race.racers, 0.1); }
    expect(racer.penaltyTurns).toBe(1);
  });
});

describe('complete AI racing through real sailing physics', () => {
  it.each([[10, 120, 1, 2, 0, false], [10, 220, 2, 2, 0, false], [4, 120, 1, 2, 0, false], [18, 350, 1, 2, 0, false], [10, 120, 1, 8, 270, true]] as const)('all boats finish in %s knots, %sm, %s laps', (windSpeedKnots, courseLength, laps, aiCount, windDirectionDeg, shifts) => {
    const weather = { ...settings, windSpeedKnots, windDirectionDeg, shifts, gusts: shifts };
    const race = createRace({ ...options, aiCount, courseLength, laps }, weather); beginSequence(race);
    for (let t = 0; t < race.timeLimit + 185 && race.phase !== 'finished'; t += 1 / 30) {
      for (const racer of race.racers) {
        const environment = fleetSettings(racer, race, weather);
        stepBoat(racer.state, aiControls(racer, race, environment, 1 / 30), environment, 1 / 30);
      }
      stepRace(race, race.racers, 1 / 30);
    }
    expect(race.racers.map(r => ({ stage: r.stage, phase: r.markPhase, dnf: r.dnf, penalties: r.penaltyTurns })))
      .toEqual(race.racers.map(() => ({ stage: 'done', phase: 0, dnf: false, penalties: 0 })));
    expect(race.racers.every(r => r.roundings === laps * 2)).toBe(true);
    expect(getRaceView(race).standings.map(r => r.place)).toEqual(race.racers.map((_, index) => index + 1));
  }, 20_000);
});

describe('solid contacts after sailing integration', () => {
  it('has the AI steer clear of the physical committee boat on its starting approach', () => {
    const race=racing(),racer=race.racers[0];
    racer.started=true;racer.stage='windward';racer.state.position={x:race.course.committee.x-8,z:8};racer.state.heading=Math.PI/4;
    racer.state.velocity={x:1.5,z:-1.5};
    const near=aiControls(racer,race,settings,0).steer;
    const clear=aiControls(racer,{...race,course:{...race.course,committee:{x:500,z:500}}},settings,0).steer;
    expect(Math.abs(near-clear)).toBeGreaterThan(.1);
  });
  it('lets the AI recover a backed-down boat through real rudder flow and finish the race', () => {
    const race=racing(),racer=race.racers[0];
    racer.state.position={x:0,z:25};racer.state.heading=-28*Math.PI/180;racer.state.velocity={x:.06,z:.29};
    racer.previousPosition={...racer.state.position};racer.previousHeading=racer.state.heading;
    for(let t=0;t<900 && race.phase!=='finished';t+=1/30){
      stepBoat(racer.state,aiControls(racer,race,settings,1/30),settings,1/30);
      stepRace(race,race.racers,1/30);
    }
    expect(racer.finishedAt).not.toBeNull();
    expect(racer.roundings).toBe(2);
  });
  it('separates overlapping boats symmetrically before the start without penalties', () => {
    const race = createRace({ ...options, aiCount: 1 }, settings);
    const [a, b] = race.racers;
    a.state.position = { x: -0.1, z: 40 }; b.state.position = { x: 0.1, z: 40 };
    a.state.heading = b.state.heading = 0;
    a.previousPosition = { ...a.state.position }; b.previousPosition = { ...b.state.position };
    a.previousHeading = a.state.heading; b.previousHeading = b.state.heading;
    a.state.velocity = { x: 2, z: 1 }; b.state.velocity = { x: -2, z: 1 };
    stepRace(race, race.racers, 1 / 120);
    expect(b.state.position.x - a.state.position.x).toBeGreaterThanOrEqual(1.63);
    expect(a.state.position.x + b.state.position.x).toBeCloseTo(0);
    expect(a.state.velocity.x).toBeLessThanOrEqual(0);
    expect(b.state.velocity.x).toBeGreaterThanOrEqual(0);
    expect(a.penalties + b.penalties).toBe(0);
  });

  it('keeps a boat out of the windward buoy and penalizes one sustained racing contact once', () => {
    const race = racing(); const racer = race.racers[0];
    racer.state.position = { ...race.course.windward }; racer.state.heading = 0;
    racer.previousPosition = { ...racer.state.position };
    stepRace(race, race.racers, 1 / 120);
    expect(Math.hypot(racer.state.position.x - race.course.windward.x, racer.state.position.z - race.course.windward.z)).toBeGreaterThan(1.5);
    expect(racer.penalties).toBe(1);
    for (let i = 0; i < 100; i++) stepRace(race, race.racers, 1 / 120);
    expect(racer.penalties).toBe(1);
  });

  it('collides with the committee hull during prestart', () => {
    const race = createRace(options, settings), racer = race.racers[0];
    racer.state.position = { ...race.course.committee }; racer.state.heading = 0;
    racer.previousPosition = { ...racer.state.position };
    stepRace(race, race.racers, 1 / 120);
    expect(Math.hypot(racer.state.position.x - race.course.committee.x, racer.state.position.z - race.course.committee.z)).toBeGreaterThan(1.8);
    expect(racer.penalties).toBe(0);
  });

  it('stops a fast boat crossing through a buoy between sampled positions', () => {
    const race = createRace(options, settings), racer = race.racers[0];
    racer.state.heading = Math.PI / 2;
    racer.previousHeading = racer.state.heading;
    racer.previousPosition = { x: race.course.windward.x - 12, z: race.course.windward.z };
    racer.state.position = { x: race.course.windward.x + 12, z: race.course.windward.z };
    racer.state.velocity = { x: 30, z: 0 };
    stepRace(race, race.racers, 0.8);
    expect(racer.state.position.x).toBeLessThan(race.course.windward.x - 2);
    expect(racer.state.velocity.x).toBeLessThanOrEqual(0);
  });
});
