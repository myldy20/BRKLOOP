// SPDX-License-Identifier: GPL-3.0-only
// RESEARCH ONLY. Native SLOOP state, shared Step/Roll command session, no app.js changes.
import {createResearchEditSession} from '../shared-edit-commands.mjs';
import {LocalPreview} from '../../web/preview.js';
import {panelAuditionPitch} from './panel-pitch.mjs';
import {generateDrumGroove, grooveSummary} from '../groove-tools.mjs';
import {generateMelodicIdea,melodicIdeaSummary} from '../melodic-ideas.mjs';
import {mutateExistingPattern} from '../pattern-mutate.mjs';
import {generateLinkedScene} from '../linked-scene.mjs';
import {generateSongArrangement,applyArrangementSection,createSongArrangementSession,arrangementPlaybackStates} from '../song-arranger.mjs';
const $=id=>document.getElementById(id);
const names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const noteName=n=>names[n%12]+(Math.floor(n/12)-1);
const newEl=(tag,cls,txt)=>{
  const x=document.createElement(tag);
  if(cls)x.className=cls;
  if(txt!==undefined)x.textContent=txt;
  return x;
};
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const trackNames=['SYNTH 1','SYNTH 2','SYNTH 3','DRUMS'];
const laneNames=['KICK','KICK 2','SNARE','CLAP','HAT','OPEN HAT','PEDAL','RIM',
  'SNARE 2','LOW TOM','HI TOM','CRASH','RIDE','SHAKER','CONGA','COWBELL'];
const bank=await fetch('../../bank-preview-v2.json').then(r=>{
  if(!r.ok)throw Error('SLOOP factory bank not present. Run original bank builder.');
  return r.json();
});
if(bank.format!=='BRKLOOP_BANK_V2_CANDIDATE'||bank.engines.reduce((n,e)=>n+e.presets.length,0)!==153)throw Error('Native SLOOP 153-sound bank missing');
// Prototype starts with a blank score (factory sounds remain unchanged).
const seed=structuredClone(bank.baseline);
for(let k=0;k<seed.tracks.length;k++){
  const t=seed.tracks[k];
  t.step?.forEach(s=>{s.n=0;s.time=2;s.flags=0;s.notes=[0,0,0,0];});
  t.dstep?.forEach(s=>{s.on=0;s.lvl.fill(0);s.rat.fill(0);});
  t.micro.fill(0);t.fill.fill(0);t.locks=[];
  if(k<3){
    const names=['WOBBLE','MUSIC BOX','GAME LEAD'];
    const e=[0,1,3][k],i=bank.engines[e].presets.findIndex(p=>p.name===names[k]);
    if(i<0)throw Error('Missing native factory default: '+names[k]);
    const preset=bank.engines[e].presets[i];
    const retained=[0,29,30,31,32,39,40].map(id=>t.p[id]);
    t.engine=e;t.preset=i;t.p=[...preset.p];t.fm6=[...preset.fm6];
    [0,29,30,31,32,39,40].forEach((id,j)=>{t.p[id]=retained[j]});
  }
}
const session=createResearchEditSession(seed);
let grooveDraft=null,grooveSeed=1,melodyDraft=null,melodySeed=1,mutationDraft=null,mutationSeed=1,sceneDraft=null,sceneSeed=1;
let songDraft=null,songSession=null,songSeed=1,songIndex=0,songActive=-1,songCycle=-1,songPlaying=false;
const modeForTrack=['step','step','step','step'];
let octave=3,rollOctave=3,selectedPitch=48,drumLane=0,auto=false,chord=false,chordNotes=[],player=null,playing=false;
const compactScreen=window.matchMedia('(max-width:900px)').matches;
let workspaceTab='pattern',activeTool=null,keyboardVisible=!compactScreen,rollScroll={left:0,top:0};
let soundPage='tone';
function soundState(){
  const state=session.getState();
  // Only the audio preview receives the draft. The edit session remains untouched
  // until APPLY; CANCEL and track switches restore the original immediately.
  if(grooveDraft)state.tracks[3].dstep=grooveDraft.steps.map(s=>({
    on:s.on,lvl:[...s.lvl],rat:[...s.rat]
  }));
  if(melodyDraft)state.tracks[melodyDraft.track].step=melodyDraft.steps.map(s=>({
    ...s,notes:[...s.notes]
  }));
  if(mutationDraft){
    const t=state.tracks[mutationDraft.trackIndex];
    const prop=mutationDraft.drums?'dstep':'step';
    t[prop]=mutationDraft.steps.map(s=>structuredClone(s));
    t.micro=[...mutationDraft.micro];
  }
  if(sceneDraft){
    for(const item of sceneDraft.tracks){
      const t=state.tracks[item.track];
      t[item.track===3?'dstep':'step']=item.steps.map(s=>structuredClone(s));
      t.p[29]=sceneDraft.length;t.p[30]=sceneDraft.division;
      t.micro.fill(0);t.fill.fill(0);t.locks=[];
    }
  }
  if(songDraft&&workspaceTab==='song')return applyArrangementSection(state,songDraft.sections[songIndex]);
  return state;
}
function current(){const v=session.getView(),state=session.getState();return {v,state,track:state.tracks[v.track]};}
function status(message){$('status').textContent=message;}
function commit(cmd){
  try{
    if(songPlaying)stopSongPlayback();
    const edited=session.dispatch(cmd);
    if(edited){grooveDraft=null;melodyDraft=null;mutationDraft=null;sceneDraft=null;songDraft=null;songSession=null;player?.sync();}
    render();
    return edited;
  }catch(e){status(e.message);render();return false;}
}
function advance(){
  if(!auto)return;
  const {v,track}=current();
  session.select(v.track,(v.step+1)%clamp(track.p[29],1,64));
  render();
}
function selectStep(step){
  const {v}=current();
  session.select(v.track,step);render();
}

