// SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import {mutateExistingPattern,MUTATION_MODES} from '../research/pattern-mutate.mjs';
import {createResearchEditSession} from '../research/shared-edit-commands.mjs';
const clone=x=>structuredClone(x);
const rest=()=>({notes:[0,0,0,0],n:0,time:2,flags:0,vel:100,lvl:0,rat:0});
const blankDrum=()=>({on:0,lvl:Array(16).fill(0),rat:Array(16).fill(0)});
function nativeTrack(k=0,length=32){
  const p=Array(64).fill(0);p[29]=length;p[28]=-24;p[63]=7;
  return {engine:1,preset:8,p,fm6:Array(128).fill(7),
    step:Array.from({length:64},rest),dstep:Array.from({length:64},blankDrum),
    micro:Array(64).fill(0),fill:Array(16).fill(0),locks:[]};
}
function populated(k,length=32){
  const t=nativeTrack(k,length);
  if(k!==3){
    for(let i=0;i<length;i+=4) t.step[i]={...rest(),notes:[48+(i%12),52+(i%12),0,0],
      n:2,time:0,vel:100,flags:1,lvl:2,rat:0};
    // ensure shifted note's original velocity and expression are meaningful
    t.step[3]={...rest(),notes:[51,0,0,0],n:1,time:0,vel:84,flags:1,lvl:1,rat:0};
    t.step[6]={...rest(),notes:[55,0,0,0],n:1,time:0,vel:93,flags:2,lvl:2,rat:0};
    t.step[7]={...rest(),notes:[55,0,0,0],n:1,time:1,vel:94,flags:0,lvl:0,rat:0};
  }else{
    for(let i=0;i<length;i+=4){
      t.dstep[i].on|=1<<0;t.dstep[i].lvl[0]=3;
      t.dstep[i].on|=1<<4;t.dstep[i].lvl[4]=2;
    }
    for(let i=2;i<length;i+=4){t.dstep[i].on|=1<<2;t.dstep[i].lvl[2]=1;t.dstep[i].rat[2]=2;}
    t.dstep[3].on|=1<<7;t.dstep[3].lvl[7]=3;
  }
  t.locks=[{step:4,param:5,value:90}];t.fill[0]=1;t.micro[0]=12;t.micro[4]=-12;
  // Sentinel hidden step beyond LEN: must never change on any variation.
  t.step[63]={...rest(),notes:[79,0,0,0],n:1,time:0,flags:1,vel:88};
  t.dstep[63]={...blankDrum(),on:1<<15};
  t.micro[63]=-9;
  return t;
}
function notePool(track,length){
  return new Set(track.step.slice(0,length).filter(s=>s.time===0&&s.n)
    .flatMap(s=>s.notes.slice(0,s.n)));
}
function lanePool(track,length){
  return new Set(track.dstep.slice(0,length).flatMap(s=>
    Array.from({length:16},(_,lane)=>lane).filter(lane=>s.on&(1<<lane))));
}
const modes=MUTATION_MODES.map(([name])=>name);
assert.deepEqual(modes,['SHIFT','FILL','THIN','ACCENT','HUMANIZE']);
for(const k of [0,3]){
  const t=populated(k);
  const key=k===3?'dstep':'step',pitchPool=notePool(t,32),lanes=lanePool(t,32);
  for(const mode of modes){
    for(const seed of [1,2,97]){
      const args={track:t,trackIndex:k,length:32,mode,seed,amount:75};
      const a=mutateExistingPattern(args),b=mutateExistingPattern(args);
      assert.deepEqual(a,b,'deterministic '+mode+' / '+k);
      assert.deepEqual(t,populated(k),'pure generator never changes source');
      assert.equal(a.steps.length,64);assert.equal(a.micro.length,64);
      assert(a.micro.every(v=>Number.isInteger(v)&&v>=-32&&v<=31),'native micro range');
      if(['SHIFT','FILL','THIN'].includes(mode))
        assert.deepEqual(a.steps[4],t[key][4],'step carrying native parameter lock stays intact');
      assert.deepEqual(a.steps.slice(32),t[key].slice(32),'steps outside LEN unchanged');
      assert.deepEqual(a.micro.slice(32),t.micro.slice(32),'micro outside LEN unchanged');
      if(k===3){
        const candidate={...t,dstep:a.steps};
        for(const lane of lanePool(candidate,32))
          assert(lanes.has(lane),'mutator cannot introduce a new drum instrument');
        assert(a.steps.every(s=>s.on>=0&&s.on<=65535&&s.lvl.length===16&&s.rat.length===16));
      }else{
        const candidate={...t,step:a.steps};
        for(const pitch of notePool(candidate,32))
          assert(pitchPool.has(pitch),'mutator cannot introduce a new pitch');
        assert(a.steps.every(s=>s.n<=4&&s.notes.length===4&&s.notes.every(v=>v>=0&&v<=127)));
        assert.equal(a.steps[7].time,1,'native TIE must not be shifted or destroyed');
      }
      if(mode==='SHIFT'||mode==='ACCENT'||mode==='HUMANIZE')
        assert.equal(a.after,a.original,mode+' conserves count of note/hit attacks');
      if(mode==='FILL')assert(a.after>=a.original,'FILL cannot erase attacks');
      if(mode==='THIN')assert(a.after<=a.original,'THIN cannot add attacks');
      assert(a.after>0,'mutation never silences whole populated part');
      if(mode==='ACCENT'||mode==='HUMANIZE'){
        assert.deepEqual(a.steps.map(s=>k===3?s.on:[s.time,s.n,s.notes]),
          t[key].map(s=>k===3?s.on:[s.time,s.n,s.notes]),
          mode+' does not change notes or hit times');
      }
      if(mode==='ACCENT')assert.deepEqual(a.micro,t.micro,'ACCENT must not change microtiming');
      if(mode==='HUMANIZE')assert.deepEqual(a.steps,t[key],'timing-only mode keeps exact note/hit steps');
    }
  }
  const untouched=mutateExistingPattern({track:t,trackIndex:k,length:32,mode:'FILL',amount:0});
  assert.equal(untouched.changed,false);
  assert.deepEqual(untouched.steps,t[key]);
  assert.deepEqual(untouched.micro,t.micro);
}
for(const k of [0,3]){
  const blank=nativeTrack(k);
  const candidate=mutateExistingPattern({track:blank,trackIndex:k,length:32,mode:'FILL',amount:100});
  assert.equal(candidate.changed,false,'blank sources stay blank');
}
for(const values of [{amount:-1},{amount:101},{seed:-1},{seed:2**32},{mode:'GATE'},
 {trackIndex:4},{length:65}]){
  assert.throws(()=>mutateExistingPattern({track:populated(0),trackIndex:0,length:32,...values}),
    RangeError,JSON.stringify(values));
}
const project={g:Array(49).fill(0),tracks:[populated(0),populated(1),populated(2),populated(3)]};
const session=createResearchEditSession(project);
const synth=mutateExistingPattern({track:project.tracks[0],trackIndex:0,length:32,mode:'ACCENT',amount:90,seed:1});
assert.equal(synth.changed,true);
const command=d=>({type:'applyPatternMutation',track:d.trackIndex,length:d.length,steps:d.steps,micro:d.micro});
session.dispatch(command(synth));
let after=session.getState();
assert.deepEqual(after.tracks.slice(1),project.tracks.slice(1),'mutating synth cannot touch other tracks');
for(const attr of ['p','fm6','engine','preset','fill','locks'])
  assert.deepEqual(after.tracks[0][attr],project.tracks[0][attr],'preserve '+attr);
