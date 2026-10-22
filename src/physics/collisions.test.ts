import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BOAT_CONFIG as B } from '../config/boat';
import { DEFAULT_SETTINGS, ENVIRONMENT_CONFIG as E } from '../config/environment';
import { getBoatWavePose } from '../world/waves';
import { Matrix4, Euler, Vector3 } from 'three';
import { hullGeometry, foilGeometry } from '../render/geometry';
import { createBoatState, stepBoat } from './sailing';
import { getBoatTerrainClearance, resolveTerrainCollision, resolveWorldCollisions } from './collisions';
import { configureTerrainCourse, getTerrainGradient, getTerrainHeight, getTerrainIslands, getTerrainSeed, protectTerrainPoints, setTerrainSeed } from '../world/terrain';
import * as terrain from '../world/terrain';

beforeEach(() => { setTerrainSeed(420); configureTerrainCourse(null); protectTerrainPoints([]); });

describe('shared continuous terrain', () => {
  it('keeps a three-metre shoreline mesh within the collision safety margin across seeds and island shapes', () => {
    let maximumError=0;
    for(const seed of [2,420,421,881]){
      setTerrainSeed(seed);
      for(const island of getTerrainIslands()){
        for(let x=Math.floor((island.x-island.radius)/3)*3;x<island.x+island.radius;x+=3)for(let z=Math.floor((island.z-island.radius)/3)*3;z<island.z+island.radius;z+=3){
          const a=getTerrainHeight(x,z),b=getTerrainHeight(x,z+3),c=getTerrainHeight(x+3,z),d=getTerrainHeight(x+3,z+3);
          if(Math.min(a,b,c,d)>3 || Math.max(a,b,c,d)<-3)continue;
          for(const [u,v] of [[.25,.25],[.5,.5],[.75,.75],[.25,.75],[.75,.25]]){
            const actual=getTerrainHeight(x+u*3,z+v*3);
            const interpolated=u+v<=1?a+(c-a)*u+(b-a)*v:d+(b-d)*(1-u)+(c-d)*(1-v);
            maximumError=Math.max(maximumError,Math.abs(actual-interpolated));
          }
        }
      }
    }
    expect(maximumError).toBeLessThan(E.terrainMeshClearanceM);
  });
  it('includes low reefs and distinctly noncircular shorelines', () => {
    const islands=getTerrainIslands();
    expect(islands.some(island=>island.height<5)).toBe(true);
    let irregular=0;
    for(const island of islands){
      if(Math.hypot(island.x,island.z)<200 || island.height<5)continue;
      const radii=[];
      for(let angle=0;angle<Math.PI*2;angle+=Math.PI/12){
        let shore=0;
        for(let radius=0;radius<island.radius;radius+=.5)if(getTerrainHeight(island.x+Math.cos(angle)*radius,island.z+Math.sin(angle)*radius)>0)shore=radius;
        radii.push(shore);
      }
      if(Math.max(...radii)-Math.min(...radii)>island.radius*.25)irregular++;
    }
    expect(irregular).toBeGreaterThanOrEqual(2);
  });
  it('repeats a seed, changes islands for another seed, and retains a deep launch harbour', () => {
    const first = getTerrainIslands().map(island => ({ ...island }));
    expect(first.every(island => Math.hypot(island.x, island.z) >= 120 && Math.hypot(island.x, island.z) <= 450)).toBe(true);
    setTerrainSeed(421);
    expect(getTerrainSeed()).toBe(421);
    expect(getTerrainIslands()).not.toEqual(first);
    setTerrainSeed(420);
    expect(getTerrainIslands()).toEqual(first);
    for (let x = -50; x <= 50; x += 10) for (let z = -50; z <= 50; z += 10) expect(getTerrainHeight(x, z)).toBeLessThan(-2);
  });
  it('keeps the full long-course rectangle clear at every compass heading', () => {
    for (const seed of [2, 420, 881]) for (let degrees = 0; degrees < 360; degrees += 30) {
      setTerrainSeed(seed); configureTerrainCourse({ windDirectionDeg: degrees, length: 350 });
      const angle = degrees * Math.PI / 180;
      for (let across = -200; across <= 200; across += 40) for (let up = -100; up <= 400; up += 25) {
        expect(getTerrainHeight(across * Math.cos(angle) + up * Math.sin(angle), across * Math.sin(angle) - up * Math.cos(angle))).toBeLessThan(-2);
      }
    }
  });
  it('has a continuous gradient and real positive land elevation', () => {
    const island = getTerrainIslands().find(i => Math.hypot(i.x, i.z) > 230)!;
    expect(getTerrainHeight(island.x, island.z)).toBeGreaterThan(1);
    const x = island.x + island.radius * .4, z = island.z + island.radius * .2, epsilon = .002;
    const gradient = getTerrainGradient(x, z);
    expect(gradient.x).toBeCloseTo((getTerrainHeight(x + epsilon, z) - getTerrainHeight(x - epsilon, z)) / (epsilon * 2), 2);
    expect(gradient.z).toBeCloseTo((getTerrainHeight(x, z + epsilon) - getTerrainHeight(x, z - epsilon)) / (epsilon * 2), 2);
    expect(Math.abs(getTerrainHeight(x + epsilon, z) - getTerrainHeight(x, z))).toBeLessThan(.01);
  });
  it('preserves safe water beneath all supplied boats while changing the island seed', () => {
    const island = getTerrainIslands().find(i => Math.hypot(i.x, i.z) > 230)!;
    protectTerrainPoints([{ x:island.x, z:island.z }]); setTerrainSeed(421);
    expect(getTerrainHeight(island.x, island.z)).toBeLessThan(-2);
  });
});

