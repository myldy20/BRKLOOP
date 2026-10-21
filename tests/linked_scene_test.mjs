// SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import {generateLinkedScene,SCENE_FEELS} from '../research/linked-scene.mjs';
import {MELODY_SCALES,MELODY_PROGRESSIONS} from '../research/melodic-ideas.mjs';
import {GROOVE_STYLES} from '../research/groove-tools.mjs';
import {createResearchEditSession} from '../research/shared-edit-commands.mjs';
const cfg={length:64,division:2,root:0,scale:'MINOR',
  progression:'MINOR',groove:'DNB',feel:'DRIVE',seed:9};
const clone=x=>structuredClone(x);
const first=generateLinkedScene(cfg);
assert.deepEqual(first,generateLinkedScene(cfg),'one seed generates exactly one reproducible scene');
assert.equal(first.tracks.length,4);
assert.deepEqual(first.tracks.map(t=>t.track),[0,1,2,3]);
const scaleClasses=new Set();
for(const root of [0,7,11])for(const scale of Object.keys(MELODY_SCALES)){
  const pcs=MELODY_SCALES[scale];
  for(const groove of GROOVE_STYLES.map(g=>g[0]))for(const feel of SCENE_FEELS){
    for(const length of [16,32,64]){
      const scene=generateLinkedScene({...cfg,root,scale,groove,feel,length,seed:27});
      assert.equal(scene.barInfo.length,length/16);
      const [bass,chords,arp,drums]=scene.tracks.map(t=>t.steps);
      for(const steps of [bass,chords,arp,drums])assert.equal(steps.length,64);
      for(let i=length;i<64;i++){
        assert.equal(bass[i].time,2);assert.equal(chords[i].time,2);
        assert.equal(arp[i].time,2);assert.equal(drums[i].on,0);
      }
      for(let bar=0;bar<length/16;bar++){
        const i=bar*16,degree=MELODY_PROGRESSIONS[cfg.progression][bar%4];
        const rootPc=(root+pcs[degree])%12;
        const chord=chords[i].notes.slice(0,chords[i].n);
        assert.equal(chord.length,3,'one triad on every bar downbeat');
        assert(chord.some(n=>n%12===rootPc),'harmony includes the root');
        assert.equal(bass[i].notes[0]%12,rootPc,'bass starts bar on same harmony');
        const classes=new Set(chord.map(n=>n%12));
        const kicks=Array.from({length:16},(_,j)=>i+j).filter(j=>drums[j].on&1);
        const bassOn=kicks.filter(j=>bass[j].time===0&&bass[j].n>0);
        assert(bassOn.length>0,'each bar has bass and kick');
        for(let j=i;j<i+16;j++){
          if(bass[j].time===0&&bass[j].n>0){
            assert(drums[j].on&1,'every bass note locks to a kick, bar '+bar+' step '+j);
            assert(classes.has(bass[j].notes[0]%12),
              'bass pitches come from the active chord');
          }
          if(arp[j].time===0&&arp[j].n>0){
            assert(classes.has(arp[j].notes[0]%12),'arp uses current chord tones');
            assert(drums[j].on&((1<<4)|(1<<5)),'arp attacks follow a hat in this style');
          }
        }
      }
      for(const s of [...bass,...chords,...arp]){
        assert.equal(s.notes.length,4);
        assert(s.n>=0&&s.n<=4);
        assert(s.notes.every(n=>n>=0&&n<=127));
        if(s.time===0)assert(s.n>0);
      }
      assert(drums.every(s=>Number.isInteger(s.on)&&s.on>=0&&s.on<=65535&&
        s.lvl.length===16&&s.rat.length===16));
    }
  }
}
assert.notDeepEqual(generateLinkedScene({...cfg,seed:1}).tracks[3].steps,
  generateLinkedScene({...cfg,seed:99}).tracks[3].steps,'variation changes beat');
assert.notDeepEqual(generateLinkedScene({...cfg,feel:'DRIVE'}).tracks[0].steps,
  generateLinkedScene({...cfg,feel:'AIRY'}).tracks[0].steps,'feel changes kick/bass interplay');
