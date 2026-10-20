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
const bank=await fetch('../../bank.json').then(r=>{
  if(!r.ok)throw Error('SLOOP factory bank not present. Run original bank builder.');
  return r.json();
});
if(bank.format!=='BRKLOOP_BANK_V1')throw Error('Expected SLOOP V1 baseline');
// Prototype starts with a blank score (factory sounds remain unchanged).
const seed=structuredClone(bank.baseline);
for(const t of seed.tracks){
  t.step?.forEach(s=>{s.n=0;s.time=2;s.flags=0;s.notes=[0,0,0,0];});
  t.dstep?.forEach(s=>{s.on=0;s.lvl.fill(0);s.rat.fill(0);});
  t.micro.fill(0);t.fill.fill(0);t.locks=[];
}
const session=createResearchEditSession(seed);
const modeForTrack=['step','step','step','step'];
let tool='select',octave=3,selectedPitch=60,drumLane=0,auto=false,chord=false,chordNotes=[],player=null,playing=false;
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
function midiKey(note){
  selectedPitch=note;
  const {v}=current();
  if(v.track===3)return;
  if(chord){
    if(chordNotes.includes(note))chordNotes=chordNotes.filter(n=>n!==note);
    else if(chordNotes.length<4)chordNotes.push(note);
    else{status('SLOOP allows four notes per step');renderKeyboard();return;}
    renderKeyboard();return;
  }
  if(commit({type:'writeNote',track:v.track,step:v.step,note}))advance();
  if(player){
    player.note(v.track,note,true);
    setTimeout(()=>player?.note(v.track,note,false),150);
  }
}
function drawAt(step,pitchOrLane){
  const {v,track}=current();
  session.select(v.track,step);
  if(tool==='select'){selectedPitch=pitchOrLane??selectedPitch;render();return;}
  if(v.track===3){
    drumLane=pitchOrLane??drumLane;
    if(tool==='draw'&&!(track.dstep[step].on&(1<<drumLane)))
      commit({type:'toggleDrumHit',track:v.track,step,lane:drumLane});
    else if(tool==='erase'&&(track.dstep[step].on&(1<<drumLane)))
      commit({type:'toggleDrumHit',track:v.track,step,lane:drumLane});
    else render();
  }else if(tool==='draw'){
    selectedPitch=pitchOrLane??selectedPitch;
    commit({type:'addNote',track:v.track,step,note:selectedPitch});
  }else {
    selectedPitch=pitchOrLane??selectedPitch;
    if(pitchOrLane!=null)commit({type:'removeNote',track:v.track,step,note:pitchOrLane});
    else commit({type:'clearNotes',track:v.track,step});
  }
}
function renderTracks(){
  const {v}=current(),container=$('tracks');
  container.replaceChildren();
  trackNames.forEach((name,k)=>{
    const b=newEl('button','track'+(v.track===k?' active':''));
    b.append(newEl('small','',String(k+1).padStart(2,'0')),newEl('strong','',name));
    b.append(newEl('span','',k===3?'16 LANES':'12 SYNTH ENGINES'));
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
  document.querySelectorAll('[data-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tool===tool)));
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
  const canvas=$('grid');canvas.replaceChildren();
  const scroll=newEl('div','roll-scroll');
  const grid=newEl('div','roll-grid');
  grid.style.gridTemplateColumns='52px repeat('+length+',38px)';
  grid.append(newEl('div','roll-corner','NOTE'));
  for(let i=0;i<length;i++)grid.append(newEl('div','roll-step',String(i+1)));
  const lines=drums?Array.from({length:16},(_,i)=>i):Array.from({length:24},(_,i)=>71-i);
  for(const row of lines){
    grid.append(newEl('div','roll-note-label',drums?laneNames[row]:noteName(row)));
    for(let i=0;i<length;i++){
      const s=drums?track.dstep[i]:track.step[i];
      const active=drums?!!(s.on&(1<<row)):s.n>0&&s.time===0&&s.notes.slice(0,s.n).includes(row);
      const b=newEl('button','roll-cell'+(i%4===0?' beat':'')+(active?' on':'')+
        (i===v.step && (drums?drumLane===row:selectedPitch===row)?' selected':''));
      b.dataset.step=String(i);b.dataset.note=String(row);
      b.setAttribute('aria-label',drums?'Step '+(i+1)+' '+laneNames[row]:'Step '+(i+1)+' '+noteName(row));
      b.setAttribute('aria-pressed',String(active));
      b.textContent=active?'●':'';
      b.addEventListener('click',()=>drawAt(i,row));
      grid.append(b);
    }
  }
  scroll.append(grid);canvas.append(scroll);
  const active=scroll.querySelector('.roll-cell.selected');
  if(active)active.scrollIntoView({block:'nearest',inline:'nearest'});
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
  $('chord-preview').textContent=chord?'CHORD: '+(chordNotes.map(noteName).join(' + ')||'tap notes, then Done'):'Tap keys to write selected step; AUTO advances after each note.';
  if(v.track===3){
    const pads=newEl('div','step-row');
    laneNames.forEach((name,i)=>{
      const b=newEl('button','step-cell'+(i===drumLane?' selected':''));
      b.textContent=name;b.dataset.lane=String(i);
      b.addEventListener('click',()=>{drumLane=i;render();});
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
function render(){
  const {v}=current();
  renderTracks();renderOptions();
  if(v.mode==='step')renderStep();else renderRoll();
  renderInspector();renderKeyboard();
}
const initial=session.getView();session.select(initial.track,0);render();
for(const mode of ['step','roll'])$(mode+'-mode').addEventListener('click',()=>{
  modeForTrack[current().v.track]=mode;
  session.setMode(mode);render();
});
document.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>{tool=b.dataset.tool;render();}));
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
$('clear').addEventListener('click',()=>{
  const {v,track}=current();
  if(v.track===3){if(track.dstep[v.step].on&(1<<drumLane))commit({type:'toggleDrumHit',track:v.track,step:v.step,lane:drumLane});}
  else commit({type:'clearNotes',track:v.track,step:v.step});
});
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
    if(!player)player=new LocalPreview(soundState,e=>status(e.message));
    await player.start();player.play(true);playing=true;status('PLAYING / SLOOP WASM');
  }catch(e){status(e.message);}
});
$('stop').addEventListener('click',()=>{player?.play(false);player?.panic();playing=false;status('STOPPED');});