// Wave samples are supplied by the ORIGINAL audio DSP output, not generated
// from knob values. This view draws an actual low-bandwidth time-domain trace.
let scopeSeen=false;
function drawScope(wave,peak){
  const canvas=$('scope-canvas');
  if(!canvas)return;
  const ctx=canvas.getContext('2d');
  if(!ctx)return;
  const w=canvas.width,h=canvas.height,mid=h/2;
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle='#090f19';ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#253648';ctx.lineWidth=1;
  ctx.beginPath();
  for(let i=0;i<=8;i++){const x=i*w/8;ctx.moveTo(x,0);ctx.lineTo(x,h);}
  for(let i=0;i<=4;i++){const y=i*h/4;ctx.moveTo(0,y);ctx.lineTo(w,y);}
  ctx.stroke();
  ctx.strokeStyle='#274960';ctx.beginPath();ctx.moveTo(0,mid);ctx.lineTo(w,mid);ctx.stroke();
  ctx.strokeStyle='#62e2be';ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.lineCap='round';
  ctx.beginPath();
  const points=wave?.length||0;
  for(let i=0;i<points;i++){
    const x=i*w/Math.max(1,points-1);
    const y=mid-clamp(Number(wave[i])||0,-1,1)*mid*.88;
    if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
  }
  ctx.stroke();
  if(wave){
    scopeSeen=true;
    $('scope-state').textContent='LIVE / DSP AUDIO';
    $('scope-peak').textContent='PEAK '+Math.round(Math.min(1,Math.max(0,peak||0))*100)+'%';
  }
}
async function ensureAudio(){
  if(!player)player=new LocalPreview(soundState,e=>status(e.message),()=>{},transport=>onSongTransport(transport),
    (wave,peak)=>drawScope(wave,peak));
  await player.start();
}
async function audition(note,trackId=current().v.track){
  try{
    await ensureAudio();
    player.note(trackId,note,true);
    setTimeout(()=>player?.note(trackId,note,false),150);
  }catch(e){status(e.message);}
}
function midiKey(note){
  selectedPitch=note;
  const {v}=current();
  if(v.track===3)return;
  if(workspaceTab==='sound'){
    const mapped=panelAuditionPitch(note,current().track.p);
    status('PANEL KEY '+noteName(note)+' → '+noteName(mapped)+' · SLOOP TRANSPOSE '+current().track.p[28]);
    void audition(mapped,v.track);
    renderKeyboard();return;
  }
  if(chord){
    if(chordNotes.includes(note))chordNotes=chordNotes.filter(n=>n!==note);
    else if(chordNotes.length<4)chordNotes.push(note);
    else{status('Maximum four notes per step');renderKeyboard();return;}
    renderKeyboard();return;
  }
  if(commit({type:'writeNote',track:v.track,step:v.step,note}))advance();
  if(player)void audition(note,v.track);
}
// There is no edit-tool switch: empty cells are writable by one tap in either
// editor. A populated piano-roll note is selected, while a touch long-press
// or mouse context menu removes it. Dedicated ERASE stays close to the canvas.
function drawAt(step,pitchOrLane){
  const {v,track}=current();
  const wasSelected=v.step===step;
  session.select(v.track,step);
  if(v.track===3){
    drumLane=pitchOrLane??drumLane;
    commit({type:'toggleDrumHit',track:v.track,step,lane:drumLane});
    return;
  }
  if(pitchOrLane!==null && pitchOrLane!==undefined){
    selectedPitch=pitchOrLane;
    const synth=track.step[step];
    const present=synth.time===0&&synth.notes.slice(0,synth.n).includes(pitchOrLane);
    if(present){render();return;}
    commit({type:'addNote',track:v.track,step,note:pitchOrLane});
    return;
  }
  const synth=track.step[step];
  if(synth.n>0 && synth.time===0){render();return;}
  commit({type:'writeNote',track:v.track,step,note:selectedPitch});
  if(auto && !wasSelected)advance();
}
function eraseSelected(){
  const {v,track}=current();
  if(v.track===3){
    if(track.dstep[v.step].on&(1<<drumLane))
      commit({type:'toggleDrumHit',track:v.track,step:v.step,lane:drumLane});
  }else if(v.mode==='roll'){
    const synth=track.step[v.step],p=selectedPitch;
    if(synth.time===0&&synth.notes.slice(0,synth.n).includes(p))
      commit({type:'removeNote',track:v.track,step:v.step,note:p});
  }else commit({type:'clearNotes',track:v.track,step:v.step});
}
function bindLongPressErase(button,step,pitchOrLane){
  let timer=null,origin=null,suppress=false;
  const cancel=()=>{if(timer){clearTimeout(timer);timer=null;}origin=null;};
  button.addEventListener('pointerdown',e=>{
    if(e.pointerType!=='touch')return;
    origin={x:e.clientX,y:e.clientY};
    timer=setTimeout(()=>{
      timer=null;suppress=true;
      session.select(current().v.track,step);
      if(current().v.track===3){
        const t=current().track.dstep[step];
        if(t.on&(1<<pitchOrLane))commit({type:'toggleDrumHit',track:3,step,lane:pitchOrLane});
      }else{
        const t=current().track.step[step];
        if(t.time===0&&t.notes.slice(0,t.n).includes(pitchOrLane))
          commit({type:'removeNote',track:current().v.track,step,note:pitchOrLane});
      }
      status('Note erased · Undo available');
    },480);
  });
  button.addEventListener('pointermove',e=>{
    if(origin&&Math.hypot(e.clientX-origin.x,e.clientY-origin.y)>10)cancel();
  });
  button.addEventListener('pointercancel',cancel);
  button.addEventListener('pointerup',cancel);
  button.addEventListener('contextmenu',e=>{
    e.preventDefault();cancel();suppress=true;
    session.select(current().v.track,step);
    const v=current().v,track=current().track;
    if(v.track===3){
      if(track.dstep[step].on&(1<<pitchOrLane))commit({type:'toggleDrumHit',track:3,step,lane:pitchOrLane});
    }else if(track.step[step].time===0&&track.step[step].notes.slice(0,track.step[step].n).includes(pitchOrLane))
      commit({type:'removeNote',track:v.track,step,note:pitchOrLane});
  });
  return ()=>{if(suppress){suppress=false;return true;}return false;};
}
function renderTracks(){
  const {v}=current(),container=$('tracks');
  container.replaceChildren();
  trackNames.forEach((name,k)=>{
    const b=newEl('button','track'+(v.track===k?' active':''));
    b.append(newEl('small','',String(k+1).padStart(2,'0')),newEl('strong','',name));
    b.append(newEl('span','',k===3?(bank.kits[session.getState().tracks[3].p[bank.pe0]]||'16 lanes'):(bank.engines[session.getState().tracks[k].engine]?.presets[session.getState().tracks[k].preset]?.name||'CUSTOM')));
    b.addEventListener('click',()=>{
      if(k!==v.track&&(grooveDraft||melodyDraft||mutationDraft)){grooveDraft=null;melodyDraft=null;mutationDraft=null;player?.sync();}
      session.select(k,Math.min(v.step,clamp(session.getState().tracks[k].p[29],1,64)-1));
      session.setMode(modeForTrack[k]);chord=false;chordNotes=[];render();
    });
    container.append(b);
  });
}
function renderOptions(){
  const {v,track}=current();
  $('track-title').textContent=trackNames[v.track];
  $('length').value=track.p[29];
  const select=$('division');
  select.replaceChildren();
  bank.sequence.division.names.forEach((name,i)=>{
    const o=newEl('option','',String(name));o.value=String(i);select.append(o);
  });
  select.value=String(track.p[30]);
  $('auto').checked=auto;
  for(const m of ['step','roll'])$(m+'-mode').setAttribute('aria-pressed',String(v.mode===m));
  $('roll-pitch-nav').hidden=v.mode!=='roll' || v.track===3;
  $('roll-range').textContent='C'+rollOctave+'–B'+rollOctave;
  $('edit-hint').textContent=v.mode==='roll' ? 'Tap empty cell to add a note. Hold a note or right-click to erase.' : 'Tap empty step to write highlighted pitch. Piano keys replace selected step.';
  $('quick-erase').textContent=v.mode==='roll'?'⌫ ERASE NOTE':'⌫ ERASE STEP';
  const history=session.history();
  $('undo').disabled=history.undo===0;$('redo').disabled=history.redo===0;
}
function renderStep(){
  const {v,track}=current(),length=clamp(track.p[29],1,64),canvas=$('grid');
  canvas.replaceChildren();
  for(let base=0;base<length;base+=16){
    const section=newEl('section','step-section');
    section.append(newEl('div','section-title','STEPS '+String(base+1).padStart(2,'0')+'–'+String(Math.min(base+16,length)).padStart(2,'0')));
    for(let half=0;half<2;half++){
      if(base+half*8>=length)break;
      const row=newEl('div','step-row');
      for(let i=base+half*8;i<Math.min(base+half*8+8,length);i++){
        const s=v.track===3?track.dstep[i]:track.step[i];
        const isOn=v.track===3?!!(s.on&(1<<drumLane)):s.n>0&&s.time===0;
        const b=newEl('button','step-cell'+(isOn?' active':'')+(i===v.step?' selected':''));
        b.dataset.step=String(i);
        const content=v.track===3?(isOn?'●':'·'):(isOn?s.notes.slice(0,s.n).map(noteName).join(' + '):'·');
        b.append(newEl('span','number',String(i+1).padStart(2,'0')),newEl('span','pitch',content));
        b.setAttribute('aria-label','Step '+(i+1)+' '+(isOn?content:'empty'));
        b.setAttribute('aria-pressed',String(i===v.step));
        b.addEventListener('click',()=>drawAt(i,v.track===3?drumLane:null));
        row.append(b);
      }
      section.append(row);
    }
    canvas.append(section);
  }
}

function renderRoll(){
  const {v,track}=current(),length=clamp(track.p[29],1,64),drums=v.track===3;
  const canvas=$('grid'),prior=canvas.querySelector('.roll-scroll');
  if(prior)rollScroll={left:prior.scrollLeft,top:prior.scrollTop};
  canvas.replaceChildren();
  const scroll=newEl('div','roll-scroll'),grid=newEl('div','roll-grid');
  grid.style.gridTemplateColumns='56px repeat('+length+',42px)';
  grid.append(newEl('div','roll-corner',drums?'DRUM':'NOTE'));
  for(let i=0;i<length;i++)grid.append(newEl('div','roll-step',String(i+1)));
  // Octave bank, not an endlessly vertically scrolling two-octave sheet.
  // Every MIDI pitch is reachable via +/- in the always-visible header.
  const base=(rollOctave+1)*12;
  const lines=drums?Array.from({length:16},(_,i)=>i):
    Array.from({length:12},(_,i)=>base+11-i);
  for(const row of lines){
    grid.append(newEl('div','roll-note-label',drums?laneNames[row]:noteName(row)));
    for(let i=0;i<length;i++){
      const t=drums?track.dstep[i]:track.step[i];
      const active=drums?!!(t.on&(1<<row)):t.n>0&&t.time===0&&t.notes.slice(0,t.n).includes(row);
      const b=newEl('button','roll-cell'+(i%4===0?' beat':'')+(active?' on':'')+
        (i===v.step && (drums?drumLane===row:selectedPitch===row)?' selected':''));
      b.dataset.step=String(i);b.dataset.note=String(row);
      b.setAttribute('aria-label',drums?'Step '+(i+1)+' '+laneNames[row]:'Step '+(i+1)+' '+noteName(row));
      b.setAttribute('aria-pressed',String(active));
      b.textContent=active?'●':'';
      const suppressed=bindLongPressErase(b,i,row);
      b.addEventListener('click',()=>{
        if(suppressed())return;
        drawAt(i,row);
      });
      grid.append(b);
    }
  }
  scroll.append(grid);canvas.append(scroll);
  scroll.scrollLeft=rollScroll.left;scroll.scrollTop=rollScroll.top;
  scroll.addEventListener('scroll',()=>{rollScroll={left:scroll.scrollLeft,top:scroll.scrollTop};},{passive:true});
}
function renderInspector(){
  const {v,track}=current();$('selected').textContent=String(v.step+1).padStart(2,'0');
  const s=v.track===3?track.dstep[v.step]:track.step[v.step];
  $('notes').textContent=v.track===3?laneNames[drumLane]+': '+((s.on&(1<<drumLane))?'ON':'OFF'):
    s.time===2?'REST':s.time===1?'TIE':s.n?s.notes.slice(0,s.n).map(noteName).join('  +  '):'EMPTY';
  $('velocity').disabled=v.track===3;
  $('velocity').value=v.track===3?96:(s.vel||96);
  $('velocity-value').textContent=$('velocity').value;
}
function renderKeyboard(){
  const {v}=current(),kb=$('keyboard');
  kb.replaceChildren();
  $('key-label').textContent='C'+octave+' – C'+(octave+1);
  $('chord').hidden=v.track===3;
  $('chord').setAttribute('aria-pressed',String(chord));
  $('chord-done').hidden=!chord;$('chord-cancel').hidden=!chord;
  $('chord-preview').textContent=chord?'CHORD: '+(chordNotes.map(noteName).join(' + ')||'tap notes, then Done'):workspaceTab==='sound'?'FM-1 PANEL: transposes live key by '+current().track.p[28]+' semitones. Piano Roll steps retain absolute pitches.':'Tap keys to write selected step, or tap an empty step to stamp highlighted pitch.';
  if(v.track===3){
    const pads=newEl('div','step-row');
    laneNames.forEach((name,i)=>{
      const b=newEl('button','step-cell'+(i===drumLane?' selected':''));
      b.textContent=name;b.dataset.lane=String(i);
      b.addEventListener('click',()=>{drumLane=i;render();if(player)player.hit(current().track.p[bank.pe0],i,100);});
      pads.append(b);
    });kb.append(pads);kb.style.height='auto';return;
  }
  kb.style.height='';
  const white=newEl('div','piano-whites'),base=(octave+1)*12;
  for(const semi of [0,2,4,5,7,9,11,12]){
    const n=base+semi,b=newEl('button','piano-key white-key'+(n===selectedPitch?' chosen':''),noteName(n));
    b.dataset.note=String(n);b.setAttribute('aria-label','Write '+noteName(n));
    b.addEventListener('click',()=>midiKey(n));white.append(b);
  }
  kb.append(white);
  for(const [semi,gap] of [[1,1],[3,2],[6,4],[8,5],[10,6]]){
    const n=base+semi,b=newEl('button','piano-key black-key'+(n===selectedPitch?' chosen':''),noteName(n));
    b.dataset.note=String(n);b.style.left=(gap*100/8)+'%';
    b.setAttribute('aria-label','Write '+noteName(n));
    b.addEventListener('click',()=>midiKey(n));kb.append(b);
  }
}

