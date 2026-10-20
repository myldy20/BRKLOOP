// SPDX-License-Identifier: GPL-3.0-only
// Isolated bank V2 acceptance: all 153 native sounds, all legacy preset identity remaps,
// and real SLOOP WASM audition + sound continuity for every migrated V1 selection.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {FirmwareAudio} from '../web/preview-worklet.js';
import {remapLegacyPresetSelection} from '../research/factory-preset-migration.mjs';
const old=JSON.parse(readFileSync('dist/bank.json','utf8'));
const candidate=JSON.parse(readFileSync('dist/audit/bank-v2-candidate.json','utf8'));
const wasm=await WebAssembly.compile(readFileSync('build/preview/sloop-preview.wasm'));
assert.equal(candidate.format,'BRKLOOP_BANK_V2_CANDIDATE');
assert.equal(candidate.engines.reduce((n,e)=>n+e.presets.length,0),153);
assert.equal(old.engines.reduce((n,e)=>n+e.presets.length,0),115);
assert.equal(candidate.engines.length,12);
assert.equal(candidate.migration.legacyIndexMap.length,12);
const results={format:'BRKLOOP_BANK_V2_WASM_QUALIFICATION_V1',
  totalNative:153,checkedNative:0,legacySelections:0,reindexed:0,
  silent:[],errors:[],maxLegacyDelta:0,weak:[],maxAbs:0,energyByEngine:[]};
function stateFor(engine,preset,presetIndex){
  const state=structuredClone(candidate.baseline);
  const t=state.tracks[0];
  t.engine=engine;t.preset=presetIndex;t.p=structuredClone(preset.p);t.fm6=structuredClone(preset.fm6);
  // Cut out sequencer/ARPs/other track auditions: deterministic note-on per patch.
  t.p[17]=0; // original SLOOP AMODE (disable arp for controlled synth audition)
  for(let k=1;k<4;k++)state.tracks[k].p[40]=1; // P_MUTE
  state.sel=0;state.solo=0;
  return state;
}
function audition(state,frames=6144,note=60){
  const dsp=new FirmwareAudio(wasm);
  dsp.sync(state);
  dsp.w.preview_note(0,note,1);
  const left=new Float32Array(frames),right=new Float32Array(frames);
  dsp.render(left,right);
  const signal=new Float32Array(frames*2);
  let energy=0,maxAbs=0;
  for(let i=0;i<frames;i++){
    const l=left[i],r=right[i];
    if(!Number.isFinite(l)||!Number.isFinite(r)||Math.abs(l)>1||Math.abs(r)>1)
      throw Error('Invalid audio at sample '+i);
    signal[2*i]=l;signal[2*i+1]=r;
    energy+=Math.abs(l)+Math.abs(r);
    maxAbs=Math.max(maxAbs,Math.abs(l),Math.abs(r));
  }
  dsp.w.preview_note(0,note,0);
  return {signal,energy,maxAbs};
}
function nativeCatalog(){
  return {engines:candidate.engines.map((e,id)=>({name:e.name,id,
    presets:e.presets.map((p,index)=>({name:p.name,index}))}))};
}
const target=nativeCatalog();
for(let k=0;k<12;k++){
  const n=candidate.engines[k],a=old.engines[k],map=candidate.migration.legacyIndexMap[k].indexToNative;
  assert.equal(n.name,a.name);assert.equal(map.length,a.presets.length);
  const nameSet=new Set(n.presets.map(p=>p.name));
  assert.equal(nameSet.size,n.presets.length,'Every native name must be unique');
  let minEnergy=Infinity,maxEnergy=0;
  for(let i=0;i<n.presets.length;i++){
    const preset=n.presets[i];
    const cfg=stateFor(k,preset,i);
    let res=audition(cfg);
    let audibleNote=60;
    // Some SAMPLE sounds are GM drum maps. MIDI C4 does not necessarily point
    // at a populated zone: qualify at least one factory-defined playable key.
    if(res.energy<0.01)for(const note of [36,38,42,46,48,51,57,72]){
      const attempt=audition(cfg,6144,note);
      if(attempt.energy>res.energy){res=attempt;audibleNote=note;}
      if(res.energy>=0.01)break;
    }
    if(res.energy<0.01)results.silent.push({engine:n.name,index:i,name:preset.name,energy:res.energy});
    else if(res.energy<0.5)results.weak.push({engine:n.name,index:i,name:preset.name,energy:res.energy});
    if(audibleNote!==60)console.log('Non-C4 sample-key qualification:',n.name,preset.name,'note',audibleNote,'energy',res.energy.toFixed(2));
    minEnergy=Math.min(minEnergy,res.energy);maxEnergy=Math.max(maxEnergy,res.energy);
    results.maxAbs=Math.max(results.maxAbs,res.maxAbs);
    results.checkedNative++;
  }
  results.energyByEngine.push({engine:n.name,minEnergy,maxEnergy});
  for(let i=0;i<a.presets.length;i++){
    const name=a.presets[i].name,idx=map[i];
    assert.equal(n.presets[idx].name,name,'Legacy index remap must identify original selected name');
    const project=stateFor(k,a.presets[i],i);
    // In a real old project, other unrelated native fields (such as automation)
    // are preserved by the migration. Audio equivalence checks selected patch.
    const migrated=remapLegacyPresetSelection(project,old,target).state;
    assert.equal(migrated.tracks[0].preset,idx);
    assert.deepEqual(migrated.tracks[0].p,project.tracks[0].p);
    assert.deepEqual(migrated.tracks[0].fm6,project.tracks[0].fm6);
    const reference=audition(project),after=audition(migrated);
    let delta=0;
    for(let s=0;s<reference.signal.length;s++)
      delta=Math.max(delta,Math.abs(reference.signal[s]-after.signal[s]));
    results.maxLegacyDelta=Math.max(results.maxLegacyDelta,delta);
    if(delta>1/32768)results.errors.push({engine:n.name,name,oldIndex:i,newIndex:idx,maxDelta:delta});
    results.legacySelections++;if(i!==idx)results.reindexed++;
  }
}
writeFileSync('dist/audit/bank-v2-qualification.json',JSON.stringify(results,null,2)+'\n');
console.log('V2 WASM qualification',JSON.stringify({...results,energyByEngine:undefined,weak:results.weak.slice(0,20),silent:results.silent.slice(0,20)}));
assert.equal(results.checkedNative,153);
assert.equal(results.legacySelections,115);
assert.equal(results.reindexed,30);
assert.deepEqual(results.errors,[],'Legacy project audio must be bit-exact after index-only migration');
assert.equal(results.silent.length,0,'All 153 native factory sounds must emit audible audio');
console.log('PASS native V2 candidate: 153 audible patches, 115 legacy audio matches, 30 remappings');
