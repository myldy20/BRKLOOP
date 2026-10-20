// SPDX-License-Identifier: GPL-3.0-only
// Non-destructive, deterministic mutations of existing native SLOOP patterns.
// Original pitches, drum lane set, song harmony, sound and FX settings survive.
// Inspired by ristiisa's evolve/mutate explorations; no source copied.
export const MUTATION_MODES=Object.freeze([
  ['SHIFT','Move selected hits inside their beat'],
  ['FILL','Add notes/hits using existing material'],
  ['THIN','Reduce density without silencing a part'],
  ['ACCENT','Alter existing dynamics'],
  ['HUMANIZE','Change microtiming within the native range'],
]);
const VALID=new Set(MUTATION_MODES.map(([key])=>key));
const deep=value=>structuredClone(value);
function int(n,a,b,label){
  if(!Number.isInteger(n)||n<a||n>b)throw new RangeError(label+' must be '+a+'..'+b);
  return n;
}
function random(seed){
  let s=seed>>>0;
  return ()=>{
    s=(Math.imul(1664525,s)+1013904223)>>>0;
    return s/4294967296;
  };
}
const shuffle=(a,rng)=>{
  for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
};
const activeSynth=s=>s.time===0&&s.n>0;
const activeDrum=s=>s.on!==0;
const noteRest=s=>({...s,time:2});
const beats=i=>Math.floor(i/4);
const bar=i=>Math.floor(i/16);
function drumBits(steps,length) {
  const events=[];
  for(let i=0;i<length;i++)
    for(let lane=0;lane<16;lane++)
      if(steps[i].on&(1<<lane))events.push({step:i,lane});
  return events;
}
const synthEvents=(steps,length)=>Array.from({length},(_,i)=>i)
  .filter(i=>activeSynth(steps[i]));
