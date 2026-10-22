import { BOAT_CONFIG as B } from '../config/boat';
import type { BoatState } from '../physics/types';

export interface WaveSurface { height: number; slopeX: number; slopeZ: number }
const offsets = [0, .72, -.55], wavelengths = [18, 9, 4.7], weights = [.57, .28, .15];

/** Same wave heights, with frame-invariant phase/direction prepared once for a sea mesh. */
export function prepareWaveHeightSampler(time: number, windDirectionRad: number) {
  const x = new Float64Array(3), z = new Float64Array(3), phase = new Float64Array(3);
  for (let i = 0; i < 3; i++) {
    const frequency = Math.PI * 2 / wavelengths[i], direction = windDirectionRad + offsets[i];
    x[i] = -Math.sin(direction) * frequency; z[i] = Math.cos(direction) * frequency;
    phase[i] = -time * Math.sqrt(9.81 * frequency) * .85 + i * 1.7;
  }
  return (worldX: number, worldZ: number, windSpeedKnots: number) => {
    const amplitude = .06 + Math.max(0, Math.min(1.4, windSpeedKnots / 20)) * .48;
    return amplitude * (Math.sin(worldX * x[0] + worldZ * z[0] + phase[0]) * weights[0]
      + Math.sin(worldX * x[1] + worldZ * z[1] + phase[1]) * weights[1]
      + Math.sin(worldX * x[2] + worldZ * z[2] + phase[2]) * weights[2]);
  };
}

/** Pure shared sea surface. An optional destination avoids allocations in water-mesh updates. */
export function sampleWaveSurface(x: number, z: number, time: number, windSpeedKnots: number, windDirectionRad = 0, out: WaveSurface = { height: 0, slopeX: 0, slopeZ: 0 }): WaveSurface {
  const strength = Math.max(0, Math.min(1.4, windSpeedKnots / 20));
  const amplitude = 0.06 + strength * 0.48;
  let height = 0, slopeX = 0, slopeZ = 0;
  for (let i = 0; i < 3; i++) {
    const offset = offsets[i];
    const direction = windDirectionRad + offset;
    const dx = -Math.sin(direction), dz = Math.cos(direction);
    const wavelength = wavelengths[i];
    const weight = weights[i];
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
