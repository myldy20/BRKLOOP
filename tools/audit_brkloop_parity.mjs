// SPDX-License-Identifier: GPL-3.0-only
// Research-only: audit the current SLOOP mock protocol against its native preset inventory.
// Does not modify the runtime, bank builder or firmware. Run: node tools/audit_brkloop_parity.mjs
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const editor=readFileSync('web/editor.html','utf8');
const start=editor.indexOf('/*PROTO-BEGIN*/'), end=editor.indexOf('/*PROTO-END*/');
assert(start>=0 && end>start,'SLOOP mock protocol markers are required');
const proto=editor.slice(start,end);
const E=vm.runInNewContext(proto+';({makeMockDevice,CMD,req,frame,unframe,parse})',
  {setTimeout,clearTimeout,setInterval,clearInterval,console,TextEncoder,TextDecoder,Blob,Response,DecompressionStream});
const device=E.makeMockDevice({auto:false});
const inPort=[...device.access.inputs.values()][0];
const outPort=[...device.access.outputs.values()][0];
function request([cmd,args]) {
  return new Promise((resolve,reject)=>{
    inPort.onmidimessage=({data})=>{
      try {const got=E.unframe(data);if(!got||got.cmd!==cmd)throw Error('Unexpected mock response for '+cmd);resolve(got.a);}
      catch(error){reject(error);}
    };
    try {outPort.send(E.frame(cmd,args));} catch(error){reject(error);}
  });
}
const normal = d => ({id:d.id,label:d.label,fmt:d.fmt,min:d.min,max:d.max,def:d.def,unit:d.unit,names:Array.from(d.names||[])});
const factory=readFileSync('firmware/src/preset_trim.h','utf8');
const byEngine=Array.from({length:12},()=>[]);
for(const m of factory.matchAll(/\/\*\s*(\d+)\.(\d+)\s+([^*]+)\*\//g)) {
  const k=Number(m[1]),id=Number(m[2]);
  if(k>=12)continue; // engine 12 is experimental FELUCCA_SLICE, not compiled by default
  byEngine[k][id]=m[3].trim();
}
const report={format:'BRKLOOP_PARITY_AUDIT_V1',sources:['web/editor.html','firmware/src/preset_trim.h','firmware/host/preview.c','web/preview-worklet.js'],
  descriptorSource:'SLOOP editor mock (not proof of native DSP delivery)',commonTrack:[],global:[],engine:[],factory:{nativeCount:0,mockCount:0,missing:[]},
  bridge:{stepFlagsMask:3,continuationFlagsMask:120,knownIssue:'preview_step masks SF_CONT0..3, so held-note continuation is lost in browser WASM'},
  limitations:['Descriptor registry is the editor mock, not native runtime parameter validation.','UI editability and audible response require separate real WASM/browser tests.']};
try {
  const info=E.parse[E.CMD.INFO](await request(E.req.info()));
  if(info.ntrk!==4 || info.nengines!==12 || info.nstep!==64)throw Error('Unexpected SLOOP track/engine/step topology');
  report.protocol={pcount:info.pcount,gcount:info.gcount,pe0:info.pe0,ntrk:info.ntrk,nengines:info.nengines,nstep:info.nstep,version:info.version};
  await request(E.req.track(0));
  for(let id=0;id<info.pe0;id++)report.commonTrack.push(normal(E.parse[E.CMD.DESC](await request(E.req.desc(0,id)))));
  for(let id=0;id<info.gcount;id++)report.global.push(normal(E.parse[E.CMD.DESC](await request(E.req.desc(1,id)))));
  for(let engine=0;engine<info.nengines;engine++){
    const names=Array.from(E.parse[E.CMD.NAMES](await request(E.req.names(engine))).names);
    await request(E.req.preset(engine,0));
    const params=[];
    for(let j=0;j<8;j++)params.push(normal(E.parse[E.CMD.DESC](await request(E.req.desc(0,info.pe0+j)))));
    const originals=byEngine[engine];
    if(originals.some(x=>!x))throw Error('Sparse native preset trim map in engine '+engine);
    const missing=originals.map((name,index)=>({index,name})).filter(x=>x.index>=names.length || names[x.index]!==x.name);
    report.engine.push({id:engine,name:info.engines[engine],params,nativePresetNames:originals,mockPresetNames:names,
      countNative:originals.length,countMock:names.length,countMissing:originals.length-names.length,nameMismatches:missing});
    report.factory.nativeCount+=originals.length;report.factory.mockCount+=names.length;
    report.factory.missing.push(...missing.map(x=>({...x,engine,engineName:info.engines[engine]})));
  }
  assert.equal(report.commonTrack.length,info.pe0);
  assert.equal(report.global.length,info.gcount);
  assert.equal(report.engine.length,12);
  assert.equal(report.engine.flatMap(x=>x.params).length,96);
  assert.equal(report.factory.nativeCount,153,'native factory preset inventory changed');
  if(report.factory.mockCount>report.factory.nativeCount)throw Error('Mock contains more presets than native factory inventory');
  const currentWorklet=readFileSync('web/preview-worklet.js','utf8');
  const currentHost=readFileSync('firmware/host/preview.c','utf8');
  report.bridge.workletSendsFlags=/s\.flags,\s*s\.vel/.test(currentWorklet);
  report.bridge.hostMasksContinuation=/s->flags\s*&=\s*3u/.test(currentHost);
  if(!report.bridge.workletSendsFlags)throw Error('Worklet note flag transfer contract changed');
  if(!report.bridge.hostMasksContinuation)report.bridge.knownIssue=null;
  mkdirSync('dist/audit',{recursive:true});
  writeFileSync('dist/audit/sloop-capabilities.json',JSON.stringify(report,null,2)+'\n');
  let md='# SLOOP ↔ BRKLOOP audit (generated)\n\n';
  md+='Editor mock: '+info.nengines+' engines, '+info.pe0+' common track descriptors, '+info.gcount+' global descriptors, 8 controls/engine, 64 steps per track.\n\n';
  md+='**Native factory presets:** '+report.factory.nativeCount+'; **mock:** '+report.factory.mockCount+'; **difference:** '+(report.factory.nativeCount-report.factory.mockCount)+'. Counts are from \`preset_trim.h\` vs the mock NAMES protocol. Missing sound states are NOT reconstructed by this audit.\n\n';
  md+='| Engine | Native preset names | Mock preset names | Difference |\n|---|---:|---:|---:|\n';
  for(const x of report.engine)md+='| '+x.id+' '+x.name+' | '+x.countNative+' | '+x.countMock+' | '+x.countMissing+' |\n';
  md+='\nBridge: worklet serializes SF_CONT flags; host currently '+(report.bridge.hostMasksContinuation?'**masks them** (known playback parity gap).':'preserves them (confirm via native/WASM audio fixture).')+'\n';
  md+='\nInterpretation: catalog metadata alone is neither proof that a preset can be reconstructed nor proof that a particular parameter is audible. Test the firmware DSP separately.\n';
  writeFileSync('dist/audit/summary.md',md);
  console.log(md);
} finally {device.stop();}
