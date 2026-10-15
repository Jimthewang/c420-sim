import GUI from 'lil-gui';
import { BOAT_CONFIG as B } from './config/boat';
import { DEFAULT_SETTINGS, DEG_TO_RAD, ENVIRONMENT_CONFIG as E } from './config/environment';
import { getTelemetry, stepBoat } from './physics/sailing';
import type { CameraMode, Controls, SailingSettings } from './physics/types';
import { createWorld } from './render/world';
import type { GraphicsQuality } from './render/types';
import { createSailingAudio } from './audio';
import { beginSequence, createRace, getRaceView, setPenaltyTurn, startTutorialRounding, stepRace, type RaceState } from './game/race';
import { aiControls } from './game/ai';
import { createLesson, updateLesson, type LessonState } from './game/tutorial';
import { addSeriesRace, loadRecords, saveBest, saveRecords, type SeriesEntry } from './game/records';
import { createUI, type SetupOptions, type HudView } from './ui';
import './style.css';

const settings:SailingSettings={...DEFAULT_SETTINGS,autoCrew:true,spinnaker:false};
const preferences={sound:true,finalBeeps:false,quality:'medium' as GraphicsQuality};
let storage:Storage|null=null;try{storage=window.localStorage;}catch{/* Private browsing can deny storage. */}
const records=loadRecords(storage);
const audio=createSailingAudio();
let options:SetupOptions={mode:'race',difficulty:'beginner',aiCount:3,courseLength:220,laps:1,windSpeedKnots:10,crewWeightKg:130,spinnaker:false,lessonIndex:0};
let race:RaceState=createRace({...options,mode:'free',aiCount:0},settings);
let lesson:LessonState|null=null;
let series:SeriesEntry[]=[];
let raceNumber=1;
let cameraMode:CameraMode='chase';
let started=false,paused=false,helpOpen=false,settingsOpen=false,debugOpen=false,resultsOpen=false;
let accumulator=0,previousFrame=0,hudTimer=0,manualHike=0,lessonSaved=false;
let stats={sailing:0,pinching:0,luffing:0,stalled:0,capsizes:0,lastCapsized:false};
let previousBeep=180;
let bestRecorded=false,newPersonalBest=false;
const keys=new Set<string>();
const canvas=document.querySelector<HTMLCanvasElement>('#ocean')!;
const player=()=>race.racers[0];
const clearInput=()=>{keys.clear();player().state.rudder=0;};
const focusWater=()=>canvas.focus({preventScroll:true});
function unlockAudio(){audio.setEnabled(preferences.sound);void audio.unlock();}
function saveProgress(){const saved=saveRecords(records,storage);ui.showSaved(records.lessons.length,Object.keys(records.bests).length,records.seriesWins);return saved;}
function closePanels(){if(helpOpen){helpOpen=false;ui.showHelp(false);}settingsOpen=false;debugOpen=false;ui.showSettings(false);ui.showDebug(false);}
function launch(setup:SetupOptions,continueSeries=false){
  unlockAudio();closePanels();clearInput();
  options={...setup};settings.windSpeedKnots=Math.max(4,Math.min(20,setup.windSpeedKnots));settings.crewWeightKg=setup.crewWeightKg;settings.spinnaker=setup.spinnaker;
  if(!continueSeries){series=[];raceNumber=1;}
  const mode=options.mode==='tutorial'?(options.lessonIndex===5?'race':options.lessonIndex===4?'time-trial':'free'):options.mode;
  const aiCount=['free','tutorial','time-trial'].includes(options.mode)?0:options.aiCount;
  race=createRace({...options,mode,aiCount,courseLength:options.mode==='tutorial'?120:options.courseLength},settings);
  if(mode==='time-trial')beginSequence(race);
  lesson=options.mode==='tutorial'?createLesson(options.lessonIndex):null;
  lessonSaved=false;manualHike=0;
  bestRecorded=false;newPersonalBest=false;
  if(lesson){
    settings.autoCrew=true;
    if(lesson.index===2){player().state.heading=(settings.windDirectionDeg+50)*DEG_TO_RAD;player().state.mainSheet=1;}
    if(lesson.index===3){player().state.heading=(settings.windDirectionDeg+145)*DEG_TO_RAD;player().state.mainSheet=.15;}
    if(lesson.index===4)startTutorialRounding(race);
  }
  stats={sailing:0,pinching:0,luffing:0,stalled:0,capsizes:0,lastCapsized:false};
  started=true;paused=false;resultsOpen=false;accumulator=0;previousBeep=180;
  ui.showStarted(options.mode);ui.showPaused(false);audio.setPaused(false);setTuningLock();focusWater();
}
function pause(){if(!started||helpOpen||resultsOpen)return;paused=!paused;clearInput();accumulator=0;ui.showPaused(paused);if(!paused){unlockAudio();focusWater();}}
function reset(){if(!started)return;launch(options,!resultsOpen);}
function menu(){started=false;paused=false;resultsOpen=false;lesson=null;clearInput();closePanels();ui.showMenu();saveProgress();audio.setPaused(true);setTuningLock();}
function sequence(){if(!started||paused||helpOpen||resultsOpen)return;beginSequence(race);unlockAudio();focusWater();}
const ui=createUI({
  launch,pause,reset,menu,sequence,
  nextRace(){if(options.mode==='series'&&raceNumber<3){raceNumber++;launch(options,true);}else launch(options);},
  nextLesson(){if(!lesson?.passed)return;if(lesson.index===5)menu();else launch({...options,lessonIndex:lesson.index+1});},
  penalty(){setPenaltyTurn(player());focusWater();},
  camera(){cameraMode=cameraMode==='chase'?'tactical':'chase';ui.setCamera(cameraMode);focusWater();},
  settings(){settingsOpen=!settingsOpen;clearInput();ui.showSettings(settingsOpen);if(!settingsOpen)focusWater();},
  help(){if(!started)return;helpOpen=!helpOpen;clearInput();accumulator=0;ui.showHelp(helpOpen);if(!helpOpen)focusWater();},
  debug(){debugOpen=!debugOpen;ui.showDebug(debugOpen);focusWater();},
  sheet(value){player().state.mainSheet=value;},
});
const gui=new GUI({container:ui.mount,title:'Wind & boat',width:250});
const lockedControllers=[
  gui.add(settings,'windSpeedKnots',E.windSpeedMinKnots,E.windSpeedMaxKnots,1).name('Wind (knots)'),
  gui.add(settings,'windDirectionDeg',0,359,1).name('Wind from (°)'),
  gui.add(settings,'crewWeightKg',E.crewWeightMinKg,E.crewWeightMaxKg,5).name('Crew weight (kg)'),
  gui.add(settings,'shifts').name('Wind shifts'),gui.add(settings,'gusts').name('Puffs & lulls'),
  gui.add(settings,'spinnaker').name('Spinnaker'),
];
gui.add(settings,'autoCrew').name('Automatic crew').listen();
gui.add(preferences,'sound').name('Sound').onChange(()=>{unlockAudio();});
gui.add(preferences,'finalBeeps').name('Final 10s beeps (aid)');
gui.add(preferences,'quality',['low','medium','high']).name('Graphics quality');
function setTuningLock(){const locked=started&&!['free'].includes(options.mode);for(const controller of lockedControllers)controller.disable(locked);gui.controllersRecursive().forEach(c=>c.updateDisplay());}
setTuningLock();saveProgress();
function editing(target:EventTarget|null){return target instanceof HTMLElement&&(['INPUT','TEXTAREA','SELECT','BUTTON'].includes(target.tagName)||target.isContentEditable);}
const sailingKeys=['a','d','arrowleft','arrowright','w','s','z','x','j','l','q','e','f',' '];
window.addEventListener('keydown',event=>{
  if(event.metaKey||event.ctrlKey||event.altKey)return;const key=event.key.toLowerCase();
  if(key==='escape'){if(helpOpen)return;event.preventDefault();if(settingsOpen){settingsOpen=false;ui.showSettings(false);clearInput();focusWater();}else if(!event.repeat)pause();return;}
  if(editing(event.target))return;
  if(key==='enter'&&!started){event.preventDefault();ui.openSetup();return;}
  if(key==='enter'&&lesson?.passed){event.preventDefault();document.getElementById('next-lesson')!.click();return;}
  if(sailingKeys.includes(key)){event.preventDefault();if(started&&!paused&&!helpOpen&&!resultsOpen&&!lesson?.passed)keys.add(key);return;}
  if(!started||event.repeat)return;
  if(key==='r'){event.preventDefault();reset();}
  else if(key==='n'){event.preventDefault();sequence();}
  else if(key==='p'){event.preventDefault();setPenaltyTurn(player());}
  else if(key==='c')document.getElementById('camera-button')!.click();
  else if(key==='g')document.getElementById('settings-button')!.click();
  else if(key==='h')document.getElementById('help-button')!.click();
  else if(key==='f3'){event.preventDefault();debugOpen=!debugOpen;ui.showDebug(debugOpen);}
});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
function backgroundPause(){clearInput();if(started&&!paused&&!resultsOpen&&!lesson?.passed){paused=true;ui.showPaused(true);}accumulator=0;audio.setPaused(true);}
window.addEventListener('blur',backgroundPause);document.addEventListener('visibilitychange',()=>{if(document.hidden)backgroundPause();});
function userControls(dt:number):Controls {
  const state=player().state;
  const steer=Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'));
  const trim=Number(keys.has('w'))-Number(keys.has('s'));
  const mainSheet=Math.max(0,Math.min(1,state.mainSheet+trim*B.mainSheetRatePerSecond*dt));
  const board=Math.max(0,Math.min(1,state.centerboard+(Number(keys.has('x'))-Number(keys.has('z')))*B.boardControlRatePerSecond*dt));
  const jibSheet=Math.max(0,Math.min(1,state.jibSheet+(Number(keys.has('j'))-Number(keys.has('l')))*B.mainSheetRatePerSecond*dt));
  manualHike=Math.max(-1,Math.min(1,manualHike+(Number(keys.has('e'))-Number(keys.has('q')))*B.hikeControlRatePerSecond*dt));
  if(state.capsized&&options.difficulty==='beginner')return {steer:0,mainSheet:0,board:1,righting:true};
  return {steer,mainSheet,board,jibSheet,hike:manualHike,righting:keys.has('f'),rollTack:keys.has(' ')};
}
function recordKey(){return [options.mode==='series'?'race':options.mode,options.windSpeedKnots,settings.windDirectionDeg,settings.shifts,settings.gusts,settings.crewWeightKg,Boolean(settings.spinnaker),options.courseLength,options.laps,options.difficulty,race.racers.length-1].join(':');}
function recordFinish(){
  if(bestRecorded||lesson||player().finishedAt===null)return;
  bestRecorded=true;newPersonalBest=saveBest(records,recordKey(),player().finishedAt!);saveProgress();
}
function finish(){
  if(resultsOpen)return;
  const view=getRaceView(race),row=view.standings.find(r=>r.id==='player')!;
  recordFinish();
  if(options.mode==='series'){series=addSeriesRace(series,view.standings);if(raceNumber===3&&series[0]?.id==='player'&&series[0].scores.some(score=>score<=race.racers.length))records.seriesWins++;}
  const tips:string[]=[];
  if(stats.pinching>stats.sailing*.12)tips.push('You spent time pointing too close to the wind. Bear away a few degrees and keep speed through the beat.');
  else tips.push('Keep watching the next wind shift. A small lift can save a whole tack on the next beat.');
  if(stats.capsizes)tips.push(`${stats.capsizes} capsize${stats.capsizes===1?'':'s'} cost time. Ease the main sooner and keep crew weight to windward.`);
  else if(stats.stalled>stats.sailing*.2)tips.push('The main was often overtrimmed. Ease until it starts to flutter, then trim just enough to fill.');
  else tips.push('Prepare your crew and sheet before the turn so the boat keeps moving through tacks and gybes.');
  if(row.ocs)tips.push('Your early start needed a return. Approach the line from below with room to slow down.');
  else if(row.penalties)tips.push('Leave more space at crossings. Port gives way to starboard; avoid the windward boat’s side on the same tack.');
  else tips.push('You avoided rule penalties. Protect that clear lane and give yourself room at the marks.');
  resultsOpen=true;clearInput();ui.showResults({rows:view.standings,tips,series,raceNumber,mode:options.mode,best:records.bests[recordKey()]??null,newBest:newPersonalBest,saved:saveProgress(),seriesComplete:raceNumber>=3});
}

