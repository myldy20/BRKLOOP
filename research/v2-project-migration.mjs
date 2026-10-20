// SPDX-License-Identifier: GPL-3.0-only
// Research-only migration of an entire BRKLOOP_PROJECT_V1 envelope to an explicit,
// idempotent native-bank V2 candidate envelope. The running app does NOT load this module.
import {remapLegacyPresetSelection} from './factory-preset-migration.mjs';
const V1='BRKLOOP_PROJECT_V1',V2='BRKLOOP_PROJECT_V2_CANDIDATE';
const BANK='BRKLOOP_BANK_V2_CANDIDATE';
export function migrateProjectEnvelope(document,legacyBank,nativeCandidate){
  if(document?.format===V2){
    if(document?.bank?.format!==BANK || document.bank.identity!=='SLOOP_NATIVE_FACTORY_153')
      throw Error('Unknown or incomplete V2 candidate bank identity');
    return {document:structuredClone(document),migrated:false,report:[]};
  }
  if(document?.format!==V1 || !document.state)
    throw Error('Unsupported project version; migration intentionally fails closed');
  if(legacyBank?.format!=='BRKLOOP_BANK_V1'||nativeCandidate?.format!==BANK)
    throw Error('Bank versions do not match migration contract');
  const {state,report}=remapLegacyPresetSelection(document.state,legacyBank,nativeCandidate);
  return {
    migrated:true,report,
    document:{
      ...structuredClone(document),
      format:V2,
      bank:{format:BANK,identity:'SLOOP_NATIVE_FACTORY_153',legacySourceFormat:V1},
      state
    }
  };
}