function optionList(select,labels,value){
  select.replaceChildren();
  labels.forEach((name,i)=>{
    const opt=newEl('option','',String(name));opt.value=String(i);select.append(opt);
  });
  select.value=String(value);
}

const soundLabels={
  0:'Level',1:'Attack',2:'Decay',3:'Sustain',4:'Release',
  5:'Filter offset',6:'Pitch offset',7:'Shape offset',8:'Preset trim',
  9:'LFO rate',10:'Waveform',11:'Start phase',12:'Fade in',
  13:'To pitch',14:'To filter',15:'To shape',16:'To amplitude',
  17:'Arpeggiator',18:'Arp division',19:'Arp octaves',20:'Arp gate',
  21:'Arp swing',22:'Probability',23:'Hold notes',24:'Note order',
  25:'Root',26:'Scale',27:'Quantize',28:'Transpose',29:'Pattern length',
  30:'Step division',31:'Step swing',32:'Step gate',
  33:'Distortion',34:'Chorus',35:'Delay',36:'Reverb',37:'Voice mode',
  38:'Glide',39:'Pan',40:'Mute',41:'Glide mode',42:'Voice priority',
  43:'Voice allocation',44:'Detune',45:'Slicer',46:'Slice pattern',
  47:'Slice rate',48:'Slice depth',49:'Chord',50:'Track filter',
  51:'Strum timing',52:'Voice lead',53:'Insert type',
  54:'Insert A',55:'Insert B',56:'Insert C',57:'Insert mix',
  58:'Filter type',59:'Envelope sync',60:'LFO sync',
  61:'LFO retrigger',62:'LFO polarity'
};
// Compact controls share the exact same native SLOOP parameter pipeline as
// the full editor. Gestures are grouped in Undo, while each move reaches WASM.
function writeNativeTrackParam(id,value,final){
  const v=current().v;
  if(final){
    if(session.finishGesture()){player?.sync();render();}
    else if(current().track.p[id]!==value)
      commit({type:'setTrackParam',track:v.track,param:id,value});
  }else{
    session.preview({type:'setTrackParam',track:v.track,param:id,value});
    player?.trackParam(v.track,id,value);
    updateSoundVisuals();
  }
}
const level=(id,value=current().track.p[id])=>{
  const d=bank.trackControls[id];
  return d&&d.max>d.min?clamp((value-d.min)/(d.max-d.min),0,1):0.5;
};
const svgNS='http://www.w3.org/2000/svg';
function plot(id,path){$(id).setAttribute('d',path);}
// One visualization = one editor. Every numeric field below is the real
// SLOOP parameter; every graph gesture previews directly in AudioWorklet.
function syncVizInput(id,value){
  const input=$(id);
  if(input && document.activeElement!==input && input.value!==String(value))
    input.value=String(value);
}
function syncVizBounds(id,parameter){
  const input=$(id),d=bank.trackControls[parameter];
  if(!d)return;
  input.min=String(d.min);input.max=String(d.max);
}
function makeVizOptions(id,names,value){
  const input=$(id);
  if(!input.options.length)optionList(input,names,value);
  if(document.activeElement!==input)input.value=String(value);
}
function waveFunction(wave,phase){
  const p=((phase%1)+1)%1;
  if(wave===0)return Math.sin(2*Math.PI*p);
  if(wave===1)return 1-4*Math.abs(p-0.5);
  if(wave===2)return 2*p-1;
  if(wave===3)return p<0.5?1:-1;
  // Original SLOOP's fifth LFO choice is sample-and-hold. Fixed seeds for
  // a stable preview (not an audio-rate simulation or a random animation).
  const n=Math.floor(phase*4);
  return ((Math.sin((n+13)*78.233)*43758.5453)%1+1)%1*2-1;
}
function updateSoundVisuals(){
  if(!$('viz-envelope')||$('sound-panel').hidden||current().v.track===3)return;
  const t=current().track;
  for(const [id,p] of [['viz-env-attack',1],['viz-env-decay',2],
    ['viz-env-sustain',3],['viz-env-release',4],['viz-lfo-rate',9],
    ['viz-filter-tilt',50],['viz-filter-offset',5]]){
    syncVizBounds(id,p);syncVizInput(id,t.p[p]);
  }
  const waves=bank.trackControls[10].names||['SIN','TRI','SAW','SQR','S&H'];
  const syncs=bank.trackControls[60].names||['OFF','4BAR','2BAR','1BAR','1/2',
    '1/4','1/8','8T','1/16','16T','1/32'];
  makeVizOptions('viz-lfo-wave',waves,t.p[10]);
  makeVizOptions('viz-lfo-sync',syncs,t.p[60]);
  const target=Number($('viz-lfo-target').value);
  syncVizBounds('viz-lfo-depth',target);
  syncVizInput('viz-lfo-depth',t.p[target]);
  $('viz-lfo-rate').disabled=t.p[60]!==0;

  const a=level(1),d=level(2),su=level(3),r=level(4);
  const ax=16+a*60,dx=ax+15+d*60,sx=dx+45,rx=sx+16+r*65;
  const sy=100-80*su;
  const env='M 12 100 L '+ax+' 20 L '+dx+' '+sy+' L '+sx+' '+sy+
    ' L '+rx+' 100 L 308 100';
  plot('viz-env-line',env);
  plot('viz-env-fill',env+' L 12 100 Z');
  const handles=$('viz-env-handles');
  if(!handles.childElementCount){
    for(const [id,label]of [[1,'Attack'],[2,'Decay'],[3,'Sustain'],[4,'Release']]){
      const dot=document.createElementNS(svgNS,'circle');
      dot.setAttribute('r','7');dot.setAttribute('tabindex','0');
      dot.dataset.param=String(id);dot.setAttribute('aria-label','Drag '+label);
      const title=document.createElementNS(svgNS,'title');title.textContent=label;
      dot.append(title);handles.append(dot);
    }
  }
  [[ax,20],[dx,sy],[sx,sy],[rx,100]].forEach(([x,y],i)=>{
    const dot=handles.children[i];dot.setAttribute('cx',String(x));dot.setAttribute('cy',String(y));
  });
  $('viz-envelope-caption').textContent='Native ADSR · drag points or edit values';

  // Native enum order: SIN, TRI, SAW, SQR, S&H (firmware/src/params.c).
  const wave=t.p[10],depthDesc=bank.trackControls[target];
  const depth=t.p[target],depthNorm=depthDesc.max>depthDesc.min?
    Math.abs(depth)/(Math.max(Math.abs(depthDesc.min),Math.abs(depthDesc.max))):0;
  const cycles=t.p[60]===0?1+level(9)*4:1+(t.p[60]/10)*4;
  const polar=t.p[62]===1,amp=8+depthNorm*34;
  const points=[];
  for(let i=0;i<=150;i++){
    const phase=i/150*cycles,raw=waveFunction(wave,phase);
    const y=56-(polar?(raw+1)*.5:raw)*amp*(depth<0?-1:1);
    points.push((i?'L ':'M ')+(10+i*2).toFixed(1)+' '+y.toFixed(1));
  }
  plot('viz-lfo-line',points.join(' '));
  $('viz-lfo-point').setAttribute('cx',String(10+level(t.p[60]?60:9)*300));
  $('viz-lfo-point').setAttribute('cy',String(100-level(target)*88));
  $('viz-lfo-caption').textContent=t.p[60]?
    'Tempo sync '+syncs[t.p[60]]+' · X adjusts sync / Y adjusts '+$('viz-lfo-target').selectedOptions[0].text:
    'X adjusts rate · Y adjusts '+$('viz-lfo-target').selectedOptions[0].text+
    ' depth · signed modulation';

  // Track filter (P_TFLT) is a *bipolar* tone tilt: negative lowpass,
  // zero open, positive highpass. Draw an illustrative balance curve rather
  // than claiming this is a measured filter transfer function.
  const tilt=t.p[50],off=t.p[5],tNorm=tilt<0?tilt/64:tilt/63;
  const filter=[];
  for(let i=0;i<=120;i++){
    const x=10+i*2.5,n=i/120;
    const attenuation=Math.abs(tNorm)*Math.pow(tilt<0?n:1-n,1.35);
    const y=22+attenuation*75;
    filter.push((i?'L ':'M ')+x.toFixed(1)+' '+y.toFixed(1));
  }
  const curve=filter.join(' ');
  plot('viz-filter-line',curve);
  plot('viz-filter-fill',curve+' L 310 100 L 10 100 Z');
  $('viz-filter-point').setAttribute('cx',String(10+level(50)*300));
  $('viz-filter-point').setAttribute('cy',String(100-level(5)*88));
  $('viz-filter-caption').textContent='TILT '+tilt+' (LP ← 0 open → HP) · ENGINE OFFSET '+off+
    ' · schematic';
}
function attachEnvelopeEditor(){
  const g=$('viz-env-handles');
  g.addEventListener('pointerdown',e=>{
    const dot=e.target.closest('circle[data-param]');
    if(!dot||current().v.track===3)return;
    const id=Number(dot.dataset.param),rect=$('viz-envelope').getBoundingClientRect();
    const x0=e.clientX,y0=e.clientY,start=current().track.p[id];
    const descriptor=bank.trackControls[id],width=Math.max(1,rect.width),height=Math.max(1,rect.height);
    let active=true;
    const move=event=>{
      if(!active)return;
      const delta=id===3?(y0-event.clientY)/height:(event.clientX-x0)/width;
      const normalized=level(id,start)+delta*2.7;
      const value=clamp(Math.round(descriptor.min+clamp(normalized,0,1)*(descriptor.max-descriptor.min)),
        descriptor.min,descriptor.max);
      if(current().track.p[id]!==value)writeNativeTrackParam(id,value,false);
    };
    dot.setPointerCapture(e.pointerId);
    const end=event=>{
      if(!active)return;active=false;
      dot.removeEventListener('pointermove',move);
      dot.removeEventListener('pointerup',end);
      dot.removeEventListener('pointercancel',end);
      writeNativeTrackParam(id,current().track.p[id],true);
    };
    dot.addEventListener('pointermove',move);
    dot.addEventListener('pointerup',end);
    dot.addEventListener('pointercancel',end);
    e.preventDefault();
  });
}
function rotaryControl(container,descriptor,value,command,displayName,paramId){
  if(!descriptor||descriptor.max<=descriptor.min)return;
  const label=newEl('label','sound-control dial-control');
  label.dataset.param=String(paramId);
  label.append(newEl('span','control-name',displayName||descriptor.label));
  const body=newEl('div','dial-body'),face=newEl('div','dial-face');
  const pointer=newEl('span','dial-pointer'),input=newEl('input','dial-native');
  const output=newEl('output','control-value',String(value));
  input.type='range';input.min=String(descriptor.min);input.max=String(descriptor.max);
  input.step='1';input.value=String(value);input.setAttribute('aria-label',displayName||descriptor.label);
  const paint=()=>{
    const pct=clamp((Number(input.value)-descriptor.min)/(descriptor.max-descriptor.min),0,1);
    face.style.setProperty('--dial-angle',(pct*270-135)+'deg');
    face.style.setProperty('--dial-progress',(pct*270)+'deg');
    output.textContent=input.value;
  };
  input.addEventListener('input',()=>{paint();command(Number(input.value),false);});
  input.addEventListener('change',()=>command(Number(input.value),true));
  let origin=null;
  body.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;
    e.preventDefault();input.focus();
    origin={x:e.clientX,y:e.clientY,start:Number(input.value)};
    body.setPointerCapture(e.pointerId);
  });
  body.addEventListener('pointermove',e=>{
    if(!origin)return;
    const delta=(origin.y-e.clientY)+(e.clientX-origin.x)*.55;
    const next=clamp(Math.round(origin.start+delta*(descriptor.max-descriptor.min)/180),
      descriptor.min,descriptor.max);
    if(next!==Number(input.value)){
      input.value=String(next);input.dispatchEvent(new Event('input',{bubbles:true}));
    }
  });
  const finish=()=>{
    if(!origin)return;origin=null;
    input.dispatchEvent(new Event('change',{bubbles:true}));
  };
  body.addEventListener('pointerup',finish);
  body.addEventListener('pointercancel',finish);
  body.append(face,pointer,input);label.append(body,output);container.append(label);paint();
}
function renderQuickSound(){
  const {v,track}=current(),drums=v.track===3;
  const currentPreset=drums?(bank.kits[track.p[bank.pe0]]||'KIT'):
    (bank.engines[track.engine]?.presets[track.preset]?.name||'CUSTOM');
  $('quick-sound-name').textContent=currentPreset;
  const choices=$('quick-sound-preset');choices.replaceChildren();
  const entries=drums?bank.kits.slice(0,37):bank.engines[track.engine].presets.map(x=>x.name);
  optionList(choices,entries,drums?clamp(track.p[bank.pe0],0,36):track.preset);
  const control=$('quick-sound-controls');control.replaceChildren();
  const ids=drums?[0,50]:[0,50];
  ids.forEach(id=>rotaryControl(control,bank.trackControls[id],track.p[id],
    (value,final)=>writeNativeTrackParam(id,value,final),
    id===0?'LEVEL':'FILTER',id));
}
function soundControl(container,descriptor,value,command,displayName,paramId){
  if(!descriptor||descriptor.max<=descriptor.min||descriptor.label==='-')return;
  const parent=newEl('label','sound-control');
  if(Number.isInteger(paramId))parent.dataset.param=String(paramId);
  const name=newEl('span','control-name',displayName||descriptor.label);
  name.title=descriptor.label+' · SLOOP '+(Number.isInteger(paramId)?'param '+paramId:'macro');
  parent.append(name);
  const values=descriptor.names||[];
  const named=values.length>0&&values.length===descriptor.max-descriptor.min+1&&values.length<=128;
  if(named){
    const select=newEl('select');
    optionList(select,values,value-descriptor.min);
    select.setAttribute('aria-label',name.textContent);
    select.addEventListener('change',()=>command(descriptor.min+Number(select.value),true));
    parent.append(select);
  }else{
    const range=newEl('input');
    range.type='range';range.min=String(descriptor.min);range.max=String(descriptor.max);
    range.step='1';range.value=String(value);range.setAttribute('aria-label',name.textContent);
    const output=newEl('output','control-value',String(value));
    range.addEventListener('input',()=>{output.textContent=range.value;command(Number(range.value),false);});
    range.addEventListener('change',()=>command(Number(range.value),true));
    parent.append(range,output);
  }
  container.append(parent);
}
function renderSound(){
  const {v,track}=current(),drums=v.track===3;
  const engine=drums?null:bank.engines[track.engine];
  const preset=drums?(bank.kits[track.p[bank.pe0]]||'Kit'):(engine.presets[track.preset]?.name||'Custom');
  $('sound-title').textContent=preset;
  $('sound-subtitle').textContent=drums?'DRUMS · 16 LANES · '+bank.kits.length+' KITS':engine.name+' ENGINE · '+engine.presets.length+' FACTORY SOUNDS';
  $('engine-wrap').hidden=drums;$('preset-wrap').hidden=drums;$('kit-wrap').hidden=!drums;
  if(drums)optionList($('kit-select'),bank.kits.slice(0,37),clamp(track.p[bank.pe0],0,36));
  else{
    optionList($('engine-select'),bank.engines.map(x=>x.name),track.engine);
    optionList($('preset-select'),engine.presets.map(x=>x.name),track.preset);
  }
  const available=drums?['tone','fx','mix','advanced']:['tone','envelope','lfo','fx','performance','mix','advanced'];
  if(!available.includes(soundPage))soundPage='tone';
  for(const button of $('sound-pages').querySelectorAll('button')){
    const page=button.dataset.soundPage;
    button.hidden=!available.includes(page);
    button.setAttribute('aria-pressed',String(page===soundPage));
  }
  for(const page of $('sound-panel').querySelectorAll('.sound-page'))
    page.hidden=page.dataset.page!==soundPage;
  const common=bank.trackControls;
  const writeParam=(id,value,final)=>writeNativeTrackParam(id,value,final);
  const writeGlobal=(id,value,final)=>{
    if(final){
      if(session.finishGesture()){player?.sync();render();}
      else if(current().state.g[id]!==value)commit({type:'setGlobalParam',track:v.track,param:id,value});
    }else{
      session.preview({type:'setGlobalParam',track:v.track,param:id,value});
      player?.globalParam(id,value);
    }
  };
  const showParams=(container,ids)=>{
    const target=$(container);target.replaceChildren();
    for(const id of ids)soundControl(target,common[id],track.p[id],
      (value,final)=>writeParam(id,value,final),soundLabels[id]||common[id].label,id);
  };
  if(soundPage==='tone'){
    $('sound-macros').replaceChildren();
    if(drums)$('sound-macros').append(newEl('p','sound-help','Choose a kit above. Tap one of the 16 pads below to audition. Track effects and filtering live in FX.'));
    else engine.controls.forEach((c,i)=>{
      const id=bank.pe0+i;
      const render=(!c.names||!c.names.length)?rotaryControl:soundControl;
      render($('sound-macros'),c,track.p[id],
        (value,final)=>writeParam(id,value,final),c.label,id);
    });
    $('sound-shape').closest('.sound-section').hidden=drums;
    if(!drums)showParams('sound-shape',[28,5,6,7,50,58]);
    else $('sound-shape').replaceChildren();
  }else if(soundPage==='envelope'){
    showParams('sound-envelope',[1,2,3,4,59]);
    if(track.engine===9)$('sound-envelope').append(newEl('p','sound-help','FM6 has separate packed operator envelopes. These are the common track envelope controls.'));
  }else if(soundPage==='lfo'){
    showParams('sound-lfo',[9,10,11,12,13,14,15,16,60,61,62]);
  }else if(soundPage==='fx'){
    showParams('sound-fx',[33,34,35,36,50,53,54,55,56,57]);
  }else if(soundPage==='performance'){
    showParams('sound-performance',[17,18,19,20,21,22,23,24,25,26,27,29,30,31,32,37,38,41,42,43,44,45,46,47,48,49,51,52]);
  }else if(soundPage==='mix'){
    showParams('sound-mix',[0,39,40,50]);
  }else if(soundPage==='advanced'){
    const search=$('sound-search').value.trim().toLowerCase();
    const matches=d=>!search||String(d.id).includes(search)||d.label.toLowerCase().includes(search)||
      (soundLabels[d.id]||'').toLowerCase().includes(search);
    $('sound-advanced-controls').replaceChildren();
    $('sound-global-controls').replaceChildren();
    if($('all-params').open)for(const d of common.filter(matches))
      soundControl($('sound-advanced-controls'),d,track.p[d.id],
        (value,final)=>writeParam(d.id,value,final),soundLabels[d.id]||d.label,d.id);
    if($('all-globals').open)for(const d of bank.globalControls.filter(matches))
      soundControl($('sound-global-controls'),d,current().state.g[d.id],
        (value,final)=>writeGlobal(d.id,value,final),d.label,d.id);
  }
  $('sound-visuals').hidden=drums;
  if(!drums)updateSoundVisuals();
  $('param-count').textContent=String(common.length);
  $('global-count').textContent=String(bank.globalControls.length);
}
const grooveRows=[
  ['KICK',[0]], ['SNARE',[2,3]], ['HATS',[4,5]], ['PERC',[7,9,13]]
];
function renderGroove(){
  const {v,track}=current(),panel=$('groove-panel');
  panel.hidden=v.track!==3||workspaceTab!=='pattern';
  if(panel.hidden)return;
  const length=clamp(track.p[29],1,64),steps=grooveDraft?.steps||track.dstep;
  $('groove-apply').disabled=!grooveDraft;
  $('groove-cancel').disabled=!grooveDraft;
  const summary=grooveDraft?grooveSummary(grooveDraft):null;
  $('groove-meta').textContent=grooveDraft?
    'DRAFT #'+grooveDraft.seed+' · '+summary.kick+' kicks / '+summary.snare+' snares / '+summary.hats+' hats · unchanged until Apply':
    'CURRENT PATTERN · Preview is non-destructive';
  const visual=$('groove-visual');visual.replaceChildren();
  for(const [label,lanes] of grooveRows){
    const row=newEl('div','groove-mini-row');
    row.style.gridTemplateColumns='64px repeat('+length+',minmax(11px,1fr))';
    row.append(newEl('span','groove-row-name',label));
    for(let step=0;step<length;step++){
      const active=lanes.some(lane=>!!(steps[step].on&(1<<lane)));
      const dot=newEl('span','groove-mini-cell'+(active?' on':'')+(step%4===0?' beat':''));
      dot.dataset.step=String(step);dot.dataset.part=label;
      dot.setAttribute('aria-hidden','true');row.append(dot);
    }
    visual.append(row);
  }
}
function cancelGroove(){
  if(grooveDraft){grooveDraft=null;player?.sync();}
  render();status('GROOVE PREVIEW CANCELLED · original drum pattern retained');
}
function previewGroove(next){
  const {v,state}=current();
  if(v.track!==3)return;
  if(next)grooveSeed=(grooveSeed+1)>>>0;
  if(songPlaying)stopSongPlayback();
  mutationDraft=null;melodyDraft=null;sceneDraft=null;songDraft=null;
  grooveDraft=generateDrumGroove({length:state.tracks[3].p[29],
    style:$('groove-style').value,seed:grooveSeed});
  player?.sync();render();
  status('PREVIEW '+grooveDraft.style+' / #'+grooveDraft.seed+' · Apply to save, Cancel to restore');
}
function renderMelody(){
  const {v,track}=current(),panel=$('melody-panel');
  panel.hidden=v.track===3||workspaceTab!=='pattern';
  if(panel.hidden)return;
  const length=clamp(track.p[29],1,64);
  const draft=melodyDraft&&melodyDraft.track===v.track?melodyDraft:null;
  const steps=draft?.steps||track.step;
  const count=melodicIdeaSummary(draft||{steps,events:steps.slice(0,length)
    .map((s,i)=>({step:i,notes:s.notes.slice(0,s.n)}))
    .filter(e=>steps[e.step].time===0&&e.notes.length),length});
  $('melody-apply').disabled=!draft;
  $('melody-cancel').disabled=!draft;
  $('melody-length-hint').textContent='LEN '+length+' · '+Math.ceil(length/16)+' BAR'+(length>16?'S':'');
  $('melody-meta').textContent=draft?
    'DRAFT #'+draft.seed+' · '+count.attacks+' attacks / '+count.notes+' notes · unchanged until Apply':
    'CURRENT PART · '+count.attacks+' attacks · '+(length<64?'Set LEN 64 for all 4 chords':'Four chord bars available');
  const visual=$('melody-visual');visual.replaceChildren();
  for(let base=0;base<length;base+=16){
    const row=newEl('div','melody-mini-row');
    const last=Math.min(base+16,length);
    row.style.gridTemplateColumns='43px repeat('+(last-base)+',minmax(16px,1fr))';
    row.append(newEl('span','groove-row-name',String(base+1).padStart(2,'0')+'–'+String(last).padStart(2,'0')));
    for(let i=base;i<last;i++){
      const step=steps[i],active=step.time===0&&step.n>0;
      const names=active?step.notes.slice(0,step.n).map(noteName).join(' + '):'Rest';
      const dot=newEl('span','melody-mini-cell'+(active?' on':'')+(i%4===0?' beat':''),
        active?String(step.n>1?'▦':'●'):'·');
      dot.title='Step '+(i+1)+': '+names;
      dot.dataset.step=String(i);
      dot.setAttribute('aria-label','Step '+(i+1)+': '+names);
      row.append(dot);
    }
    visual.append(row);
  }
}
function cancelMelody(){
  if(melodyDraft){melodyDraft=null;player?.sync();}
  render();status('MELODIC PREVIEW CANCELLED · original synth notes retained');
}
function previewMelody(next){
  const {v,track}=current();if(v.track===3)return;
  if(next)melodySeed=(melodySeed+1)>>>0;
  const idea=generateMelodicIdea({length:track.p[29],role:$('melody-role').value,
    rhythm:$('melody-rhythm').value,scale:$('melody-scale').value,
    progression:$('melody-progression').value,root:Number($('melody-root').value),
    seed:melodySeed});
  if(songPlaying)stopSongPlayback();
  melodyDraft={...idea,track:v.track};grooveDraft=null;mutationDraft=null;sceneDraft=null;songDraft=null;
  player?.sync();render();
  status('PREVIEW '+idea.role+' / '+idea.scale+' / #'+idea.seed+' · Apply to save');
}
function renderMutation(){
  const {v,track}=current(),length=clamp(track.p[29],1,64);
  const drums=v.track===3,existing=drums?track.dstep:track.step;
  const draft=mutationDraft?.trackIndex===v.track?mutationDraft:null;
  const proposed=draft?.steps||existing;
  const active=(s)=>drums?s.on!==0:s.time===0&&s.n>0;
  const sourceEvents=existing.slice(0,length).filter(active).length;
  $('mutation-preserved').textContent='SOURCE / '+sourceEvents+' STEPS';
  $('mutation-apply').disabled=!draft?.changed;
  $('mutation-cancel').disabled=!draft;
  $('mutation-meta').textContent=draft?
    'DRAFT #'+draft.seed+' · '+draft.original+' → '+draft.after+
      (drums?' HITS':' NOTES')+
      (draft.changed?' · original unchanged until Apply':' · no eligible change — try another focus'):
    sourceEvents?'CURRENT PART · Mutations draw only from this track':
      'EMPTY PART · Write notes/hits or generate a part first';
  const visual=$('mutation-visual');visual.replaceChildren();
  for(let base=0;base<length;base+=16){
    const row=newEl('div','mutation-mini-row');
    const width=Math.min(16,length-base);
    row.style.gridTemplateColumns='42px repeat('+width+',minmax(14px,1fr))';
    row.append(newEl('span','groove-row-name',String(base+1).padStart(2,'0')));
    for(let i=base;i<base+width;i++){
      const before=existing[i],after=proposed[i];
      const changed=JSON.stringify(before)!==JSON.stringify(after)||
        (draft&&draft.micro[i]!==track.micro[i]);
      const present=active(after);
      const label=drums?'drum lanes '+(after.on.toString(2).split('1').length-1):
        after.time===0?after.notes.slice(0,after.n).map(noteName).join('+'):'rest';
      const dot=newEl('span','mutation-mini-cell'+(present?' on':'')+(changed?' changed':'')+(i%4===0?' beat':''),
        changed?'◆':present?'●':'·');
      dot.dataset.step=String(i);dot.title='Step '+(i+1)+': '+label+(changed?' (changed)':'');
      dot.setAttribute('aria-label','Step '+(i+1)+(changed?' changed':'')+': '+label);
      row.append(dot);
    }
    visual.append(row);
  }
}
function cancelMutation(){
  if(mutationDraft){mutationDraft=null;player?.sync();}
  render();status('MUTATION CANCELLED · previous pattern restored');
}
function previewMutation(next){
  const {v,track}=current();
  if(next)mutationSeed=(mutationSeed+1)>>>0;
  const draft=mutateExistingPattern({track,trackIndex:v.track,length:track.p[29],
    mode:$('mutation-mode').value,amount:Number($('mutation-amount').value),seed:mutationSeed});
  if(songPlaying)stopSongPlayback();
  mutationDraft=draft;grooveDraft=null;melodyDraft=null;sceneDraft=null;songDraft=null;
  player?.sync();render();
  status(draft.changed?'PREVIEW '+draft.mode+' / #'+draft.seed+' · original unchanged':
    'NO CHANGE · add source notes/hits or select another mutation focus');
}
function renderScene(){
  const state=session.getState(),draft=sceneDraft;
  $('scene-apply').disabled=!draft;
  $('scene-cancel').disabled=!draft;
  $('scene-meta').textContent=draft?
    'DRAFT #'+draft.seed+' · '+draft.length+' steps / synchronized DIV '+draft.division+
    ' · '+draft.attacks.bass+' bass + '+draft.attacks.arp+' arp attacks · unchanged until Apply':
    'Apply replaces all four scores, matches LEN/DIV and clears old step locks/fills; presets + BPM survive.';
  const rows=$('scene-visual');rows.replaceChildren();
  const length=draft?.length||Number($('scene-length').value);
  for(let base=0;base<length;base+=16){
    const group=newEl('div','scene-bar');
    group.append(newEl('div','scene-bar-head','BAR '+(base/16+1)));
    for(const [k,label] of [[3,'DRUMS'],[0,'BASS'],[1,'CHORDS'],[2,'ARP']]){
      const source=draft?.tracks[k].steps||(k===3?state.tracks[k].dstep:state.tracks[k].step);
      const row=newEl('div','scene-bar-row');row.dataset.track=String(k);
      row.append(newEl('span','scene-row-name',label));
      for(let i=base;i<base+16;i++){
        const s=source[i],active=k===3?s.on!==0:s.time===0&&s.n>0;
        const dot=newEl('span','scene-led'+(active?' on':'')+(i%4===0?' beat':''));
        dot.dataset.step=String(i);dot.dataset.track=String(k);
        dot.setAttribute('aria-label',label+' step '+(i+1)+(active?' active':' empty'));
        row.append(dot);
      }
      group.append(row);
    }
    rows.append(group);
  }
}
function cancelScene(){
  if(sceneDraft){sceneDraft=null;player?.sync();}
  render();status('SCENE PREVIEW CANCELLED · all four original tracks retained');
}
function previewScene(next){
  if(next)sceneSeed=(sceneSeed+1)>>>0;
  try{
    const state=session.getState();
    const draft=generateLinkedScene({
      length:Number($('scene-length').value),division:state.tracks[3].p[30],
      root:Number($('scene-root').value),scale:$('scene-scale').value,
      progression:$('scene-progression').value,groove:$('scene-groove').value,
      feel:$('scene-feel').value,seed:sceneSeed
    });
    if(songPlaying)stopSongPlayback();
    sceneDraft=draft;grooveDraft=null;melodyDraft=null;mutationDraft=null;songDraft=null;
    player?.sync();render();
    status('LINKED SCENE #'+sceneSeed+' · bass follows kick, arp follows hats · Apply to save');
  }catch(e){status('Scene error: '+e.message);}
}
function stopSongPlayback(){
  if(!songPlaying)return;
  songPlaying=false;songActive=-1;songCycle=-1;playing=false;
  player?.play(false);player?.panic();player?.clearArrangement();
  player?.sync();
  renderSong();
}
function onSongTransport(transport){
  if(!songPlaying||!songDraft||!Number.isInteger(transport.sectionIndex))return;
  if(transport.sectionIndex===songCycle)return;
  songCycle=transport.sectionIndex;
  let cycle=transport.sectionIndex,selected=0;
  for(const section of songDraft.sections){
    const loops=section.repeats??1;
    if(cycle<loops)break;
    cycle-=loops;selected++;
  }
  songActive=Math.min(selected,songDraft.sections.length-1);
  updateSongTransportLabel();
}
function updateSongTransportLabel(){
  const el=$('song-now');if(!el)return;
  el.textContent=songPlaying&&songDraft?
    'PLAYING '+(songActive+1)+' / '+songDraft.sections.length+
    ' · '+songDraft.sections[songActive]?.title+' · Live SLOOP / sections loop':
    songDraft?'SELECTED '+songDraft.sections[songIndex]?.title+
      ' · Press ▶ Play to loop this section, or PLAY SONG for the whole form':
    'Generate a song. Your current four-track pattern is preserved until Apply Section.';
  for(const btn of $('song-timeline').querySelectorAll('button[data-song-section]'))
    btn.classList.toggle('playing',songPlaying&&Number(btn.dataset.songSection)===songActive);
}
function renderSong(){
  $('song-editbar').hidden=!songDraft;
  for(const id of ['song-play','song-apply','song-export','song-cancel','song-next'])
    $(id).hidden=!songDraft;
  $('song-play').disabled=!songDraft;
  $('song-apply').disabled=!songDraft;
  $('song-export').disabled=!songDraft;
  $('song-cancel').disabled=!songDraft;
  $('song-next').disabled=!songDraft;
  $('song-play').textContent=songPlaying?'■ STOP SONG':'▶ PLAY SONG';
  $('song-chip').textContent=songDraft?
    songDraft.totalBars+' BARS · '+songDraft.sections.length+' SECTIONS':'MULTI-SCENE';
  const timeline=$('song-timeline');timeline.replaceChildren();
  if(songDraft){
    songDraft.sections.forEach((section,i)=>{
      const btn=newEl('button','song-section'+(i===songIndex?' selected':''));
      btn.dataset.songSection=String(i);
      btn.setAttribute('aria-pressed',String(i===songIndex));
      btn.append(newEl('small','song-section-num',String(i+1).padStart(2,'0')),
        newEl('strong','song-section-title',section.title),
        newEl('span','song-section-sub',section.subtitle),
        newEl('span','song-section-bars',((section.repeats??1)*4)+' BARS · '+section.scene.attacks.drums+' drum steps'+(section.locked?' · LOCKED':'')));
      btn.addEventListener('click',()=>{
        if(songPlaying)stopSongPlayback();
        songIndex=i;player?.sync();renderSong();
        status('SONG SECTION '+section.title+' / audition through original SLOOP engine');
      });
      timeline.append(btn);
    });
  }
  const controls=['song-repeats','song-left','song-right','song-duplicate',
    'song-delete','song-lock','song-regen','song-edit-undo','song-edit-redo'];
  for(const id of controls)$(id).disabled=!songDraft;
  if(songDraft){
    const sec=songDraft.sections[songIndex];
    $('song-repeats').value=String(sec.repeats??1);
    $('song-left').disabled=songIndex===0;
    $('song-right').disabled=songIndex===songDraft.sections.length-1;
    $('song-duplicate').disabled=songDraft.sections.length>=16;
    $('song-delete').disabled=songDraft.sections.length<=1;
    $('song-regen').disabled=Boolean(sec.locked);
    $('song-lock').textContent=sec.locked?'UNLOCK':'LOCK';
    $('song-lock').setAttribute('aria-pressed',String(Boolean(sec.locked)));
    $('song-edit-undo').disabled=!songSession?.history().undo;
    $('song-edit-redo').disabled=!songSession?.history().redo;
  }
  updateSongTransportLabel();
}
function cancelSong(){
  if(songPlaying)stopSongPlayback();
  if(songDraft){songDraft=null;songSession=null;songIndex=0;player?.sync();}
  render();status('ARRANGEMENT PREVIEW CANCELLED · original editor retained');
}
function previewSong(next){
  if(next)songSeed=(songSeed+1)>>>0;
  try{
    if(songPlaying)stopSongPlayback();
    const state=session.getState();
    songDraft=generateSongArrangement({form:$('song-form').value,
      root:Number($('song-root').value),scale:$('song-scale').value,
      progression:$('song-progression').value,groove:$('song-groove').value,
      division:state.tracks[3].p[30],seed:songSeed});
    songSession=createSongArrangementSession(songDraft);
    songIndex=0;songActive=-1;
    grooveDraft=null;melodyDraft=null;mutationDraft=null;sceneDraft=null;
    player?.sync();render();
    status('SONG #'+songSeed+' · '+songDraft.sections.length+' sections · source untouched');
  }catch(e){status('Song arrangement error: '+e.message);}
}
async function playSong(){
  if(songPlaying){stopSongPlayback();status('SONG STOPPED · original notes retained');return;}
  if(!songDraft)return;
  try{
    await ensureAudio();
    const source=session.getState(),states=arrangementPlaybackStates(songDraft,source);
    player.arrange(states);player.play(true);
    songPlaying=true;songActive=0;songCycle=0;playing=true;
    renderSong();status('PLAYING SONG · SLOOP audio-thread transitions');
  }catch(e){status('Song playback error: '+e.message);}
}
function applySongSection(){
  if(!songDraft)return;
  if(songPlaying)stopSongPlayback();
  const chosen=songDraft.sections[songIndex].scene;
  try{
    const edited=session.dispatch({type:'applyLinkedScene',track:0,length:64,
      division:chosen.division,tracks:chosen.tracks});
    if(edited){
      const v=session.getView();
      if(v.step>=64)session.select(v.track,63);
      // Applying a song section is an edit action. Take the user straight
      // to its native STEP/ROLL score instead of leaving them on the song form.
      selectWorkspace('pattern');
      status('APPLIED '+songDraft.sections[songIndex].title+
        ' TO EDITOR · original presets retained · one Undo');
    }
  }catch(e){status('Apply failed: '+e.message);}
}
function editSong(command){
  if(!songSession||!songDraft)return;
  try{
    if(songPlaying)stopSongPlayback();
    const beforeId=songDraft.sections[songIndex].id;
    if(!songSession.dispatch({...command,index:songIndex}))return;
    songDraft=songSession.get();
    if(command.type==='move')songIndex=Math.max(0,Math.min(songDraft.sections.length-1,
      songIndex+command.direction));
    else if(command.type==='duplicate')songIndex++;
    else if(command.type==='remove')
      songIndex=Math.min(songIndex,songDraft.sections.length-1);
    else songIndex=Math.max(0,songDraft.sections.findIndex(s=>s.id===beforeId));
    songActive=-1;
    player?.sync();renderSong();
    status('SONG EDIT '+command.type.toUpperCase()+' · '+songDraft.totalBars+' bars · undo available');
  }catch(e){status('Song edit: '+e.message);}
}
function evolveUnlockedSong(){
  if(!songSession||!songDraft)return;
  try{
    if(songPlaying)stopSongPlayback();
    const index=songIndex,id=songDraft.sections[index].id;
    if(songSession.dispatch({type:'evolve'})){
      songDraft=songSession.get();songSeed=songDraft.seed;
      songIndex=Math.max(0,songDraft.sections.findIndex(s=>s.id===id));
      player?.sync();renderSong();
      status('EVOLVED UNLOCKED SECTIONS · locked musical ideas preserved · Song Undo available');
    }else status('ALL SECTIONS LOCKED · unlock one to evolve');
  }catch(e){status('Song evolve: '+e.message);}
}
function songHistory(direction){
  if(!songSession)return;
  if(songPlaying)stopSongPlayback();
  const id=songDraft.sections[songIndex]?.id;
  if(songSession[direction]()){
    songDraft=songSession.get();
    const found=songDraft.sections.findIndex(s=>s.id===id);
    songIndex=found>=0?found:Math.min(songIndex,songDraft.sections.length-1);
    player?.sync();renderSong();
    status('SONG '+direction.toUpperCase()+' · arrangement updated');
  }
}
function exportSong(){
  if(!songDraft)return;
  const data=JSON.stringify(songDraft,null,2);
  const url=URL.createObjectURL(new Blob([data],{type:'application/json'}));
  const a=document.createElement('a');
  a.href=url;a.download='brkloop-song-'+songDraft.form.toLowerCase()+'-'+songDraft.seed+'.json';
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  status('EXPORTED '+songDraft.sections.length+' linked sections · BRKLOOP_ARRANGEMENT_V1');
}
function renderToolDrawer(){
  const drum=current().v.track===3;
  if(activeTool==='groove'&&!drum)activeTool=null;
  if(activeTool==='melody'&&drum)activeTool=null;
  const labels={
    groove:'Drum pattern',melody:'Note pattern',
    mutation:'Edit existing material',scene:'Four-track sketch'
  };
  $('tool-workbench-title').textContent=activeTool?labels[activeTool]:'Make something from this pattern';
  $('tool-context').textContent=activeTool?'Tap the selected tool again to close':'Choose one tool when you need it';
  $('tool-groove').hidden=!drum;
  $('tool-melody').hidden=drum;
  const showing=Boolean(activeTool);
  $('tool-content').hidden=!showing;
  for(const id of ['groove','melody','mutation','scene']){
    const pressed=activeTool===id;
    const control=$('tool-'+id);
    control.setAttribute('aria-pressed',String(pressed));
    control.setAttribute('aria-expanded',String(pressed));
    $(id+'-panel').hidden=!pressed;
  }
}
function selectWorkspace(tab){
  if(!['pattern','song','sound'].includes(tab))return;
  if(tab===workspaceTab)return;
  if(songPlaying)stopSongPlayback();
  if(tab!=='pattern'&&(grooveDraft||melodyDraft||mutationDraft||sceneDraft)){
    grooveDraft=null;melodyDraft=null;mutationDraft=null;sceneDraft=null;
  }
  workspaceTab=tab;
  // Keep the MIDI keyboard opt-in on touch screens; its sticky piano was
  // occupying a large portion of the pattern and sound editor viewport.
  keyboardVisible=!compactScreen && (tab==='sound'||(tab==='pattern'&&current().v.mode==='step'));
  player?.sync();
  render();
}
function render(){
  const {v,track}=current();
  const sound=workspaceTab==='sound',song=workspaceTab==='song',pattern=workspaceTab==='pattern';
  $('workspace').classList.toggle('sound-open',sound);
  $('workspace').classList.toggle('song-open',song);
  document.querySelector('.shell').dataset.track=String(v.track);
  $('workspace-title').textContent=pattern?'Pattern':song?'Song':'Sound';
  $('pattern-panel').hidden=!pattern;$('song-workspace').hidden=!song;
  $('sound-panel').hidden=!sound;$('inspector').hidden=!pattern;
  $('tracks').hidden=song;$('keyboard-area').hidden=song;
  for(const tab of ['pattern','song','sound'])
    $(tab+'-tab').setAttribute('aria-pressed',String(workspaceTab===tab));
  // The global buttons edit one native pattern; hide them in Song to avoid
  // offering two different Play / Undo interfaces at once.
  for(const id of ['play','stop','undo','redo'])$(id).hidden=song;
  $('sound-name').textContent=v.track===3?bank.kits[track.p[bank.pe0]]:
    (bank.engines[track.engine]?.name+' / '+bank.engines[track.engine]?.presets[track.preset]?.name);
  if(!song)renderTracks();
  if(sound)renderSound();
  else if(song)renderSong();
  else{
    renderOptions();
    if(v.mode==='step')renderStep();else renderRoll();
    renderInspector();
    renderQuickSound();
    // Only the selected tool is rendered. Hidden generators no longer
    // repeatedly create 64-step / multi-track DOM grids on every key press.
    if(activeTool==='groove')renderGroove();
    else if(activeTool==='melody')renderMelody();
    else if(activeTool==='mutation')renderMutation();
    else if(activeTool==='scene')renderScene();
    renderToolDrawer();
  }
  $('bpm').value=String(current().state.g[0]);
  $('swing').value=String(current().state.g[1]);
  $('keyboard').hidden=!keyboardVisible;
  $('keyboard-area').classList.toggle('keys-collapsed',!keyboardVisible);
  $('toggle-keyboard').textContent=keyboardVisible?'HIDE KEYS':'SHOW KEYS';
  $('toggle-keyboard').setAttribute('aria-pressed',String(keyboardVisible));
  renderKeyboard();
  const history=session.history();
  $('undo').disabled=history.undo===0;$('redo').disabled=history.redo===0;
}
const initial=session.getView();session.select(initial.track,0);render();
drawScope();
attachEnvelopeEditor();
for(const button of document.querySelectorAll('[data-sound-jump]')){
  button.addEventListener('click',()=>{
    const page=button.dataset.soundJump;
    if(page==='filter'){
      soundPage='tone';
      $('tone-extras').open=true;
    }else soundPage=page;
    renderSound();
    $('sound-pages').scrollIntoView({block:'nearest'});
  });
}
$('sound-audition').addEventListener('click',async()=>{
  const {v,track}=current();
  try{
    await ensureAudio();
    if(v.track===3){
      player.hit(track.p[bank.pe0],0,112);
      status('AUDITION · NATIVE KIT / KICK');
    }else{
      // The original FM-1 panel applies its transpose to a played key.
      // Start from middle C5 so factory patches such as WOBBLE (-24) sound
      // in an audible bass register while preserving their pitch settings.
      const pitch=panelAuditionPitch(72,track.p);
      player.note(v.track,pitch,true);
      setTimeout(()=>player?.note(v.track,pitch,false),650);
      status('AUDITION · '+noteName(pitch)+' / '+bank.engines[track.engine].name);
    }
  }catch(e){status(e.message);}
});
$('quick-sound-open').addEventListener('click',()=>selectWorkspace('sound'));
$('quick-sound-preset').addEventListener('change',e=>{
  const {v,track}=current(),index=Number(e.target.value);
  if(v.track===3)commit({type:'setTrackParam',track:3,param:bank.pe0,value:index});
  else{
    const preset=bank.engines[track.engine].presets[index];
    commit({type:'setFactorySound',track:v.track,engine:track.engine,preset:index,
      p:preset.p,fm6:preset.fm6});
  }
});
$('sound-pages').addEventListener('click',event=>{
  const button=event.target.closest('button[data-sound-page]');
  if(!button||button.hidden)return;
  soundPage=button.dataset.soundPage;renderSound();
});
$('sound-search').addEventListener('input',()=>{if(soundPage==='advanced')renderSound();});

