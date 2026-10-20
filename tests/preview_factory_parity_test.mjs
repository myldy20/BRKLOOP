// SPDX-License-Identifier: GPL-3.0-only
// Native SLOOP parity is a release gate, not a UI screenshot assertion.
// This test fails if WOBBLE's firmware modulation, transpose or tempo behavior
// are lost during bank generation, application or the real WASM adapter.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FirmwareAudio} from '../web/preview-worklet.js';
import {createResearchEditSession} from '../research/shared-edit-commands.mjs';
import {panelAuditionPitch} from '../research/hybrid-editor/panel-pitch.mjs';

const bank=JSON.parse(readFileSync('dist/audit/bank-v2-candidate.json','utf8'));
assert.equal(bank.format,'BRKLOOP_BANK_V2_CANDIDATE');
assert.equal(bank.engines.reduce((n,e)=>n+e.presets.length,0),153);
assert.equal(bank.trackControls.length,63);
assert.equal(bank.globalControls.length,49);
const analog=bank.engines[0];
const idx=analog.presets.findIndex(p=>p.name==='WOBBLE');
assert.equal(idx,7,'Native WOBBLE identity/index changed');
const wobble=analog.presets[idx];
assert.equal(wobble.p[9],74,'Firmware WOBBLE LFO rate');
assert.equal(wobble.p[14],40,'Firmware WOBBLE LFO filter depth');
assert.equal(wobble.p[28],-24,'Firmware WOBBLE low-register transpose');
const wasm=await WebAssembly.compile(readFileSync('build/preview/sloop-preview.wasm'));
const initial=()=>{
  const s=structuredClone(bank.baseline);
  const t=s.tracks[0];
  t.engine=0;t.preset=idx;t.p=[...wobble.p];t.fm6=[...wobble.fm6];
  for(let k=1;k<4;k++)s.tracks[k].p[40]=1; // mute other tracks
  s.sel=0;s.solo=0;
  return s;
};
function signal(s,note=60,length=8192){
  const dsp=new FirmwareAudio(wasm);
  dsp.sync(s);dsp.w.preview_note(0,note,1);
  const l=new Float32Array(length),r=new Float32Array(length);dsp.render(l,r);
  dsp.w.preview_note(0,note,0);
  let energy=0;
  for(let i=0;i<length;i++)energy+=Math.abs(l[i])+Math.abs(r[i]);
  return {l,r,energy};
}
function waveformDelta(a,b){
  let sum=0;
  for(let i=0;i<a.l.length;i++)sum+=Math.abs(a.l[i]-b.l[i])+Math.abs(a.r[i]-b.r[i]);
  return sum/a.l.length;
}
const correct=initial();
const intact=signal(correct,48,16384);
assert(intact.energy>1,'Native WOBBLE must be audible');
const noLfo=structuredClone(correct);noLfo.tracks[0].p[14]=0;
const filterOff=signal(noLfo,48,16384);
const modDifference=waveformDelta(intact,filterOff);
assert(modDifference>0.000001,'WOBBLE LFO-to-filter must demonstrably change original WASM output; delta='+modDifference);
// Low-level preview_note is raw MIDI and does not call physical keyboard
// kb_map(). The on-screen SOUND piano must explicitly use original P_TRANS.
const higher=structuredClone(correct);higher.tracks[0].p[28]=0;
const raw=signal(higher,48,16384);
assert.equal(waveformDelta(intact,raw),0,
  'Raw preview_note must remain absolute MIDI; transpose lives in FM-1 panel mapping');
const panelNote=panelAuditionPitch(48,correct.tracks[0].p);
assert.equal(panelNote,24,'The FM-1 C3 key on WOBBLE must trigger C1 (-24)');
const unshifted=panelAuditionPitch(48,higher.tracks[0].p);
assert.equal(unshifted,48);
const soundAtPanelPitch=signal(correct,panelNote,16384);
const pitchDifference=waveformDelta(soundAtPanelPitch,intact);
assert(pitchDifference>0.00001,
  'FM-1 panel mapping C3→C1 must audibly lower WOBBLE vs raw C3; delta='+pitchDifference);
function positionAfter(tempo){
  const s=initial();s.g[0]=tempo;
  s.tracks[0].p[29]=16;s.tracks[0].p[30]=2;
  const t=s.tracks[0].step[0];t.n=1;t.time=0;t.notes=[48,0,0,0];t.vel=100;
  const dsp=new FirmwareAudio(wasm);dsp.sync(s);dsp.w.preview_play(1);
  const l=new Float32Array(18000),r=new Float32Array(18000);
  dsp.render(l,r);
  return dsp.transport().positions[0];
}
const slow=positionAfter(60),fast=positionAfter(180);
assert(slow!==fast,'BPM must affect original SLOOP sequencer timing: '+slow+' vs '+fast);
const edit=createResearchEditSession(initial());
assert.equal(edit.getState().g[0],90);
edit.dispatch({type:'setGlobalParam',track:0,param:0,value:160});
assert.equal(edit.getState().g[0],160);
edit.undo();assert.equal(edit.getState().g[0],90,'BPM Undo returns original tempo');
console.log('PASS native preview parity: 153 sounds, WOBBLE rate/filter/-24 pitch, audible modulation and BPM timing', {wobbleIndex:idx,modDifference,pitchDifference,slow,fast});
