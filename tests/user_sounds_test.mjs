// SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import {makeUserSound,validateUserSound,normalizeUserSoundLibrary,importUserSoundFile,
  exportUserSoundLibrary,applyUserSoundToTrack,USER_SOUND_FORMAT,
  USER_SOUND_LIBRARY_FORMAT,MAX_USER_SOUNDS,PRESERVED_TRACK_PARAMS} from '../research/user-sounds.mjs';
import {createResearchEditSession} from '../research/shared-edit-commands.mjs';
const controls=Array.from({length:71},(_,i)=>i);
const fm6=Array.from({length:128},(_,i)=>i%256);
const nativeTrack={
  engine:9,preset:4,p:controls, fm6,
  step:Array.from({length:64},()=>({notes:[48,0,0,0],n:1,time:0,flags:0,vel:100,lvl:0,rat:0})),
  dstep:Array.from({length:64},()=>({on:0,lvl:Array(16).fill(0),rat:Array(16).fill(0)})),
  micro:Array(64).fill(0),fill:Array(16).fill(0),locks:[]};
nativeTrack.p[1]=95;nativeTrack.p[9]=71;nativeTrack.p[14]=-55;
nativeTrack.p[33]=82;nativeTrack.p[34]=47;nativeTrack.p[35]=49;nativeTrack.p[36]=72;
nativeTrack.p[50]=-47;
const limits={engines:12,pLength:71,fm6Length:128};
const copy=structuredClone(nativeTrack);
const patch=makeUserSound({id:'u:save_my_patch_1234',name:'   Wobble Rewired  ',track:nativeTrack},limits);
assert.equal(patch.format,USER_SOUND_FORMAT);
assert.equal(patch.name,'Wobble Rewired');
assert.equal(patch.p[1],95);assert.equal(patch.p[9],71);
assert.equal(patch.p[14],-55);assert.equal(patch.p[33],82);
assert.equal(patch.p[34],47);assert.equal(patch.p[35],49);
assert.equal(patch.p[36],72);assert.equal(patch.p[50],-47);
assert.deepEqual(patch.fm6,fm6);
nativeTrack.p[1]=2;nativeTrack.fm6[0]=0;
assert.equal(patch.p[1],95,'saved patch is immutable snapshot');
assert.equal(patch.fm6[0],0);
assert.equal(patch.fm6[1],1);
assert.equal('step' in patch,false,'note steps cannot enter sound library');
assert.equal('locks' in patch,false,'step locks cannot enter sound library');
const json=exportUserSoundLibrary([patch],limits);
const parsed=importUserSoundFile(json,limits);
assert.equal(parsed.format,USER_SOUND_LIBRARY_FORMAT);
assert.deepEqual(parsed.sounds,[patch]);
assert.deepEqual(importUserSoundFile(JSON.stringify(patch),limits).sounds,[patch]);
for(const bad of [
  {...patch,name:''},{...patch,name:'a'.repeat(49)},
  {...patch,id:'../../etc'},{...patch,engine:12},{...patch,preset:-1},
  {...patch,p:[1,2]},{...patch,p:[...patch.p.slice(0,-1),2.5]},
  {...patch,fm6:[0]},{...patch,fm6:[...patch.fm6.slice(0,-1),999999]}
])assert.throws(()=>validateUserSound(bad,limits),Error);
assert.throws(()=>importUserSoundFile('not-json',limits),SyntaxError);
assert.throws(()=>importUserSoundFile(JSON.stringify({format:USER_SOUND_LIBRARY_FORMAT,
  sounds:[patch,patch]}),limits),/Duplicate/);
assert.throws(()=>importUserSoundFile('a'.repeat(1024*1024+1),limits),/too large/);
assert.throws(()=>normalizeUserSoundLibrary({format:USER_SOUND_LIBRARY_FORMAT,
  sounds:Array(MAX_USER_SOUNDS+1).fill(patch)},limits),/Invalid/);

const live=structuredClone(copy);
live.engine=0;live.preset=7;live.p=Array(71).fill(3);live.fm6=Array(128).fill(4);
for(const id of PRESERVED_TRACK_PARAMS)live.p[id]=1000+id;
const before=structuredClone(live);
const applied=applyUserSoundToTrack(live,patch,limits);
assert.equal(applied.engine,9);
assert.equal(applied.preset,4);
for(const [id,value]of [[1,95],[9,71],[14,-55],[33,82],[34,47],[35,49],[36,72],[50,-47]])
  assert.equal(applied.p[id],value,'patch control '+id);
for(const id of PRESERVED_TRACK_PARAMS)
  assert.equal(applied.p[id],before.p[id],'track-native fields preserved '+id);
assert.deepEqual(applied.step,before.step,'note pattern preserved');
assert.deepEqual(applied.micro,before.micro,'micro preserved');
assert.deepEqual(applied.locks,before.locks,'locks preserved');
assert.deepEqual(applied.fm6,patch.fm6,'full packed FM6 data carried over');
assert.deepEqual(live,before,'pure snapshot apply never touches original');

const seed={g:Array(49).fill(0),tracks:Array.from({length:4},()=>structuredClone(before))};
const session=createResearchEditSession(seed);
const old=session.getState();
assert.equal(session.dispatch({type:'setFactorySound',track:0,
  engine:patch.engine,preset:patch.preset,p:patch.p,fm6:patch.fm6}),true);
const after=session.getState();
assert.equal(after.tracks[0].p[33],82);
assert.equal(after.tracks[0].p[36],72);
assert.deepEqual(after.tracks[0].step,old.tracks[0].step);
assert.deepEqual(after.tracks[1],old.tracks[1]);
assert.equal(session.undo(),true);assert.deepEqual(session.getState(),old);
assert.equal(session.redo(),true);assert.deepEqual(session.getState(),after);
console.log('user sounds: complete ADSR/LFO/filter/FX/FM6 snapshots, guarded JSON, track-safe apply and atomic Undo/Redo: PASS');
