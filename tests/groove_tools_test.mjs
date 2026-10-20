// SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import {generateDrumGroove,grooveSummary,GROOVE_STYLES} from '../research/groove-tools.mjs';
import {createResearchEditSession} from '../research/shared-edit-commands.mjs';
const length=64;
const empty=()=>({on:0,lvl:Array(16).fill(0),rat:Array(16).fill(0)});
const fixture=()=>({
  g:Array(49).fill(0),
  tracks:Array.from({length:4},(_,id)=>({
    p:Object.assign(Array(64).fill(0),{29:16,63:id===3?7:0}),
    dstep:Array.from({length},empty),micro:Array(length).fill(0),
    fill:Array(16).fill(0),locks:[],step:[],fm6:[],engine:0,preset:0
  }))
});
assert.equal(GROOVE_STYLES.length,5);
for(const [style] of GROOVE_STYLES){
  const a=generateDrumGroove({length:64,style,seed:23});
  const b=generateDrumGroove({length:64,style,seed:23});
  assert.deepEqual(a,b,style+' seed must reproduce exactly');
  assert.equal(a.steps.length,64);
  assert.equal(a.steps[0].on&1,1,style+' downbeat kick');
  assert.equal((a.steps[4].on>>2)&1,1,style+' backbeat snare');
  assert.equal((a.steps[12].on>>2)&1,1,style+' second backbeat snare');
  assert(a.steps.every(s=>s.on>=0&&s.on<=65535&&s.lvl.length===16&&s.rat.length===16));
  assert(a.steps.every(s=>s.lvl.every(v=>v>=0&&v<=3)&&s.rat.every(v=>v>=0&&v<=3)));
  assert(grooveSummary(a).kick>=4,style+' audible pulse');
}
const variationA=generateDrumGroove({style:'BREAK',seed:1});
const variationB=generateDrumGroove({style:'BREAK',seed:2});
assert.notDeepEqual(variationA.steps,variationB.steps,'NEXT variation should be different');
for(const bad of [0,65,1.5,-1])
  assert.throws(()=>generateDrumGroove({length:bad}),RangeError);
for(const bad of [-1,2**32,0.2])
  assert.throws(()=>generateDrumGroove({seed:bad}),RangeError);
assert.throws(()=>generateDrumGroove({style:'UNKNOWN'}),RangeError);
const base=fixture();
base.tracks[3].dstep[0].on=1<<5;
base.tracks[3].micro[0]=-11;base.tracks[3].fill[0]=2;
base.tracks[3].locks=[{step:0,param:4,value:111}];
base.tracks[3].p[29]=32;
const session=createResearchEditSession(base);
const draft=generateDrumGroove({length:32,style:'BOOM_BAP',seed:7});
assert.deepEqual(session.getState(),base,'generate must not edit session before APPLY');
session.dispatch({type:'replaceDrumGroove',track:3,length:32,steps:draft.steps});
const after=session.getState();
assert.deepEqual(after.tracks[3].dstep,draft.steps,'APPLY copies all 64 cells exactly');
assert.equal(after.tracks[3].p[29],32,'preserves active LEN');
assert.equal(after.tracks[3].p[63],7,'preserves drum kit');
assert.deepEqual(after.tracks.slice(0,3),base.tracks.slice(0,3),'does not modify synth tracks');
assert(after.tracks[3].micro.every(v=>v===0));
assert(after.tracks[3].fill.every(v=>v===0));
assert.deepEqual(after.tracks[3].locks,[]);
assert.deepEqual(session.history(),{undo:1,redo:0},'one APPLY = one Undo');
session.undo();assert.deepEqual(session.getState(),base,'Undo restores previous groove, locks and nudges');
session.redo();assert.deepEqual(session.getState(),after,'Redo restores applied groove');
assert.throws(()=>session.dispatch({type:'replaceDrumGroove',track:0,length:32,steps:draft.steps}),/DRUMS/);
assert.throws(()=>session.dispatch({type:'replaceDrumGroove',track:3,length:16,steps:draft.steps}),/LEN/);
assert.throws(()=>session.dispatch({type:'replaceDrumGroove',track:3,length:32,steps:[{}]}),/64 native/);
const invalid=structuredClone(draft.steps);invalid[22].lvl[0]=6;
assert.throws(()=>session.dispatch({type:'replaceDrumGroove',track:3,length:32,steps:invalid}),RangeError);
assert.deepEqual(session.getState(),after,'invalid candidate must leave history and pattern unchanged');
const short=generateDrumGroove({length:7,style:'HOUSE',seed:3});
assert(short.steps.slice(7).every(s=>s.on===0),'no hidden hits beyond LEN');
console.log('groove tools: deterministic 5 styles, native expression, atomic Undo/Redo, validation: PASS');
