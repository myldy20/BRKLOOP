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
      subtitle:roles[part].subtitle,scene});
    sections.push(section);
  }
  return {format:'BRKLOOP_ARRANGEMENT_V1',form,seed,root,scale,progression,groove,
    division,stepsPerSection:64,sections,totalBars:sections.length*4};
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
  return {sections:arrangement.sections.length,bars:arrangement.totalBars,
    labels:arrangement.sections.map(x=>x.title)};
}
