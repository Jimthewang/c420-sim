import { BOAT_CONFIG as B } from '../config/boat';
import { ENVIRONMENT_CONFIG as E, KNOTS_TO_MPS } from '../config/environment';
import { getTerrainGradient, getTerrainHeight, getTerrainIslands, isTerrainDeepWater } from '../world/terrain';
import { getBoatWavePose } from '../world/waves';
import type { BoatState, Vec2 } from './types';

export interface CollisionWind { speed:number; direction:number }
const defaultWind:CollisionWind={speed:10*KNOTS_TO_MPS,direction:0};
export interface CollisionBody { id:string; state:BoatState; previousPosition:Vec2; previousHeading:number; massKg:number; wind?:CollisionWind }
export type StaticObstacle = { id:string; kind:'mark'; position:Vec2; radius:number }
  | { id:string; kind:'committee'; position:Vec2; heading:number; length:number; beam:number };
export interface CollisionContact { a:string; b:string; kind:'boat'|'mark'|'committee'; positionA:Vec2; positionB:Vec2; headingA:number; headingB:number }
interface Box { position:Vec2; heading:number; length:number; beam:number }
interface Contact { normal:Vec2; depth:number; point:Vec2 }
const dot=(a:Vec2,b:Vec2)=>a.x*b.x+a.z*b.z;
const wrap=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));
const clamp=(value:number,low:number,high:number)=>Math.max(low,Math.min(high,value));
const hull=(state:BoatState):Box=>({position:state.position,heading:state.heading,length:B.lengthM,beam:B.beamM});
const axes=(heading:number):[Vec2,Vec2]=>[{x:Math.cos(heading),z:Math.sin(heading)},{x:Math.sin(heading),z:-Math.cos(heading)}];
const radius=(box:Box,axis:Vec2)=>{const [right,forward]=axes(box.heading);return Math.abs(dot(right,axis))*box.beam/2+Math.abs(dot(forward,axis))*box.length/2;};

