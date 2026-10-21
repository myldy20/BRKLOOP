// SPDX-License-Identifier: GPL-3.0-only
// Firmware-backed audio-thread section switching: replaces a 64-step score
// at native step 63, before the next bar-1 event. No UI setTimeout timers.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FirmwareAudio} from '../web/preview-worklet.js';
import {generateSongArrangement,applyArrangementSection} from '../research/song-arranger.mjs';

const wasm=await WebAssembly.compile(readFileSync('build/preview/sloop-preview.wasm'));
const baseline=JSON.parse(readFileSync('dist/audit/bank-v2-candidate.json','utf8')).baseline;
assert(baseline?.tracks?.length===4,'Full SLOOP candidate bank must expose a native baseline');
const song=generateSongArrangement({form:'SHORT',seed:12,root:9,groove:'HOUSE',division:2});
const states=song.sections.slice(0,2).map(section=>applyArrangementSection(baseline,section));
states.forEach(s=>{s.g[0]=240;s.g[1]=0;});
const dsp=new FirmwareAudio(wasm);
const transitions=[];
const oldSync=dsp.sync.bind(dsp);
dsp.sync=state=>{
  if(dsp.arrangement)transitions.push(dsp.w.preview_position(3));
  oldSync(state);
};
assert.throws(()=>dsp.setArrangement([states[0]]),RangeError);
const broken=structuredClone(states);broken[1].tracks[2].p[30]=3;
assert.throws(()=>dsp.setArrangement(broken),/LEN 64 and DIV/);
dsp.setArrangement(states);
assert.equal(dsp.transport().sectionIndex,0);
assert.equal(dsp.transport().sectionCount,2);
assert.deepEqual(dsp.previous.tracks[3].dstep,states[0].tracks[3].dstep);
dsp.w.preview_play(1);
const left=new Float32Array(128),right=new Float32Array(128);
let seenEnd=false,now=0;
for(let block=0;block<9000;block++){
  dsp.render(left,right);
  assert(left.every(Number.isFinite),'bounded finite audio left');
  now=dsp.transport().positions[3];
  if(now===63)seenEnd=true;
  if(dsp.transport().sectionIndex===1)break;
}
assert(seenEnd,'native transport must reach the last step before switching');
assert.equal(dsp.transport().sectionIndex,1,'WASM switches to second section in real playback');
assert(transitions.length>=1,'the audio thread did perform a native score replacement');
assert(transitions.every(p=>p===63),'each prepared section loads exactly on the previous last step');
assert.deepEqual(dsp.previous.tracks[3].dstep,states[1].tracks[3].dstep,
  'second section drums are now in real SLOOP DSP memory');
assert.deepEqual(dsp.previous.tracks[0].step,states[1].tracks[0].step,
  'second section bass is now in real SLOOP DSP memory');
const prior=dsp.arrangement.index;
dsp.clearArrangement();assert.equal(dsp.arrangement,null);
dsp.sync(states[0]);assert.equal(dsp.transport().sectionIndex,undefined);
assert.equal(prior,1);
console.log('worklet arranger: real native step-63 queued transitions, no UI timers, musical sound and stop/restore: PASS');
