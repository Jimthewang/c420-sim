import { describe, expect, it } from 'vitest';
import { createBoatState } from '../physics/sailing';
import { createBoatInterpolator } from './interpolation';

describe('fixed-step display interpolation', () => {
  it('advances evenly at 90 and 144 Hz without changing authoritative state', () => {
    for (const hz of [90, 144]) {
      const state = createBoatState(), display = createBoatInterpolator(state);
      let accumulator = 0, lastX = 0;
      for (let frame = 0; frame < hz; frame++) {
        accumulator += 1 / hz;
        while (accumulator >= 1 / 120) {
          display.capture(); state.position.x += 3 / 120; state.time += 1 / 120;
          accumulator -= 1 / 120;
        }
        const before = structuredClone(state), view = display.sample(accumulator * 120);
        if (frame > 1) expect(view.position.x - lastX).toBeCloseTo(3 / hz, 10);
        expect(state).toEqual(before); lastX = view.position.x;
      }
    }
  });

  it('takes the short path through north and interpolates crew, heel and rig', () => {
    const state = createBoatState(); state.heading = 359 * Math.PI / 180;
    const display = createBoatInterpolator(state); display.capture();
    state.heading = Math.PI / 180; state.heel = .2; state.crew.skipperX = .8;
    state.main.angle = .4; state.rudder = .2; state.time = 1 / 120;
    const view = display.sample(.5);
    expect(Math.sin(view.heading)).toBeCloseTo(0, 12);
    expect(Math.cos(view.heading)).toBeCloseTo(1, 12);
    expect(view.heel).toBeCloseTo(.1); expect(view.crew.skipperX).toBeCloseTo(.4);
    expect(view.main.angle).toBeCloseTo(.2); expect(view.rudder).toBeCloseTo(.1);
    expect(view.time).toBeCloseTo(1 / 240);
  });

  it('keeps display and nested object identity stable across samples and pause', () => {
    const state = createBoatState(), display = createBoatInterpolator(state);
    const first = display.sample(0), position = first.position, crew = first.crew, main = first.main;
    display.capture(); state.position.x = 2; state.crew.crewX = -.5;
    expect(display.sample(.7)).toBe(first);
    expect(first.position).toBe(position); expect(first.crew).toBe(crew); expect(first.main).toBe(main);
    expect(first).not.toBe(state); expect(first.position).not.toBe(state.position);
    display.reset();
    expect(display.sample(0).position.x).toBe(2);
    expect(display.sample(.9).position.x).toBe(2);
    state.position.x = 90; state.time = 0; display.reset();
    expect(display.sample(.3).position.x).toBe(90);
  });
});
