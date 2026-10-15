import { BOAT_CONFIG as B } from '../config/boat';
import type { BoatState } from '../physics/types';

export interface WaveSurface { height: number; slopeX: number; slopeZ: number }

/** Pure shared sea surface. An optional destination avoids allocations in water-mesh updates. */
export function sampleWaveSurface(x: number, z: number, time: number, windSpeedKnots: number, windDirectionRad = 0, out: WaveSurface = { height: 0, slopeX: 0, slopeZ: 0 }): WaveSurface {
  const strength = Math.max(0, Math.min(1.4, windSpeedKnots / 20));
  const amplitude = 0.06 + strength * 0.48;
  let height = 0, slopeX = 0, slopeZ = 0;
  for (let i = 0; i < 3; i++) {
    const offset = i === 0 ? 0 : i === 1 ? 0.72 : -0.55;
    const direction = windDirectionRad + offset;
    const dx = -Math.sin(direction), dz = Math.cos(direction);
    const wavelength = i === 0 ? 18 : i === 1 ? 9 : 4.7;
    const weight = i === 0 ? 0.57 : i === 1 ? 0.28 : 0.15;
    const frequency = Math.PI * 2 / wavelength;
    // Deep-water phase speed follows wavelength, while changing wind changes amplitude.
    // Multiplying elapsed time by a local gust would create a rapidly shearing phase field.
    const phase = (x * dx + z * dz) * frequency - time * Math.sqrt(9.81 * frequency) * 0.85 + i * 1.7;
    height += Math.sin(phase) * amplitude * weight;
    const slope = Math.cos(phase) * amplitude * weight * frequency;
    slopeX += slope * dx; slopeZ += slope * dz;
  }
  out.height = height; out.slopeX = slopeX; out.slopeZ = slopeZ;
  return out;
}

/** Rendering and terrain collision use one rigid wave pose; roll excludes physical heel. */
export function getBoatWavePose(state: BoatState, windSpeedKnots: number, windDirectionRad: number): { height: number; pitch: number; roll: number } {
  const c = Math.cos(state.heading), s = Math.sin(state.heading);
  const sample = (x: number, z: number) => sampleWaveSurface(state.position.x + x * c - z * s, state.position.z + x * s + z * c, state.time, windSpeedKnots, windDirectionRad).height;
  const foreDistance = B.lengthM * 0.38, sideDistance = B.beamM * 0.36;
  const bow = sample(0, -foreDistance), stern = sample(0, foreDistance), port = sample(-sideDistance, 0), starboard = sample(sideDistance, 0);
  const upright = state.capsized ? 0 : Math.max(0, Math.cos(state.heel)) ** 2;
  const waveHeight = (bow + stern + port + starboard) / 4;
  const crestAllowance = Math.max(0, Math.max(bow, stern, port, starboard) - waveHeight - 0.22) * upright;
  return {
    height: waveHeight + 0.035 + crestAllowance + state.planing * 0.055,
    pitch: state.planing * 0.045 + Math.atan2(bow - stern, foreDistance * 2) * upright,
    roll: Math.atan2(starboard - port, sideDistance * 2) * upright,
  };
}