/** Separating-axis minimum translation, normal pointing from B out toward A. */
function boxContact(a:Box,b:Box):Contact|null {
  const delta={x:a.position.x-b.position.x,z:a.position.z-b.position.z};
  if(Math.hypot(delta.x,delta.z)>(Math.hypot(a.length,a.beam)+Math.hypot(b.length,b.beam))/2)return null;
  let depth=Infinity,normal:Vec2={x:1,z:0};
  for(const axis of [...axes(a.heading),...axes(b.heading)]){
    const signed=dot(delta,axis),overlap=radius(a,axis)+radius(b,axis)-Math.abs(signed);
    if(overlap<=0)return null;
    if(overlap<depth){depth=overlap;const side=signed<0?-1:1;normal={x:axis.x*side,z:axis.z*side};}
  }
  const tangent={x:-normal.z,z:normal.x};
  const along=(dot(a.position,normal)-radius(a,normal)+dot(b.position,normal)+radius(b,normal))/2;
  const low=Math.max(dot(a.position,tangent)-radius(a,tangent),dot(b.position,tangent)-radius(b,tangent));
  const high=Math.min(dot(a.position,tangent)+radius(a,tangent),dot(b.position,tangent)+radius(b,tangent));
  const across=(low+high)/2;
  return {normal,depth,point:{x:normal.x*along+tangent.x*across,z:normal.z*along+tangent.z*across}};
}
function circleContact(box:Box,position:Vec2,radiusM:number):Contact|null {
  const [right,forward]=axes(box.heading),relative={x:position.x-box.position.x,z:position.z-box.position.z};
  const x=dot(relative,right),z=dot(relative,forward),halfX=box.beam/2,halfZ=box.length/2;
  const dx=x-clamp(x,-halfX,halfX),dz=z-clamp(z,-halfZ,halfZ),distance=Math.hypot(dx,dz);
  if(distance>=radiusM)return null;
  const point={x:box.position.x+right.x*clamp(x,-halfX,halfX)+forward.x*clamp(z,-halfZ,halfZ),z:box.position.z+right.z*clamp(x,-halfX,halfX)+forward.z*clamp(z,-halfZ,halfZ)};
  if(distance>1e-9)return {point,normal:{x:-(right.x*dx+forward.x*dz)/distance,z:-(right.z*dx+forward.z*dz)/distance},depth:radiusM-distance};
  const exitX=halfX-Math.abs(x),exitZ=halfZ-Math.abs(z);
  const axis=exitX<exitZ?right:forward,side=(exitX<exitZ?x:z)<0?1:-1;
  return {point,normal:{x:axis.x*side,z:axis.z*side},depth:radiusM+Math.min(exitX,exitZ)};
}
function wallImpulse(velocity:Vec2,normal:Vec2,friction:number,restitution=0):void {
  const closing=dot(velocity,normal);
  if(closing>=0)return;
  const impulse=-(1+restitution)*closing;
  velocity.x+=normal.x*impulse;velocity.z+=normal.z*impulse;
  const tangent={x:-normal.z,z:normal.x},speed=dot(velocity,tangent);
  const drag=clamp(speed,-friction*impulse,friction*impulse);
  velocity.x-=tangent.x*drag;velocity.z-=tangent.z*drag;
}
const cross=(a:Vec2,b:Vec2)=>a.x*b.z-a.z*b.x;
const inertia=(body:CollisionBody)=>(body.massKg-B.addedMassKg)*(B.lengthM**2+B.beamM**2)/12+B.yawAddedInertiaKgM2;
/** Contact-point impulses include yaw, with the same mass and inertia used by the sailing integrator. */
function rigidImpulse(a:CollisionBody,b:CollisionBody|null,contact:Contact):void {
  const ra={x:contact.point.x-a.state.position.x,z:contact.point.z-a.state.position.z};
  const rb=b?{x:contact.point.x-b.state.position.x,z:contact.point.z-b.state.position.z}:{x:0,z:0};
  const inverseA=1/a.massKg,inverseB=b?1/b.massKg:0,ia=1/inertia(a),ib=b?1/inertia(b):0;
  const relative=()=>({x:a.state.velocity.x-a.state.yawRate*ra.z-(b?b.state.velocity.x-b.state.yawRate*rb.z:0),
    z:a.state.velocity.z+a.state.yawRate*ra.x-(b?b.state.velocity.z+b.state.yawRate*rb.x:0)});
  const denominator=(axis:Vec2)=>inverseA+inverseB+cross(ra,axis)**2*ia+cross(rb,axis)**2*ib;
  const apply=(axis:Vec2,magnitude:number)=>{
    const impulse={x:axis.x*magnitude,z:axis.z*magnitude};
    a.state.velocity.x+=impulse.x*inverseA;a.state.velocity.z+=impulse.z*inverseA;a.state.yawRate+=cross(ra,impulse)*ia;
    if(b){b.state.velocity.x-=impulse.x*inverseB;b.state.velocity.z-=impulse.z*inverseB;b.state.yawRate-=cross(rb,impulse)*ib;}
  };
  const closing=dot(relative(),contact.normal);
  if(closing>=0)return;
  const impulse=-(1+E.collisionRestitution)*closing/denominator(contact.normal);
  apply(contact.normal,impulse);
  const tangent={x:-contact.normal.z,z:contact.normal.x};
  apply(tangent,clamp(-dot(relative(),tangent)/denominator(tangent),-E.collisionFriction*impulse,E.collisionFriction*impulse));
}
function terrainContact(state:BoatState,wind:CollisionWind=defaultWind):{penetration:number;point:Vec2} {
  const pose=getBoatWavePose(state,wind.speed/KNOTS_TO_MPS,wind.direction);
  const roll=-state.heel+pose.roll,cr=Math.cos(roll),sr=Math.sin(roll),cp=Math.cos(pose.pitch),sp=Math.sin(pose.pitch);
  const ch=Math.cos(state.heading),sh=Math.sin(state.heading);
  let penetration=-Infinity,point=state.position;
  const probe=(x:number,y:number,z:number)=>{
    // Same YXZ rigid transform as the rendered boat, including wave troughs and heeled appendages.
    const rx=cr*x-sr*y,ry=sr*x+cr*y,py=cp*ry-sp*z,pz=sp*ry+cp*z;
    const p={x:state.position.x+ch*rx-sh*pz,z:state.position.z+sh*rx+ch*pz};
    const overlap=getTerrainHeight(p.x,p.z)-(pose.height+py)+E.terrainMeshClearanceM;
    if(overlap>penetration){penetration=overlap;point=p;}
  };
  const alongSteps=Math.ceil(B.lengthM/E.terrainProbeSpacingM),acrossSteps=Math.ceil(B.beamM/E.terrainProbeSpacingM);
  for(let i=0;i<=alongSteps;i++)for(let j=0;j<=acrossSteps;j++)for(const y of [-B.hullDraftM,B.hullRailHeightM])probe((j/acrossSteps-.5)*B.beamM,y,(i/alongSteps-.5)*B.lengthM);
  // At ninety degrees of heel the gunwale and topsides, rather than the keel plane, face the shore.
  for(let i=0;i<=alongSteps;i++)for(const x of [-B.beamM/2,B.beamM/2])probe(x,(B.hullRailHeightM-B.hullDraftM)/2,(i/alongSteps-.5)*B.lengthM);
  const boardLength=B.boardLengthM*(B.boardMinExtension+state.centerboard*(1-B.boardMinExtension));
  for(const [top,length,aft] of [[B.boardTopY,boardLength,B.boardAftM],[B.rudderTopY,B.rudderLengthM,B.lengthM/2+B.rudderAftOffsetM]]){
    const intervals=Math.ceil(length/E.terrainProbeSpacingM);
    for(let i=0;i<=intervals;i++)for(const foreAft of [-B.foilChordClearanceM,B.foilChordClearanceM])probe(0,top-length*i/intervals,aft+foreAft);
  }
  return {penetration,point};
}
export const getBoatTerrainClearance=(state:BoatState,wind:CollisionWind=defaultWind):number=>-terrainContact(state,wind).penetration;

