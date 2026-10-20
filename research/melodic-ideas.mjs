// SPDX-License-Identifier: GPL-3.0-only
// Musical ideas inspired by MerthSloop's progression browser; independently
// implemented for the native SLOOP 64-step / four-note-per-step score.
// All pitches are stored MIDI notes, never pre-transposed by the sound preset.
export const MELODY_ROLES=Object.freeze(['CHORD','BASS','ARP']);
export const MELODY_RHYTHMS=Object.freeze(['STRAIGHT','SPARSE','SYNCOPATED']);
export const MELODY_SCALES=Object.freeze({MAJOR:[0,2,4,5,7,9,11],MINOR:[0,2,3,5,7,8,10]});
export const MELODY_PROGRESSIONS=Object.freeze({
  POP:[0,4,5,3],      // I–V–vi–IV in major
  CYCLE:[0,5,3,4],    // I–vi–IV–V in major
  MINOR:[0,5,2,6],    // i–VI–III–VII in natural minor
  RISE:[0,3,4,5],     // I–IV–V–vi (degree-based for both scales)
});
const assertInt=(n,a,b,label)=>{
  if(!Number.isInteger(n)||n<a||n>b)throw new RangeError(label+' must be '+a+'..'+b);
  return n;
};
function random(seed){
  let x=seed>>>0;
  return ()=>{x=(Math.imul(1664525,x)+1013904223)>>>0;return x/4294967296;};
}
function degreeSemitone(scale,degree){
  return scale[degree%7]+12*Math.floor(degree/7);
}
function rest(){
  return {notes:[0,0,0,0],n:0,time:2,flags:0,vel:100,lvl:0,rat:0};
}
function noteStep(notes,vel=104){
  if(notes.length<1||notes.length>4||notes.some(n=>!Number.isInteger(n)||n<0||n>127))
    throw new RangeError('Generated MIDI pitches must fit SLOOP 0..127');
  if(new Set(notes).size!==notes.length)throw new Error('Duplicate generated chord notes');
  return {notes:[...notes,...Array(4-notes.length).fill(0)],n:notes.length,time:0,
    flags:0,vel,lvl:0,rat:0};
}
const attacks={
  CHORD:{STRAIGHT:[0,8],SPARSE:[0],SYNCOPATED:[0,6,11]},
  BASS:{STRAIGHT:[0,4,8,12],SPARSE:[0,8],SYNCOPATED:[0,3,7,10,14]},
  ARP:{STRAIGHT:[0,2,4,6,8,10,12,14],SPARSE:[0,4,8,12],
    SYNCOPATED:[0,3,6,8,11,14]},
};
export function generateMelodicIdea({
  length=16,role='BASS',rhythm='STRAIGHT',scale='MINOR',progression='MINOR',
  root=0,seed=1
}={}){
  assertInt(length,1,64,'LEN');
  assertInt(root,0,11,'root');
  assertInt(seed,0,0xFFFFFFFF,'seed');
  if(!MELODY_ROLES.includes(role))throw new RangeError('Unknown idea role');
  if(!MELODY_RHYTHMS.includes(rhythm))throw new RangeError('Unknown rhythm');
  if(!Object.hasOwn(MELODY_SCALES,scale))throw new RangeError('Unknown scale');
  if(!Object.hasOwn(MELODY_PROGRESSIONS,progression))throw new RangeError('Unknown progression');
  const notes=MELODY_SCALES[scale],degrees=MELODY_PROGRESSIONS[progression],rng=random(seed);
  const steps=Array.from({length:64},rest);
  const barCount=Math.ceil(length/16),events=[];
  for(let bar=0;bar<barCount;bar++){
    const degree=degrees[bar%degrees.length];
    // Keep each chord root in C3–B3 for bass / C4–B4 for chords and arps,
    // rather than letting successive scale degrees leap into new octaves.
    const degreeRoot=degreeSemitone(notes,degree);
    const rootNote=(role==='BASS'?48:60)+(root+degreeRoot)%12;
    const triad=[0,2,4].map(offset=>rootNote+degreeSemitone(notes,degree+offset)-degreeRoot);
    let arpIndex=(bar+(seed%3))%3;
    for(const tick of attacks[role][rhythm]){
      const index=bar*16+tick;
      if(index>=length)continue;
      const accent=tick===0||tick===8;
      let pitches;
      if(role==='CHORD'){
        pitches=[...triad];
        // One optional open-voicing variation, always diatonic and 3 notes.
        if(bar%2===1 && rng()<0.55)pitches[0]+=12;
        pitches.sort((a,b)=>a-b);
      }else if(role==='BASS'){
        const choose=tick===0?0:(rng()<0.28?7:(rng()<0.22?12:0));
        // The fifth is diatonic and has the correct size for diminished triads.
        pitches=[rootNote+(choose===7?triad[2]-triad[0]:choose)];
        // Keep bass within a musical two-octave range.
        if(pitches[0]>75)pitches[0]-=12;
      }else{
        const note=triad[arpIndex%3];
        const octave=rng()<0.14?12:0;
        pitches=[note+octave];
        arpIndex++;
      }
      steps[index]=noteStep(pitches,accent?114:role==='CHORD'?94:100);
      events.push({step:index,notes:[...pitches],bar,degree});
    }
  }
  return {length,role,rhythm,scale,progression,root,seed,steps,events};
}
export function melodicIdeaSummary(idea){
  if(!idea||!Array.isArray(idea.steps)||!Array.isArray(idea.events))
    throw new TypeError('Invalid melodic idea');
  return {attacks:idea.events.length,notes:idea.events.reduce((n,e)=>n+e.notes.length,0),
    bars:Math.ceil(idea.length/16)};
}
