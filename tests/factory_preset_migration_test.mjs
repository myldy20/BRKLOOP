// SPDX-License-Identifier: GPL-3.0-only
// Run after native_factory_dump + tools/compare_native_factory.mjs, without a running website.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {remapLegacyPresetSelection} from '../research/factory-preset-migration.mjs';

const legacy=JSON.parse(readFileSync('dist/bank.json','utf8'));
const native=JSON.parse(readFileSync('dist/audit/native-factory.json','utf8'));
let verified=0,reindexed=0;
for(let k=0;k<12;k++){
  for(let i=0;i<legacy.engines[k].presets.length;i++){
    const old=legacy.engines[k].presets[i],seed=structuredClone(legacy.baseline);
    seed.tracks[0].engine=k;seed.tracks[0].preset=i;
    seed.tracks[0].p=[...old.p];seed.tracks[0].fm6=[...old.fm6];
    seed.tracks[0].p[5]=old.p[5]+1; // unsaved patch tweak must not be replaced by factory values
    seed.tracks[0].micro[63]=-8;
    seed.tracks[0].step[63].notes=[60,64,67,0];
    seed.tracks[0].step[63].n=3;
    seed.tracks[0].locks=[{step:63,param:5,value:32}];
    const before=JSON.stringify(seed),snapshot=JSON.stringify(seed.tracks[0]);
    const converted=remapLegacyPresetSelection(seed,legacy,native);
    assert.equal(JSON.stringify(seed),before,'Legacy project may not be mutated');
    const record=converted.report[0];
    assert.equal(record.name,old.name,'Name-based migration must preserve the intended selected sound');
    assert.equal(native.engines[k].presets[record.newIndex].name,old.name);
    assert.equal(record.oldIndex,i);
    const result=converted.state.tracks[0],original=structuredClone(seed.tracks[0]);
    original.preset=record.newIndex;
    assert.deepEqual(result,original,'No p[], fm6, step, locks or expression may be rewritten');
    assert.equal(JSON.stringify(seed.tracks[0]),snapshot);
    verified++;reindexed+=(record.newIndex!==i);
  }
}
assert.equal(verified,115,'Expected every legacy factory selection covered');
assert(reindexed>0,'Migration scenario must include renumbered presets');
const missing=structuredClone(legacy.baseline);
missing.tracks[0].engine=0;missing.tracks[0].preset=200;
const fallback=remapLegacyPresetSelection(missing,legacy,native);
assert.equal(fallback.state.tracks[0].preset,200,'Unknown custom preset indices remain untouched');
assert.equal(fallback.report[0].status,'unmapped-existing-custom-state');
console.log('PASS bank migration research: '+verified+' legacy selections, '+reindexed+
  ' require index remap; zero saved patch/step modifications');
