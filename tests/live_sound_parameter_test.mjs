// SPDX-License-Identifier: GPL-3.0-only
// A moving knob must audibly alter a held note right away on the real SLOOP WASM.
// Each continuous gesture creates exactly one undo transaction.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FirmwareAudio} from '../web/preview-worklet.js';
import {createResearchEditSession} from '../research/shared-edit-commands.mjs';
const wasm=await WebAssembly.compile(readFileSync('build/preview/sloop-preview.wasm'));
const bank=JSON.parse(readFileSync('dist/audit/bank-v2-candidate.json','utf8'));
const idx=bank.engines[0].presets.findIndex(p=>p.name==='WOBBLE');
assert.equal(idx,7);
function scene(){
  const s=structuredClone(bank.baseline),t=s.tracks[0],preset=bank.engines[0].presets[idx];
  t.engine=0;t.preset=idx;t.p=[...preset.p];t.fm6=[...preset.fm6];
  s.sel=0;s.solo=0;
  for(let k=1;k<4;k++)s.tracks[k].p[40]=1;
  return s;
}
function drain(d,n=4096){
  const l=new Float32Array(n),r=new Float32Array(n);
  d.render(l,r);return {l,r};
}
const reference=new FirmwareAudio(wasm),moving=new FirmwareAudio(wasm);
for(const d of [reference,moving]){
  d.sync(scene());d.w.preview_note(0,36,1);drain(d,8192);
}
// Cutoff is one of the eight native ANALOG engine controls at PE0+4.
const cutoff=bank.pe0+4;
assert.equal(cutoff,67);
moving.setTrackParam(0,cutoff,120);
const a=drain(reference,4096),b=drain(moving,4096);
let delta=0,active=0;
for(let i=0;i<a.l.length;i++){
  delta+=Math.abs(a.l[i]-b.l[i])+Math.abs(a.r[i]-b.r[i]);
  active+=Math.abs(b.l[i])+Math.abs(b.r[i]);
}
assert(active>0.01,'Voice remains sounding throughout slider movement without note retrigger');
assert(delta>0.03,'Moving cutoff must change a held note immediately, no pattern boundary, delta='+delta);
assert.equal(moving.previous.tracks[0].p[cutoff],120,'Live worklet snapshot keeps sync baseline current');
// Gesture moves should never reinitialize sequences or create multiple Undo entries.
const session=createResearchEditSession(scene());
const original=session.getState().tracks[0].p[cutoff];
session.preview({type:'setTrackParam',track:0,param:cutoff,value:40});
session.preview({type:'setTrackParam',track:0,param:cutoff,value:65});
session.preview({type:'setTrackParam',track:0,param:cutoff,value:120});
assert.equal(session.getState().tracks[0].p[cutoff],120);
assert.equal(session.history().undo,0,'No history spam while holding a knob');
assert.equal(session.finishGesture(),true);
assert.equal(session.history().undo,1,'One complete drag creates one Undo');
session.undo();assert.equal(session.getState().tracks[0].p[cutoff],original);
session.redo();assert.equal(session.getState().tracks[0].p[cutoff],120);
// While dragging a second knob we should commit it before another command.
session.preview({type:'setTrackParam',track:0,param:14,value:75});
session.dispatch({type:'setGlobalParam',track:0,param:0,value:130});
assert.equal(session.history().undo,3);
session.undo();assert.equal(session.getState().g[0],90);
session.undo();assert.equal(session.getState().tracks[0].p[14],40);
console.log('PASS live SLOOP WASM cutoff changes while note is sustained; gesture Undo/Redo is atomic',{delta,active});
