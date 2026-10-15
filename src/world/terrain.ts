import { DEG_TO_RAD, ENVIRONMENT_CONFIG as E } from '../config/environment';
import type { Vec2 } from '../physics/types';

export interface TerrainIsland { id:number; x:number; z:number; radius:number; height:number; angle:number; aspect:number; bay:boolean }
let seed = E.terrainSeed;
let islands:TerrainIsland[] = [];
let course:{ windDirectionDeg:number; length:number }|null = null;
let protectedPoints:Vec2[] = [];
const permutation = new Uint16Array(512);
const fade = (t:number) => t*t*t*(t*(t*6-15)+10);
const lerp = (a:number,b:number,t:number) => a+(b-a)*t;
const smooth = (value:number) => { const t=Math.max(0,Math.min(1,value)); return t*t*(3-2*t); };

/** Seeded shuffle and island placement; the integer constants belong to the PRNG, not terrain tuning. */
export function setTerrainSeed(value:number):void {
  seed = Math.trunc(value) >>> 0;
  let randomState = seed;
  const random = () => {
    let n = randomState += 0x6d2b79f5;
    n = Math.imul(n ^ n >>> 15, n | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
  const values = Array.from({length:256},(_,i)=>i);
  for(let i=255;i>0;i--){const j=Math.floor(random()*(i+1));[values[i],values[j]]=[values[j],values[i]];}
  for(let i=0;i<512;i++)permutation[i]=values[i&255];
  islands = Array.from({length:E.terrainIslandCount},(_,id)=>{
    const angle=(id+random())/E.terrainIslandCount*Math.PI*2;
    const distance=lerp(E.terrainIslandMinDistanceM,E.terrainIslandMaxDistanceM,random());
    return {id,x:Math.cos(angle)*distance,z:Math.sin(angle)*distance,
      radius:lerp(E.terrainIslandMinRadiusM,E.terrainIslandMaxRadiusM,random()),
      height:id%4===3?lerp(1,E.terrainReefMaxHeightM,random()):lerp(E.terrainIslandMinHeightM,E.terrainIslandMaxHeightM,random()),
      angle:random()*Math.PI*2,aspect:lerp(E.terrainIslandMinAspect,1,random()),bay:id%3===1};
  });
}
export const getTerrainSeed = () => seed;
export const getTerrainIslands = ():readonly TerrainIsland[] => islands;
export function configureTerrainCourse(value:{windDirectionDeg:number;length:number}|null):void { course=value?{...value}:null; }
export function protectTerrainPoints(points:readonly Vec2[]):void { protectedPoints=points.map(point=>({...point})); }

// Unit gradient vectors and quintic interpolation keep first derivatives continuous across lattice cells.
function gradient(hash:number,x:number,z:number):number {
  const angle=(hash&7)*Math.PI/4;
  return Math.cos(angle)*x+Math.sin(angle)*z;
}
function perlin(x:number,z:number):number {
  const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz,u=fade(fx),v=fade(fz);
  const a=permutation[ix&255]+(iz&255),b=permutation[(ix+1)&255]+(iz&255);
  return lerp(lerp(gradient(permutation[a],fx,fz),gradient(permutation[b],fx-1,fz),u),
    lerp(gradient(permutation[a+1],fx,fz-1),gradient(permutation[b+1],fx-1,fz-1),u),v);
}
function fbm(x:number,z:number):number {
  let amplitude=1,frequency=1/E.terrainNoiseScaleM,total=0,weight=0;
  for(let i=0;i<E.terrainNoiseOctaves;i++){
    total+=amplitude*perlin(x*frequency,z*frequency);weight+=amplitude;
    amplitude*=E.terrainNoisePersistence;frequency*=E.terrainNoiseLacunarity;
  }
  return total/weight;
}
function waterBlend(x:number,z:number):number {
  let blend=smooth((Math.hypot(x,z)-E.terrainHarbourRadiusM)/E.terrainWaterBlendM);
  if(blend===0)return 0;
  if(course){
    const angle=course.windDirectionDeg*DEG_TO_RAD;
    const across=x*Math.cos(angle)+z*Math.sin(angle),up=x*Math.sin(angle)-z*Math.cos(angle);
    const halfWidth=Math.max(E.terrainCourseHalfWidthMinM,course.length*E.terrainCourseWidthPerLength);
    const dx=Math.max(0,Math.abs(across)-halfWidth);
    const dz=Math.max(0,-E.terrainCourseBehindM-up,up-course.length-E.terrainCourseBeyondM);
    blend*=smooth(Math.hypot(dx,dz)/E.terrainWaterBlendM);
  }
  for(const point of protectedPoints)blend*=smooth((Math.hypot(x-point.x,z-point.z)-E.terrainProtectedRadiusM)/E.terrainWaterBlendM);
  return blend;
}
/** Conservative broad phase: every point inside the supplied disk is flat protected or offshore water. */
export function isTerrainDeepWater(x:number,z:number,radius:number):boolean {
  if(Math.hypot(x,z)+radius<E.terrainHarbourRadiusM)return true;
  if(course){
    const angle=course.windDirectionDeg*DEG_TO_RAD;
    const across=x*Math.cos(angle)+z*Math.sin(angle),up=x*Math.sin(angle)-z*Math.cos(angle);
    const halfWidth=Math.max(E.terrainCourseHalfWidthMinM,course.length*E.terrainCourseWidthPerLength);
    if(Math.abs(across)+radius<halfWidth && up-radius>-E.terrainCourseBehindM && up+radius<course.length+E.terrainCourseBeyondM)return true;
  }
  if(protectedPoints.some(point=>Math.hypot(x-point.x,z-point.z)+radius<E.terrainProtectedRadiusM))return true;
  return islands.every(island=>Math.hypot(x-island.x,z-island.z)>island.radius+radius);
}
/** World x east / z south, height in metres with the sea at y=0. Renderer and physics share this function. */
export function getTerrainHeight(x:number,z:number):number {
  const blend=waterBlend(x,z);
  if(blend===0)return -E.terrainDepthM;
  let elevation=0;
  for(const island of islands){
    const dx=(x-island.x)/island.radius,dz=(z-island.z)/island.radius,outer=dx*dx+dz*dz;
    if(outer>=1)continue;
    const c=Math.cos(island.angle),s=Math.sin(island.angle),u=dx*c+dz*s,v=(-dx*s+dz*c)/island.aspect;
    const noise=fbm(x,z);
    const r2=(u*u+v*v)*(1+E.terrainCoastWarp*noise*(1-outer));
    if(r2>=1)continue;
    // An off-centre bay cuts through one coast while leaving a connected headland on each side.
    const bay=island.bay?1-E.terrainBayDepth*Math.exp(-((u-.5)**2+v*v)/(2*E.terrainBayWidth**2)):1;
    elevation+=(island.height+E.terrainDepthM)*(1-r2)**2*(1+E.terrainNoiseStrength*noise)*bay;
  }
  return -E.terrainDepthM+elevation*blend;
}
export function getTerrainGradient(x:number,z:number):Vec2 {
  const d=E.terrainGradientStepM;
  return {x:(getTerrainHeight(x+d,z)-getTerrainHeight(x-d,z))/(2*d),z:(getTerrainHeight(x,z+d)-getTerrainHeight(x,z-d))/(2*d)};
}
setTerrainSeed(seed);
