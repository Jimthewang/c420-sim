import * as THREE from 'three';
import { sampleWaveSurface } from '../world/waves';

export interface WaveSample { height: number; normal: THREE.Vector3 }
const surface = { height: 0, slopeX: 0, slopeZ: 0 };

/** Shared sea surface: boats and water use the same travelling waves and analytical slope. */
export function sampleWave(x: number, z: number, time: number, windSpeedKnots: number, windDirectionRad: number, out: WaveSample): WaveSample {
  sampleWaveSurface(x, z, time, windSpeedKnots, windDirectionRad, surface);
  out.height = surface.height;
  out.normal.set(-surface.slopeX, 1, -surface.slopeZ).normalize();
  return out;
}

export function getWaveHeight(x: number, z: number, time: number, windSpeedKnots: number, windDirectionRad = 0): WaveSample {
  return sampleWave(x, z, time, windSpeedKnots, windDirectionRad, { height: 0, normal: new THREE.Vector3() });
}
