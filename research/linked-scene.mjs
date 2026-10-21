// SPDX-License-Identifier: GPL-3.0-only
// Linked musical scenes for four existing SLOOP tracks. Original algorithm,
// composing the already-audited native groove + melodic building blocks.
// Same progression throughout; bass locks to kick, arpeggio draws chord tones
// at drum-hat positions. Only score data is generated: sound presets stay put.
import {generateDrumGroove,GROOVE_STYLES} from './groove-tools.mjs';
import {generateMelodicIdea,MELODY_SCALES,MELODY_PROGRESSIONS} from './melodic-ideas.mjs';

export const SCENE_FEELS=Object.freeze(['TIGHT','DRIVE','AIRY']);
const VALID_GROOVES=new Set(GROOVE_STYLES.map(s=>s[0]));
const int=(n,a,b,name)=>{
  if(!Number.isInteger(n)||n<a||n>b)throw new RangeError(name+' must be '+a+'..'+b);
  return n;
};
const rest=()=>({notes:[0,0,0,0],n:0,time:2,flags:0,vel:100,lvl:0,rat:0});
const event=(notes,vel=104)=>{
  if(notes.length<1||notes.length>4||notes.some(n=>!Number.isInteger(n)||n<0||n>127))
    throw RangeError('Native SLOOP MIDI note outside 0..127');
  if(new Set(notes).size!==notes.length)throw Error('Duplicate generated notes');
  return {...rest(),notes:[...notes,...Array(4-notes.length).fill(0)],n:notes.length,time:0,vel};
};
function kickAt(drum,i){return (drum[i].on&1)!==0;}
function hatAt(drum,i){return (drum[i].on&((1<<4)|(1<<5)))!==0;}
const beats=steps=>steps.filter(s=>s.n>0&&s.time===0).length;
const tickSeed=(seed,offset)=>(seed+offset)>>>0;

/** Return one deterministic, fully synchronized 4-track proposal; no audio
 * or browser globals. All tracks use the SAME native LEN and DIV on commit. */
export function generateLinkedScene({
  length=64,division=2,root=0,scale='MINOR',progression='MINOR',
  groove='DNB',feel='DRIVE',seed=1
}={}){
  int(length,16,64,'scene LEN');
  if(length%16!==0)throw new RangeError('Linked scene length must be full 16-step bars');
  int(division,0,8,'SLOOP DIV');int(root,0,11,'root');int(seed,0,0xFFFFFFFF,'seed');
  if(!Object.hasOwn(MELODY_SCALES,scale))throw new RangeError('Unknown scale');
  if(!Object.hasOwn(MELODY_PROGRESSIONS,progression))throw new RangeError('Unknown progression');
  if(!VALID_GROOVES.has(groove))throw new RangeError('Unknown groove style');
  if(!SCENE_FEELS.includes(feel))throw new RangeError('Unknown arrangement feel');
  const drums=generateDrumGroove({length,style:groove,seed:tickSeed(seed,17)}).steps;
  const chordIdea=generateMelodicIdea({length,role:'CHORD',rhythm:feel==='AIRY'?'SPARSE':'STRAIGHT',
    scale,progression,root,seed:tickSeed(seed,31)});
  const bass=Array.from({length:64},rest),chords=chordIdea.steps;
  const arp=Array.from({length:64},rest);
  const barInfo=[];
  for(let start=0;start<length;start+=16){
    const end=Math.min(length,start+16),bar=start/16;
    const harmony=chords[start].notes.slice(0,chords[start].n);
    if(harmony.length!==3)throw Error('Chord generator must provide a triad on the downbeat');
    // Generate the bass root from exactly the same progression and root,
    // then reuse the chord's diatonic pitches for passing/fifth notes.
    const harmonicRoot=generateMelodicIdea({length:16,role:'BASS',rhythm:'SPARSE',
      scale,progression:bar===0?progression:'RISE',root,seed:tickSeed(seed,31)}); // discarded: bar roots resolved below
    void harmonicRoot;
    const degrees=MELODY_PROGRESSIONS[progression],pcs=MELODY_SCALES[scale];
    const rootClass=(root+pcs[degrees[bar%degrees.length]])%12;
    const rootNote=48+rootClass;
    const fifthClass=(rootClass+(harmony[2]-harmony[0]+120)%12)%12;
    // Chord voicings can invert; choose the chord tone nearest 7 semitones
    // above the root, including diminished fifth where appropriate.
    const pitchClasses=harmony.map(n=>n%12);
    const nextTone=pitchClasses.map(pc=>(pc-rootClass+12)%12)
      .filter(d=>d>=5).sort((a,b)=>Math.abs(a-7)-Math.abs(b-7))[0]??7;
    const fifth=rootNote+nextTone;
    void fifthClass;
    const kicks=Array.from({length:end-start},(_,i)=>start+i).filter(i=>kickAt(drums,i));
    if(!kicks.includes(start))throw Error('Groove must start each bar with a kick');
    const chosen=feel==='DRIVE'?kicks:
      feel==='TIGHT'?kicks.filter((_,j)=>j===0||j%2===0):
      kicks.filter(i=>i===start||i-start>=8&&i-start<12);
    if(!chosen.includes(start))chosen.unshift(start);
    // Bass attacks share kick indices exactly, never wander into a new bar.
    chosen.forEach((i,j)=>{
      bass[i]=event([j===0||j%3!==2?rootNote:fifth],i===start?118:102);
    });
    // Chords normally sound on beats 1 and 3. AIRY leaves space.
    // The arp is sourced from the very same chord voicing, and takes
    // only hi-hat positions when available. Never invent new pitch classes.
    const hats=Array.from({length:end-start},(_,i)=>start+i)
      .filter(i=>hatAt(drums,i)&&i>start);
    const candidate=hats.length?hats:[start+2,start+6,start+10,start+14].filter(i=>i<end);
    const chosenArp=feel==='DRIVE'?candidate.filter((_,j)=>j%1===0).slice(0,7):
      feel==='TIGHT'?candidate.filter((_,j)=>j%2===0).slice(0,4):
      candidate.filter((_,j)=>j%3===0).slice(0,3);
    for(let j=0;j<chosenArp.length;j++){
      const i=chosenArp[j],n=harmony[(j+bar+seed%3)%harmony.length];
      arp[i]=event([n],i%4===0?106:91);
    }
    barInfo.push({bar,root:rootClass,kicks:kicks.length,
      bass:chosen.length,chords:chords.slice(start,end).filter(s=>s.time===0&&s.n).length,
      arp:chosenArp.length});
  }
  const tracks=[
    {track:0,steps:bass},
    {track:1,steps:chords},
    {track:2,steps:arp},
    {track:3,steps:drums}
  ];
  return {length,division,root,scale,progression,groove,feel,seed,tracks,barInfo,
    attacks:{bass:beats(bass),chords:beats(chords),arp:beats(arp),
      drums:drums.slice(0,length).reduce((total,s)=>total+Number(s.on!==0),0)}};
}
