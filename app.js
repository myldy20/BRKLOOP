// SPDX-License-Identifier: GPL-3.0-only
// BRKLOOP experimental UI. Musical clock, oscillators, drums and FX run in SLOOP's real WASM AudioWorklet.
import { LocalPreview } from './web/preview.js';

const $ = (id) => document.getElementById(id);
const colors = ['#ffb15b', '#6dc8da', '#be9cef', '#b6d675'];
const labels = ['BASS', 'CHORDS', 'LEAD', 'DRUMS'];
const drumLanes = [[36,'KICK'],[35,'KICK 2'],[38,'SNARE'],[39,'CLAP'],[42,'HAT'],[46,'OPEN HAT'],
  [44,'PEDAL'],[37,'RIM'],[40,'SNARE 2'],[43,'LOW TOM'],[48,'HI TOM'],[49,'CRASH'],
  [51,'RIDE'],[70,'SHAKER'],[63,'CONGA'],[56,'COWBELL']];
const storeKey = 'brkloop.groove.v1';
let bank, state, player, playing = false, selectedTrack = 0, selectedStep = -1;
let selectedLane = -1, keyboardOctave = 3, pitch = [45,60,72], transportPositions = [-1,-1,-1,-1], toastTimer;
const mobile = () => matchMedia('(max-width: 890px)').matches;
const track = (k = selectedTrack) => state.tracks[k];
const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
function noteName(n) {
  const names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  return names[n % 12] + (Math.floor(n / 12) - 1);
}
function el(tag, cls, text) {
  const a=document.createElement(tag);
  if (cls) a.className=cls;
  if (text != null) a.textContent=String(text);
  return a;
}
function toast(message) {
  $('toast').textContent=message; $('toast').hidden=false;
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>{$('toast').hidden=true;},3300);
}
function setAudioStatus(value, mode) {
  $('audio-status').className='status'+(mode ? ' '+mode : '');
  $('audio-status').lastChild.textContent=' '+value;
}
function projectValid(x) {
  if (!x || x.format !== 'BRKLOOP_PROJECT_V1' || !x.state) return false;
  const s=x.state;
  if (!Array.isArray(s.g) || s.g.length!==bank.baseline.g.length || !s.g.every(Number.isFinite)) return false;
  if (!Array.isArray(s.tracks) || s.tracks.length!==4) return false;
  return s.tracks.every((t,k)=>Array.isArray(t.p) && t.p.length===bank.baseline.tracks[k].p.length && t.p.every(Number.isFinite) &&
    Number.isInteger(t.engine) && t.engine>=0 && t.engine<12 && Number.isInteger(t.preset) &&
    Array.isArray(t.step) && t.step.length===64 && t.step.every(v=>v && Array.isArray(v.notes) && v.notes.length===4) &&
    Array.isArray(t.micro) && t.micro.length===64 && Array.isArray(t.fill) && t.fill.length===16 &&
    Array.isArray(t.locks) && t.locks.length<=24 && Array.isArray(t.fm6) &&
    (k!==3 || (Array.isArray(t.dstep) && t.dstep.length===64 && t.dstep.every(v=>v && Array.isArray(v.lvl) && v.lvl.length===16 && Array.isArray(v.rat) && v.rat.length===16))));
}
function persist() {
  try { localStorage.setItem(storeKey,JSON.stringify({format:'BRKLOOP_PROJECT_V1',state})); $('save-status').textContent='SAVED LOCALLY · EXPORT FOR BACKUP'; }
  catch(e){ $('save-status').textContent='LOCAL SAVE FAILED · EXPORT NOW'; }
}
let persistTimer;
function changed(redraw=false) {
  if (player) player.sync();
  clearTimeout(persistTimer);persistTimer=setTimeout(persist,200);
  if (redraw) render();
}
function opts(select,options,selected) {
  select.replaceChildren();
  options.forEach((v,i)=>{const o=el('option','',v);o.value=String(i);select.append(o);});
  select.value=String(selected);
}
function renderTracks() {
  const list=$('tracks');list.replaceChildren();
  labels.forEach((name,k)=>{
    const t=track(k), b=el('button','track-card'+(selectedTrack===k?' selected':''));
    b.type='button';b.style.setProperty('--track',colors[k]);b.setAttribute('aria-pressed',String(selectedTrack===k));
    b.append(el('span','track-id','0'+(k+1)));
    const info=el('div','track-info');
    info.append(el('div','track-title',name),el('div','track-preset',k===3 ? bank.kits[t.p[bank.pe0]] : (bank.engines[t.engine]?.presets[t.preset]?.name || bank.engines[t.engine]?.name || 'CUSTOM')));
    b.append(info,el('span','track-meter'));b.addEventListener('click',()=>selectTrack(k));list.append(b);
  });
  opts($('track-select'),labels.map((n,i)=>'0'+(i+1)+' / '+n),selectedTrack);
  document.documentElement.style.setProperty('--track',colors[selectedTrack]);
}
function selectTrack(k) {
  selectedTrack=k;selectedStep=-1;selectedLane=-1;
  render();
}
function isOn(s){return s.n>0 && s.time===0;}
function synthStep(i, e) {
  const s=track().step[i];selectedStep=i;
  if (e.shiftKey || e.altKey) {
    s.n=1;s.time=0;s.vel=s.vel||100;s.notes[0]=pitch[selectedTrack];s.notes[1]=s.notes[2]=s.notes[3]=0;
  } else if(isOn(s)) s.time=2;
  else if(s.n>0) s.time=0;
  else {s.n=1;s.notes=[pitch[selectedTrack],0,0,0];s.time=0;s.vel=100;s.flags=0;s.lvl=0;s.rat=0;}
  changed();renderGrid();updateSelection();
}
function drumStep(i,lane) {
  const d=track(3).dstep[i];selectedStep=i;selectedLane=lane;d.on ^= (1<<lane);
  d.lvl[lane]=0;d.rat[lane]=0;
  changed();renderGrid();updateSelection();
}
function renderGrid() {
  const grid=$('step-grid'); grid.replaceChildren();
  const drums=selectedTrack===3; grid.className='step-grid'+(drums?' drums':' synth');
  function stepButton(i,active,text,callback,lane=-1) {
    const currentSelection=i===selectedStep && (lane===-1 || lane===selectedLane);
    const b=el('button','step-cell'+(i%4===0?' beat':'')+(active?' active':'')+(currentSelection?' selected-step':''));
    b.type='button'; b.textContent=text; b.dataset.step=String(i);
    b.setAttribute('aria-label',drums?drumLanes[lane][1]+', step '+(i+1)+', '+(active?'on':'off'):'Step '+(i+1)+', '+(active?'note '+text:'empty'));
    b.setAttribute('aria-pressed',String(!!active));
    b.addEventListener('click',callback);
    return b;
  }
  if (drums) {
    const heading=el('div','drum-heading');
    heading.append(el('span','row-name','SOUND'));
    const counts=el('div','drum-counts');
    for(let i=0;i<16;i++) counts.append(el('span','step-no'+(i%4===0?' bar':''),String(i+1).padStart(2,'0')));
    heading.append(counts);grid.append(heading);
    drumLanes.forEach(([note,name],lane)=>{
      const row=el('div','drum-lane');
      const label=el('button','row-name drum-name',name);
      label.type='button';label.title='Audition '+name;
      label.addEventListener('click',async()=>{
        try{await ensureAudio();player.note(3,note,true);setTimeout(()=>player?.note(3,note,false),150);}catch(e){audioError(e);}
      });
      row.append(label);
      const cells=el('div','drum-cells');
      for(let i=0;i<16;i++){
        const active=!!(track(3).dstep[i].on&(1<<lane));
        cells.append(stepButton(i,active,active?'●':'',()=>drumStep(i,lane),lane));
      }
      row.append(cells);grid.append(row);
    });
  } else {
    const groups=el('div','synth-groups');
    for(let group=0;group<2;group++){
      const panel=el('div','synth-bar'),head=el('div','synth-numbers'),row=el('div','synth-cells');
      for(let i=group*8;i<group*8+8;i++){
        head.append(el('span','step-no'+(i%4===0?' bar':''),String(i+1).padStart(2,'0')));
        const step=track().step[i];
        row.append(stepButton(i,isOn(step),isOn(step)?noteName(step.notes[0]):'·',(event)=>synthStep(i,event)));
      }
      panel.append(head,row);groups.append(panel);
    }
    grid.append(groups);
  }
  paintPlayhead();
}
function paintPlayhead() {
  const pos=transportPositions[selectedTrack];
  // A single low-contrast column tint, without per-cell pseudo-element stripes.
  document.querySelectorAll('.step-cell[data-step]').forEach(b=>
    b.classList.toggle('current',playing && Number(b.dataset.step)===pos));
  document.querySelectorAll('.step-no').forEach(b=>{
    const n=Number(b.textContent)-1;
    b.classList.toggle('current-label',playing && n===pos);
  });
}
function updateSelection() {
  $('selected-info').textContent=selectedStep<0?'STEP --':'STEP '+String(selectedStep+1).padStart(2,'0');
}
function renderKeyboard() {
  const panel=$('keyboard-block');panel.hidden=selectedTrack===3;
  if(selectedTrack===3)return;
  const keys=$('keyboard');keys.replaceChildren();
  const base=(keyboardOctave+1)*12;
  $('octave-label').textContent='C'+keyboardOctave+'–C'+(keyboardOctave+1);
  // Real piano geometry: eight white keys C..C, sharps above the gaps.
  const white=[0,2,4,5,7,9,11,12];
  const black=[{semi:1,gap:1},{semi:3,gap:2},{semi:6,gap:4},{semi:8,gap:5},{semi:10,gap:6}];
  const whites=el('div','piano-whites');
  function bindKey(button,n) {
    button.dataset.note=String(n);button.type='button';
    button.setAttribute('aria-label','Play '+noteName(n));
    button.classList.toggle('chosen',pitch[selectedTrack]===n);
    let pressed=false,started=false;
    button.addEventListener('pointerdown',async(e)=>{
      e.preventDefault();pressed=true;
      pitch[selectedTrack]=n;
      $('note-select').value=String(n-24);
      keys.querySelectorAll('.piano-key').forEach(k=>k.classList.toggle('chosen',Number(k.dataset.note)===n));
      try{
        await ensureAudio();
        if(!button.isConnected || selectedTrack===3)return;
        player.note(selectedTrack,n,true);started=true;button.classList.add('down');
        if(!pressed) setTimeout(()=>{player?.note(selectedTrack,n,false);button.classList.remove('down');},210);
      } catch(err){audioError(err);}
    });
    const up=()=>{pressed=false;if(started){started=false;player?.note(selectedTrack,n,false);button.classList.remove('down');}};
    button.addEventListener('pointerup',up);button.addEventListener('pointercancel',up);
    button.addEventListener('pointerleave',up);
  }
  white.forEach(semi=>{
    const n=base+semi,b=el('button','piano-key white-key',noteName(n));bindKey(b,n);whites.append(b);
  });
  keys.append(whites);
  const blacks=el('div','piano-blacks');
  black.forEach(({semi,gap})=>{
    const n=base+semi,b=el('button','piano-key black-key',noteName(n));
    b.style.left=(gap*100/8)+'%';bindKey(b,n);blacks.append(b);
  });
  keys.append(blacks);
}
function slider(parent,label,value,min,max,onChange){
  const wrap=el('label','knob'),top=el('span','knob-top');
  const name=el('span','',label),out=el('output','',String(value));top.append(name,out);
  const input=el('input');input.type='range';input.min=String(min);input.max=String(max);input.step='1';input.value=String(value);
  input.addEventListener('input',()=>{const v=Number(input.value);out.textContent=String(v);onChange(v);});
  wrap.append(top,input);parent.append(wrap);
}
function enumBox(parent,label,values,value,onChange){
  const wrap=el('label','knob'),name=el('span','knob-top',label),sel=el('select','compact-select');
  values.forEach((v,i)=>{const o=el('option','',v);o.value=String(i);sel.append(o);});
  sel.value=String(value);
  sel.addEventListener('change',()=>onChange(Number(sel.value)));
  wrap.append(name,sel);parent.append(wrap);
}
function setParam(id,value){track().p[id]=value;changed();}
function renderSound(){
  const drum=selectedTrack===3,t=track();$('env-section').hidden=drum;$('sound-track-id').textContent='TRACK 0'+(selectedTrack+1);
  $('synth-sound').hidden=drum;$('drum-sound').hidden=!drum;
  $('envelope-controls').replaceChildren();$('engine-controls').replaceChildren();$('fx-controls').replaceChildren();
  if(!drum){
    opts($('engine-select'),bank.engines.map(e=>e.name),t.engine);
    const eng=bank.engines[t.engine];
    opts($('preset-select'),eng.presets.map(p=>p.name),clamp(t.preset,0,eng.presets.length-1));
    eng.controls.forEach((c,i)=>{
      if(c.min===c.max || c.label==='-')return;
      const p=bank.pe0+i;
      if(c.names && c.names.length>0 && c.names.length<=16) enumBox($('engine-controls'),c.label,c.names,t.p[p]-c.min,v=>setParam(p,v+c.min));
      else slider($('engine-controls'),c.label,t.p[p],c.min,c.max,v=>setParam(p,v));
    });
  }else{
    opts($('kit-select'),bank.kits.slice(0,37),clamp(t.p[bank.pe0],0,36));
    const pads=$('drum-pads');pads.replaceChildren();
    drumLanes.forEach(([note,name])=>{
      const b=el('button','drum-pad',name);b.type='button';
      b.addEventListener('click',async()=>{try{await ensureAudio();player.note(3,note,true);setTimeout(()=>player?.note(3,note,false),125);}catch(e){audioError(e);}});
      pads.append(b);
    });
  }
  [['ATTACK',1],['DECAY',2],['SUSTAIN',3],['RELEASE',4]].forEach(([name,id])=>slider($('envelope-controls'),name,t.p[id],0,127,v=>setParam(id,v)));
  slider($('fx-controls'),'FILTER',t.p[50],-64,63,v=>setParam(50,v));
  enumBox($('fx-controls'),'INSERT',['OFF','SOFT','HARD','FOLD','FUZZ','CRUSH','PHASR','FLANG','CHOR'],t.p[53],v=>{setParam(53,v);renderSound();});
  [['CHORUS',34],['DELAY',35],['REVERB',36],['FX MIX',57]].forEach(([name,id])=>slider($('fx-controls'),name,t.p[id],0,127,v=>setParam(id,v)));
}
function renderMixer(){
  const root=$('mixer');root.replaceChildren();
  labels.forEach((label,k)=>{
    const t=track(k),strip=el('div','mix-strip');strip.style.setProperty('--strip',colors[k]);
    const h=el('div','mix-strip-head');
    h.append(el('span','mix-id','0'+(k+1)),el('span','',label));
    const mute=el('button','mute'+(t.p[40]?' muted':''),t.p[40]?'MUTED':'MUTE');
    mute.type='button';mute.setAttribute('aria-pressed',String(!!t.p[40]));
    mute.addEventListener('click',()=>{t.p[40]=t.p[40]?0:1;changed();renderMixer();renderTracks();});
    h.append(mute);
    strip.append(h);
    const row=el('label','mix-strip-main');row.append(el('span','','LVL'));
    const range=el('input');range.type='range';range.min='0';range.max='127';range.value=String(t.p[0]);
    const out=el('output','',t.p[0]);range.addEventListener('input',()=>{t.p[0]=Number(range.value);out.textContent=range.value;changed();});
    row.append(range,out);strip.append(row);
    const panRow=el('label','mix-strip-main');panRow.append(el('span','','PAN'));
    const pan=el('input');pan.type='range';pan.min='-64';pan.max='63';pan.value=String(t.p[39]);
    const panOut=el('output','',t.p[39]);pan.addEventListener('input',()=>{t.p[39]=Number(pan.value);panOut.textContent=pan.value;changed();});
    panRow.append(pan,panOut);strip.append(panRow);
    root.append(strip);
  });
}
function render(){
  renderTracks();
  $('pattern-title').textContent=selectedTrack===3?'DRUM MACHINE':'NOTE SEQUENCER';
  $('pattern-hint').textContent=selectedTrack===3?'16 sounds · 16 steps · one continuous pattern':'All 16 steps visible · choose a pitch on the keyboard';
  $('note-wrap').hidden=selectedTrack===3;$('set-note').hidden=selectedTrack===3;
  $('note-action-hint').textContent=selectedTrack===3?'TAP TO TOGGLE · TAP SOUND NAME TO PREVIEW':'TAP TO TOGGLE · SHIFT+TAP TO REPLACE NOTE';
  opts($('note-select'),Array.from({length:73},(_,i)=>noteName(i+24)),pitch[selectedTrack] == null?0:pitch[selectedTrack]-24);
  $('bpm').value=String(state.g[0]);$('swing').value=String(state.g[1]);
  renderGrid();renderSound();renderMixer();renderKeyboard();updateSelection();
}
function applyPreset(e,p){
  const t=track(), preset=bank.engines[e].presets[p];
  if(!preset){toast('Preset not available');return;}
  const kept=[0,25,26,27,29,30,31,32,39,40,49];
  const old=kept.map(id=>t.p[id]);
  t.engine=e;t.preset=p;t.p=preset.p.slice();t.fm6=preset.fm6.slice();
  kept.forEach((id,i)=>{t.p[id]=old[i];});
  changed(true);
}
async function ensureAudio(){
  if(!player) throw new Error('Audio engine not loaded');
  await player.start();
  setAudioStatus('AUDIO READY','ready');
}
function audioError(err){playing=false;updatePlay();setAudioStatus('AUDIO ERROR','error');toast('Audio: '+(err?.message||err));console.error(err);}
function updatePlay(){
  $('play').classList.toggle('playing',playing);
  $('play-label').textContent=playing?'PAUSE':'PLAY';$('play-symbol').textContent=playing?'❚❚':'▶';
  paintPlayhead();
}
async function togglePlay(){
  if(playing){player.play(false);playing=false;transportPositions=[-1,-1,-1,-1];updatePlay();return;}
  $('play').disabled=true;$('play-label').textContent='LOADING';
  try{await ensureAudio();player.play(true);playing=true;updatePlay();}
  catch(e){audioError(e);}finally{$('play').disabled=false;if(!playing)updatePlay();}
}
function stop(){
  if(player) player.panic();
  playing=false;transportPositions=[-1,-1,-1,-1];updatePlay();
}
function randomize(){
  const t=track();
  if(selectedTrack===3){
    for(let i=0;i<16;i++){
      const d=t.dstep[i];d.on=0;d.lvl.fill(0);d.rat.fill(0);
      if(i%4===0 || (i===10&&Math.random()<.6))d.on|=1;
      if(i%8===4)d.on|=1<<2;
      if(Math.random()>.3)d.on|=1<<4;
      if(Math.random()>.82)d.on|=1<<3;
    }
  } else {
    for(let i=0;i<16;i++){
      const s=t.step[i],on=Math.random() < (i%4===0?.78:.24);
      s.n=on?1:0;s.notes=[on?pitch[selectedTrack]+[0,0,3,5,7,0,-2][Math.floor(Math.random()*7)]:0,0,0,0];
      s.time=on?0:2;s.vel=100;s.flags=0;
    }
  }
  changed();renderGrid();toast('New pattern generated · Undo by importing a backup');
}
function clearPattern(){
  if(!confirm('Clear all 64 steps on track '+(selectedTrack+1)+'?'))return;
  const t=track();
  for(const s of t.step){s.n=0;s.time=2;s.notes=[0,0,0,0];s.vel=0;s.flags=0;}
  if(t.dstep)for(const d of t.dstep){d.on=0;d.lvl.fill(0);d.rat.fill(0);}
  t.micro.fill(0);t.fill.fill(0);t.locks=[];
  changed();renderGrid();toast('Track pattern cleared');
}
function exportProject(){
  const blob=new Blob([JSON.stringify({format:'BRKLOOP_PROJECT_V1',state},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='BRKLOOP-'+new Date().toISOString().slice(0,10)+'.json';
  a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);toast('Project exported');
}
async function importProject(file){
  if(!file)return;
  try {
    if(file.size>2000000)throw new Error('File too large');
    const parsed=JSON.parse(await file.text());
    if(!projectValid(parsed))throw new Error('Not a compatible BRKLOOP V1 project');
    stop();state=parsed.state;selectedTrack=0;selectedStep=-1;selectedLane=-1;
    changed(true);persist();toast('Project imported');
  }catch(e){toast('Import failed: '+e.message);}
}
function selectView(v){
  $('workspace').dataset.view=v;
  document.querySelectorAll('.mobile-tab').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
}
function wireEvents(){
  $('play').addEventListener('click',togglePlay);$('stop').addEventListener('click',stop);
  $('bpm').addEventListener('change',()=>{state.g[0]=clamp(Number($('bpm').value)||90,40,240);changed();$('bpm').value=state.g[0];});
  $('swing').addEventListener('change',()=>{state.g[1]=clamp(Number($('swing').value)||0,0,100);changed();$('swing').value=state.g[1];});
  $('track-select').addEventListener('change',e=>selectTrack(Number(e.target.value)));
  $('note-select').addEventListener('change',e=>{pitch[selectedTrack]=24+Number(e.target.value);renderKeyboard();});
  $('set-note').addEventListener('click',()=>{
    if(selectedTrack===3 || selectedStep<0){toast('Select a step first');return;}
    synthStep(selectedStep,{shiftKey:true});
  });
  $('engine-select').addEventListener('change',e=>applyPreset(Number(e.target.value),0));
  $('preset-select').addEventListener('change',e=>applyPreset(track().engine,Number(e.target.value)));
  $('kit-select').addEventListener('change',e=>{track(3).p[bank.pe0]=Number(e.target.value);changed(true);});
  $('octave-down').addEventListener('click',()=>{keyboardOctave=clamp(keyboardOctave-1,1,7);renderKeyboard();});
  $('octave-up').addEventListener('click',()=>{keyboardOctave=clamp(keyboardOctave+1,1,7);renderKeyboard();});
  $('random').addEventListener('click',randomize);$('clear').addEventListener('click',clearPattern);
  $('save').addEventListener('click',exportProject);$('import').addEventListener('click',()=>$('file').click());
  $('file').addEventListener('change',e=>{importProject(e.target.files[0]);e.target.value='';});
  document.querySelectorAll('.mobile-tab').forEach(b=>b.addEventListener('click',()=>selectView(b.dataset.view)));
  window.addEventListener('resize',()=>{renderGrid();});
  document.addEventListener('keydown',e=>{
    if(e.repeat || e.ctrlKey || e.metaKey || e.altKey)return;
    if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName))return;
    if(e.code==='Space'){e.preventDefault();togglePlay();}
    if(e.code==='Escape')stop();
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)document.querySelectorAll('.key.down').forEach(b=>{player?.note(selectedTrack,Number(b.dataset.note),false);b.classList.remove('down');});});
}
async function init(){
  try{
    const response=await fetch('./bank.json');
    if(!response.ok)throw new Error('Factory bank was not deployed');
    bank=await response.json();
    if(bank.format!=='BRKLOOP_BANK_V1' || bank.engines.length!==12)throw new Error('Incompatible factory bank');
    let saved=null;try{saved=JSON.parse(localStorage.getItem(storeKey)||'null');}catch(e){}
    state=projectValid(saved)?saved.state:structuredClone(bank.baseline);
    state.g[13]=0; // browser source uses its own internal clock (not USB/TRS)
    player=new LocalPreview(()=>state,e=>audioError(e),()=>{},t=>{transportPositions=t.positions;paintPlayhead();});
    wireEvents();render();setAudioStatus('AUDIO OFF','');
    if(!projectValid(saved))persist();
  }catch(e){setAudioStatus('SETUP ERROR','error');$('play').disabled=true;toast(e.message);console.error(e);}
}
init();