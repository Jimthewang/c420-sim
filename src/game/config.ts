/** Game rules and navigation tolerances, in metres and seconds unless named otherwise. */
export const RACE_CONFIG = {
  sequenceSeconds: 180, // College-style three-minute starting sequence.
  minimumLineWidth: 44, // Space for a small practice fleet on the starting line.
  lineWidthPerBoat: 9, // Additional starting-line space for each boat in a larger fleet.
  gateWidth: 26, // Distance between the two leeward gate marks.
  gateDistance: 26, // Leeward gate lies this far upwind of the start/finish line.
  roundingRadius: 13, // Navigation clearance around an inflatable mark.
  roundingZone: 46, // Crossing the correct side only counts close to the mark.
  returnClearance: 1, // An early starter must get clearly behind the line before restarting.
  contactDistance: 3.4, // Close hull contact triggers the simplified right-of-way check.
  separationDistance: 10, // Boats must separate before the same pair can receive another incident.
  incidentCooldown: 18, // Prevent a sustained contact from issuing repeated penalties.
  maxPendingPenalties: 3, // Outstanding one-turn penalties are bounded during a pileup.
  penaltyMinSpeed: 0.3, // A penalty turn must be sailed, not spun while stationary.
  raceTimeLimit: 1200, // Boats still racing twenty minutes after the gun are scored DNF.
  practiceRepeatDelay: 18, // After a valid practice start, allow this long before the next sequence.
  aiUpwindAngleDeg: 51, // Opponents sail comfortably outside the no-go zone.
  aiHeadingGain: 1.5, // Helm response to the difference between actual and desired heading.
  aiYawDamping: 1.1, // Centre the tiller as a turn approaches its target heading.
  aiAvoidDistance: 24, // Opponents start avoiding nearby boats before hull contact.
  aiAvoidLookaheadSeconds: 6, // Look ahead far enough to avoid a boat tacking into the current track.
  aiAvoidPassingDistanceM: 6, // Predicted hull centres should leave room for both boat lengths.
  aiEmergencyAvoidSeconds: 2, // Even a stand-on boat bears away when a collision is imminent.
  aiAvoidBearAwayDeg: 35, // Decisive give-way heading that stays powered outside the no-go zone.
  aiLoiterLaneSpacingM: 12, // Separate prestart reaching lanes leave room for downwind turns.
  aiStartEndClearanceM: 4, // Approach the starting segment inboard of its physical endpoints.
  aiStartApproachDepthM: 20, // Return this far below the line before crossing from outside an endpoint.
  aiPenaltyClearanceM: 24, // Sail clear of fixed objects before beginning or continuing a penalty circle.
  aiPenaltyEntrySpeedMps: 0.6, // Build rudder flow before attempting the upwind part of a penalty circle.
  aiObstacleClearanceM: 2, // Extra navigation room beyond hull and course-object collision radii.
  aiBackingThresholdMps: 0.05, // Reverse tiller action when actual water flow through the rudder is astern.
  aiRecoveryTrimAngleDeg: 38, // First ease completely, then trim once backed onto this angle on the new tack.
  aiRecoveryExitAngleDeg: 48, // Resume navigation only once the recovered boat is outside the no-go zone.
  aiRecoveryNoGoDeg: 40, // A backed-down hull inside this wind angle needs a deliberate escape tack.
  aiRecoverySpeedMps: 0.4, // Resume normal navigation only after the recovery has restored forward rudder flow.
};
