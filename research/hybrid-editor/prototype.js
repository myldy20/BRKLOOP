// SPDX-License-Identifier: GPL-3.0-only
// RESEARCH ONLY. Native SLOOP state, shared Step/Roll command session, no app.js changes.
import {createResearchEditSession} from '../shared-edit-commands.mjs';
import {LocalPreview} from '../../web/preview.js';
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
const modeForTrack=['step','step','step','step'];
let octave=3,rollOctave=3,selectedPitch=48,drumLane=0,auto=false,chord=false,chordNotes=[],player=null,playing=false;
let workspaceTab='pattern',keyboardVisible=true,rollScroll={left:0,top:0};
function soundState(){return session.getState();}
function current(){const v=session.getView(),state=session.getState();return {v,state,track:state.tracks[v.track]};}
function status(message){$('status').textContent=message;}
function commit(cmd){
  try{
    const edited=session.dispatch(cmd);
    if(edited)player?.sync();
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
    void audition(note,v.track);
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
  $('chord-preview').textContent=chord?'CHORD: '+(chordNotes.map(noteName).join(' + ')||'tap notes, then Done'):workspaceTab==='sound'?'Tap keys to audition the current sound.':'Tap keys to write selected step, or tap an empty step to stamp highlighted pitch.';
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
function soundControl(container,descriptor,value,command,displayName){
  if(!descriptor || descriptor.max<=descriptor.min || descriptor.label==='-')return;
  const parent=newEl('label','sound-control');
  const top=newEl('span','control-title'),name=newEl('span','',displayName||descriptor.label);
  const out=newEl('output','',String(value));
  top.append(name,out);parent.append(top);
  const values=descriptor.names||[];
  const named=values.length>0 && values.length===descriptor.max-descriptor.min+1 && values.length<=128;
  if(named){
    const select=newEl('select');
    optionList(select,values,value-descriptor.min);
    out.textContent=values[value-descriptor.min]||String(value);
    select.addEventListener('change',()=>command(descriptor.min+Number(select.value)));
    parent.append(select);
  }else{
    const range=newEl('input');
    range.type='range';range.min=String(descriptor.min);range.max=String(descriptor.max);
    range.step='1';range.value=String(value);
    range.addEventListener('input',()=>{out.textContent=range.value;});
    range.addEventListener('change',()=>command(Number(range.value)));
    parent.append(range);
  }
  container.append(parent);
}
function renderSound(){
  const {v,track}=current(),drums=v.track===3;
  $('sound-title').textContent=drums?'Drum kit & effects':bank.engines[track.engine].name+' · '+(bank.engines[track.engine].presets[track.preset]?.name||'Custom');
  $('engine-wrap').hidden=drums;$('preset-wrap').hidden=drums;$('kit-wrap').hidden=!drums;
  $('sound-macros').replaceChildren();$('sound-shape').replaceChildren();$('sound-fx').replaceChildren();
  $('sound-advanced-controls').replaceChildren();$('sound-global-controls').replaceChildren();
  const writeParam=(id,value)=>commit({type:'setTrackParam',track:v.track,param:id,value});
  const common=bank.trackControls;
  if(!drums){
    optionList($('engine-select'),bank.engines.map(x=>x.name),track.engine);
    optionList($('preset-select'),bank.engines[track.engine].presets.map(x=>x.name),track.preset);
    bank.engines[track.engine].controls.forEach((c,i)=>{
      const index=bank.pe0+i;
      soundControl($('sound-macros'),c,track.p[index],value=>writeParam(index,value),c.label);
    });
  }else{
    optionList($('kit-select'),bank.kits.slice(0,37),clamp(track.p[bank.pe0],0,36));
    $('sound-macros').append(newEl('p','hint','16 SLOOP drum lanes · select a kit and play the pads below.'));
  }
  const shape=drums?[0,39,50]:track.engine===9?[0,28,39,50]:[0,28,39,1,2,3,4,50];
  for(const id of shape)soundControl($('sound-shape'),common[id],track.p[id],v=>writeParam(id,v));
  if(track.engine===9 && !drums)
    $('sound-shape').append(newEl('p','hint','FM6 envelopes are stored in its separate operator patch.'));
  // Source-native LFO destinations and note transpose are part of factory presets.
  $('sound-lfo').replaceChildren();
  for(const id of [9,10,11,12,13,14,15,16,60,61,62])
    soundControl($('sound-lfo'),common[id],track.p[id],value=>writeParam(id,value),
      String(id).padStart(2,'0')+' / '+common[id].label);
  for(const id of [34,35,36,53,54,55,56,57])
    soundControl($('sound-fx'),common[id],track.p[id],v=>writeParam(id,v));
  if($('all-params').open)for(const d of common)
    soundControl($('sound-advanced-controls'),d,track.p[d.id],v=>writeParam(d.id,v),
      String(d.id).padStart(2,'0')+' / '+d.label);
  if($('all-globals').open)for(const d of bank.globalControls)
    soundControl($('sound-global-controls'),d,current().state.g[d.id],v=>commit({type:'setGlobalParam',track:v.track,param:d.id,value:v}),
      String(d.id).padStart(2,'0')+' / '+d.label);
  $('param-count').textContent=String(bank.trackControls.length);
  $('global-count').textContent=String(bank.globalControls.length);
}
function selectWorkspace(tab){
  if(tab!=='pattern'&&tab!=='sound')return;
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
for(const [id,param] of [['bpm',0],['swing',1]]){
  $(id).addEventListener('change',e=>{
    const d=bank.globalControls[param];
    const value=clamp(Number(e.target.value)||d.def,d.min,d.max);
    commit({type:'setGlobalParam',track:current().v.track,param,value});
  });
}
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
$('all-params').addEventListener('toggle',()=>{if(workspaceTab==='sound'&&$('all-params').open)renderSound();});
$('all-globals').addEventListener('toggle',()=>{if(workspaceTab==='sound'&&$('all-globals').open)renderSound();});
$('length').addEventListener('change',e=>{
  const {v}=current(),length=clamp(Number(e.target.value)||16,1,64);
  if(commit({type:'setLength',track:v.track,length})){
    if(v.step>=length)session.select(v.track,length-1);
    render();
  }
});
$('division').addEventListener('change',e=>commit({type:'setDivision',track:current().v.track,division:Number(e.target.value)}));
$('auto').addEventListener('change',e=>{auto=e.target.checked;render();});
$('undo').addEventListener('click',()=>{session.undo();render();player?.sync();});
$('redo').addEventListener('click',()=>{session.redo();render();player?.sync();});
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
