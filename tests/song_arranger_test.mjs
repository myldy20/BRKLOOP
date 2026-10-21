// SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import {generateSongArrangement,applyArrangementSection,arrangementSummary,SONG_FORMS}
  from '../research/song-arranger.mjs';
const rootState=()=>{
  const step=()=>({notes:[0,0,0,0],n:0,time:2,flags:0,vel:100,lvl:0,rat:0});
  const drum=()=>({on:0,lvl:Array(16).fill(0),rat:Array(16).fill(0)});
  return {g:Array(49).fill(0).map((v,i)=>i===0?145:v),
    tracks:Array.from({length:4},(_,k)=>{
      const p=Array(71).fill(0);
      p[29]=16+k;p[30]=k;p[28]=-24;p[70]=k;
      return {p,engine:k%12,preset:k+7,fm6:Array(128).fill(k+1),
        step:Array.from({length:64},step),dstep:Array.from({length:64},drum),
        micro:Array(64).fill(0).map((v,i)=>i===4?-12:v),
        fill:Array(16).fill(3),locks:[{step:4,param:5,value:47}]};
    })};
};
const active=s=>s.time===0&&s.n>0;
for(const form of Object.keys(SONG_FORMS)){
  for(const seed of [1,5,999]){
    const options={form,seed,root:9,scale:'MINOR',groove:'DNB',progression:'MINOR',division:2};
    const song=generateSongArrangement(options);
    assert.deepEqual(song,generateSongArrangement(options),'deterministic form '+form);
    assert.equal(song.format,'BRKLOOP_ARRANGEMENT_V1');
    assert.equal(song.sections.length,SONG_FORMS[form].length);
    assert.equal(song.totalBars,song.sections.length*4);
    assert.deepEqual(arrangementSummary(song).labels,song.sections.map(s=>s.title));
    assert.equal(JSON.parse(JSON.stringify(song)).sections.length,song.sections.length,
      'song is JSON-exportable without browser runtime');
    const firstVerse=song.sections.find(s=>s.part==='VERSE');
    const firstChorus=song.sections.find(s=>s.part==='CHORUS');
    assert(firstChorus.scene.attacks.bass>=firstVerse.scene.attacks.bass,
      'chorus should bring in at least as much bass as verse');
    const intro=song.sections[0],outro=song.sections.at(-1);
    assert.equal(intro.part,'INTRO');assert.equal(outro.part,'OUTRO');
    assert(intro.scene.tracks[0].steps.slice(0,32).every(s=>!active(s)),
      'intro opens without bass in first half');
    assert(outro.scene.tracks[2].steps.every(s=>!active(s)),
      'outro has no arp');
    assert(outro.scene.tracks[3].steps.slice(48).every(s=>s.on===0),
      'outro ends with space');
    for(const sec of song.sections){
      assert.equal(sec.scene.length,64,'each section stays native 64 steps');
      assert.equal(sec.scene.tracks.length,4);
      if(sec.part!=='INTRO')assert(sec.scene.tracks[3].steps[0].on&1,
        'drums kick on first beat outside intentionally atmospheric intro');
      const [bass,chords,arp,drums]=sec.scene.tracks.map(t=>t.steps);
      for(let i=0;i<64;i++){
        if(active(bass[i]))assert(drums[i].on&1,'bass event follows kick');
        if(active(arp[i])){
          const chord=chords[Math.floor(i/16)*16];
          const pcs=chord.notes.slice(0,chord.n).map(n=>n%12);
          assert(pcs.includes(arp[i].notes[0]%12),'arp pitch class belongs to section chord');
        }
      }
    }
    const original=rootState(),copy=structuredClone(original);
    const applied=applyArrangementSection(original,firstVerse);
    assert.deepEqual(original,copy,'preview never mutates source');
    assert.deepEqual(applied.g,original.g,'BPM and global effects remain unchanged');
    assert.deepEqual(applied.tracks.map(t=>t.p[29]),[64,64,64,64]);
    assert.deepEqual(applied.tracks.map(t=>t.p[30]),[2,2,2,2]);
    for(let k=0;k<4;k++){
      const a=applied.tracks[k],b=original.tracks[k];
      for(const key of ['engine','preset','fm6'])assert.deepEqual(a[key],b[key],'presets preserved '+key);
      assert.deepEqual(a.p.map((v,j)=>j===29||j===30?null:v),
        b.p.map((v,j)=>j===29||j===30?null:v),'native params preserved');
      assert(a.micro.every(x=>x===0));assert(a.fill.every(x=>x===0));assert.deepEqual(a.locks,[]);
      assert.deepEqual(k===3?a.dstep:a.step,firstVerse.scene.tracks[k].steps);
    }
  }
}
const full=generateSongArrangement({form:'FULL',seed:42});
assert.equal(full.sections.length,8);
assert.deepEqual(full.sections.map(s=>s.title),
  ['INTRO','VERSE','CHORUS','VERSE 2','CHORUS 2','BREAK','CHORUS 3','OUTRO']);
assert.notDeepEqual(full.sections[2].scene.tracks[3].steps,
  full.sections[4].scene.tracks[3].steps,'repeated chorus carries a fresh beat variation');
assert.notDeepEqual(full,generateSongArrangement({form:'FULL',seed:43}));
for(const invalid of [{form:'OTHER'},{seed:-1},{seed:2**32},{root:12},
 {division:9},{groove:'JAZZ'},{scale:'DORIAN'},{progression:'INVALID'}]){
  assert.throws(()=>generateSongArrangement(invalid),Error,JSON.stringify(invalid));
}
for(const invalid of [null,{},'string']){
  assert.throws(()=>arrangementSummary(invalid),TypeError);
}
assert.throws(()=>applyArrangementSection(rootState(),{}),TypeError);
console.log('song arranger: 4/8 section forms, phrasing, native stereo-score integrity and JSON roundtrip: PASS');
