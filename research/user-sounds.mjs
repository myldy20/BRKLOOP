// SPDX-License-Identifier: GPL-3.0-only
// Portable snapshots of original SLOOP synth patch data. No steps or mixer
// state are stored. This module does not touch browser storage or native DSP.
export const USER_SOUND_FORMAT='BRKLOOP_USER_SOUND_V1';
export const USER_SOUND_LIBRARY_FORMAT='BRKLOOP_USER_SOUNDS_V1';
export const MAX_USER_SOUNDS=96;
const isInt=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
const cleanName=s=>typeof s==='string'?s.trim():'';
function checkedArray(array,length,label){
  if(!Array.isArray(array)||array.length!==length||!array.every(n=>isInt(n,-32768,32767)))
    throw new RangeError('Invalid native '+label+' payload');
  return [...array];
}
export function validateUserSound(item,{engines=12,pLength=71,fm6Length=128}={}){
  if(!item||item.format!==USER_SOUND_FORMAT||typeof item.id!=='string'||
     !/^u:[a-zA-Z0-9_-]{4,70}$/.test(item.id))throw new TypeError('Invalid user sound ID or format');
  const name=cleanName(item.name);
  if(!name||name.length>48)throw new RangeError('Sound name must be 1..48 characters');
  if(!isInt(item.engine,0,engines-1)||!isInt(item.preset,0,32767))
    throw new RangeError('Invalid SLOOP engine/preset');
  return {format:USER_SOUND_FORMAT,id:item.id,name,engine:item.engine,preset:item.preset,
    p:checkedArray(item.p,pLength,'track parameters'),
    fm6:checkedArray(item.fm6,fm6Length,'FM6 operator parameters')};
}
export function makeUserSound({id,name,track},limits){
  if(!track||!Array.isArray(track.p)||!Array.isArray(track.fm6))
    throw new TypeError('Native synth track required');
  return validateUserSound({format:USER_SOUND_FORMAT,id,name,engine:track.engine,
    preset:track.preset,p:track.p,fm6:track.fm6},limits);
}
export function normalizeUserSoundLibrary(value,limits){
  if(!value||value.format!==USER_SOUND_LIBRARY_FORMAT||!Array.isArray(value.sounds)||
     value.sounds.length>MAX_USER_SOUNDS)throw new TypeError('Invalid user sound library');
  const ids=new Set();
  const sounds=value.sounds.map(item=>{
    const sound=validateUserSound(item,limits);
    if(ids.has(sound.id))throw new Error('Duplicate user sound ID');
    ids.add(sound.id);return sound;
  });
  return {format:USER_SOUND_LIBRARY_FORMAT,sounds};
}
export function importUserSoundFile(text,limits){
  if(typeof text!=='string'||text.length>1024*1024)throw new RangeError('User sound file is too large');
  const parsed=JSON.parse(text);
  if(parsed?.format===USER_SOUND_FORMAT)
    return {format:USER_SOUND_LIBRARY_FORMAT,sounds:[validateUserSound(parsed,limits)]};
  return normalizeUserSoundLibrary(parsed,limits);
}
export function exportUserSoundLibrary(sounds,limits){
  return JSON.stringify(normalizeUserSoundLibrary({format:USER_SOUND_LIBRARY_FORMAT,sounds},limits),null,2);
}
// Same native rules as setFactorySound: preserve transport/track-level values,
// replace the entire oscillator/FM6 patch incl ADSR/LFO/filter/track FX.
export const PRESERVED_TRACK_PARAMS=Object.freeze([0,25,26,27,29,30,31,32,39,40,49]);
export function applyUserSoundToTrack(track,sound,limits){
  const s=validateUserSound(sound,limits);
  if(!track||!Array.isArray(track.p)||!Array.isArray(track.fm6)||
     track.p.length!==s.p.length||track.fm6.length!==s.fm6.length)
    throw new TypeError('Target native track is incompatible');
  const next=structuredClone(track);
  const retained=PRESERVED_TRACK_PARAMS.map(id=>next.p[id]);
  next.engine=s.engine;next.preset=s.preset;
  next.p=[...s.p];next.fm6=[...s.fm6];
  PRESERVED_TRACK_PARAMS.forEach((id,i)=>{next.p[id]=retained[i];});
  return next;
}