assert.deepEqual(session.history(),{undo:1,redo:0});
session.undo();assert.deepEqual(session.getState(),project,'Undo synth mutation restores original pattern and metadata');
session.redo();assert.deepEqual(session.getState(),after);
const drum=mutateExistingPattern({track:project.tracks[3],trackIndex:3,length:32,mode:'HUMANIZE',amount:90,seed:1});
assert.equal(drum.changed,true);
session.dispatch(command(drum));
const applied=session.getState();
assert.deepEqual(applied.tracks[3].dstep,project.tracks[3].dstep,'humanize only touches drum timing');
assert.deepEqual(applied.tracks[3].locks,project.tracks[3].locks,'retains drum locks');
assert.deepEqual(applied.tracks[3].fill,project.tracks[3].fill,'retains drum fill');
session.undo();assert.deepEqual(session.getState(),after,'undo restores entire drum timing');
session.undo();assert.deepEqual(session.getState(),project,'second undo restores synth');
session.redo();session.redo();assert.deepEqual(session.getState(),applied);
for(const broken of [
 {...command(synth),length:31},
 {...command(synth),micro:[0]},
 {...command(synth),steps:[{}]},
 {...command(synth),steps:synth.steps.map((s,i)=>i===63?{...s,n:7}:s)},
 {...command(synth),micro:synth.micro.map((v,i)=>i===40?32:v)}
]){
  assert.throws(()=>session.dispatch(broken),Error);
  assert.deepEqual(session.getState(),applied,'rejected patch cannot alter history/data');
}
console.log('pattern mutation: 5 modes, 2 track types, source integrity, MIDI pool, native timing, Undo: PASS');
