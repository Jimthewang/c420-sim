import { describe, expect, it } from 'vitest';
import { createLesson, updateLesson } from './tutorial';
import { addSeriesRace, loadRecords, saveBest, saveRecords } from './records';
import { createBoatState, getTelemetry, stepBoat } from '../physics/sailing';
import { DEFAULT_SETTINGS } from '../config/environment';

const sailing = { dt: 1, speed: 3, windAngle: 90, vmg: 0, steered: false, trimmed: false, tackCount: 0, gybeCount: 0, roundings: 0, legallyStarted: false };
describe('interactive lessons', () => {
  it('requires steering and trimming before passing the reach lesson', () => {
    const lesson = createLesson(0);
    for (let i=0;i<20;i++) updateLesson(lesson, sailing);
    expect(lesson.passed).toBe(false);
    for (let i=0;i<8;i++) updateLesson(lesson, {...sailing,steered:true,trimmed:true});
    expect(lesson.passed).toBe(true);
  });
  it('requires experiencing no-go before making progress close hauled', () => {
    const lesson = createLesson(1);
    for(let i=0;i<10;i++) updateLesson(lesson,{...sailing,windAngle:48,vmg:2});
    expect(lesson.passed).toBe(false);
    updateLesson(lesson,{...sailing,windAngle:10,speed:0,vmg:0});
    for(let i=0;i<6;i++) updateLesson(lesson,{...sailing,windAngle:48,vmg:2});
    expect(lesson.passed).toBe(true);
  });
  it('does not pass a tack without rebuilding speed', () => {
    const lesson=createLesson(2);
    updateLesson(lesson,{...sailing,tackCount:1,speed:0.4});
    expect(lesson.passed).toBe(false);
    updateLesson(lesson,{...sailing,tackCount:1,speed:2.5});
    expect(lesson.passed).toBe(true);
  });
  it('passes the tack lesson from a real helm-driven crossing and recovered sailing speed', () => {
    const lesson = createLesson(2), boat = createBoatState();
    const settings = { ...DEFAULT_SETTINGS, gusts: false, shifts: false };
    boat.heading = Math.PI / 4; boat.velocity = { x: 1.5, z: -1.5 };
    for (let t = 0; t < 45 && !lesson.passed; t += 1 / 120) {
      const error = Math.atan2(Math.sin(-Math.PI / 4 - boat.heading), Math.cos(-Math.PI / 4 - boat.heading));
      const steer = t < 3 ? -1 : error * 2 - boat.yawRate * .8;
      stepBoat(boat, { steer, mainSheet: 1, rollTack: true }, settings, 1 / 120);
      const telemetry = getTelemetry(boat, settings);
      updateLesson(lesson, { ...sailing, dt: 1 / 120, speed: telemetry.speedKnots,
        windAngle: telemetry.trueWindAngleDeg, steered: true, tackCount: boat.tackCount });
    }
    expect(lesson.passed).toBe(true);
    expect(boat.tackCount).toBe(1);
    expect(getTelemetry(boat, settings).trueWindAngleDeg).toBeGreaterThan(20);
  });
  it('needs an actual gybe, valid rounding, and legal start for their lessons', () => {
    for(const index of [3,4,5]) {
      const lesson=createLesson(index);
      updateLesson(lesson,sailing);expect(lesson.passed).toBe(false);
      updateLesson(lesson,{...sailing,gybeCount:1,roundings:1,legallyStarted:true});
      expect(lesson.passed).toBe(true);
    }
  });
});
describe('saved records and series',()=>{
  it('keeps the fastest time for matching conditions',()=>{
    const records=loadRecords(null);
    expect(saveBest(records,'trial:10:120:1',75)).toBe(true);
    expect(saveBest(records,'trial:10:120:1',80)).toBe(false);
    expect(saveBest(records,'trial:10:120:1',70)).toBe(true);
    expect(records.bests['trial:10:120:1']).toBe(70);
  });
  it('recovers from unavailable or corrupted storage',()=>{
    expect(loadRecords({getItem:()=>'{broken'}).bests).toEqual({});
    expect(saveRecords(loadRecords(null),{setItem:()=>{throw Error('blocked')}})).toBe(false);
  });
  it('sums low points and breaks ties by the most recent race',()=>{
    const first=addSeriesRace([], [{id:'player',name:'You',place:2},{id:'ai-1',name:'Boat 1',place:1}]);
    const second=addSeriesRace(first,[{id:'player',name:'You',place:1},{id:'ai-1',name:'Boat 1',place:2}]);
    expect(second[0].id).toBe('player');expect(second[0].total).toBe(3);
    expect(second[0].scores).toEqual([2,1]);
  });
  it('can award a series to a sailor who did not finish the final race',()=>{
    const first=addSeriesRace([], [{id:'player',name:'You',place:1},{id:'ai-1',name:'Boat 1',place:2}]);
    const second=addSeriesRace(first,[{id:'player',name:'You',place:1},{id:'ai-1',name:'Boat 1',place:2}]);
    // In a two-boat fleet, DNF scores 3. Both totals are 5; two wins beat one win.
    const final=addSeriesRace(second,[{id:'ai-1',name:'Boat 1',place:1},{id:'player',name:'You',place:3}]);
    expect(final[0].id).toBe('player');
    expect(final[0].scores).toEqual([1,1,3]);
    expect(final[0].total).toBe(final[1].total);
  });
  it('restores personal bests, completed lessons and series wins from a saved browser record',()=>{
    let saved:string|null=null;
    const storage={getItem:()=>saved,setItem:(_key:string,value:string)=>{saved=value;}};
    const records=loadRecords(null);
    saveBest(records,'time-trial:10:220:1',245.8);
    records.lessons=[0,1,2];records.seriesWins=2;
    expect(saveRecords(records,storage)).toBe(true);
    expect(loadRecords(storage)).toEqual(records);
  });
});