for(const bad of [{length:1},{length:20},{length:80},{division:9},{root:12},{seed:-1},
 {seed:2**32},{scale:'CHROMATIC'},{progression:'OTHER'},{groove:'NONE'},{feel:'BROKEN'}]){
  assert.throws(()=>generateLinkedScene({...cfg,...bad}),RangeError,
    'illegal scene option: '+JSON.stringify(bad));
}
function emptyStep(){return {notes:[0,0,0,0],n:0,time:2,flags:0,vel:100,lvl:0,rat:0};}
function emptyDrum(){return {on:0,lvl:Array(16).fill(0),rat:Array(16).fill(0)};}
function fixture(){
  return {g:Array(49).fill(0).map((v,i)=>i===0?137:v),
    tracks:Array.from({length:4},(_,k)=>{
      const p=Array(64).fill(0);p[29]=k===0?7:k===1?32:16;
      p[30]=k;p[28]=-24;p[63]=6;
      const t={p,engine:k%12,preset:k*3,fm6:Array(128).fill(k+1),
        step:Array.from({length:64},emptyStep),
        dstep:Array.from({length:64},emptyDrum),
        micro:Array(64).fill(0),fill:Array(16).fill(0),
        locks:[{step:2,param:5,value:90}]};
      t.step[2]={...emptyStep(),n:1,time:0,notes:[44,0,0,0]};
      t.dstep[2].on=3;t.micro[2]=-11;t.fill[1]=2;
      return t;
    })};
}
const original=fixture(),session=createResearchEditSession(original);
assert.deepEqual(session.getState(),original,'preview construction must not mutate original');
const action={type:'applyLinkedScene',track:0,length:first.length,
  division:original.tracks[3].p[30],tracks:first.tracks};
assert.equal(session.dispatch(action),true);
const applied=session.getState();
assert.deepEqual(applied.g,original.g,'tempo and global params untouched');
assert.deepEqual(applied.tracks.map(t=>t.p[29]),[64,64,64,64]);
assert.deepEqual(applied.tracks.map(t=>t.p[30]),[3,3,3,3]);
for(let k=0;k<4;k++){
  const previous=original.tracks[k],actual=applied.tracks[k];
  for(const key of ['engine','preset','fm6'])
    assert.deepEqual(actual[key],previous[key],'sound '+key+' preserved');
  for(let p=0;p<actual.p.length;p++)
    if(p!==29&&p!==30)assert.equal(actual.p[p],previous.p[p],'parameter '+p+' preserved');
  assert(actual.micro.every(v=>v===0),'old groove micro cleared');
  assert(actual.fill.every(v=>v===0),'old fill cleared');
  assert.deepEqual(actual.locks,[],'old locks cleared because pattern replaced');
  assert.deepEqual(k===3?actual.dstep:actual.step,first.tracks[k].steps);
}
assert.deepEqual(session.history(),{undo:1,redo:0},'four track Apply is one Undo');
session.undo();assert.deepEqual(session.getState(),original,'Undo restores entire project in one action');
session.redo();assert.deepEqual(session.getState(),applied,'Redo restores entire scene');
for(const modified of [
 {...action,tracks:action.tracks.slice(0,3)},
 {...action,tracks:action.tracks.map((t,i)=>i===2?{...t,track:1}:t)},
 {...action,tracks:action.tracks.map((t,i)=>i===3?{...t,steps:[{}]}:t)},
 {...action,tracks:action.tracks.map((t,i)=>i===1?{...t,steps:t.steps.map((s,j)=>j===63?{...s,n:5}:s)}:t)},
 {...action,length:17},{...action,division:-1}
]){
  assert.throws(()=>session.dispatch(modified),Error,'partial multi-track invalid payload rejected');
  assert.deepEqual(session.getState(),applied,'invalid Apply never partially changes any track');
  assert.deepEqual(session.history(),{undo:1,redo:0},'invalid Apply does not affect Undo history');
}
console.log('linked scene: harmony, 5 grooves × 3 feels × 3 lengths × 3 keys × 2 modes; kick/hat sync, native schema and atomic 4-track Undo: PASS');
