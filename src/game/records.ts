export interface Records { bests: Record<string,number>; lessons: number[]; seriesWins: number }
export interface SeriesEntry { id:string; name:string; scores:number[]; total:number }
const STORAGE_KEY='c420-records-v1';
export function loadRecords(storage: Pick<Storage,'getItem'>|null):Records {
  const empty:Records={bests:{},lessons:[],seriesWins:0};
  try {
    const parsed=JSON.parse(storage?.getItem(STORAGE_KEY)??'null');
    if(!parsed || typeof parsed!=='object') return empty;
    for(const [key,value] of Object.entries(parsed.bests??{})) if(typeof value==='number' && Number.isFinite(value) && value>0) empty.bests[key]=value;
    if(Array.isArray(parsed.lessons)) empty.lessons=parsed.lessons.filter((n:unknown)=>Number.isInteger(n) && Number(n)>=0 && Number(n)<6);
    if(Number.isInteger(parsed.seriesWins) && parsed.seriesWins>0) empty.seriesWins=parsed.seriesWins;
  } catch { /* Browser privacy settings and old/corrupt saves must not prevent sailing. */ }
  return empty;
}
export function saveRecords(records:Records,storage:Pick<Storage,'setItem'>|null):boolean {
  try { if(!storage)return false;storage.setItem(STORAGE_KEY,JSON.stringify(records));return true; } catch {return false;}
}
export function saveBest(records:Records,key:string,elapsed:number):boolean {
  if(!Number.isFinite(elapsed) || elapsed<=0)return false;
  if(records.bests[key]!==undefined && records.bests[key]<=elapsed)return false;
  records.bests[key]=elapsed;return true;
}
export function addSeriesRace(previous:SeriesEntry[],finishers:{id:string;name:string;place:number}[]):SeriesEntry[] {
  return finishers.map(row=>{
    const scores=[...(previous.find(p=>p.id===row.id)?.scores??[]),row.place];
    return {...row,scores,total:scores.reduce((a,b)=>a+b,0)};
  }).sort((a,b)=>{
    if(a.total!==b.total)return a.total-b.total;
    const bestA=[...a.scores].sort((x,y)=>x-y),bestB=[...b.scores].sort((x,y)=>x-y);
    for(let i=0;i<bestA.length;i++)if(bestA[i]!==bestB[i])return bestA[i]-bestB[i];
    for(let i=a.scores.length-1;i>=0;i--)if(a.scores[i]!==b.scores[i])return a.scores[i]-b.scores[i];
    return 0;
  });
}
export function formatTime(seconds:number) {
  if(!Number.isFinite(seconds))return '—';
  const whole=Math.max(0,Math.floor(seconds));
  return `${Math.floor(whole/60)}:${String(whole%60).padStart(2,'0')}`;
}