describe('terrain contact envelope', () => {
  function coast() {
    const island = getTerrainIslands().find(i => Math.hypot(i.x, i.z) > 230)!;
    return { island, outside: { x:island.x - island.radius - 8, z:island.z } };
  }
  it('sweeps the hull against land instead of tunnelling through an island', () => {
    const { island, outside } = coast(), state = createBoatState();
    state.heading = Math.PI / 2;
    state.position = { x:island.x + island.radius + 8, z:island.z };
    state.velocity = { x:20, z:0 };
    resolveTerrainCollision(state, outside, state.heading, 1);
    expect(state.position.x).toBeLessThan(island.x);
    expect(getBoatTerrainClearance(state)).toBeGreaterThanOrEqual(-.025);
    expect(state.velocity.x).toBeLessThan(1);
  });
  it('preserves tangent motion while dissipating a shoreward impact', () => {
    const { island, outside } = coast(), state = createBoatState();
    state.heading = Math.PI / 2;
    state.position = { x:island.x, z:island.z + 5 };
    state.velocity = { x:12, z:6 };
    const before = Math.hypot(state.velocity.x, state.velocity.z);
    resolveTerrainCollision(state, outside, state.heading, 1);
    expect(getBoatTerrainClearance(state)).toBeGreaterThanOrEqual(-.025);
    expect(Math.hypot(state.velocity.x, state.velocity.z)).toBeLessThan(before);
    expect(Math.abs(state.velocity.z)).toBeGreaterThan(.1);
  });
  it('includes centerboard and stern-rudder draft, not just the boat centre', () => {
    const { island } = coast(), state = createBoatState();
    state.heading = 0;
    let x = island.x - island.radius;
    while (getTerrainHeight(x, island.z) < -.65) x += .05;
    state.position = { x, z:island.z };
    const shorePosition={...state.position};state.position={x:0,z:0};
    state.centerboard=0;const raised=getBoatTerrainClearance(state);
    state.centerboard=1;expect(getBoatTerrainClearance(state)).toBeLessThan(raised-.1);
    state.position=shorePosition;
    state.heading = Math.PI / 2;
    expect(getBoatTerrainClearance(state)).toBeLessThan(-B.hullDraftM - getTerrainHeight(x, island.z));
  });
  it.each([.3,-1.53,1.53])('keeps the actual boat mesh above the coastal triangles at heel %s including capsize', (heel) => {
    const {island,outside}=coast(),state=createBoatState();state.heel=heel;state.capsized=Math.abs(heel)>1;
    const hull=hullGeometry(),board=foilGeometry(B.boardLengthM,.33,.035),rudder=foilGeometry(B.rudderLengthM,.28,.035);
    board.translate(0,B.boardTopY,B.boardAftM);rudder.translate(0,B.rudderTopY,B.lengthM/2+B.rudderAftOffsetM);
    const points=[hull,board,rudder].flatMap(geometry=>Array.from(geometry.getAttribute('position').array));
    for(const heading of [0,Math.PI/2,Math.PI,Math.PI*1.5])for(const time of [0,4,8,12]){
      state.heading=heading;state.time=time;state.position={x:island.x,z:island.z};state.velocity={x:4,z:0};
      resolveTerrainCollision(state,outside,state.heading,1);
      const pose=getBoatWavePose(state,10,0),matrix=new Matrix4().makeRotationFromEuler(new Euler(pose.pitch,-state.heading,-state.heel+pose.roll,'YXZ'));
      const point=new Vector3();
      for(let i=0;i<points.length;i+=3){
        point.set(points[i],points[i+1],points[i+2]).applyMatrix4(matrix);point.x+=state.position.x;point.y+=pose.height;point.z+=state.position.z;
        const x=Math.floor(point.x/3)*3,z=Math.floor(point.z/3)*3,u=(point.x-x)/3,v=(point.z-z)/3;
        const a=getTerrainHeight(x,z),b=getTerrainHeight(x,z+3),c=getTerrainHeight(x+3,z),d=getTerrainHeight(x+3,z+3);
        const ground=u+v<=1?a+(c-a)*u+(b-a)*v:d+(b-d)*(1-u)+(c-d)*(1-v);
        expect(point.y-ground).toBeGreaterThanOrEqual(-.01);
      }
    }
    hull.dispose();board.dispose();rudder.dispose();
  });
  it('applies shoreline contact within standalone stepBoat integration', () => {
    const { island, outside } = coast(), state = createBoatState();
    state.position = outside; state.heading = Math.PI / 2;
    for (let i = 0; i < 3000; i++) stepBoat(state, { steer:0, mainSheet:.65 }, { ...DEFAULT_SETTINGS, shifts:false, gusts:false, windSpeedKnots:20 }, 1 / 120);
    expect(getBoatTerrainClearance(state,{speed:20*.514444,direction:0})).toBeGreaterThanOrEqual(-.025);
    expect(state.position.x).toBeLessThan(island.x + island.radius);
  });
});

