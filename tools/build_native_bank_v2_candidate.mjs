// SPDX-License-Identifier: GPL-3.0-only
// ISOLATED CANDIDATE ONLY. Builds a native SLOOP catalog without changing dist/bank.json or Pages.
// Prereq: node tools/build_brkloop_bank.mjs; compiled research/native_factory_dump.c;
//         node tools/compare_native_factory.mjs
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const legacy=JSON.parse(readFileSync('dist/bank.json','utf8'));
const native=JSON.parse(readFileSync('dist/audit/native-factory.json','utf8'));
assert.equal(legacy.format,'BRKLOOP_BANK_V1');
assert.equal(native.schema,'SLOOP_NATIVE_PRESET_AUDIT_V1');
assert.equal(native.total,153);
assert.equal(legacy.engines.length,12);
assert.equal(native.engines.length,12);
assert.equal(native.pcount,legacy.baseline.tracks[0].p.length,'Native and BRKLOOP parameter ABI diverged');
assert.equal(native.pe0,legacy.pe0,'Engine parameter base changed');
const engines=[], legacyIndexMap=[];
let total=0;
for(let k=0;k<12;k++){
  const source=native.engines[k],old=legacy.engines[k];
  assert.equal(source.id,k);assert.equal(source.name,old.name);
  const nameIndex=new Map(source.presets.map((p,i)=>[p.name,i]));
  assert.equal(nameIndex.size,source.presets.length,'Duplicate native preset names in '+source.name);
  const oldByName=new Map(old.presets.map((p,i)=>[p.name,{...p,index:i}]));
  const indexMap=[];
  for(const p of old.presets){
    const index=nameIndex.get(p.name);
    assert(Number.isInteger(index),'Legacy sound missing from native source: '+source.name+'/'+p.name);
    indexMap.push(index);
  }
  const presets=source.presets.map((p,i)=>{
    assert.equal(p.index,i,'Invalid native preset index');
    assert.equal(p.p.length,native.pcount,'Missing native parameters in '+source.name+'/'+p.name);
    assert(p.p.every(Number.isInteger),'Non-integer preset values '+p.name);
    // SLOOP FM6 stores real per-operator envelopes in a separate packed 128-byte patch.
    // Eight FM6 native preset names already exist in the old mock, which exposes the
    // actual selected packed patch; use it by exact name, not a default arbitrary patch.
    const selected=oldByName.get(p.name);
    if(k===9&&!selected)throw Error('FM6 native patch has no packed state: '+p.name);
    const fm6=k===9?selected.fm6:legacy.baseline.tracks[0].fm6;
    assert(Array.isArray(fm6)&&fm6.length===legacy.baseline.tracks[0].fm6.length,'Invalid FM6 patch bytes');
    return {index:i,name:p.name,p:Array.from(p.p),fm6:Array.from(fm6)};
  });
  engines.push({name:source.name,controls:old.controls,presets});
  legacyIndexMap.push({engine:k,name:source.name,indexToNative:indexMap});
  total+=presets.length;
}
assert.equal(total,153);
assert.equal(legacyIndexMap.reduce((sum,x)=>sum+x.indexToNative.length,0),115);
const candidate={
  format:'BRKLOOP_BANK_V2_CANDIDATE',
  source:'compiled original SLOOP 2.7 native preset_t tables; NOT qualified for deployment',
  derivedFromLegacyFormat:legacy.format,
  pe0:legacy.pe0,baseline:legacy.baseline,sequence:legacy.sequence,
  engines,kits:legacy.kits,
  migration:{from:'BRKLOOP_BANK_V1',to:'BRKLOOP_BANK_V2_CANDIDATE',strategy:'exact engine and preset name, preserve saved p[],fm6,steps,locks',legacyIndexMap}
};
mkdirSync('dist/audit',{recursive:true});
writeFileSync('dist/audit/bank-v2-candidate.json',JSON.stringify(candidate)+'\n');
console.log('Candidate only:',total,'native factory sounds,',legacyIndexMap.length,'engine mappings, legacy bank untouched');
