// SPDX-License-Identifier: GPL-3.0-only
// Portable, strictly validated native SLOOP project. No browser side effects,
// no user code execution and no dependency on the firmware's storage format.
export const PROJECT_FORMAT='BRKLOOP_PROJECT_V1';
export const MAX_PROJECT_BYTES=5*1024*1024;
const clone=x=>structuredClone(x);
function number(n,min,max,label){
  if(!Number.isInteger(n)||n<min||n>max)throw new RangeError('Invalid '+label);
  return n;
}
function word(s,max,label){
  if(typeof s!=='string'||!s.trim()||s.length>max)throw new RangeError('Invalid '+label);
  return s.trim();
}
function ints(values,count,min,max,label){
  if(!Array.isArray(values)||values.length!==count)
    throw new TypeError('Invalid '+label+' array length');
  return values.map((n,i)=>number(n,min,max,label+' '+i));
}
function note(s){
  if(!s||typeof s!=='object')throw new TypeError('Missing native note');
  const n=number(s.n,0,4,'polyphony'),time=number(s.time,0,2,'gate');
  const notes=ints(s.notes,4,0,127,'MIDI notes');
  if(time===0&&n===0)throw new RangeError('A played step needs at least one note');
  if(new Set(notes.slice(0,n)).size!==n)throw new RangeError('Duplicate MIDI note');
  return {notes,n,time,flags:number(s.flags,0,255,'flags'),
    vel:number(s.vel,0,127,'velocity'),lvl:number(s.lvl,0,255,'note level'),
    rat:number(s.rat,0,255,'note ratchet')};
}
function drum(s){
  if(!s||typeof s!=='object')throw new TypeError('Missing native drum step');
  return {on:number(s.on,0,65535,'drum mask'),lvl:ints(s.lvl,16,0,3,'drum levels'),
    rat:ints(s.rat,16,0,3,'drum ratchets')};
}
function seq(values,mapper,label){
  if(!Array.isArray(values)||values.length!==64)throw new TypeError('Invalid '+label+' length');
  return values.map(mapper);
}
function nativeTrack(track,k,baseline,engines){
  if(!track||typeof track!=='object')throw new TypeError('Invalid track '+k);
  const engine=number(track.engine,0,engines.length-1,'engine'),
    preset=number(track.preset,0,k===3?32767:engines[engine].presets.length-1,'preset');
  const p=ints(track.p,baseline.tracks[k].p.length,-32768,32767,'track controls');
  number(p[29],1,64,'track LEN');number(p[30],0,8,'track DIV');
  if(k===3)number(p[engines.pe0??8],0,36,'drum kit');
  const fm6=ints(track.fm6,baseline.tracks[k].fm6.length,-32768,32767,'FM6 data');
  const step=seq(track.step,note,'synth steps'),dstep=seq(track.dstep,drum,'drum steps');
  const micro=ints(track.micro,64,-32,31,'microtiming'),
    fill=ints(track.fill,16,0,255,'fills');
  if(!Array.isArray(track.locks)||track.locks.length>24)throw new TypeError('Bad step locks');
  const locks=track.locks.map(l=>({
    step:number(l.step,0,63,'lock step'),
    param:number(l.param,0,p.length-1,'lock parameter'),
    value:number(l.value,-32768,32767,'lock value')
  }));
  if(new Set(locks.map(l=>l.step+':'+l.param)).size!==locks.length)
    throw new RangeError('Duplicate step lock');
  return {engine,preset,p,fm6,step,dstep,micro,fill,locks};
}
export function validateNativeProjectState(state,baseline,engines){
  if(!state||!Array.isArray(state.tracks)||state.tracks.length!==4||
     !baseline||!Array.isArray(baseline.tracks)||baseline.tracks.length!==4)
    throw new TypeError('Invalid original SLOOP project structure');
  return {g:ints(state.g,baseline.g.length,-32768,32767,'global parameters'),
    tracks:state.tracks.map((track,k)=>nativeTrack(track,k,baseline,engines))};
}
function songData(song){
  if(song===null)return null;
  if(!song||song.format!=='BRKLOOP_ARRANGEMENT_V1'||!Array.isArray(song.sections)||
     song.sections.length<1||song.sections.length>16)
    throw new TypeError('Invalid song arrangement');
  const form=word(song.form,16,'song form');
  if(!['FULL','SHORT'].includes(form))throw new RangeError('Unknown song form');
  const result=clone(song);
  let bars=0,cycles=0;
  for(const section of result.sections){
    word(section.id,128,'section id');word(section.title,128,'section title');
    word(section.part,20,'section role');
    if(typeof section.subtitle!=='string'||section.subtitle.length>500)
      throw new TypeError('Invalid section subtitle');
    const repeats=number(section.repeats??1,1,4,'section loops');
    if(typeof section.locked!=='boolean')throw new TypeError('Invalid lock flag');
    bars+=repeats*4;cycles+=repeats;
    if(!section.scene||!Array.isArray(section.scene.tracks)||section.scene.tracks.length!==4)
      throw new TypeError('Invalid scene');
    for(let k=0;k<4;k++){
      const t=section.scene.tracks[k];
      if(t.track!==k)throw new RangeError('Scene track order mismatch');
      seq(t.steps,k===3?drum:note,'song scene steps');
    }
    if(!section.scene.attacks||!Number.isInteger(section.scene.attacks.drums))
      throw new TypeError('Missing scene attack summary');
    number(section.scene.division,0,8,'scene division');
  }
  if(cycles>64||song.totalBars!==bars)
    throw new RangeError('Invalid song length');
  return result;
}
export function makeProject({name='BRKLOOP Session',state,arrangement=null,
  songIndex=0,view={track:0,step:0,mode:'step'}},baseline,engines){
  const native=validateNativeProjectState(state,baseline,engines);
  const song=songData(arrangement);
  const track=number(view.track,0,3,'selected track'),
    step=number(view.step,0,native.tracks[track].p[29]-1,'selected step');
  if(!['step','roll'].includes(view.mode))throw new RangeError('Invalid editor mode');
  return {format:PROJECT_FORMAT,name:word(name,80,'project name'),state:native,
    arrangement:song,songIndex:song?number(songIndex,0,song.sections.length-1,'selected song section'):0,
    view:{track,step,mode:view.mode}};
}
export function parseProject(text,baseline,engines){
  if(typeof text!=='string'||text.length>MAX_PROJECT_BYTES)
    throw new RangeError('Project exceeds 5 MB');
  return makeProject(JSON.parse(text),baseline,engines);
}
export function serializeProject(value,baseline,engines){
  const project=makeProject(value,baseline,engines);
  const json=JSON.stringify(project,null,2);
  if(json.length>MAX_PROJECT_BYTES)throw new RangeError('Project exceeds 5 MB');
  return json;
}
