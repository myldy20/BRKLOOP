// SPDX-License-Identifier: GPL-3.0-only
// RESEARCH ONLY. Native SLOOP state, shared Step/Roll command session, no app.js changes.
import {createResearchEditSession} from '../shared-edit-commands.mjs';
import {LocalPreview} from '../../web/preview.js';
import {panelAuditionPitch} from './panel-pitch.mjs';
import {generateDrumGroove, grooveSummary} from '../groove-tools.mjs';
import {generateMelodicIdea,melodicIdeaSummary} from '../melodic-ideas.mjs';
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
let grooveDraft=null,grooveSeed=1,melodyDraft=null,melodySeed=1;
const modeForTrack=['step','step','step','step'];
let octave=3,rollOctave=3,selectedPitch=48,drumLane=0,auto=false,chord=false,chordNotes=[],player=null,playing=false;
let workspaceTab='pattern',keyboardVisible=true,rollScroll={left:0,top:0};
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
  return state;
}
function current(){const v=session.getView(),state=session.getState();return {v,state,track:state.tracks[v.track]};}
function status(message){$('status').textContent=message;}
function commit(cmd){
  try{
    const edited=session.dispatch(cmd);
    if(edited){grooveDraft=null;melodyDraft=null;player?.sync();}
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

async function ensureAudio(){
  if(!player)player=new LocalPreview(soundState,e=>status(e.message));
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
      if(k!==v.track&&(grooveDraft||melodyDraft)){grooveDraft=null;melodyDraft=null;player?.sync();}
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
  const writeParam=(id,value,final)=>{
    if(final){
      if(session.finishGesture()){player?.sync();render();}
      else if(current().track.p[id]!==value)commit({type:'setTrackParam',track:v.track,param:id,value});
    }else{
      session.preview({type:'setTrackParam',track:v.track,param:id,value});
      player?.trackParam(v.track,id,value);
    }
  };
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
      soundControl($('sound-macros'),c,track.p[id],(value,final)=>writeParam(id,value,final),c.label,id);
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
  melodyDraft={...idea,track:v.track};grooveDraft=null;
  player?.sync();render();
  status('PREVIEW '+idea.role+' / '+idea.scale+' / #'+idea.seed+' · Apply to save');
}
function selectWorkspace(tab){
  if(tab!=='pattern'&&tab!=='sound')return;
  if(tab!=='pattern'&&(grooveDraft||melodyDraft)){grooveDraft=null;melodyDraft=null;player?.sync();}
  workspaceTab=tab;
  // A keyboard in Sound is an audition tool; a hidden keyboard in Roll frees
  // vertical screen space so musicians never scroll back to Draw/Erase.
  keyboardVisible=tab==='sound'||current().v.mode==='step';
  render();
}
function render(){
  const {v,track}=current();
  const sound=workspaceTab==='sound';
  $('workspace').classList.toggle('sound-open',sound);
  document.querySelector('.shell').dataset.track=String(v.track);
  $('pattern-panel').hidden=sound;$('sound-panel').hidden=!sound;$('inspector').hidden=sound;
  $('pattern-tab').setAttribute('aria-pressed',String(!sound));
  $('sound-tab').setAttribute('aria-pressed',String(sound));
  $('sound-name').textContent=v.track===3?bank.kits[track.p[bank.pe0]]:
    (bank.engines[track.engine]?.name+' / '+bank.engines[track.engine]?.presets[track.preset]?.name);
  renderTracks();
  if(sound)renderSound();
  else{
    renderOptions();
    if(v.mode==='step')renderStep();else renderRoll();
    renderInspector();
    renderGroove();
    renderMelody();
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
$('pattern-tab').addEventListener('click',()=>selectWorkspace('pattern'));
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
$('undo').addEventListener('click',()=>{grooveDraft=null;melodyDraft=null;session.undo();render();player?.sync();});
$('redo').addEventListener('click',()=>{grooveDraft=null;melodyDraft=null;session.redo();render();player?.sync();});
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
    await ensureAudio();player.play(true);playing=true;status('PLAYING / SLOOP WASM');
  }catch(e){status(e.message);}
});
$('stop').addEventListener('click',()=>{player?.play(false);player?.panic();playing=false;status('STOPPED');});
