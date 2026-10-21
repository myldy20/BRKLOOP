// SPDX-License-Identifier: GPL-3.0-only
// Browser-only song form. Native SLOOP has 64 steps/track, so an arrangement
// is a sequence of independent four-track scenes, never an oversized pattern.
import {generateLinkedScene} from './linked-scene.mjs';

export const SONG_FORMS=Object.freeze({SHORT:['INTRO','VERSE','CHORUS','OUTRO'],
  FULL:['INTRO','VERSE','CHORUS','VERSE','CHORUS','BREAK','CHORUS','OUTRO']});
const roles=Object.freeze({
  INTRO:{feel:'AIRY',subtitle:'Open the texture'},
  VERSE:{feel:'TIGHT',subtitle:'Leave room for a voice'},
  CHORUS:{feel:'DRIVE',subtitle:'Full rhythmic energy'},
  BREAK:{feel:'AIRY',subtitle:'Break the groove'},
  OUTRO:{feel:'AIRY',subtitle:'Strip the arrangement back'},
});
const integer=(v,min,max,name)=>{
  if(!Number.isInteger(v)||v<min||v>max)throw new RangeError(name+' must be '+min+'..'+max);
  return v;
};
const clone=value=>structuredClone(value);
const silenceSynth=(step)=>{step.n=0;step.time=2;step.flags=0;};
const silenceDrums=(step)=>{step.on=0;step.lvl.fill(0);step.rat.fill(0);};
const maskDrums=(s,allowed)=>{
  for(let lane=0;lane<16;lane++)
    if(!(allowed&(1<<lane))){s.on&=~(1<<lane);s.lvl[lane]=0;s.rat[lane]=0;}
};
function arrangeSection(section){
  const {part,scene}=section,[bass,chords,arp,drums]=scene.tracks.map(t=>t.steps);
  if(part==='INTRO'){
    for(let i=0;i<64;i++){
      if(i<32){silenceSynth(bass[i]);silenceSynth(arp[i]);}
      if(i<16||i%16>=12)maskDrums(drums[i],(1<<4)|(1<<5));
      if(i<48&&i%16!==0)silenceSynth(chords[i]);
    }
  }else if(part==='VERSE'){
    for(let i=0;i<64;i++){
      if(i%4===2)silenceSynth(arp[i]);
      // Keep quieter second half of every bar for vocal phrasing.
      if(i%16>=8 && i%16!==12)silenceSynth(chords[i]);
    }
  }else if(part==='BREAK'){
    for(let i=0;i<64;i++){
      if(i%16!==0)silenceSynth(bass[i]);
      if(i%16!==0)silenceSynth(chords[i]);
      if(i%16>=4)silenceSynth(arp[i]);
      maskDrums(drums[i],i%16===0?1:(1<<4));
      if(i%4!==0)silenceDrums(drums[i]);
    }
  }else if(part==='OUTRO'){
    for(let i=0;i<64;i++){
      silenceSynth(arp[i]);
      if(i>=32)silenceSynth(bass[i]);
      if(i%16!==0)silenceSynth(chords[i]);
      if(i>=48)silenceDrums(drums[i]);
      else if(i%4!==0)maskDrums(drums[i],1<<4);
    }
  }
  // Retain the strong first-beat relationship when bass is present.
  for(let i=0;i<64;i++)
    if(bass[i].time===0&&bass[i].n>0 && !(drums[i].on&1))
      silenceSynth(bass[i]);
  scene.attacks={
    bass:bass.filter(s=>s.time===0&&s.n).length,
    chords:chords.filter(s=>s.time===0&&s.n).length,
    arp:arp.filter(s=>s.time===0&&s.n).length,
    drums:drums.filter(s=>s.on).length,
  };
  return section;
}
export function generateSongArrangement({
  form='FULL',root=0,scale='MINOR',progression='MINOR',groove='DNB',
  division=2,seed=1
}={}){
  if(!Object.hasOwn(SONG_FORMS,form))throw new RangeError('Unknown song form');
  integer(seed,0,0xFFFFFFFF,'seed');
  const counts={},sections=[];
  for(let i=0;i<SONG_FORMS[form].length;i++){
    const part=SONG_FORMS[form][i];
    counts[part]=(counts[part]||0)+1;
    const variation=counts[part];
    const sceneSeed=(seed+i*104729+variation*8191)>>>0;
    const scene=generateLinkedScene({length:64,division,root,scale,progression,groove,
      feel:roles[part].feel,seed:sceneSeed});
    const section=arrangeSection({id:part.toLowerCase()+'-'+variation,
      title:part+(variation>1?' '+variation:''),part,variation,
      subtitle:roles[part].subtitle,scene,repeats:1,locked:false});
    sections.push(section);
  }
  return {format:'BRKLOOP_ARRANGEMENT_V1',form,seed,root,scale,progression,groove,
    division,stepsPerSection:64,sections,totalBars:sections.length*4};
}
// Editing the song form never mutates the native score until the user
// explicitly applies a section. Each edit returns a fresh JSON-safe document.
export const SONG_EDIT_ACTIONS=Object.freeze(['move','duplicate','remove','repeats',
  'lock','regenerate','evolve']);
