import { BOAT_CONFIG as B } from '../config/boat';
import { DEG_TO_RAD, ENVIRONMENT_CONFIG as E } from '../config/environment';
import { getTelemetry, sampleWind } from '../physics/sailing';
import type { Controls, SailingSettings, Vec2 } from '../physics/types';
import { courseCoordinates, coursePoint, getNavigationTarget, requestPenaltyTurn } from './race';
import type { Racer, RaceState } from './race';
import { RACE_CONFIG as C } from './config';

interface Pilot { tack: number; loiterSide: number; tackHold: number; recoverySide:number; recoveryTrim:boolean; recoveryStalled:number; loiterGybe:boolean }
const pilots = new WeakMap<Racer, Pilot>();
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/** Supplies helm and sheets only. Advance opponents with the same stepBoat used by the player. */
export function aiControls(racer: Racer, race: RaceState, settings: SailingSettings, dt: number): Controls {
  const state = racer.state;
  if (state.capsized) return { steer: 0, mainSheet: 0, board: 1, righting: true };
  const wind = sampleWind(state.position.x, state.position.z, state.time, settings);
  const telemetry = getTelemetry(state, settings);
  let pilot = pilots.get(racer);
  if (!pilot) {
    pilot = { tack: Math.sign(wrap(state.heading - wind.direction)) || 1, loiterSide: 1, tackHold: 0, recoverySide:0, recoveryTrim:false, recoveryStalled:0, loiterGybe:false };
    pilots.set(racer, pilot);
  }
  pilot.tackHold = Math.max(0, pilot.tackHold - dt);
  const forward: Vec2 = { x: Math.sin(state.heading), z: -Math.cos(state.heading) };
  const forwardSpeed = state.velocity.x * forward.x + state.velocity.z * forward.z;
  const windAngle=wrap(state.heading-wind.direction)/DEG_TO_RAD;
  if(!pilot.recoverySide && forwardSpeed < -C.aiBackingThresholdMps && Math.abs(windAngle)<C.aiRecoveryNoGoDeg){
    pilot.recoverySide=-(Math.sign(windAngle)||pilot.tack);pilot.recoveryTrim=false;
  }
  if(pilot.recoverySide){
    const stalled=windAngle*pilot.recoverySide>0 && forwardSpeed < -C.aiBackingThresholdMps
      && Math.abs(state.yawRate)<C.aiRecoveryStallRateDegPerSecond*DEG_TO_RAD;
    pilot.recoveryStalled=stalled?pilot.recoveryStalled+dt:0;
    if((pilot.recoveryTrim && windAngle*pilot.recoverySide<C.aiRecoveryRetryAngleDeg && forwardSpeed < -C.aiBackingThresholdMps)
      || pilot.recoveryStalled>=C.aiRecoveryStallSeconds){
      // A shift can beat the finite sheet take-up. Depower and back across again instead of remaining sheeted in forever.
      pilot.recoverySide=-(Math.sign(windAngle)||pilot.recoverySide);pilot.recoveryTrim=false;pilot.recoveryStalled=0;
    }
    const recoveryAngle=windAngle*pilot.recoverySide;
    if(recoveryAngle>C.aiRecoveryTrimAngleDeg)pilot.recoveryTrim=true;
    if(recoveryAngle>C.aiRecoveryExitAngleDeg && forwardSpeed>C.aiRecoverySpeedMps){
      pilot.tack=pilot.recoverySide;pilot.tackHold=10;pilot.recoverySide=0;
    }else{
      // Ease to back across the wind, then trim on the new tack and reverse the tiller when forward flow returns.
      return {steer:pilot.recoverySide*(forwardSpeed>C.aiBackingThresholdMps?1:-1),mainSheet:pilot.recoveryTrim?1:0,board:1,righting:true};
    }
  }
  const index = race.racers.indexOf(racer);
  let target = getNavigationTarget(racer, race);
  const local=courseCoordinates(race.course,state.position),halfLine=Math.hypot(race.course.committee.x,race.course.committee.z);
  const loitering=race.phase === 'prestart' || race.phase === 'free' || race.phase === 'countdown' && race.countdown > 24;
  if (loitering) {
    if(local.x*pilot.loiterSide>halfLine+3){pilot.loiterSide*=-1;pilot.loiterGybe=true;}
    if(Math.abs(windAngle)>150)pilot.loiterGybe=false;
    target=coursePoint(race.course,pilot.loiterSide*(halfLine+12),-28-index*C.aiLoiterLaneSpacingM);
  }else if(!racer.started){
    // A fixed central target triggers the layline tack before the boat runs into a line-end obstacle.
    const outside=Math.abs(local.x)>halfLine-C.aiStartEndClearanceM && local.z>-C.aiStartApproachDepthM;
    target=coursePoint(race.course,0,racer.ocs || local.z>0 || outside?-C.aiStartApproachDepthM:14);
  }
  if (!target) return { steer: 0, mainSheet: 0, board: 1, righting: true };
  const obstacles=race.options.mode==='free'||race.options.mode==='tutorial'?[]:[
    {position:race.course.committee,radius:Math.hypot(E.committeeLengthM,E.committeeBeamM)/2},
    ...[race.course.startPin,race.course.windward,race.course.gatePort,race.course.gateStarboard].map(position=>({position,radius:E.markRadiusM})),
  ];
  const nearby=obstacles.map(obstacle=>({...obstacle,distance:Math.hypot(obstacle.position.x-state.position.x,obstacle.position.z-state.position.z)})).sort((a,b)=>a.distance-b.distance)[0];
  const penaltyClear=!nearby || nearby.distance>C.aiPenaltyClearanceM;
  if (racer.penaltyTurns>0 && race.phase==='racing' && penaltyClear && forwardSpeed>C.aiPenaltyEntrySpeedMps)requestPenaltyTurn(racer);
  const mainOpening = clamp(Math.abs(telemetry.apparentWindAngleDeg) - B.mainEffectiveTwistDeg - B.sailPeakAngleDeg, B.minMainAngleDeg, B.maxMainAngleDeg);
  const mainSheet = (B.maxMainAngleDeg - mainOpening) / (B.maxMainAngleDeg - B.minMainAngleDeg);
  const jibOpening = clamp(Math.abs(telemetry.apparentWindAngleDeg) - B.jibEffectiveTwistDeg - B.jibTargetAttackDeg, B.minJibAngleDeg, B.maxJibAngleDeg);
  const jibSheet = (B.maxJibAngleDeg - jibOpening) / (B.maxJibAngleDeg - B.minJibAngleDeg);
  let desired = Math.atan2(target.x - state.position.x, -(target.z - state.position.z));
  if(racer.penaltyTurns>0 && !penaltyClear && nearby)desired=Math.atan2(state.position.x-nearby.position.x,-(state.position.z-nearby.position.z));
  if(loitering && pilot.loiterGybe)desired=wind.direction+Math.PI;
  const relative = wrap(desired - wind.direction);
  const upwindAngle = C.aiUpwindAngleDeg * DEG_TO_RAD;
  if (Math.abs(relative) < upwindAngle) {
    if (Math.sign(relative) !== pilot.tack && Math.abs(relative) > upwindAngle - 4 * DEG_TO_RAD && pilot.tackHold === 0) {
      pilot.tack = Math.sign(relative) || -pilot.tack; pilot.tackHold = 10;
    }
    desired = wind.direction + pilot.tack * upwindAngle;
  } else {
    const proposed = Math.sign(relative) || pilot.tack;
    if (Math.abs(relative) < Math.PI / 2 && proposed !== pilot.tack && pilot.tackHold === 0) { pilot.tack = proposed; pilot.tackHold = 10; }
  }
  // Give-way boats bear away early; this does not replace the race's contact adjudication.
  for (const other of race.racers) {
    if (other === racer || other.finishedAt !== null) continue;
    const dx = other.state.position.x - state.position.x, dz = other.state.position.z - state.position.z;
    const separation = Math.hypot(dx, dz);
    if (separation >= C.aiAvoidDistance || separation < 0.01 || dx * forward.x + dz * forward.z < 0) continue;
    const ownStarboard = Math.sin(wind.direction - state.heading) > 0;
    const otherStarboard = Math.sin(wind.direction - other.state.heading) > 0;
    const windward = (state.position.x - other.state.position.x) * Math.sin(wind.direction) - (state.position.z - other.state.position.z) * Math.cos(wind.direction) > 0;
    const following = dx * forward.x + dz * forward.z > B.lengthM / 2 && Math.abs(dx * Math.cos(state.heading) + dz * Math.sin(state.heading)) < B.beamM;
    const givingWay=(!ownStarboard && otherStarboard) || ownStarboard === otherStarboard && (windward || following);
    const vx=other.state.velocity.x-state.velocity.x,vz=other.state.velocity.z-state.velocity.z;
    const approach=clamp(-(dx*vx+dz*vz)/Math.max(vx*vx+vz*vz,B.velocityEpsilonMps),0,C.aiAvoidLookaheadSeconds);
    const closest=Math.hypot(dx+vx*approach,dz+vz*approach);
    if(closest<C.aiAvoidPassingDistanceM && (givingWay || approach<C.aiEmergencyAvoidSeconds)){
      // Predict a tacking boat's crossing path and bear away before its bow reaches this hull.
      const side=Math.sign(wrap(state.heading-wind.direction))||pilot.tack;
      desired=wind.direction+side*Math.min(170*DEG_TO_RAD,Math.max(upwindAngle,Math.abs(wrap(state.heading-wind.direction)))+C.aiAvoidBearAwayDeg*DEG_TO_RAD);
    }else if(givingWay)desired+=(Math.sign(wrap(state.heading-wind.direction))||1)*.5*(1-separation/C.aiAvoidDistance);
  }
  if (race.options.mode !== 'free' && race.options.mode !== 'tutorial') {
    for (const {position,radius} of obstacles) {
      const dx = position.x - state.position.x, dz = position.z - state.position.z, distance = Math.hypot(dx, dz);
      if (distance >= C.aiAvoidDistance || distance < B.velocityEpsilonMps) continue;
      const bearing = Math.atan2(dx, -dz), difference = wrap(desired - bearing);
      const clearance = radius + Math.hypot(B.lengthM, B.beamM) / 2 + C.aiObstacleClearanceM;
      const cone = Math.asin(Math.min(1, clearance / distance));
      if (Math.abs(difference) < cone) desired = bearing + (Math.sign(difference) || pilot.tack) * cone;
    }
  }
  let steer = clamp(wrap(desired - state.heading) * C.aiHeadingGain - state.yawRate * C.aiYawDamping, -1, 1);
  if (racer.takingPenalty && penaltyClear) steer = telemetry.speedKnots > 0.8 ? 0.65 : 1;
  // The foil model already reverses its effect while backing; the helmsman must reverse the tiller too.
  if (forwardSpeed < -C.aiBackingThresholdMps) steer *= -1;
  return { steer, mainSheet, jibSheet, board: Math.abs(telemetry.trueWindAngleDeg) > 110 ? 0.45 : 1,
    hike: Math.sin(wind.direction - state.heading), righting: true, rollTack: pilot.tackHold > 7 && pilot.tackHold < 9 };
}

/** Every boat sees wakes from the rest of the fleet, never its own wind shadow. */
export function fleetSettings(racer: Racer, race: RaceState, settings: SailingSettings): SailingSettings {
  return { ...settings, autoCrew: racer.isPlayer ? settings.autoCrew : true,
    windShadows: race.racers.filter(other => other !== racer).map(other => ({ position: other.state.position, heading: other.state.heading })) };
}