for(const [id,param] of [['bpm',0],['swing',1]]){
  $(id).addEventListener('change',e=>{
    const d=bank.globalControls[param];
    const value=clamp(Number(e.target.value)||d.def,d.min,d.max);
    commit({type:'setGlobalParam',track:current().v.track,param,value});
  });
}
$('song-left').addEventListener('click',()=>editSong({type:'move',direction:-1}));
$('song-right').addEventListener('click',()=>editSong({type:'move',direction:1}));
$('song-duplicate').addEventListener('click',()=>editSong({type:'duplicate'}));
$('song-delete').addEventListener('click',()=>editSong({type:'remove'}));
$('song-lock').addEventListener('click',()=>editSong({type:'lock'}));
$('song-regen').addEventListener('click',()=>editSong({type:'regenerate'}));
$('song-repeats').addEventListener('change',()=>editSong({type:'repeats',value:Number($('song-repeats').value)}));
$('song-edit-undo').addEventListener('click',()=>songHistory('undo'));
$('song-edit-redo').addEventListener('click',()=>songHistory('redo'));
$('song-generate').addEventListener('click',()=>previewSong(false));
$('song-next').addEventListener('click',evolveUnlockedSong);
$('song-cancel').addEventListener('click',cancelSong);
$('song-apply').addEventListener('click',applySongSection);
$('song-play').addEventListener('click',()=>void playSong());
$('song-export').addEventListener('click',exportSong);
for(const id of ['song-form','song-root','song-scale','song-progression','song-groove'])
  $(id).addEventListener('change',cancelSong);
