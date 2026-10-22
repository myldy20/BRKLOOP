// SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import {makeProject,parseProject,serializeProject,PROJECT_FORMAT,
  MAX_PROJECT_BYTES} from '../research/project-file.mjs';
import {createResearchEditSession} from '../research/shared-edit-commands.mjs';
import {generateSongArrangement,createSongArrangementSession,
  arrangementPlaybackStates} from '../research/song-arranger.mjs';
const emptyNote=()=>({notes:[0,0,0,0],n:0,time:2,flags:0,vel:100,lvl:0,rat:0});
const emptyDrum=()=>({on:0,lvl:Array(16).fill(0),rat:Array(16).fill(0)});
const bank={pe0:63,engines:Array.from({length:12},(_,i)=>({
  presets:Array.from({length:10},(_,j)=>({name:'Engine'+i+'-'+j}))
}))};
const baseline={g:Array(49).fill(0),tracks:Array.from({length:4},(_,k)=>({
  engine:k,preset:0,p:Array(71).fill(0),fm6:Array(128).fill(0),
  step:Array.from({length:64},emptyNote),
  dstep:Array.from({length:64},emptyDrum),
  micro:Array(64).fill(0),fill:Array(16).fill(0),locks:[]
}))};
const state=structuredClone(baseline);
state.g[0]=174;state.g[1]=35;
for(let k=0;k<4;k++){
  const t=state.tracks[k];t.engine=k;t.preset=k;
  t.p[29]=k===0?64:16;t.p[30]=2;t.p[33]=34+k;t.p[35]=44+k;t.p[36]=63+k;
  t.fm6[14]=500+k;t.micro[11]=-19;t.fill[4]=192;
  t.locks=[{step:7,param:33,value:47}];
  t.step[11]={...emptyNote(),notes:[48+k,0,0,0],n:1,time:0};
  t.dstep[11].on=11;t.dstep[11].lvl[1]=3;
}
state.tracks[3].p[63]=6;
const song=generateSongArrangement({form:'SHORT',root:9,seed:16,groove:'DNB'});
const doc=makeProject({name:'Full 4-track demo',state,arrangement:song,songIndex:2,
  view:{track:0,step:11,mode:'roll'}},baseline,bank);
const serialized=serializeProject(doc,baseline,bank);
const parsed=parseProject(serialized,baseline,bank);
assert.equal(parsed.format,PROJECT_FORMAT);
assert.deepEqual(parsed,doc,'roundtrip is lossless across native state and arrangement');
assert.deepEqual(parsed.state,state,'all native SLOOP knobs, effects, patterns, locks, FM6 preserved');
assert.equal(parsed.state.tracks[3].dstep[11].on,11);
assert.equal(parsed.state.tracks[0].fm6[14],500);
assert.equal(parsed.state.tracks[1].locks[0].value,47);
assert.equal(parsed.arrangement.sections.length,4);
assert.equal(parsed.songIndex,2);
const recoveredSong=createSongArrangementSession(parsed.arrangement);
assert.deepEqual(recoveredSong.get(),song);
assert.equal(arrangementPlaybackStates(recoveredSong.get(),parsed.state).length,4);
const simple=parseProject(serializeProject({state,arrangement:null},baseline,bank),baseline,bank);
assert.equal(simple.arrangement,null,'pure pattern projects are supported');
const initial=structuredClone(baseline);
for(const t of initial.tracks)t.p[29]=16;
const session=createResearchEditSession(initial);
assert.equal(session.restore(parsed.state),true);
assert.deepEqual(session.getState(),state);
assert.equal(session.history().undo,1);
assert.equal(session.undo(),true);assert.deepEqual(session.getState(),initial);
assert.equal(session.redo(),true);assert.deepEqual(session.getState(),state);
assert.equal(session.restore(state),false,'reimporting identical score is a no-op');
function invalid(patch,expect=Error){
  const candidate=structuredClone(doc);patch(candidate);
  assert.throws(()=>parseProject(JSON.stringify(candidate),baseline,bank),expect);
  assert.deepEqual(session.getState(),state,'invalid file cannot touch active project');
}
invalid(x=>x.state.tracks[0].step[12].n=5);
invalid(x=>x.state.tracks[1].p[29]=65);
invalid(x=>x.state.tracks[3].p[63]=37);
invalid(x=>x.state.tracks[1].fm6.pop());
invalid(x=>x.state.tracks[0].dstep[0].on=65536);
invalid(x=>x.state.tracks[0].micro[9]=-33);
invalid(x=>x.state.tracks[0].locks.push({step:7,param:33,value:47}));
invalid(x=>x.state.g[0]='BAD');
invalid(x=>x.state.tracks.pop());
invalid(x=>x.view.step=64);
invalid(x=>x.arrangement.sections[1].scene.tracks[0].steps[0].n=5);
invalid(x=>x.arrangement.sections[1].repeats=7);
invalid(x=>x.arrangement.totalBars=999);
invalid(x=>x.format='UNKNOWN');
assert.throws(()=>parseProject('not json',baseline,bank),SyntaxError);
assert.throws(()=>parseProject('x'.repeat(MAX_PROJECT_BYTES+1),baseline,bank),/5 MB/);
assert.throws(()=>session.restore({g:[],tracks:[]}),/Incompatible/);
console.log('project file: lossless native state, FM6, song arrangement, corrupt file guards and atomic one-Undo restore: PASS');
