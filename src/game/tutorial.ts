export const LESSONS = [
  { title: 'Find the reach', goal: 'Steer with A/D and trim with W/S. Hold at least 2.5 knots on a reach for five seconds.', tip: 'Keep the wind on your side. Ease until the main flutters, then trim a little until it fills.' },
  { title: 'Find the no-go zone', goal: 'Head into the wind, then sail at 40–60° to it with positive upwind progress for four seconds.', tip: 'Bear away means turn farther from the wind. A stopped boat needs its sails filled before the rudder works.' },
  { title: 'Make a tack', goal: 'Steer the bow through the wind. Fill the sails on the other side and rebuild to 2 knots.', tip: 'Enter with speed. Hold Space during the turn to coordinate a roll tack with your crew.' },
  { title: 'Make a gybe', goal: 'Turn the stern through the wind, then sail at 2 knots on the new side.', tip: 'Ease onto a broad reach. Turn gently through the run; the boom changes sides. Strong-wind gybes need balance.' },
  { title: 'Round the windward mark', goal: 'Pass the orange mark on its outside and turn around it, keeping the mark to port (your left).', tip: 'Approach from the right of the mark. Leave room to turn across its windward side; simply touching the mark does not count.' },
  { title: 'Make a clean start', goal: 'Start the three-minute sequence. Cross between the pin and committee boat toward the wind after the horn.', tip: 'Stay below the line until zero. OCS means over early: return below the line and cross again to start legally.' },
] as const;

export interface LessonState { index: number; passed: boolean; held: number; sawNoGo: boolean; steered: boolean; trimmed: boolean }
export interface LessonInput { dt: number; speed: number; windAngle: number; vmg: number; steered: boolean; trimmed: boolean; tackCount: number; gybeCount: number; roundings: number; legallyStarted: boolean }
export function createLesson(index: number): LessonState { return { index: Math.max(0,Math.min(5,index)), passed:false,held:0,sawNoGo:false,steered:false,trimmed:false }; }
export function updateLesson(lesson: LessonState, input: LessonInput) {
  if(lesson.passed) return;
  lesson.steered ||= input.steered;
  lesson.trimmed ||= input.trimmed;
  const angle=Math.abs(input.windAngle);
  if(angle<30 && input.speed<1.5) lesson.sawNoGo=true;
  let condition=false;
  if(lesson.index===0) condition=lesson.steered && lesson.trimmed && input.speed>=2.5 && angle>=65 && angle<=120;
  if(lesson.index===1) condition=lesson.sawNoGo && angle>=40 && angle<=60 && input.vmg>=1;
  if(lesson.index<=1) {
    lesson.held=condition?lesson.held+input.dt:0;
    lesson.passed=lesson.held>=(lesson.index===0?5:4);
  } else if(lesson.index===2) lesson.passed=input.tackCount>0 && input.speed>=2;
  else if(lesson.index===3) lesson.passed=input.gybeCount>0 && input.speed>=2;
  else if(lesson.index===4) lesson.passed=input.roundings>0;
  else lesson.passed=input.legallyStarted;
}
