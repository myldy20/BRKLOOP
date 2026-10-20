// SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import {generateMelodicIdea,melodicIdeaSummary,MELODY_ROLES,MELODY_SCALES}
  from '../research/melodic-ideas.mjs';
import {createResearchEditSession} from '../research/shared-edit-commands.mjs';
const generate=generateMelodicIdea;
for(const role of MELODY_ROLES){
  for(const scale of Object.keys(MELODY_SCALES)){
    for(const length of [1,7,16,33,64]){
      const config={role,scale,length,progression:'CYCLE',root:11,seed:17};
      const a=generate(config),b=generate(config);
      assert.deepEqual(a,b,'reproducible '+JSON.stringify(config));
      assert.equal(a.steps.length,64);
      assert(a.steps.slice(length).every(s=>s.n===0&&s.time===2),
        'no hidden notes beyond LEN');
      for(const s of a.steps){
        assert.equal(s.notes.length,4);
        assert(s.n>=0&&s.n<=(role==='CHORD'?3:1));
        if(s.n){assert.equal(s.time,0);assert.equal(new Set(s.notes.slice(0,s.n)).size,s.n);}
        assert(s.notes.every(n=>n>=0&&n<=127));
        assert(Number.isInteger(s.vel)&&s.vel>=0&&s.vel<=127);
      }
      assert(melodicIdeaSummary(a).attacks>0);
    }
  }
}
const chords=generate({length:64,role:'CHORD',root:0,scale:'MAJOR',progression:'POP',seed:1});
for(const [bar,triad] of [[0,[0,4,7]],[1,[7,11,2]],[2,[9,0,4]],[3,[5,9,0]]]){
  const actual=chords.steps[bar*16].notes.slice(0,3).map(n=>n%12).sort((a,b)=>a-b);
  assert.deepEqual(actual,triad.sort((a,b)=>a-b),'correct major progression, bar '+bar);
}
assert.equal(chords.steps[0].n,3,'three notes for chords');
const minor=generate({length:64,role:'BASS',root:9,scale:'MINOR',progression:'MINOR',seed:1});
assert.deepEqual([0,16,32,48].map(i=>minor.steps[i].notes[0]%12),[9,5,0,7],
  'A minor i–VI–III–VII root pitches');
const a=generate({length:64,role:'ARP',rhythm:'STRAIGHT',seed:3});
const b=generate({length:64,role:'ARP',rhythm:'SYNCOPATED',seed:3});
assert.notDeepEqual(a.steps,b.steps,'rhythm makes a measurable difference');
const v=generate({length:64,role:'BASS',rhythm:'SYNCOPATED',seed:7});
const v2=generate({length:64,role:'BASS',rhythm:'SYNCOPATED',seed:73});
assert.notDeepEqual(v.steps,v2.steps,'NEXT VARIATION makes a new candidate');
for(const invalid of [{length:0},{length:65},{length:1.2},{role:'DNB'},{scale:'BLUES'},
 {progression:'BAD'},{root:-1},{root:12},{seed:2**32},{rhythm:'NONE'}]){
  assert.throws(()=>generate(invalid),RangeError,'invalid: '+JSON.stringify(invalid));
}
function synthStep(){return {notes:[0,0,0,0],n:0,time:2,flags:0,vel:100,lvl:0,rat:0};}
function fixture(){
  return {g:Array(49).fill(0),tracks:Array.from({length:4},(_,track)=>{
    const p=Array(64).fill(0);p[29]=64;p[28]=track===0?-24:0;p[30]=2;
    return {p,step:Array.from({length:64},synthStep),dstep:[],micro:Array(64).fill(0),
      fill:Array(16).fill(0),locks:[],engine:1,preset:12,fm6:Array(128).fill(0)};
  })};
}
const original=fixture();
original.tracks[0].step[3]={...synthStep(),notes:[48,0,0,0],n:1,time:0,vel:88};
original.tracks[0].micro[3]=-17;original.tracks[0].fill[0]=2;
original.tracks[0].locks=[{step:3,param:6,value:33}];
const session=createResearchEditSession(original);
const idea=generate({length:64,role:'CHORD',scale:'MINOR',progression:'MINOR',seed:4});
assert.deepEqual(session.getState(),original,'generating must not modify project');
assert.equal(session.dispatch({type:'replaceMelodicIdea',track:0,length:64,steps:idea.steps}),true);
const applied=session.getState();
assert.deepEqual(applied.tracks[0].step,idea.steps);
assert.deepEqual(applied.tracks.slice(1),original.tracks.slice(1));
assert.deepEqual(applied.tracks[0].p,original.tracks[0].p,'instrument and performance params preserved');
assert.deepEqual(applied.tracks[0].fm6,original.tracks[0].fm6);
assert(applied.tracks[0].micro.every(x=>x===0));
assert(applied.tracks[0].fill.every(x=>x===0));
assert.deepEqual(applied.tracks[0].locks,[]);
assert.deepEqual(session.history(),{undo:1,redo:0},'one Apply one history entry');
assert.equal(session.undo(),true);assert.deepEqual(session.getState(),original);
assert.equal(session.redo(),true);assert.deepEqual(session.getState(),applied);
assert.throws(()=>session.dispatch({type:'replaceMelodicIdea',track:3,length:64,steps:idea.steps}),/synth/);
assert.throws(()=>session.dispatch({type:'replaceMelodicIdea',track:0,length:16,steps:idea.steps}),/LEN/);
const corrupt=structuredClone(idea.steps);corrupt[63].notes[0]=144;
assert.throws(()=>session.dispatch({type:'replaceMelodicIdea',track:0,length:64,steps:corrupt}),RangeError);
assert.deepEqual(session.getState(),applied,'all validation precedes any session mutation');
console.log('melodic ideas: 3 roles × 2 scales × 5 LEN, chord theory, variation, atomic undo: PASS');