try{
  const world=createWorld(canvas);window.addEventListener('resize',world.resize);
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();paused=true;audio.setPaused(true);ui.showError('The graphics connection was lost. Close a few other tabs, then try again.');});
  function frame(timestamp:number){
    const dt=previousFrame===0?0:Math.min((timestamp-previousFrame)/1000,E.maxFrameDelta);previousFrame=timestamp;
    const running=started&&!paused&&!helpOpen&&!resultsOpen&&!lesson?.passed;
    if(running){
      accumulator+=dt;
      while(accumulator>=E.fixedTimeStep){
        const step=E.fixedTimeStep;
        const shadows=race.racers.map(r=>({id:r.id,position:{...r.state.position},heading:r.state.heading}));
        const controls=userControls(step);
        for(const racer of race.racers){
          const boatSettings={...settings,autoCrew:racer.isPlayer?settings.autoCrew:true,windShadows:shadows.filter(s=>s.id!==racer.id)};
          const input=racer.isPlayer?controls:aiControls(racer,race,boatSettings,step);
          stepBoat(racer.state,input,boatSettings,step);
        }
        const oldCountdown=race.countdown;
        stepRace(race,race.racers,step);
        recordFinish();
        if(preferences.finalBeeps&&race.phase==='countdown'&&Math.ceil(race.countdown)<Math.ceil(oldCountdown)&&Math.ceil(race.countdown)<=10&&Math.ceil(race.countdown)>0){const n=Math.ceil(race.countdown);if(n!==previousBeep){audio.beep();previousBeep=n;}}
        for(const event of race.events.splice(0)){if(event.type==='horn')audio.horn();if(event.type==='practice-restart')previousBeep=180;}
        const state=player().state;const telemetry=getTelemetry(state,{...settings,windShadows:shadows.filter(s=>s.id!=='player')});
        if((race.phase==='racing'&&player().finishedAt===null)||options.mode==='free'){stats.sailing+=step;if(Math.abs(telemetry.trueWindAngleDeg)<40)stats.pinching+=step;if(telemetry.main.status==='luffing')stats.luffing+=step;if(telemetry.main.status==='stalled'&&Math.abs(telemetry.trueWindAngleDeg)<150)stats.stalled+=step;}
        if(state.capsized&&!stats.lastCapsized&&player().finishedAt===null&&(race.phase==='racing'||options.mode==='free'))stats.capsizes++;stats.lastCapsized=state.capsized;
        if(lesson){updateLesson(lesson,{dt:step,speed:telemetry.speedKnots,windAngle:telemetry.trueWindAngleDeg,vmg:telemetry.vmgKnots,steered:controls.steer!==0,trimmed:keys.has('w')||keys.has('s'),tackCount:state.tackCount,gybeCount:state.gybeCount,roundings:player().roundings,legallyStarted:player().started&&!player().ocs});if(lesson.passed&&!lessonSaved){lessonSaved=true;if(!records.lessons.includes(lesson.index))records.lessons.push(lesson.index);saveProgress();clearInput();}}
        accumulator-=step;
        if(race.phase==='finished'&&!lesson){finish();break;}
        if(lesson?.passed)break;
      }
    }else accumulator=0;
    const state=player().state;const shadowSettings={...settings,windShadows:race.racers.slice(1).map(r=>({position:r.state.position,heading:r.state.heading}))};
    const telemetry=getTelemetry(state,shadowSettings);state.main=telemetry.main;state.jib=telemetry.jib;
    const view=getRaceView(race);const showCourse=started&&options.mode!=='free'&&(!lesson||lesson.index>=4);
    world.render(state,telemetry,settings,cameraMode,running||!started?dt:0,{opponents:race.racers.slice(1).map(r=>({id:r.id,name:r.name,boat:r.state,color:r.color})),course:showCourse?race.course:null,target:showCourse?view.nextTarget:null,difficulty:options.difficulty,quality:preferences.quality,spinnaker:settings.spinnaker});
    audio.setPaused(!running);audio.update(state,telemetry,running?dt:0);
    hudTimer+=dt;
    if(hudTimer>=.1||!running){
      const distance=view.nextTarget?Math.hypot(view.nextTarget.x-state.position.x,view.nextTarget.z-state.position.z):NaN;
      const hud:HudView={phase:view.phase,timer:view.phase==='prestart'||view.phase==='countdown'?view.countdown:view.elapsed,place:view.place,total:race.racers.length,target:view.targetLabel,distance,message:view.playerFinished&&race.phase!=='finished'?'You finished · watching the remaining fleet':view.message,difficulty:options.difficulty,mode:options.mode,raceNumber,penalty:view.penaltyTurns>0,finished:view.playerFinished,practiceStarts:view.practiceStarts,autoCrew:settings.autoCrew!==false};
      ui.update(state,telemetry,cameraMode,hud,lesson);hudTimer=0;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}catch(error){console.error('Unable to initialize C420:',error);ui.showError('This game needs WebGL 2 graphics support. Try a recent Chrome or Safari with graphics acceleration enabled.');}
