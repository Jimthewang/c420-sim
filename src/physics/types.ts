/** World coordinates: x east, z south. Compass headings increase clockwise. */
export interface Vec2 { x: number; z: number }

export interface SailState {
  /** Signed angle of the boom/foot from the aft centreline; positive is starboard. */
  angle: number;
  angleOfAttack: number;
  lift: number;
  drag: number;
  status: 'drawing' | 'luffing' | 'stalled';
}

export interface BoatState {
  position: Vec2;
  velocity: Vec2;
  heading: number;
  yawRate: number;
  time: number;
  mainSheet: number;
  rudder: number;
  main: SailState;
  jib: SailState;
}

export interface Controls { steer: number; mainSheet: number }

export interface SailingSettings {
  windSpeedKnots: number;
  windDirectionDeg: number;
  shifts: boolean;
  gusts: boolean;
  crewWeightKg: number;
}

export interface WindSample { velocity: Vec2; speed: number; direction: number; gust: number }

export interface Telemetry {
  speedKnots: number;
  headingDeg: number;
  trueWindKnots: number;
  trueWindDirectionDeg: number;
  apparentWindKnots: number;
  apparentWindAngleDeg: number;
  trueWindAngleDeg: number;
  leewayDeg: number;
  vmgKnots: number;
  driveForce: number;
  sideForce: number;
  hullDrag: number;
  main: SailState;
  jib: SailState;
}

export type CameraMode = 'chase' | 'tactical';