const relocateSynth=(steps,micro,i,j)=>{
  steps[j]=deep(steps[i]);steps[i]=noteRest(steps[i]);
  micro[j]=micro[i];micro[i]=0;
};
const relocateDrum=(steps,i,j,lane)=>{
  const mask=1<<lane;
  steps[j].on|=mask;steps[j].lvl[lane]=steps[i].lvl[lane];
  steps[j].rat[lane]=steps[i].rat[lane];
  steps[i].on&=~mask;steps[i].lvl[lane]=0;steps[i].rat[lane]=0;
};
function mutateSynth(steps,micro,length,mode,amount,rng,locked){
  if(mode==='SHIFT'){
    const events=shuffle(synthEvents(steps,length),rng);
    const budget=Math.ceil(events.length*amount/100);
    let changed=0;
    for(const i of events){
      if(changed>=budget)break;
      // Preserve the first step and note continuations across step boundaries.
      if(i%16===0||locked.has(i)||!activeSynth(steps[i])||steps[(i+1)%length].time===1)continue;
      const targets=shuffle([i-1,i+1],rng);
      const j=targets.find(j=>j>=0&&j<length&&beats(i)===beats(j)
        &&!locked.has(j)&&steps[j].time===2&&steps[(j+1)%length].time!==1);
      if(j===undefined)continue;
      relocateSynth(steps,micro,i,j);changed++;
    }
    return;
  }
  if(mode==='FILL'){
    const candidates=shuffle(Array.from({length},(_,i)=>i).filter(i=>
      steps[i].time===2&&i%16!==0&&!locked.has(i)&&steps[(i+1)%length].time!==1),rng);
    const sources=synthEvents(steps,length);
    let added=0,budget=Math.ceil(candidates.length*amount/160);
    for(const i of candidates){
      if(added>=budget)break;
      const sameBar=sources.filter(j=>bar(j)===bar(i)&&Math.abs(j-i)<=4);
      const pool=sameBar.length?sameBar:sources.filter(j=>bar(j)===bar(i));
      if(!pool.length)continue;
      const j=pool[Math.floor(rng()*pool.length)];
      steps[i]={...deep(steps[j]),vel:Math.max(1,Math.min(127,steps[j].vel-8))};
      micro[i]=0;added++;
    }
    return;
  }
  if(mode==='THIN'){
    const events=shuffle(synthEvents(steps,length).filter(i=>i%16!==0&&!locked.has(i)
      &&steps[(i+1)%length].time!==1),rng);
    const total=synthEvents(steps,length).length;
    let count=0;
    for(const i of events){
      if(count>=Math.min(total-1,Math.ceil(events.length*amount/140)))break;
      if(!activeSynth(steps[i]))continue;
      steps[i]=noteRest(steps[i]);micro[i]=0;count++;
    }
    return;
  }
}
function mutateDrum(steps,micro,length,mode,amount,rng,locked){
  if(mode==='SHIFT'){
    const events=shuffle(drumBits(steps,length),rng);
    const budget=Math.ceil(events.length*amount/100);
    let moved=0;
    for(const {step:i,lane} of events){
      if(moved>=budget)break;
      if(i%16===0||locked.has(i)||!(steps[i].on&(1<<lane)))continue;
      const j=shuffle([i-1,i+1],rng).find(j=>
        j>=0&&j<length&&!locked.has(j)&&beats(i)===beats(j)&&!(steps[j].on&(1<<lane)));
      if(j===undefined)continue;
      relocateDrum(steps,i,j,lane);moved++;
    }
    return;
  }
  if(mode==='FILL'){
    const events=shuffle(drumBits(steps,length),rng),budget=Math.ceil(events.length*amount/150);
    let added=0;
    for(const {step:i,lane} of events){
      if(added>=budget)break;
      const j=shuffle([i-1,i+1,i+2],rng).find(j=>
        j>=0&&j<length&&!locked.has(j)&&bar(i)===bar(j)&&!(steps[j].on&(1<<lane))&&j%16!==0);
      if(j===undefined)continue;
      steps[j].on|=1<<lane;steps[j].lvl[lane]=steps[i].lvl[lane];
      steps[j].rat[lane]=steps[i].rat[lane];added++;
    }
    return;
  }
  if(mode==='THIN'){
    const events=shuffle(drumBits(steps,length).filter(({step})=>step%16!==0&&!locked.has(step)),rng);
    const laneCount=Array(16).fill(0);
    for(const {lane} of drumBits(steps,length))laneCount[lane]++;
    const budget=Math.ceil(events.length*amount/140);
    let removed=0;
    for(const {step:i,lane} of events){
      if(removed>=budget)break;
      if(laneCount[lane]<=1||!(steps[i].on&(1<<lane)))continue;
      steps[i].on&=~(1<<lane);steps[i].lvl[lane]=0;steps[i].rat[lane]=0;
      laneCount[lane]--;removed++;
    }
  }
}
function updateAccent(steps,length,drums,amount,rng){
  const events=drums?drumBits(steps,length):synthEvents(steps,length);
  let budget=Math.ceil(events.length*amount/100);
  for(const item of shuffle(events,rng)){
    if(!budget)break;
    const i=drums?item.step:item,s=steps[i];
    if(drums){
      const lane=item.lane,old=s.lvl[lane];
      // Original native drum level domain: NORM=0, GHOST=1, SOFT=2, HARD=3.
      s.lvl[lane]=old===3?1:3;
    }else{
      const old=s.vel;
      s.vel=old>=105?Math.max(1,old-24):Math.min(127,old+24);
      // Keep individual note levels, ratchets and continuation flags intact.
    }
    budget--;
  }
}
function updateTiming(steps,micro,length,drums,amount,rng){
  const active=i=>drums?activeDrum(steps[i]):activeSynth(steps[i]);
  const events=shuffle(Array.from({length},(_,i)=>i).filter(active),rng);
  let budget=Math.ceil(events.length*amount/100);
  const span=Math.max(1,Math.round(amount/5));
  for(const i of events){
    if(!budget)break;
    const old=micro[i];
    let delta=Math.floor(rng()*(2*span+1))-span;
    if(delta===0)delta=rng()<.5?-1:1;
    micro[i]=Math.max(-32,Math.min(31,old+delta));
    if(micro[i]!==old)budget--;
  }
}
export function mutateExistingPattern({track,trackIndex,length,mode='SHIFT',amount=35,seed=1}={}){
  int(trackIndex,0,3,'track');int(length,1,64,'LEN');
  int(amount,0,100,'amount');int(seed,0,0xFFFFFFFF,'seed');
  if(!VALID.has(mode))throw new RangeError('Unknown mutation focus');
  if(!track||!Array.isArray(track.micro)||track.micro.length!==64)
    throw new TypeError('Native SLOOP microtiming missing');
  if(track.p?.[29]!==length)throw new RangeError('Track LEN changed since mutation preview');
  const drums=trackIndex===3,source=drums?track.dstep:track.step;
  if(!Array.isArray(source)||source.length!==64)throw new TypeError('Native 64-step score missing');
  const steps=deep(source),micro=[...track.micro],rng=random(seed);
  // Preserve the musical event underneath native per-step parameter locks.
  // The locks themselves always remain untouched; a shifted/dropped event
  // would otherwise leave automation behind on an unrelated REST.
  const locked=new Set((track.locks||[]).map(l=>l.step));
  if(amount>0){
    if(mode==='ACCENT')updateAccent(steps,length,drums,amount,rng);
    else if(mode==='HUMANIZE')updateTiming(steps,micro,length,drums,amount,rng);
    else if(drums)mutateDrum(steps,micro,length,mode,amount,rng,locked);
    else mutateSynth(steps,micro,length,mode,amount,rng,locked);
  }
  const changed=JSON.stringify(steps)!==JSON.stringify(source)||
    JSON.stringify(micro)!==JSON.stringify(track.micro);
  const original=drums?drumBits(source,length).length:synthEvents(source,length).length;
  const after=drums?drumBits(steps,length).length:synthEvents(steps,length).length;
  return {trackIndex,length,mode,amount,seed,drums,steps,micro,changed,original,after};
}
