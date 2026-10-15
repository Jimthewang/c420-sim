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
  heel: number;
  rollRate: number;
  centerboard: number;
  jibSheet: number;
  capsized: boolean;
  rightingProgress: number;
  planing: number;
  /** Crew X positions are metres to starboard; foreAft is metres aft of the normal position. */
  crew: { skipperX: number; crewX: number; foreAft: number; hike: number };
  tackCount: number;
  gybeCount: number;
  lastTackTime: number;
  /** Internal maneuver bookkeeping; callers need not change these. */
  previousWindSide: number;
  rollTackEnergy: number;
}

export interface Controls {
  steer: number;
  mainSheet: number;
  board?: number;
  jibSheet?: number;
  hike?: number;
  righting?: boolean;
  rollTack?: boolean;
}

export interface SailingSettings {
  windSpeedKnots: number;
  windDirectionDeg: number;
  shifts: boolean;
  gusts: boolean;
  crewWeightKg: number;
  autoCrew?: boolean;
  spinnaker?: boolean;
  windShadows?: { position: Vec2; heading: number }[];
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
  heelDeg: number;
  heelingMoment: number;
  rightingMoment: number;
  planing: number;
  windShadow: number;
}

export type CameraMode = 'chase' | 'tactical';
