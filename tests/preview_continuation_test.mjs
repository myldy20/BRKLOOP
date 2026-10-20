// SPDX-License-Identifier: GPL-3.0-only
// Browser WASM vs same actual C adapter, with a held note overdubbed by a second pitch.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {FirmwareAudio} from '../web/preview-worklet.js';

const html=readFileSync('web/editor.html','utf8');
const proto=html.slice(html.indexOf('/*PROTO-BEGIN*/'),html.indexOf('/*PROTO-END*/'));
const E=vm.runInNewContext(proto+';({makeMockDevice,previewSnapshot})',
  {setTimeout,clearTimeout,setInterval,clearInterval,console,TextEncoder,TextDecoder,Blob,Response,DecompressionStream});
const device=E.makeMockDevice({auto:false});
const frames=32768;
const wasm=await WebAssembly.compile(readFileSync('build/preview/sloop-preview.wasm'));
const packet=s=>Uint8Array.from([...s.notes,s.n,s.time,s.flags,s.vel,s.lvl||0,s.rat||0,0,0]);
try {
  const seed=E.previewSnapshot(device.state);
  for(const t of seed.tracks){
    t.step.forEach(s=>{s.notes=[0,0,0,0];s.n=0;s.time=2;s.flags=0;s.vel=0;s.lvl=0;s.rat=0;});
    if(t.dstep)t.dstep.forEach(d=>{d.on=0;d.lvl.fill(0);d.rat.fill(0);});
    t.micro.fill(0);t.fill.fill(0);t.locks=[];
  }
  seed.tracks.slice(1).forEach(t=>t.p[40]=1);
  const t=seed.tracks[0];
  t.engine=0;t.preset=0;
  t.p[17]=0; t.p[29]=2; t.p[30]=2; t.p[31]=0;
  t.p[1]=0;t.p[2]=20;t.p[3]=127;t.p[4]=90;
  for(const id of [33,34,35,36])t.p[id]=0; // Compare dry audible DSP
  t.step[0]={notes:[60,0,0,0],n:1,time:0,flags:0,vel:100,lvl:0,rat:0};
  t.step[1]={notes:[60,64,0,0],n:2,time:0,flags:8,vel:100,lvl:0,rat:0};
  seed.g[0]=120;seed.g[1]=0;seed.g[13]=0;
  function wasmOutput(state){
    const dsp=new FirmwareAudio(wasm);
    dsp.sync(state);dsp.w.preview_play(1);
    const l=new Float32Array(frames),r=new Float32Array(frames);
    dsp.render(l,r);
    const interleaved=new Float32Array(frames*2);
    for(let i=0;i<frames;i++){interleaved[2*i]=l[i];interleaved[2*i+1]=r[i];}
    return interleaved;
  }
  const input=Buffer.concat([
    Buffer.from(Int32Array.from([t.engine,t.preset,frames,...t.p,...seed.g]).buffer),
    Buffer.from(packet(t.step[0])),Buffer.from(packet(t.step[1]))
  ]);
  const raw=execFileSync('build/host/preview_continuation_native',{input,maxBuffer:1024*1024});
  assert.equal(raw.byteLength,frames*2*4,'Native must render exact float32 stereo frames');
  const native=new Float32Array(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
  const actual=wasmOutput(seed);
  let maxDelta=0,energy=0;
  for(let i=0;i<actual.length;i++){
    assert(Number.isFinite(actual[i]),'No NaN audio');
    maxDelta=Math.max(maxDelta,Math.abs(actual[i]-native[i]));
    energy+=Math.abs(actual[i]);
  }
  assert(energy>0.1,'Native SLOOP example must produce audible audio');
  assert(maxDelta<=1/32768,'Native/WASM mismatch when preserving SF_CONT: max delta '+maxDelta);
  const retrigger=structuredClone(seed);
  retrigger.tracks[0].step[1].flags=0;
  const other=wasmOutput(retrigger);
  let difference=0;
  for(let i=0;i<actual.length;i++)difference+=Math.abs(actual[i]-other[i]);
  assert(difference>0.1,'Continuation must change native audible behaviour, not just state bytes: diff '+difference);
  console.log('PASS SLOOP 2.7 polyphonic continuation: preserved SF_CONT, native/WASM max delta='+maxDelta+
    ', audible on/off difference='+difference.toFixed(3));
}finally{device.stop();}
