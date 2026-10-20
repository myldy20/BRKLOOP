// SPDX-License-Identifier: GPL-3.0-only
// RESEARCH ONLY. Not imported by the shipping app or SLOOP AudioWorklet.
// Common semantic commands shared by future Step Write and Piano Roll.
const copy = value => structuredClone(value);
function integer(n,min,max,label) {
  if(!Number.isInteger(n)||n<min||n>max)throw new RangeError(label+' must be '+min+'..'+max);
  return n;
}
function trackAt(data,k){integer(k,0,3,'track');if(!data?.tracks?.[k])throw Error('Missing track');return data.tracks[k];}
function stepAt(t,i){integer(i,0,63,'step');if(i>=t.p[29])throw RangeError('Step outside active LEN');}
function notesValid(notes) {
  if(!Array.isArray(notes)||notes.length<1||notes.length>4)throw RangeError('SLOOP supports 1..4 notes per step');
  notes.forEach(n=>integer(n,0,127,'MIDI note'));
  if(new Set(notes).size!==notes.length)throw Error('Duplicate note');
}
const value2=(word,i)=>(word>>(2*i))&3;
function repack(old,notes,member){
  return notes.reduce((mask,n,j)=>{
    const i=old.notes.slice(0,old.n).indexOf(n);
    return mask|((i<0?0:value2(old[member]||0,i))<<(2*j));
  },0);
}
function synthStepWithNotes(step,notes) {
  notesValid(notes);
  const old=copy(step),next=copy(step);
  next.notes=[...notes,0,0,0,0].slice(0,4);
  next.n=notes.length;next.time=0;
  next.vel=integer(next.vel||100,1,127,'velocity');
  next.lvl=repack(old,notes,'lvl');next.rat=repack(old,notes,'rat');
  let continuation=0;
  for(let j=0;j<notes.length;j++){
    const prior=old.notes.slice(0,old.n).indexOf(notes[j]);
    if(prior>=0&&(old.flags&(8<<prior)))continuation|=8<<j;
  }
  next.flags=(old.flags&7)|continuation; // accent, slide, reserved; continuation follows original note identities
  return next;
}
function apply(data,cmd){
  const {type,track:trackId,step:i}=cmd;
  const t=trackAt(data,trackId);
  if(type==='replaceDrumGroove'){
    if(trackId!==3)throw Error('Groove replacement requires DRUMS');
    if(!Array.isArray(cmd.steps)||cmd.steps.length!==64)throw Error('Groove requires 64 native drum steps');
    // Validate the entire candidate before touching the cloned project, so a bad
    // imported generator result can never create a partially changed pattern.
    const steps=cmd.steps.map((s,i)=>{
      if(!s || !Number.isInteger(s.on) || s.on<0 || s.on>65535 ||
         !Array.isArray(s.lvl) || !Array.isArray(s.rat) ||
         s.lvl.length!==16 || s.rat.length!==16)
        throw new RangeError('Invalid drum step '+i);
      s.lvl.forEach(v=>integer(v,0,3,'drum level'));
      s.rat.forEach(v=>integer(v,0,3,'drum ratchet'));
      return {on:s.on,lvl:[...s.lvl],rat:[...s.rat]};
    });
    if(cmd.length!==t.p[29])throw Error('Groove candidate no longer matches track LEN');
    t.dstep=steps;
    t.micro.fill(0);t.fill.fill(0);t.locks=[];
    return;
  }
  if(type==='setLength'){t.p[29]=integer(cmd.length,1,64,'LEN');return;}
  if(type==='setDivision'){t.p[30]=integer(cmd.division,0,8,'DIV');return;}
  // Sound controls remain native SLOOP parameters; changes participate in
  // the same undo history as Step Write and Piano Roll.
  if(type==='setTrackParam'){
    const id=integer(cmd.param,0,t.p.length-1,'parameter');
    t.p[id]=integer(cmd.value,-32768,32767,'parameter value');return;
  }
  if(type==='setFactorySound'){
    if(trackId===3)throw Error('Use drum kit selection on the drum track');
    if(!Array.isArray(cmd.p)||!Array.isArray(cmd.fm6)||cmd.p.length!==t.p.length||cmd.fm6.length!==t.fm6.length)
      throw Error('Factory sound state is incompatible with native SLOOP');
    integer(cmd.engine,0,11,'engine');
    integer(cmd.preset,0,32767,'preset');
    // Match original BRKLOOP: keep per-track level, tuning, length, DIV,
    // mixer, mute and performance settings when changing sound.
    const kept=[0,25,26,27,29,30,31,32,39,40,49];
    const previous=kept.map(id=>t.p[id]);
    t.engine=cmd.engine;t.preset=cmd.preset;t.p=copy(cmd.p);t.fm6=copy(cmd.fm6);
    kept.forEach((id,j)=>{t.p[id]=previous[j];});
    return;
  }
  if(type==='setGlobalParam'){
    const id=integer(cmd.param,0,data.g.length-1,'global parameter');
    data.g[id]=integer(cmd.value,-32768,32767,'global value');return;
  }
  stepAt(t,i);
  if(['writeChord','writeNote','addNote','removeNote','clearNotes','setGate','setVelocity'].includes(type)){
    if(trackId===3)throw Error('Synth command on drum track');
    const old=t.step[i];
    if(type==='writeChord'){t.step[i]=synthStepWithNotes(old,cmd.notes);return;}
    if(type==='writeNote'){t.step[i]=synthStepWithNotes(old,[integer(cmd.note,0,127,'note')]);return;}
    if(type==='clearNotes'){t.step[i]={...old,time:2};return;} // REST retains stored pitch/expression
    if(type==='addNote'){
      integer(cmd.note,0,127,'note');
      const notes=old.time===0?old.notes.slice(0,old.n):[];
      if(notes.includes(cmd.note))return;
      t.step[i]=synthStepWithNotes(old,[...notes,cmd.note]);return;
    }
    if(type==='removeNote'){
      const note=integer(cmd.note,0,127,'note');
      const notes=old.notes.slice(0,old.n).filter(n=>n!==note);
      t.step[i]=notes.length?synthStepWithNotes(old,notes):{...old,time:2};return;
    }
    if(type==='setGate'){old.time=integer(cmd.gate,0,2,'gate');return;}
    if(type==='setVelocity'){old.vel=integer(cmd.value,1,127,'velocity');return;}
  }
  if(type==='toggleDrumHit'){
    if(trackId!==3)throw Error('Expected drum track');
    const lane=integer(cmd.lane,0,15,'lane');
    t.dstep[i].on^=1<<lane;return;
  }
  if(type==='setDrumLevel'||type==='setDrumRatchet'){
    if(trackId!==3)throw Error('Expected drum track');
    const lane=integer(cmd.lane,0,15,'lane');
    t.dstep[i][type==='setDrumLevel'?'lvl':'rat'][lane]=integer(cmd.value,0,3,'drum expression');return;
  }
  if(type==='setMicro'){t.micro[i]=integer(cmd.value,-32,31,'micro');return;}
  if(type==='setFill'){
    const v=integer(cmd.value,0,3,'fill'),slot=i>>2,shift=(i&3)*2;
    t.fill[slot]=(t.fill[slot]&~(3<<shift))|(v<<shift);return;
  }
  if(type==='setLock'||type==='removeLock'){
    integer(cmd.param,0,t.p.length-1,'param');
    const idx=t.locks.findIndex(l=>l.step===i&&l.param===cmd.param);
    if(type==='removeLock'){if(idx>=0)t.locks.splice(idx,1);return;}
    integer(cmd.value,-32768,32767,'lock value');
    const lock={step:i,param:cmd.param,value:cmd.value};
    if(idx>=0)t.locks[idx]=lock;
    else {if(t.locks.length>=24)throw RangeError('At most 24 native SLOOP locks per track');t.locks.push(lock);}
    return;
  }
  throw new Error('Unknown edit command: '+String(type));
}
export function createResearchEditSession(initial,{historyLimit=64}={}){
  integer(historyLimit,1,128,'historyLimit');
  let current=copy(initial),undo=[],redo=[],gesture=null;
  // A continuous knob turn is one Undo transaction. Drag updates change the
  // canonical state immediately without repeatedly cloning the full pattern.
  const finishGesture=()=>{
    if(!gesture)return false;
    const before=gesture;gesture=null;
    if(JSON.stringify(before)===JSON.stringify(current))return false;
    undo.push(before);if(undo.length>historyLimit)undo.shift();redo=[];return true;
  };
  const view={track:0,step:0,mode:'step'};
  return Object.freeze({
    getState:()=>copy(current),
    getView:()=>({...view}),
    select(track,step){const t=trackAt(current,track);stepAt(t,step);view.track=track;view.step=step;return {...view};},
    setMode(mode){if(mode!=='step'&&mode!=='roll')throw Error('Mode must be step or roll');view.mode=mode;return {...view};},
    preview(cmd){
      if(cmd.type!=='setTrackParam'&&cmd.type!=='setGlobalParam')throw Error('Continuous preview is for DSP parameters');
      if(!gesture)gesture=copy(current);
      apply(current,cmd);
      return true;
    },
    finishGesture,
    dispatch(cmd){
      finishGesture();
      const next=copy(current);apply(next,cmd);
      if(JSON.stringify(current)===JSON.stringify(next))return false;
      undo.push(current);if(undo.length>historyLimit)undo.shift();
      current=next;redo=[];return true;
    },
    undo(){finishGesture();if(!undo.length)return false;redo.push(current);current=undo.pop();return true;},
    redo(){finishGesture();if(!redo.length)return false;undo.push(current);current=redo.pop();return true;},
    history:()=>({undo:undo.length,redo:redo.length})
  });
}