describe('rigid hull impulses', () => {
  it('stops projecting a separated shore contact once its position cannot change', () => {
    const island=getTerrainIslands().find(i=>Math.hypot(i.x,i.z)>230)!;
    const state=createBoatState();state.heading=Math.PI/2;state.time=12;
    const outside={x:island.x-island.radius-8,z:island.z};
    state.position={x:island.x,z:island.z};
    resolveTerrainCollision(state,outside,state.heading,1);
    expect(getBoatTerrainClearance(state)).toBeGreaterThan(0);
    const before={...state.position};
    const bodies=Array.from({length:9},(_,index)=>{
      const boat=index?createBoatState():state;
      if(index)boat.position={x:index*8,z:0};
      return {id:String(index),state:boat,previousPosition:{...boat.position},previousHeading:boat.heading,massKg:270};
    });
    const broadPhase=vi.spyOn(terrain,'isTerrainDeepWater');
    try {
      resolveWorldCollisions(bodies,[],E.fixedTimeStep);
      // A stationary separated fleet needs no repeated full-fleet projection passes.
      expect(broadPhase.mock.calls.length).toBeLessThanOrEqual(bodies.length*2);
      expect(state.position).toEqual(before);
      expect(getBoatTerrainClearance(state)).toBeGreaterThan(0);
    } finally { broadPhase.mockRestore(); }
  });
  it('catches opposing fast hulls that exchange sides inside a large timestep', () => {
    const a=createBoatState(),b=createBoatState();a.heading=b.heading=Math.PI/2;
    a.position={x:15,z:0};b.position={x:-15,z:0};a.velocity={x:30,z:0};b.velocity={x:-30,z:0};
    const contacts=resolveWorldCollisions([
      {id:'a',state:a,previousPosition:{x:-15,z:0},previousHeading:a.heading,massKg:235},
      {id:'b',state:b,previousPosition:{x:15,z:0},previousHeading:b.heading,massKg:235},
    ],[],1);
    expect(contacts.some(c=>c.kind==='boat')).toBe(true);
    expect(a.position.x).toBeLessThan(b.position.x-B.lengthM);
    expect(a.velocity.x).toBeLessThanOrEqual(0);expect(b.velocity.x).toBeGreaterThanOrEqual(0);
  });
  it('fully separates three hulls squeezed around a fixed buoy', () => {
    const states=[-.7,0,.7].map(x=>{const state=createBoatState();state.position={x,z:0};state.heading=0;return state;});
    const bodies=states.map((state,index)=>({id:String(index),state,previousPosition:{...state.position},previousHeading:state.heading,massKg:235}));
    resolveWorldCollisions(bodies,[{id:'mark',kind:'mark',position:{x:0,z:0},radius:.75}],E.fixedTimeStep);
    for(let i=0;i<states.length;i++){
      const a=states[i];
      expect(Math.hypot(Math.max(0,Math.abs(a.position.x)-B.beamM/2),Math.max(0,Math.abs(a.position.z)-B.lengthM/2))).toBeGreaterThanOrEqual(.745);
      for(let j=i+1;j<states.length;j++)expect(Math.abs(a.position.x-states[j].position.x)>=B.beamM-.005 || Math.abs(a.position.z-states[j].position.z)>=B.lengthM-.005).toBe(true);
    }
  });
  it('converges hull and shoreline separation together when one boat squeezes another against land', () => {
    const island=getTerrainIslands().find(i=>Math.hypot(i.x,i.z)>230)!;
    const a=createBoatState();a.heading=0;a.position={x:island.x-island.radius-5,z:island.z};
    while(getBoatTerrainClearance(a)>.03)a.position.x+=.02;
    const b=createBoatState();b.heading=0;b.position={x:a.position.x-.8,z:a.position.z};
    const bodies=[a,b].map((state,i)=>({id:String(i),state,previousPosition:{...state.position},previousHeading:state.heading,massKg:270}));
    resolveWorldCollisions(bodies,[],E.fixedTimeStep);
    expect(getBoatTerrainClearance(a)).toBeGreaterThanOrEqual(-.025);
    expect(getBoatTerrainClearance(b)).toBeGreaterThanOrEqual(-.025);
    expect(Math.abs(a.position.x-b.position.x)>=B.beamM-.005 || Math.abs(a.position.z-b.position.z)>=B.lengthM-.005).toBe(true);
  });
  it.each([.05,.2,1])('keeps an initially separated eight-boat queue clear after a %sm shoreward sweep', (movement) => {
    const island=getTerrainIslands().find(i=>Math.hypot(i.x,i.z)>230)!;
    const leading=createBoatState();leading.heading=0;leading.position={x:island.x-island.radius-5,z:island.z};
    while(getBoatTerrainClearance(leading)>.03)leading.position.x+=.02;
    const states=Array.from({length:8},(_,i)=>{const s=createBoatState();s.heading=0;s.position={x:leading.position.x-i*(B.beamM+E.collisionSkinM),z:leading.position.z};return s;});
    const bodies=states.map((state,i)=>({id:String(i),state,previousPosition:{...state.position},previousHeading:0,massKg:270}));
    for(const state of states){state.position.x+=movement;state.velocity.x=movement/E.fixedTimeStep;}
    resolveWorldCollisions(bodies,[],E.fixedTimeStep);
    for(let i=0;i<states.length;i++){
      expect(getBoatTerrainClearance(states[i])).toBeGreaterThanOrEqual(-.025);
      if(i>0)expect(states[i-1].position.x-states[i].position.x).toBeGreaterThanOrEqual(B.beamM-.005);
    }
  });
  it('preserves the integrator compass heading across the north wrap in clear water', () => {
    const state=createBoatState();state.heading=.01;state.position={x:1,z:0};
    resolveTerrainCollision(state,{x:0,z:0},Math.PI*2-.01,E.fixedTimeStep);
    expect(state.heading).toBe(.01);
    resolveWorldCollisions([{id:'boat',state,previousPosition:{x:0,z:0},previousHeading:Math.PI*2-.01,massKg:235}],[],E.fixedTimeStep);
    expect(state.heading).toBe(.01);
  });
  it('exchanges angular momentum at an off-centre hull impact without adding kinetic energy', () => {
    const a=createBoatState(),b=createBoatState();a.heading=b.heading=0;
    a.position={x:-.7,z:-1.2};b.position={x:.7,z:1.2};a.velocity={x:2,z:0};b.velocity={x:-2,z:0};
    const mass=270,inertia=(mass-B.addedMassKg)*(B.lengthM**2+B.beamM**2)/12+B.yawAddedInertiaKgM2;
    const momentum=()=>[a,b].reduce((sum,s)=>sum+mass*(s.position.x*s.velocity.z-s.position.z*s.velocity.x)+inertia*s.yawRate,0);
    const before=momentum(),energy=mass*4;
    resolveWorldCollisions([a,b].map((state,i)=>({id:String(i),state,previousPosition:{...state.position},previousHeading:0,massKg:mass})),[],E.fixedTimeStep);
    expect(Math.abs(a.yawRate)+Math.abs(b.yawRate)).toBeGreaterThan(.01);
    expect(momentum()).toBeCloseTo(before,5);
    expect([a,b].reduce((sum,s)=>sum+mass*(s.velocity.x**2+s.velocity.z**2)/2+inertia*s.yawRate**2/2,0)).toBeLessThanOrEqual(energy);
  });
  it('conserves total linear momentum and loses energy in equal-mass side contact', () => {
    const a = createBoatState(), b = createBoatState();
    a.heading = b.heading = 0; a.position = { x:-.1, z:0 }; b.position = { x:.1, z:0 };
    a.velocity = { x:2, z:1 }; b.velocity = { x:-2, z:1 };
    const bodies = [a, b].map((state, index) => ({ id:String(index), state, previousPosition:{...state.position}, previousHeading:state.heading, massKg:235 }));
    resolveWorldCollisions(bodies, [], E.fixedTimeStep);
    expect(a.velocity.x + b.velocity.x).toBeCloseTo(0);
    expect(a.velocity.z + b.velocity.z).toBeCloseTo(2);
    expect(a.velocity.x ** 2 + a.velocity.z ** 2 + b.velocity.x ** 2 + b.velocity.z ** 2).toBeLessThan(10);
    expect(b.position.x - a.position.x).toBeGreaterThanOrEqual(B.beamM);
  });
});