function projectTerrain(state:BoatState,motion:Vec2,wind:CollisionWind=defaultWind):boolean {
  // The complete hull, appendages and wave displacement fit inside this conservative disk.
  if(isTerrainDeepWater(state.position.x,state.position.z,B.lengthM/2+B.rudderAftOffsetM+B.foilChordClearanceM+B.boardLengthM))return false;
  let hit=false;
  for(let iteration=0;iteration<E.terrainResolveIterations;iteration++){
    const contact=terrainContact(state,wind);
    if(contact.penetration<=-E.collisionSkinM)break;
    let gradient=getTerrainGradient(contact.point.x,contact.point.z),slope=Math.hypot(gradient.x,gradient.z);
    if(slope<1e-5){
      // A reset should protect occupied water; this radial exit also handles an externally placed hull at a summit.
      const nearest=[...getTerrainIslands()].sort((a,b)=>Math.hypot(a.x-state.position.x,a.z-state.position.z)-Math.hypot(b.x-state.position.x,b.z-state.position.z))[0];
      gradient={x:nearest.x-state.position.x,z:nearest.z-state.position.z};slope=Math.hypot(gradient.x,gradient.z);
      if(slope<1e-5){gradient={x:1,z:0};slope=1;}
    }
    const normal={x:-gradient.x/slope,z:-gradient.z/slope};
    const correction=Math.min(E.terrainMaxCorrectionM,(contact.penetration+E.collisionSkinM)/slope);
    const previousX=state.position.x,previousZ=state.position.z;
    state.position.x+=normal.x*correction;state.position.z+=normal.z*correction;
    wallImpulse(state.velocity,normal,E.terrainFriction);
    wallImpulse(motion,normal,E.terrainFriction);
    // At the skin boundary, roundoff can request a correction too small to change either coordinate.
    if(state.position.x===previousX && state.position.z===previousZ)break;
    hit=true;
  }
  return hit;
}
/** Called after every force-integration substep. Sweep the complete hull and appendage envelope. */
export function resolveTerrainCollision(state:BoatState,previousPosition:Vec2,previousHeading:number,dt:number,wind:CollisionWind=defaultWind):boolean {
  if(dt<=0)return false;
  const finalHeading=state.heading;
  const delta={x:state.position.x-previousPosition.x,z:state.position.z-previousPosition.z},turn=wrap(state.heading-previousHeading);
  const steps=Math.max(1,Math.ceil((Math.hypot(delta.x,delta.z)+Math.abs(turn)*B.lengthM/2)/E.collisionSweepStepM));
  const motion={x:delta.x/steps,z:delta.z/steps};
  state.position={...previousPosition};state.heading=previousHeading;
  let hit=false;
  for(let i=0;i<steps;i++){
    state.position.x+=motion.x;state.position.z+=motion.z;state.heading+=turn/steps;
    hit=projectTerrain(state,motion,wind)||hit;
  }
  state.heading=finalHeading;
  return hit;
}