function validateArrangement(song){
  if(song?.format!=='BRKLOOP_ARRANGEMENT_V1'||!Array.isArray(song.sections)||
     !song.sections.length||song.sections.length>16)
    throw new TypeError('Invalid song arrangement');
}
function sectionRepeats(section){
  return integer(section.repeats??1,1,4,'section repeats');
}
function rebuildTotal(song){
  song.totalBars=song.sections.reduce((n,s)=>n+4*sectionRepeats(s),0);
  return song;
}
function rebuildSection(song,section,seed){
  const scene=generateLinkedScene({length:64,division:song.division,
    root:song.root,scale:song.scale,progression:song.progression,
    groove:song.groove,feel:roles[section.part].feel,seed});
  return arrangeSection({...section,scene});
}
export function editSongArrangement(original,command){
  validateArrangement(original);
  if(!command||!SONG_EDIT_ACTIONS.includes(command.type))
    throw new RangeError('Unknown song edit');
  const song=clone(original),list=song.sections;
  if(command.type==='evolve'){
    if(song.sections.every(s=>s.locked))return song;
    song.seed=(integer(song.seed,0,0xffffffff,'seed')+1)>>>0;
    let count=0;
    song.sections= list.map((s,i)=>{
      if(s.locked)return s;
      count++;
      return rebuildSection(song,s,(s.scene.seed+1+i*8191)>>>0);
    });
    return rebuildTotal(song);
  }
  const index=integer(command.index,0,list.length-1,'section');
  const section=list[index];
  if(command.type==='move'){
    const direction=integer(command.direction,-1,1,'direction');
    if(direction===0)return song;
    const target=index+direction;
    if(target<0||target>=list.length)return song;
    [list[index],list[target]]=[list[target],list[index]];
  }else if(command.type==='duplicate'){
    if(list.length>=16)throw new RangeError('At most 16 song sections');
    const dup=clone(section);
    const used=new Set(list.map(s=>s.id));
    let n=1;while(used.has(section.id+'-copy-'+n))n++;
    dup.id=section.id+'-copy-'+n;
    dup.title=section.title+' COPY';
    // A duplicated section is an identical snapshot, including its lock.
    list.splice(index+1,0,dup);
  }else if(command.type==='remove'){
    if(list.length===1)throw new RangeError('Song must retain at least one section');
    list.splice(index,1);
  }else if(command.type==='repeats'){
    section.repeats=integer(command.value,1,4,'section repeats');
  }else if(command.type==='lock'){
    section.locked=!Boolean(section.locked);
  }else if(command.type==='regenerate'){
    if(section.locked)throw new Error('Unlock the section before regenerating it');
    list[index]=rebuildSection(song,section,(section.scene.seed+1)>>>0);
  }
  return rebuildTotal(song);
}
export function createSongArrangementSession(initial,{historyLimit=32}={}){
  integer(historyLimit,1,128,'history limit');
  let current=clone(initial),undo=[],redo=[];
  validateArrangement(current);
  return Object.freeze({
    get:()=>clone(current),
    history:()=>({undo:undo.length,redo:redo.length}),
    dispatch(command){
      const next=editSongArrangement(current,command);
      if(JSON.stringify(next)===JSON.stringify(current))return false;
      undo.push(current);if(undo.length>historyLimit)undo.shift();
      current=next;redo=[];return true;
    },
    undo(){if(!undo.length)return false;redo.push(current);current=undo.pop();return true;},
    redo(){if(!redo.length)return false;undo.push(current);current=redo.pop();return true;}
  });
}
export function arrangementPlaybackStates(arrangement,nativeState){
  validateArrangement(arrangement);
  const states=[];
  for(const section of arrangement.sections){
    const state=applyArrangementSection(nativeState,section);
    for(let i=0;i<sectionRepeats(section);i++)states.push(state);
  }
  if(states.length>64)throw RangeError('At most 64 section cycles');
  return states;
}
export function applyArrangementSection(state,section){
  if(!state||!Array.isArray(state.tracks)||state.tracks.length!==4)throw TypeError('Bad native state');
  if(!section?.scene?.tracks||section.scene.tracks.length!==4)throw TypeError('Bad arrangement section');
  const result=clone(state);
  for(let k=0;k<4;k++){
    const item=section.scene.tracks[k],t=result.tracks[k];
    if(item.track!==k||item.steps.length!==64)throw Error('Scene track mismatch');
    t[k===3?'dstep':'step']=clone(item.steps);
    t.p[29]=64;t.p[30]=section.scene.division;
    t.micro.fill(0);t.fill.fill(0);t.locks=[];
  }
  return result;
}
export function arrangementSummary(arrangement){
  if(arrangement?.format!=='BRKLOOP_ARRANGEMENT_V1'||!Array.isArray(arrangement.sections))
    throw TypeError('Invalid song arrangement');
  return {sections:arrangement.sections.length,
    bars:arrangement.sections.reduce((n,s)=>n+4*sectionRepeats(s),0),
    labels:arrangement.sections.map(x=>x.title)};
}
