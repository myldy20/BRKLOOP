// SPDX-License-Identifier: GPL-3.0-only
// Research: compare ORIGINAL compiled factory preset data with BRKLOOP's mock-derived 115 sounds.
// This does not modify dist/bank.json, the website, or firmware.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const native=JSON.parse(execFileSync('build/host/native_factory_dump',{encoding:'utf8',maxBuffer:3*1024*1024}));
const bank=JSON.parse(readFileSync('dist/bank.json','utf8'));
assert.equal(native.schema,'SLOOP_NATIVE_PRESET_AUDIT_V1');
assert.equal(bank.format,'BRKLOOP_BANK_V1');
assert.equal(native.engines.length,12);
assert.equal(bank.engines.length,12);
assert.equal(native.total,153);
const report={format:'BRKLOOP_NATIVE_FACTORY_COMPARISON_V1',source:'Compiled firmware/src/eng_*.c preset_t (not mock names)',
  nativeTotal:native.total,mockTotal:0,perEngine:[],notes:[
    'The native C export reproduces the pure reset/preset mappings in firmware/src/ui.c::apply_preset_to; later runtime adaptation requires validation.',
    'FM6 has independent 128-byte packed patch state: it must be preserved separately from p[].',
    'A name collision or differing preset index is not safe to migrate silently for existing saved projects.',
    'Preset trim and nondefault extras may differ from the old editor mock.']
};
for(let k=0;k<12;k++){
  const src=native.engines[k],mock=bank.engines[k];
  assert.equal(src.id,k);
  assert.equal(src.name,mock.name);
  const unique=new Set(src.presets.map(x=>x.name));
  assert.equal(unique.size,src.presets.length,'Factory preset names unique per engine: '+src.name);
  assert.equal(src.presets.length,src.count);
  const old=new Map(mock.presets.map((p,i)=>[p.name,{...p,index:i}]));
  const nmap=new Map(src.presets.map(p=>[p.name,p]));
  const absent=src.presets.filter(p=>!old.has(p.name)).map(({name,index})=>({name,index}));
  const noLongerNative=mock.presets.map((p,i)=>({name:p.name,index:i})).filter(p=>!nmap.has(p.name));
  const matches=src.presets.filter(p=>old.has(p.name)).map(p=>{
    const m=old.get(p.name);
    const diffs=p.p.map((v,i)=>({id:i,native:v,mock:m.p[i]})).filter(x=>x.native!==x.mock);
    return {name:p.name,nativeIndex:p.index,mockIndex:m.index,numberOfDifferentParams:diffs.length,
      differingIds:diffs.map(x=>x.id)};
  });
  report.mockTotal+=mock.presets.length;
  report.perEngine.push({id:k,name:src.name,nativeCount:src.presets.length,mockCount:mock.presets.length,
    absentByName:absent,mockOnlyNames:noLongerNative,sharedNameCount:matches.length,
    reordered:matches.filter(x=>x.nativeIndex!==x.mockIndex),
    changedParameterStates:matches.filter(x=>x.numberOfDifferentParams>0)});
}
assert.equal(report.mockTotal,115,'A changed mock catalog requires fresh review and migration policy');
const nameMissing=report.perEngine.reduce((n,x)=>n+x.absentByName.length,0);
report.missingNames=nameMissing;
mkdirSync('dist/audit',{recursive:true});
writeFileSync('dist/audit/native-factory.json',JSON.stringify(native,null,2)+'\n');
writeFileSync('dist/audit/native-factory-comparison.json',JSON.stringify(report,null,2)+'\n');
let md='# SLOOP native factory vs current BRKLOOP bank (research)\n\n';
md+='**Compiled factory:** '+native.total+' sounds; **web mock:** '+report.mockTotal+' sounds. By name '+nameMissing+' native presets are absent from BRKLOOP.\n\n';
md+='| Engine | Native | Mock | Native names absent | Reordered shared | Differing shared parameter states |\n| --- | ---: | ---: | ---: | ---: | ---: |\n';
for(const x of report.perEngine)
  md+='| '+x.name+' | '+x.nativeCount+' | '+x.mockCount+' | '+x.absentByName.length+' | '+x.reordered.length+' | '+x.changedParameterStates.length+' |\n';
md+='\n**Do not replace the current bank automatically**: a persisted preset index can refer to a different sound after migration. Compare native parameter states and packed FM6 patch, then define a compatibility migration before publishing.\n';
for(const x of report.perEngine)if(x.absentByName.length)md+='\n**'+x.name+' missing:** '+x.absentByName.map(p=>p.name).join(', ')+'.\n';
writeFileSync('dist/audit/native-factory-comparison.md',md);
console.log(md);