/** Rigid contacts use post-integration poses. The returned first-contact poses precede all separation. */
export function resolveWorldCollisions(bodies:CollisionBody[],obstacles:StaticObstacle[],dt:number):CollisionContact[] {
  const contacts=new Map<string,CollisionContact>();
  let steps=1;
  const paths=bodies.map(body=>{
    const delta={x:body.state.position.x-body.previousPosition.x,z:body.state.position.z-body.previousPosition.z};
    const turn=wrap(body.state.heading-body.previousHeading);
    steps=Math.max(steps,Math.ceil((Math.hypot(delta.x,delta.z)+Math.abs(turn)*B.lengthM/2)/E.collisionSweepStepM));
    return {delta,turn,heading:body.state.heading};
  });
  const motions=paths.map(path=>({x:path.delta.x/steps,z:path.delta.z/steps}));
  for(const body of bodies){body.state.position={...body.previousPosition};body.state.heading=body.previousHeading;}
  const remember=(a:CollisionBody,id:string,kind:CollisionContact['kind'],position:Vec2,heading:number)=>{
    const key=`${a.id}/${id}`;
    if(!contacts.has(key))contacts.set(key,{a:a.id,b:id,kind,positionA:{...a.state.position},positionB:{...position},headingA:a.state.heading,headingB:heading});
  };
  for(let step=0;step<steps;step++){
    for(let i=0;i<bodies.length;i++){
      const state=bodies[i].state;
      state.position.x+=motions[i].x;state.position.z+=motions[i].z;state.heading+=paths[i].turn/steps;
    }
    for(let pass=0;pass<E.collisionIterations+E.collisionChainPassesPerBodySquared*bodies.length**2;pass++){
      let changed=false;
      for(let i=0;i<bodies.length;i++){
        const body=bodies[i],state=body.state;
        for(const obstacle of obstacles){
          const contact=obstacle.kind==='mark'?circleContact(hull(state),obstacle.position,obstacle.radius):boxContact(hull(state),obstacle);
          if(!contact)continue;
          changed=true;remember(body,obstacle.id,obstacle.kind,obstacle.position,obstacle.kind==='committee'?obstacle.heading:0);
          state.position.x+=contact.normal.x*(contact.depth+E.collisionSkinM);state.position.z+=contact.normal.z*(contact.depth+E.collisionSkinM);
          rigidImpulse(body,null,contact);
          wallImpulse(motions[i],contact.normal,E.collisionFriction,E.collisionRestitution);
        }
        for(let j=i+1;j<bodies.length;j++){
          const other=bodies[j],contact=boxContact(hull(state),hull(other.state));
          if(!contact)continue;
          changed=true;remember(body,other.id,'boat',other.state.position,other.state.heading);
          const inverseA=1/body.massKg,inverseB=1/other.massKg,total=inverseA+inverseB;
          const correction=(contact.depth+E.collisionSkinM)/total;
          state.position.x+=contact.normal.x*correction*inverseA;state.position.z+=contact.normal.z*correction*inverseA;
          other.state.position.x-=contact.normal.x*correction*inverseB;other.state.position.z-=contact.normal.z*correction*inverseB;
          rigidImpulse(body,other,contact);
          for(const [va,vb] of [[motions[i],motions[j]]]){
            const relative={x:va.x-vb.x,z:va.z-vb.z},closing=dot(relative,contact.normal);
            if(closing>=0)continue;
            const normalImpulse=-(1+E.collisionRestitution)*closing/total;
            const tangent={x:-contact.normal.z,z:contact.normal.x};
            const tangentImpulse=clamp(-dot(relative,tangent)/total,-E.collisionFriction*normalImpulse,E.collisionFriction*normalImpulse);
            const impulse={x:contact.normal.x*normalImpulse+tangent.x*tangentImpulse,z:contact.normal.z*normalImpulse+tangent.z*tangentImpulse};
            va.x+=impulse.x*inverseA;va.z+=impulse.z*inverseA;vb.x-=impulse.x*inverseB;vb.z-=impulse.z*inverseB;
          }
        }
      }
      // Alternate constraints: a shore correction can otherwise push a hull back into another solid.
      for(let i=0;i<bodies.length;i++)changed=projectTerrain(bodies[i].state,motions[i],bodies[i].wind)||changed;
      if(!changed)break;
    }
  }
  bodies.forEach((body,i)=>{body.state.heading=paths[i].heading;});
  return [...contacts.values()];
}
