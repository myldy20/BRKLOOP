// SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import {generateSongArrangement,editSongArrangement,createSongArrangementSession,
  arrangementPlaybackStates,arrangementSummary} from '../research/song-arranger.mjs';
const original=generateSongArrangement({form:'FULL',seed:19,root:9,groove:'DNB'});
const copy=structuredClone(original);
let song=original;
song=editSongArrangement(song,{type:'lock',index:2});
assert.equal(song.sections[2].locked,true);
const keeper=structuredClone(song.sections[2]);
song=editSongArrangement(song,{type:'regenerate',index:4});
assert.notDeepEqual(song.sections[4].scene,original.sections[4].scene);
assert.deepEqual(song.sections[2],keeper,'unrelated locked chorus unchanged');
assert.throws(()=>editSongArrangement(song,{type:'regenerate',index:2}),/Unlock/);
const beforeEvolve=structuredClone(song);
song=editSongArrangement(song,{type:'evolve'});
assert.deepEqual(song.sections[2],keeper,'Evolve Unlocked keeps entire locked scene byte-identical');
assert.notDeepEqual(song.sections[0].scene,beforeEvolve.sections[0].scene);
assert.notDeepEqual(song.sections[4].scene,beforeEvolve.sections[4].scene);
assert.equal(song.sections[0].id,beforeEvolve.sections[0].id);
const stable=structuredClone(song.sections[2]);
song=editSongArrangement(song,{type:'move',index:2,direction:-1});
assert.deepEqual(song.sections[1],stable,'Move preserves scene content exactly');
song=editSongArrangement(song,{type:'duplicate',index:1});
assert.equal(song.sections.length,9);
assert.deepEqual(song.sections[2].scene,song.sections[1].scene,'Duplicate is exact audio snapshot');
assert.notEqual(song.sections[2].id,song.sections[1].id,'Duplicate has unique identity');
const copyId=song.sections[2].id;
song=editSongArrangement(song,{type:'repeats',index:2,value:3});
assert.equal(song.sections[2].repeats,3);
assert.equal(arrangementSummary(song).bars,9*4+8);
song=editSongArrangement(song,{type:'remove',index:2});
assert(!song.sections.some(x=>x.id===copyId));
assert.equal(arrangementSummary(song).bars,32);
assert.deepEqual(original,copy,'All arrangement operations are immutable');
for(const op of [
 {type:'bad'},{type:'remove',index:-1},{type:'repeats',index:0,value:0},
 {type:'repeats',index:0,value:5},{type:'move',index:0,direction:2},
 {type:'lock',index:10}]){
  assert.throws(()=>editSongArrangement(song,op),Error,'invalid edit '+JSON.stringify(op));
}
const beforeAllLocked=structuredClone(song);
for(let i=0;i<song.sections.length;i++)
  if(!song.sections[i].locked)song=editSongArrangement(song,{type:'lock',index:i});
assert.deepEqual(editSongArrangement(song,{type:'evolve'}),song,'all locked means no new variation');
let trimmed=structuredClone(song);
while(trimmed.sections.length>1)trimmed=editSongArrangement(trimmed,{type:'remove',index:0});
assert.throws(()=>editSongArrangement(trimmed,{type:'remove',index:0}),/at least one/);
for(let i=0;i<15;i++)trimmed=editSongArrangement(trimmed,{type:'duplicate',index:0});
assert.equal(trimmed.sections.length,16);
assert.throws(()=>editSongArrangement(trimmed,{type:'duplicate',index:0}),/16/);
for(let i=0;i<16;i++)trimmed=editSongArrangement(trimmed,{type:'repeats',index:i,value:4});
const mockTrack=k=>{const p=Array(71).fill(0);p[29]=16;p[30]=k;
 return {p,engine:0,preset:0,fm6:Array(128).fill(0),
  step:Array.from({length:64},()=>({notes:[0,0,0,0],n:0,time:2,flags:0,vel:100,lvl:0,rat:0})),
  dstep:Array.from({length:64},()=>({on:0,lvl:Array(16).fill(0),rat:Array(16).fill(0)})),
  micro:Array(64).fill(0),fill:Array(16).fill(0),locks:[]};};
const native={g:Array(49).fill(0),tracks:[0,1,2,3].map(mockTrack)};
const playback=arrangementPlaybackStates(trimmed,native);
assert.equal(playback.length,64,'maximum supported arrangement produces 64 audio cycles');
for(let i=0;i<16;i++){
  const section=trimmed.sections[i];
  assert.deepEqual(playback[i*4].tracks[3].dstep,section.scene.tracks[3].steps);
  for(let j=1;j<4;j++)
    assert.deepEqual(playback[i*4+j],playback[i*4],'repetition keeps scene snapshot');
}
assert.deepEqual(native.g,Array(49).fill(0),'playback did not alter native project');
const hist=createSongArrangementSession(original,{historyLimit:6});
const before=hist.get();
assert.deepEqual(hist.history(),{undo:0,redo:0});
assert.equal(hist.dispatch({type:'move',index:0,direction:-1}),false,'boundary move no-op');
assert.equal(hist.dispatch({type:'lock',index:2}),true);
const locked=hist.get();
assert.deepEqual(hist.history(),{undo:1,redo:0});
assert.equal(hist.dispatch({type:'repeats',index:2,value:2}),true);
assert.equal(hist.get().totalBars,36);
assert.equal(hist.undo(),true);
assert.deepEqual(hist.get(),locked);
assert.equal(hist.undo(),true);
assert.deepEqual(hist.get(),before);
assert.equal(hist.redo(),true);
assert.deepEqual(hist.get(),locked);
assert.equal(hist.dispatch({type:'duplicate',index:2}),true);
assert.deepEqual(hist.history(),{undo:2,redo:0},'branch after Undo clears Redo');
assert.equal(hist.redo(),false);
console.log('song editing: lock-preserving mutation, reorder, repeats 1..4, duplicate, remove, 64-cycle playback, independent Undo: PASS');
