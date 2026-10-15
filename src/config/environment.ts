import type { SailingSettings } from '../physics/types';

/** Metres per second in one knot; the controls display knots, forces use SI units. */
export const KNOTS_TO_MPS = 0.514444;
/** Radians per degree; compass displays use degrees, trigonometry uses radians. */
export const DEG_TO_RAD = Math.PI / 180;

export const DEFAULT_SETTINGS: SailingSettings = {
  windSpeedKnots: 10, // A moderate breeze for the first free sail.
  windDirectionDeg: 0, // Wind blows from north toward south.
  shifts: true, // Slowly change the wind direction around its average.
  gusts: true, // Moving puffs and lulls change local wind strength.
  crewWeightKg: 130, // Combined skipper and crew weight, added to the hull mass.
  autoCrew: true, // The crew trims the jib and moves weight unless manual handling is selected.
  spinnaker: false, // Use the college main-and-jib rig by default.
};

export const ENVIRONMENT_CONFIG = {
  airDensityKgM3: 1.225, // Air density near sea level; sets sail force at a given breeze.
  waterDensityKgM3: 1025, // Salt-water density; sets foil forces and water resistance.
  fixedTimeStep: 1 / 120, // Simulate 120 small physics steps each second for stable foil response.
  maxFrameDelta: 0.1, // Do not catch up more than a tenth of a second after a delayed frame.
  windSpeedMinKnots: 4, // Lightest breeze offered by the settings panel.
  windSpeedMaxKnots: 20, // Strongest breeze offered by the settings panel.
  crewWeightMinKg: 80, // Lowest combined crew weight offered by the panel.
  crewWeightMaxKg: 220, // Highest combined crew weight offered by the panel.
  shiftAmplitudeDeg: 7, // Largest combined oscillating shift away from the selected wind direction.
  shiftPeriodSeconds: 85, // Time taken by the dominant slow wind shift.
  shiftSecondaryPeriodSeconds: 31, // A smaller second oscillation makes shifts less metronomic.
  shiftPrimaryShare: 0.75, // Share of the directional shift coming from the slow oscillation.
  puffAmplitude: 0.22, // Puffs and lulls vary wind speed by at most 22 percent.
  puffAlongLengthM: 110, // Distance between stronger bands measured downwind.
  puffAcrossLengthM: 160, // Width of the changing breeze pattern across the wind.
  puffSecondaryLengthM: 57, // Smaller patches create variation inside each broad puff band.
  puffPrimaryShare: 0.7, // Most gust strength comes from the broad moving bands.
  puffCrossDistortion: 1.1, // Curves the puff boundaries across the water instead of straight stripes.
  puffSecondaryCrossSlope: 0.55, // Slants the small puff pattern across the dominant wind.
  waveTimeBase: 0.35, // Visual water motion remains slow in very light air.
  waveTimeWindDivisor: 18, // Stronger wind speeds up the visible ripple motion.
  waveDistortionBase: 0.55, // Minimum visual ripple distortion on the water surface.
  waveDistortionPerKnot: 0.11, // Each additional knot makes the visible surface rougher.
  waveTextureScaleBase: 1.5, // Starting scale of the visible water ripples.
  waveTextureScalePerKnot: 0.035, // Wind changes the visual ripple scale; wave forces arrive in a later phase.
  windShadowMaxReduction: 0.35, // A close covering boat can remove at most 35 percent of local wind speed.
  windShadowLengthM: 55, // Disturbed air fades out within this distance downwind of a boat.
  windShadowDecayM: 25, // Wake strength fades progressively farther from the other boat.
  windShadowInitialWidthM: 2.2, // Width of the disturbed-air plume just behind the sail plan.
  windShadowSpread: 0.16, // The disturbed-air plume widens with distance downwind.
  windShadowIgnoreRadiusM: 2.5, // Ignore coincident sources so a boat does not shade itself.
};
