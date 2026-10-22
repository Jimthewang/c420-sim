import type { BoatState } from '../physics/types';

function copy(target: BoatState, source: BoatState) {
  const { position, velocity, crew, main, jib } = target;
  Object.assign(target, source);
  target.position = Object.assign(position, source.position);
  target.velocity = Object.assign(velocity, source.velocity);
  target.crew = Object.assign(crew, source.crew);
  target.main = Object.assign(main, source.main);
  target.jib = Object.assign(jib, source.jib);
}

/** One fixed step of visual latency; rules and controls always use the original state. */
export function createBoatInterpolator(state: BoatState) {
  const previous = structuredClone(state), view = structuredClone(state);
  function capture() { copy(previous, state); }
  return {
    capture,
    reset: capture,
    sample(alpha: number) {
      const t = Math.max(0, Math.min(1, alpha));
      const mix = (a: number, b: number) => a + (b - a) * t;
      copy(view, state);
      for (const key of ['time', 'yawRate', 'heel', 'rollRate', 'mainSheet', 'jibSheet', 'rudder', 'centerboard', 'planing', 'rightingProgress', 'mainAngularVelocity', 'jibAngularVelocity'] as const) {
        view[key] = mix(previous[key], state[key]);
      }
      const turn = state.heading - previous.heading;
      view.heading = previous.heading + Math.atan2(Math.sin(turn), Math.cos(turn)) * t;
      for (const axis of ['x', 'z'] as const) {
        view.position[axis] = mix(previous.position[axis], state.position[axis]);
        view.velocity[axis] = mix(previous.velocity[axis], state.velocity[axis]);
      }
      for (const key of ['skipperX', 'crewX', 'foreAft', 'hike'] as const) view.crew[key] = mix(previous.crew[key], state.crew[key]);
      view.main.angle = mix(previous.main.angle, state.main.angle);
      view.jib.angle = mix(previous.jib.angle, state.jib.angle);
      return view;
    },
  };
}
