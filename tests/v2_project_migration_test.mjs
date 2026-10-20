// SPDX-License-Identifier: GPL-3.0-only
// Research-only project file migration tests; no running app dependency.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {migrateProjectEnvelope} from '../research/v2-project-migration.mjs';
const old=JSON.parse(readFileSync('dist/bank.json','utf8'));
const candidate=JSON.parse(readFileSync('dist/audit/bank-v2-candidate.json','utf8'));
let tested=0,reindexed=0;
for(let k=0;k<12;k++){
  for(let i=0;i<old.engines[k].presets.length;i++){
    const state=structuredClone(old.baseline);
    const track=state.tracks[0],saved=old.engines[k].presets[i];
    track.engine=k;track.preset=i;track.p=structuredClone(saved.p);track.fm6=structuredClone(saved.fm6);
    track.micro[63]=-19;
    track.fill[15]=0xa6;
    track.step[63]={notes:[60,64,67,0],n:3,time:0,flags:1,vel:94,lvl:0,rat:0};
    track.locks=[{step:63,param:8,value:17}];
    const envelope={format:'BRKLOOP_PROJECT_V1',title:'User track '+k+'/'+i,state};
    const before=JSON.stringify(envelope);
    const migrated=migrateProjectEnvelope(envelope,old,candidate);
    assert(migrated.migrated);assert.equal(migrated.document.format,'BRKLOOP_PROJECT_V2_CANDIDATE');
    assert.equal(JSON.stringify(envelope),before,'Migration cannot modify original data');
    assert.equal(migrated.document.title,envelope.title);
    assert.equal(migrated.document.bank.identity,'SLOOP_NATIVE_FACTORY_153');
    const expectedIndex=candidate.engines[k].presets.findIndex(p=>p.name===saved.name);
    assert.equal(migrated.document.state.tracks[0].preset,expectedIndex);
    assert.equal(candidate.engines[k].presets[expectedIndex].name,saved.name);
    const exactState=structuredClone(envelope.state);
    exactState.tracks[0].preset=expectedIndex;
    assert.deepEqual(migrated.document.state,exactState,'No synth parameters, FM6, drums, locks or steps may change');
    const second=migrateProjectEnvelope(migrated.document,old,candidate);
    assert.equal(second.migrated,false,'Idempotent migration: never remap native indices twice');
    assert.deepEqual(second.document,migrated.document);
    assert.throws(()=>migrateProjectEnvelope({...envelope,format:'FUTURE_PROJECT_VERSION'},old,candidate),/Unsupported project version/);
    tested++;if(expectedIndex!==i)reindexed++;
  }
}
assert.equal(tested,115);assert.equal(reindexed,30);
console.log('PASS idempotent and fail-closed migration:',tested,'project envelopes,',reindexed,
  'preset identity changes, all original sound/step/lock data unchanged');