$('scene-preview').addEventListener('click',()=>previewScene(false));
$('scene-next').addEventListener('click',()=>previewScene(true));
$('scene-apply').addEventListener('click',()=>{
  if(!sceneDraft)return;
  const draft=sceneDraft,v=session.getView();
  if(commit({type:'applyLinkedScene',track:0,length:draft.length,division:draft.division,tracks:draft.tracks})){
    session.select(v.track,Math.min(v.step,draft.length-1));
    render();
    status('SCENE APPLIED / '+draft.length+' STEPS / #'+draft.seed+' · one Undo for four tracks');
  }
});
$('scene-cancel').addEventListener('click',cancelScene);
for(const id of ['scene-root','scene-scale','scene-progression','scene-groove','scene-feel','scene-length'])
  $(id).addEventListener('change',cancelScene);
$('groove-preview').addEventListener('click',()=>previewGroove(false));
$('groove-next').addEventListener('click',()=>previewGroove(true));
$('groove-apply').addEventListener('click',()=>{
  if(!grooveDraft||current().v.track!==3)return;
  const draft=grooveDraft;
  if(commit({type:'replaceDrumGroove',track:3,length:draft.length,steps:draft.steps}))
    status('APPLIED '+draft.style+' / seed '+draft.seed+' · one Undo step');
});
$('groove-cancel').addEventListener('click',()=>cancelGroove());
$('groove-style').addEventListener('change',()=>cancelGroove());
$('melody-preview').addEventListener('click',()=>previewMelody(false));
$('melody-next').addEventListener('click',()=>previewMelody(true));
$('melody-apply').addEventListener('click',()=>{
  if(!melodyDraft||current().v.track!==melodyDraft.track)return;
  const draft=melodyDraft;
  if(commit({type:'replaceMelodicIdea',track:draft.track,length:draft.length,steps:draft.steps}))
    status('APPLIED '+draft.role+' / seed '+draft.seed+' · one Undo step');
});
$('melody-cancel').addEventListener('click',()=>cancelMelody());
for(const id of ['melody-role','melody-root','melody-scale','melody-progression','melody-rhythm'])
  $(id).addEventListener('change',()=>cancelMelody());
