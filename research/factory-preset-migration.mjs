// SPDX-License-Identifier: GPL-3.0-only
// Research-only non-destructive preset identity migration, not loaded by BRKLOOP.
// Native factory snapshots may differ in p[]: remap the selected index by exact name,
// NEVER replace a saved synth patch's p[], fm6 or sequencer data.
export function remapLegacyPresetSelection(project,legacyBank,nativeBank){
  if(!project?.tracks || project.tracks.length!==4)throw Error('Expected four SLOOP tracks');
  if(!Array.isArray(legacyBank?.engines)||!Array.isArray(nativeBank?.engines)||legacyBank.engines.length!==12||nativeBank.engines.length!==12)
    throw Error('Expected both 12-engine catalogs');
  const copy=structuredClone(project),report=[];
  for(let track=0;track<3;track++){
    const sound=copy.tracks[track],engine=sound.engine,index=sound.preset;
    if(!Number.isInteger(engine)||engine<0||engine>=12)throw Error('Invalid saved engine at track '+track);
    const old=legacyBank.engines[engine],native=nativeBank.engines[engine];
    if(old.name!==native.name)throw Error('Engine order incompatibility for '+engine);
    if(!Number.isInteger(index)||index<0||index>=old.presets.length){
      report.push({track,engine,status:'unmapped-existing-custom-state',index});
      continue;
    }
    const name=old.presets[index].name;
    const matches=native.presets.filter(p=>p.name===name);
    if(matches.length!==1)throw Error('Ambiguous/missing native preset: '+old.name+' / '+name);
    const next=matches[0].index;
    // p[] is the actual saved sound, not a disposable preset cache.
    // Also preserve fm6, chords/steps, fills, micro, locks and engine identity.
    sound.preset=next;
    report.push({track,engine,oldIndex:index,newIndex:next,name,status:'mapped'});
  }
  return {state:copy,report};
}