$('mutation-preview').addEventListener('click',()=>previewMutation(false));
$('mutation-next').addEventListener('click',()=>previewMutation(true));
$('mutation-apply').addEventListener('click',()=>{
  if(!mutationDraft||!mutationDraft.changed||current().v.track!==mutationDraft.trackIndex)return;
  const draft=mutationDraft;
  if(commit({type:'applyPatternMutation',track:draft.trackIndex,length:draft.length,
    steps:draft.steps,micro:draft.micro}))
    status('MUTATION APPLIED · '+draft.mode+' / #'+draft.seed+' · one Undo');
});
$('mutation-cancel').addEventListener('click',()=>cancelMutation());
$('mutation-mode').addEventListener('change',()=>cancelMutation());
$('mutation-amount').addEventListener('input',()=>{
  $('mutation-amount-value').textContent=$('mutation-amount').value+'%';
  // Avoid rebuilding a range control while a finger is dragging it.
  if(mutationDraft){mutationDraft=null;player?.sync();}
  // Rebuild the diff only: leave the moving range input attached to the DOM.
  renderMutation();
  $('mutation-meta').textContent='Settings changed · press PREVIEW MUTATION again';
});
for(const id of ['groove','melody','mutation','scene']){
  $('tool-'+id).addEventListener('click',()=>{
    if(activeTool!==id && (grooveDraft||melodyDraft||mutationDraft||sceneDraft)){
      grooveDraft=null;melodyDraft=null;mutationDraft=null;sceneDraft=null;
      player?.sync();
    }
    activeTool=activeTool===id?null:id;
    if(!activeTool){
      grooveDraft=null;melodyDraft=null;mutationDraft=null;sceneDraft=null;
      player?.sync();
    }
    render();
    if(activeTool)$('tool-content').scrollIntoView({block:'nearest',behavior:'instant'});
  });
}
$('pattern-tab').addEventListener('click',()=>selectWorkspace('pattern'));
$('song-tab').addEventListener('click',()=>selectWorkspace('song'));
$('sound-tab').addEventListener('click',()=>selectWorkspace('sound'));
$('toggle-keyboard').addEventListener('click',()=>{keyboardVisible=!keyboardVisible;render();});
$('quick-erase').addEventListener('click',eraseSelected);
$('roll-down').addEventListener('click',()=>{rollOctave=clamp(rollOctave-1,1,8);render();});
$('roll-up').addEventListener('click',()=>{rollOctave=clamp(rollOctave+1,1,8);render();});
for(const mode of ['step','roll'])$(mode+'-mode').addEventListener('click',()=>{
  const from=$('grid').querySelector('.roll-scroll');
  if(from)rollScroll={left:from.scrollLeft,top:from.scrollTop};
  modeForTrack[current().v.track]=mode;
  session.setMode(mode);
  keyboardVisible=mode==='step';
  render();
});
$('engine-select').addEventListener('change',e=>{
  const {v}=current(),engine=Number(e.target.value),preset=bank.engines[engine].presets[0];
  commit({type:'setFactorySound',track:v.track,engine,preset:0,p:preset.p,fm6:preset.fm6});
});
$('preset-select').addEventListener('change',e=>{
  const {v,track}=current(),index=Number(e.target.value),preset=bank.engines[track.engine].presets[index];
  commit({type:'setFactorySound',track:v.track,engine:track.engine,preset:index,p:preset.p,fm6:preset.fm6});
});
$('kit-select').addEventListener('change',e=>{
  const {v}=current();commit({type:'setTrackParam',track:v.track,param:bank.pe0,value:Number(e.target.value)});
});
$('all-params').addEventListener('toggle',()=>{if(workspaceTab==='sound'&&soundPage==='advanced')renderSound();});
$('all-globals').addEventListener('toggle',()=>{if(workspaceTab==='sound'&&soundPage==='advanced')renderSound();});
$('length').addEventListener('change',e=>{
  const {v}=current(),length=clamp(Number(e.target.value)||16,1,64);
  if(commit({type:'setLength',track:v.track,length})){
    if(v.step>=length)session.select(v.track,length-1);
    render();
  }
});
$('division').addEventListener('change',e=>commit({type:'setDivision',track:current().v.track,division:Number(e.target.value)}));
$('auto').addEventListener('change',e=>{auto=e.target.checked;render();});
$('undo').addEventListener('click',()=>{if(songPlaying)stopSongPlayback();grooveDraft=null;melodyDraft=null;mutationDraft=null;sceneDraft=null;songDraft=null;session.undo();render();player?.sync();});
$('redo').addEventListener('click',()=>{if(songPlaying)stopSongPlayback();grooveDraft=null;melodyDraft=null;mutationDraft=null;sceneDraft=null;songDraft=null;session.redo();render();player?.sync();});
$('clear').addEventListener('click',eraseSelected);
$('rest').addEventListener('click',()=>{const {v}=current();if(v.track!==3)commit({type:'setGate',track:v.track,step:v.step,gate:2});});
$('tie').addEventListener('click',()=>{const {v}=current();if(v.track!==3)commit({type:'setGate',track:v.track,step:v.step,gate:1});});
$('velocity').addEventListener('change',e=>{const {v}=current();if(v.track!==3)commit({type:'setVelocity',track:v.track,step:v.step,value:Number(e.target.value)});});
$('oct-down').addEventListener('click',()=>{octave=clamp(octave-1,1,7);renderKeyboard();});
$('oct-up').addEventListener('click',()=>{octave=clamp(octave+1,1,7);renderKeyboard();});
$('chord').addEventListener('click',()=>{
  chord=!chord;
  const {v,track}=current(),s=track.step[v.step];
  chordNotes=chord&&s.time===0?s.notes.slice(0,s.n):[];
  renderKeyboard();
});
$('chord-done').addEventListener('click',()=>{
  if(chordNotes.length){const {v}=current();if(commit({type:'writeChord',track:v.track,step:v.step,notes:[...chordNotes]}))advance();}
  chord=false;chordNotes=[];render();
});
$('chord-cancel').addEventListener('click',()=>{chord=false;chordNotes=[];render();});
$('play').addEventListener('click',async()=>{
  try{
    if(songPlaying)stopSongPlayback();
    await ensureAudio();player.play(true);playing=true;status('PLAYING / SLOOP WASM');
  }catch(e){status(e.message);}
});
$('stop').addEventListener('click',()=>{if(songPlaying)stopSongPlayback();player?.play(false);player?.panic();playing=false;status('STOPPED');});
