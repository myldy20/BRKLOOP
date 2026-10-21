// SPDX-License-Identifier: GPL-3.0-only
// Black-box UI regression for research/hybrid-editor on the same static site as SLOOP.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright-core';
const root=resolve('dist/site');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json'};
const server=createServer(async(req,res)=>{
  try{
    const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const path=resolve(root,'.'+(name.endsWith('/')?name+'index.html':name));
    if(!(path===root||path.startsWith(root+sep)))throw Error('Invalid path');
    const b=await readFile(path);res.writeHead(200,{'content-type':types[extname(path)]||'application/octet-stream'});
    res.end(b);
  }catch(e){res.writeHead(404);res.end('Not Found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',
    args:['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required']});
  await mkdir('ui-shots',{recursive:true});
  for(const d of [
    {name:'phone',viewport:{width:390,height:844},isMobile:true,hasTouch:true},
    {name:'desktop',viewport:{width:1440,height:900}}
  ]){
    const context=await browser.newContext({viewport:d.viewport,isMobile:d.isMobile||false,hasTouch:d.hasTouch||false});
    const page=await context.newPage();
    const failures=[];page.on('pageerror',e=>failures.push(e.message));
    // Exercise the exact public GitHub Pages entrypoint, including its stable alias.
    await page.goto('http://127.0.0.1:'+server.address().port+'/preview/',{waitUntil:'networkidle'});
    await page.waitForURL('**/research/hybrid-editor/');
    assert(page.url().includes('/research/hybrid-editor/'),'Public /preview/ must open the actual editor');
    await page.locator('.step-cell[data-step="0"]').waitFor();
    const nativeBank=await page.evaluate(async()=>await (await fetch('../../bank-preview-v2.json')).json());
    assert.equal(nativeBank.engines.reduce((n,e)=>n+e.presets.length,0),153,'All compiled firmware sounds must be in Preview');
    const wobble=nativeBank.engines[0].presets.find(x=>x.name==='WOBBLE');
    assert.equal(wobble.index,7);
    assert.equal(wobble.p[9],74);assert.equal(wobble.p[14],40);assert.equal(wobble.p[28],-24);
    // One musical scene includes four synchronized tracks and stays a draft
    // until Apply. Switching tracks during preview must keep all four parts.
    // Focused workspace baseline: no generator or song arrangement competes
    // with the native step editor before a user explicitly asks for it.
    assert.equal(await page.locator('#pattern-tab').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#song-panel').isVisible(),false);
    assert.equal(await page.locator('#sound-panel').isVisible(),false);
    assert.equal(await page.locator('#scene-panel').isVisible(),false);
    assert.equal(await page.locator('#melody-panel').isVisible(),false);
    assert.equal(await page.locator('#mutation-panel').isVisible(),false);
    assert.equal(await page.locator('#tool-content').isVisible(),false);
    assert.equal(await page.locator('#tool-groove').isVisible(),false,
      'Synth tracks show note ideas, not drum-only generators');
    assert.equal(await page.locator('#tool-melody').isVisible(),true);
    assert.equal(await page.locator('#song-workspace').isVisible(),false);
    assert.equal(await page.locator('#keyboard-area').isVisible(),true);
    assert.equal(await page.locator('#keyboard').isVisible(),d.name==='desktop',
      'On narrow screens a sticky piano is collapsed until the musician opens it');
    await page.locator('#tool-scene').click();
    assert.equal(await page.locator('#tool-scene').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#scene-panel').isVisible(),true);
    assert.equal(await page.locator('#scene-apply').isDisabled(),true);
    assert.equal(await page.locator('.step-cell[data-step="0"] .pitch').textContent(),'·');
    await page.locator('#scene-preview').click();
    assert.equal(await page.locator('#scene-apply').isEnabled(),true);
    assert.equal(await page.locator('#scene-meta').textContent().then(x=>x.includes('DRAFT #1')),true);
    assert.equal(await page.locator('.scene-led[data-track="0"].on').count()>0,true);
    assert.equal(await page.locator('.scene-led[data-track="1"].on').count()>0,true);
    assert.equal(await page.locator('.scene-led[data-track="2"].on').count()>0,true);
    assert.equal(await page.locator('.scene-led[data-track="3"].on').count()>0,true);
    assert.equal(await page.locator('.step-cell[data-step="0"] .pitch').textContent(),'·',
      'Four-track preview must not change editable score');
    await page.locator('#tracks button').last().click();
    assert.equal(await page.locator('#scene-apply').isEnabled(),true,
      'Scene draft survives track changes for live comparison');
    await page.locator('#tracks button').first().click();
    await page.locator('#scene-next').click();
    assert.equal(await page.locator('#scene-meta').textContent().then(x=>x.includes('DRAFT #2')),true);
    await page.locator('#scene-cancel').click();
    assert.equal(await page.locator('#scene-apply').isDisabled(),true);
    assert.equal(await page.locator('.step-cell[data-step="0"] .pitch').textContent(),'·',
      'Cancel restores untouched synth score');
    await page.locator('#scene-preview').click();
    await page.locator('#scene-apply').click();
    assert.equal(await page.locator('#length').inputValue(),'64',
      'Apply unifies LEN across all four tracks');
    assert.equal(await page.locator('.step-cell[data-step="0"] .pitch').textContent(),'C3',
      'Generated bass downbeat uses harmonic root');
    await page.locator('#tracks button').last().click();
    assert.equal(await page.locator('#length').inputValue(),'64');
    assert.equal(await page.locator('.step-cell[data-step="0"] .pitch').textContent(),'●',
      'Generated kick is present on drum downbeat');
    await page.locator('#undo').click();
    assert.equal(await page.locator('#length').inputValue(),'16');
    assert.equal(await page.locator('.step-cell[data-step="0"] .pitch').textContent(),'·',
      'One Undo restores drums and LEN');
    await page.locator('#tracks button').first().click();
    assert.equal(await page.locator('.step-cell[data-step="0"] .pitch').textContent(),'·',
      'Same Undo restored bass track');
    await page.locator('#redo').click();
    assert.equal(await page.locator('.step-cell[data-step="0"] .pitch').textContent(),'C3');
    await page.locator('#undo').click();
    assert.equal(await page.locator('.step-cell[data-step="0"] .pitch').textContent(),'·');
    await page.screenshot({path:'ui-shots/research-hybrid-'+d.name+'-scene.png',fullPage:true});
    // Song arranger is an independent multi-scene sketch. Navigation, native
    // audio audition and JSON export must not overwrite editable SLOOP scores.
    await page.locator('#song-tab').click();
    assert.equal(await page.locator('#song-tab').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#pattern-panel').isVisible(),false);
    assert.equal(await page.locator('#tracks').isVisible(),false);
    assert.equal(await page.locator('#keyboard-area').isVisible(),false);
    assert.equal(await page.locator('#scene-panel').isVisible(),false);
    assert.equal(await page.locator('#song-panel').isVisible(),true);
    assert.equal(await page.locator('#song-play').isVisible(),false);
    assert.equal(await page.locator('#song-editbar').isVisible(),false);
    assert.equal(await page.locator('#song-play').isDisabled(),true);
    await page.locator('#song-generate').click();
    assert.equal(await page.locator('#song-timeline button').count(),8);
    assert.equal(await page.locator('#song-editbar').isVisible(),true);
    assert.equal(await page.locator('#song-play').isVisible(),true);
    assert.equal(await page.locator('#song-apply').isEnabled(),true);
    assert.equal(await page.locator('#song-chip').textContent(),'32 BARS · 8 SECTIONS');
    assert.equal(await page.locator('.step-cell[data-step="0"] .pitch').textContent(),'·',
      'Song planning leaves real editor score untouched');
    // Song editing is independent from the native pattern's Undo stack.
    await page.locator('#song-timeline button[data-song-section="2"]').click();
    await page.locator('#song-lock').click();
    assert.equal(await page.locator('#song-lock').textContent(),'UNLOCK');
    assert.equal(await page.locator('#song-regen').isDisabled(),true,
      'Locked chorus cannot be regenerated by accident');
    await page.locator('#song-repeats').selectOption('2');
    assert.equal(await page.locator('#song-chip').textContent(),'36 BARS · 8 SECTIONS');
    await page.locator('#song-more summary').click();
    assert.equal(await page.locator('#song-more').getAttribute('open'),'',
      'More Actions explicitly reveals advanced section operations');
    await page.locator('#song-duplicate').click();
    assert.equal(await page.locator('#song-timeline button').count(),9);
    assert.equal(await page.locator('#song-chip').textContent(),'44 BARS · 9 SECTIONS');
    assert.match(await page.locator('#song-timeline button[data-song-section="3"] .song-section-title').textContent(),/COPY/);
    await page.locator('#song-left').click();
    assert.match(await page.locator('#song-timeline button[data-song-section="2"] .song-section-title').textContent(),/COPY/);
    await page.locator('#song-right').click();
    await page.locator('#song-delete').click();
    assert.equal(await page.locator('#song-timeline button').count(),8);
    await page.locator('#song-edit-undo').click();
    assert.equal(await page.locator('#song-timeline button').count(),9,
      'Song Undo restores deleted section without changing score');
    await page.locator('#song-edit-redo').click();
    assert.equal(await page.locator('#song-timeline button').count(),8,
      'Song Redo deletes the same section again');
    await page.locator('#song-timeline button[data-song-section="1"]').click();
    await page.locator('#song-regen').click();
    assert.match(await page.locator('#status').textContent(),/SONG EDIT REGENERATE/);
    await page.locator('#song-edit-undo').click();
    await page.locator('#song-next').click();
    assert.equal(await page.locator('#song-timeline button').count(),8);
    assert.equal(await page.locator('#song-lock').textContent(),'LOCK',
      'The verse is unlocked after reselecting it');
    await page.locator('#song-timeline button[data-song-section="2"]').click();
    assert.equal(await page.locator('#song-lock').textContent(),'UNLOCK',
      'Keepers remain locked after Evolve Unlocked');
    await page.locator('#song-timeline button[data-song-section="1"]').click();
    const exportEvent=page.waitForEvent('download');
    await page.locator('#song-export').click();
    const exported=await exportEvent;
    assert.match(exported.suggestedFilename(),/^brkloop-song-full-\d+\.json$/,
      'Edited arrangement exports a portable JSON document');
    assert.equal(await page.locator('.step-cell[data-step="0"] .pitch').textContent(),'·',
      'Arranger edits never overwrite the live pattern');

    await page.locator('#song-play').click();
    await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('PLAYING SONG'),{
      timeout:15000});
    assert.equal(await page.locator('#song-play').textContent(),'■ STOP SONG');
    assert.match(await page.locator('#song-now').textContent(),/PLAYING 1 \/ 8/);
    await page.locator('#song-play').click();
    assert.equal(await page.locator('#song-play').textContent(),'▶ PLAY SONG');
    await page.locator('#song-timeline button[data-song-section="1"]').click();
    assert.equal(await page.locator('#song-timeline button[data-song-section="1"]').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('.step-cell[data-step="0"] .pitch').textContent(),'·');
    await page.locator('#song-apply').click();
    await page.locator('#pattern-tab').click();
    assert.equal(await page.locator('#pattern-panel').isVisible(),true);
    assert.equal(await page.locator('#song-panel').isVisible(),false);
    assert.equal(await page.locator('#tracks').isVisible(),true);
    assert.equal(await page.locator('#keyboard-area').isVisible(),true);
    assert.equal(await page.locator('#length').inputValue(),'64');
    assert.equal(await page.locator('.step-cell[data-step="0"] .pitch').textContent(),'A3',
      'Applying VERSE injects common harmonic root on bass, all four native parts');
    await page.locator('#undo').click();
    assert.equal(await page.locator('#length').inputValue(),'16');
    assert.equal(await page.locator('.step-cell[data-step="0"] .pitch').textContent(),'·',
      'A single Undo removes applied whole section and restores native LEN');
    await page.screenshot({path:'ui-shots/research-hybrid-'+d.name+'-song.png',fullPage:true});
    assert.equal(await page.locator('#bpm').inputValue(),'90');
    await page.locator('#bpm').fill('140');await page.locator('#bpm').press('Tab');
    assert.equal(await page.locator('#bpm').inputValue(),'140');
    await page.locator('#undo').click();
    assert.equal(await page.locator('#bpm').inputValue(),'90','Tempo participates in shared Undo');
    assert.equal(await page.locator('.step-cell').count(),16,'Starts at native LEN=16');
    assert.equal(await page.locator('#step-mode').getAttribute('aria-pressed'),'true');
    // Direct note entry: no Select/Draw/Erase mode switches.
    assert.equal(await page.locator('[data-tool]').count(),0,'No edit tool mode required');
    await page.locator('.step-cell[data-step="0"]').click();
    assert.equal(await page.locator('.step-cell[data-step="0"] .pitch').textContent(),'C3',
      'One tap on empty STEP places currently highlighted pitch');
    if(d.name==='phone'){
      assert.equal(await page.locator('#keyboard').isVisible(),false);
      await page.locator('#toggle-keyboard').click();
      assert.equal(await page.locator('#keyboard').isVisible(),true);
    }
    await page.locator('.piano-key[data-note="52"]').click();
    assert.equal(await page.locator('.step-cell[data-step="0"] .pitch').textContent(),'E3',
      'Piano key writes selected step directly');
    await page.locator('.step-cell[data-step="1"]').click();
    assert.equal(await page.locator('.step-cell[data-step="1"] .pitch').textContent(),'E3',
      'Step Write stamps pitch with one tap');
    await page.locator('#roll-mode').click();
    assert.equal(await page.locator('#roll-range').textContent(),'C3–B3','Octave bank shown above roll');
    assert.equal(await page.locator('.roll-cell[data-step="1"][data-note="52"]').getAttribute('aria-pressed'),'true');
    await page.locator('.roll-cell[data-step="2"][data-note="55"]').click();
    assert.equal(await page.locator('.roll-cell[data-step="2"][data-note="55"]').getAttribute('aria-pressed'),'true',
      'One tap empty Piano Roll inserts a note without draw mode');
    await page.locator('#undo').click();
    assert.equal(await page.locator('.roll-cell[data-step="2"][data-note="55"]').getAttribute('aria-pressed'),'false');
    await page.locator('#redo').click();
    assert.equal(await page.locator('.roll-cell[data-step="2"][data-note="55"]').getAttribute('aria-pressed'),'true');
    await page.locator('.roll-cell[data-step="2"][data-note="55"]').click();
    assert.equal(await page.locator('.roll-cell[data-step="2"][data-note="55"]').getAttribute('aria-pressed'),'true',
      'Selecting existing note must not erase');
    await page.locator('#quick-erase').click();
    assert.equal(await page.locator('.roll-cell[data-step="2"][data-note="55"]').getAttribute('aria-pressed'),'false',
      'Inline erase must be available without scrolling away to choose tool');
    await page.locator('#undo').click();
    assert.equal(await page.locator('.roll-cell[data-step="2"][data-note="55"]').getAttribute('aria-pressed'),'true');
    await page.locator('#roll-up').click();
    assert.equal(await page.locator('#roll-range').textContent(),'C4–B4');
    await page.locator('.roll-cell[data-step="3"][data-note="60"]').click();
    assert.equal(await page.locator('.roll-cell[data-step="3"][data-note="60"]').getAttribute('aria-pressed'),'true');
    await page.locator('#roll-down').click();
    assert.equal(await page.locator('#roll-range').textContent(),'C3–B3');
    await page.locator('#step-mode').click();
    assert.equal(await page.locator('.step-cell[data-step="2"] .pitch').textContent(),'G3');
    assert.equal(await page.locator('.step-cell[data-step="3"] .pitch').textContent(),'C4',
      'Octave bank changes only view, not native notes');
    // Atomic chord insert: an existing note stays unless explicitly removed.
    await page.locator('.step-cell[data-step="1"]').click();
    await page.locator('#chord').click();
    await page.locator('.piano-key[data-note="55"]').click();
    await page.locator('.piano-key[data-note="59"]').click();
    await page.locator('#chord-done').click();
    assert.equal(await page.locator('.step-cell[data-step="1"] .pitch').textContent(),'E3 + G3 + B3');
    await page.locator('#undo').click();
    assert.equal(await page.locator('.step-cell[data-step="1"] .pitch').textContent(),'E3',
      'Chord Undo must revert one transaction');

    await page.locator('#length').fill('64');await page.locator('#length').press('Tab');
    assert.equal(await page.locator('.step-cell').count(),64);
    // Musical starters use the genuine native SLOOP score and existing Undo.
    await page.locator('#tool-melody').click();
    assert.equal(await page.locator('#melody-panel').isVisible(),true);
    assert.equal(await page.locator('#scene-panel').isVisible(),false);
    assert.equal(await page.locator('#tool-melody').getAttribute('aria-expanded'),'true');
    assert.equal(await page.locator('#melody-apply').isDisabled(),true);
    await page.locator('#melody-role').selectOption('CHORD');
    await page.locator('#melody-root').selectOption('9');
    await page.locator('#melody-scale').selectOption('MINOR');
    await page.locator('#melody-progression').selectOption('MINOR');
    await page.locator('#melody-rhythm').selectOption('SPARSE');
    await page.locator('#melody-preview').click();
    assert.equal(await page.locator('#melody-apply').isEnabled(),true);
    assert.equal(await page.locator('#melody-meta').textContent().then(s=>s.includes('DRAFT #1')),true);
    assert.equal(await page.locator('.melody-mini-cell[data-step="0"]').getAttribute('aria-label'),
      'Step 1: A4 + C5 + E5','A-minor chord is diatonic and uses 3 native MIDI notes');
    assert.equal(await page.locator('.step-cell[data-step="0"] .pitch').textContent(),'E3',
      'Melodic preview must leave editable notes intact');
    await page.locator('#melody-next').click();
    assert.equal(await page.locator('#melody-meta').textContent().then(s=>s.includes('DRAFT #2')),true);
    await page.locator('#melody-cancel').click();
    assert.equal(await page.locator('#melody-apply').isDisabled(),true);
    assert.equal(await page.locator('.step-cell[data-step="0"] .pitch').textContent(),'E3');
    await page.locator('#melody-preview').click();
    await page.locator('#melody-apply').click();
    assert.equal(await page.locator('.step-cell[data-step="0"] .pitch').textContent(),'A4 + C5 + E5',
      'APPLY materializes native chord in original step editor');
    assert.match(await page.locator('.step-cell[data-step="16"] .pitch').textContent(),
      /^(F4 \+ A4 \+ C5|A4 \+ C5 \+ F5)$/,
      'Full LEN 64 uses second chord in its own bar (root or open inversion)');
    await page.locator('#undo').click();
    assert.equal(await page.locator('.step-cell[data-step="0"] .pitch').textContent(),'E3',
      'One Undo restores the whole previous synth pattern');
    await page.locator('#redo').click();
    assert.equal(await page.locator('.step-cell[data-step="0"] .pitch').textContent(),'A4 + C5 + E5');
    await page.locator('#undo').click();
    assert.equal(await page.locator('.step-cell[data-step="0"] .pitch').textContent(),'E3');
    await page.screenshot({path:'ui-shots/research-hybrid-'+d.name+'-melody.png',fullPage:true});
    // Mutate an EXISTING synth score without changing its notes, preset or
    // the original editor until Apply. Accent changes velocity and Undo is atomic.
    await page.locator('#tool-mutation').click();
    assert.equal(await page.locator('#mutation-panel').isVisible(),true);
    assert.equal(await page.locator('#melody-panel').isVisible(),false);
    await page.locator('.step-cell[data-step="0"]').click(); // select, don't erase
    const originalVelocity=await page.locator('#velocity').inputValue();
    await page.locator('#mutation-mode').selectOption('ACCENT');
    await page.evaluate(()=>{
      const input=document.getElementById('mutation-amount');
      input.value='100';input.dispatchEvent(new Event('input',{bubbles:true}));
    });
    await page.locator('#mutation-preview').click();
    assert.equal(await page.locator('#mutation-apply').isEnabled(),true);
    assert.equal(await page.locator('#mutation-meta').textContent().then(s=>s.includes('DRAFT #1')),true);
    assert.equal(await page.locator('#velocity').inputValue(),originalVelocity,
      'Mutations must not change editable synth velocity until Apply');
    assert.equal(await page.locator('.mutation-mini-cell.changed').count()>0,true,
      'Mutation visually highlights changes even when notes stay in place');
    await page.locator('#mutation-next').click();
    assert.equal(await page.locator('#mutation-meta').textContent().then(s=>s.includes('DRAFT #2')),true);
    await page.locator('#mutation-cancel').click();
    assert.equal(await page.locator('#mutation-apply').isDisabled(),true);
    assert.equal(await page.locator('#velocity').inputValue(),originalVelocity);
    await page.locator('#mutation-preview').click();
    await page.locator('#mutation-apply').click();
    assert.notEqual(await page.locator('#velocity').inputValue(),originalVelocity,
      'Applied accents should alter native velocity, keeping the MIDI note intact');
    assert.equal(await page.locator('.step-cell[data-step="0"] .pitch').textContent(),'E3');
    await page.locator('#undo').click();
    assert.equal(await page.locator('#velocity').inputValue(),originalVelocity);
    await page.locator('#redo').click();
    assert.notEqual(await page.locator('#velocity').inputValue(),originalVelocity);
    await page.locator('#undo').click();
    await page.screenshot({path:'ui-shots/research-hybrid-'+d.name+'-mutation-synth.png',fullPage:true});


    await page.locator('.step-cell[data-step="63"]').click();
    assert.equal(await page.locator('.step-cell[data-step="63"] .pitch').textContent(),'B3',
      'STEP places latest selected pitch without entering Draw');
    await page.locator('#length').fill('16');await page.locator('#length').press('Tab');
    assert.equal(await page.locator('.step-cell').count(),16);
    await page.locator('#length').fill('64');await page.locator('#length').press('Tab');
    assert.equal(await page.locator('.step-cell[data-step="63"] .pitch').textContent(),'B3',
      'Length shrink must preserve step 64');
    await page.screenshot({path:'ui-shots/research-hybrid-'+d.name+'-step.png',fullPage:true});
    await page.locator('#roll-mode').click();
    assert.equal(await page.locator('.roll-cell[data-step="63"][data-note="59"]').getAttribute('aria-pressed'),'true');
    await page.screenshot({path:'ui-shots/research-hybrid-'+d.name+'-roll.png',fullPage:true});
    await page.locator('#tracks button').last().click();
    await page.locator('#roll-mode').click();
    await page.locator('.roll-cell[data-step="0"][data-note="0"]').click();
    assert.equal(await page.locator('.roll-cell[data-step="0"][data-note="0"]').getAttribute('aria-pressed'),'true',
      'Drum Roll one-tap hit input');
    await page.locator('#step-mode').click();
    assert.equal(await page.locator('.step-cell[data-step="0"] .pitch').textContent(),'●');
    await page.screenshot({path:'ui-shots/research-hybrid-'+d.name+'-drums.png',fullPage:true});
    // Groove ideas: visual/audio preview is nondestructive; APPLY is one Undo.
    assert.equal(await page.locator('#tool-melody').isVisible(),false,
      'Drums offers drum generation rather than inapplicable note generation');
    await page.locator('#tool-groove').click();
    assert.equal(await page.locator('#groove-panel').isVisible(),true);
    assert.equal(await page.locator('#groove-apply').isDisabled(),true);
    assert.equal(await page.locator('.step-cell[data-step="4"] .pitch').textContent(),'·');
    await page.locator('#groove-style').selectOption('HOUSE');
    await page.locator('#groove-preview').click();
    assert.equal(await page.locator('#groove-apply').isEnabled(),true);
    assert.equal(await page.locator('#groove-meta').textContent().then(s=>s.includes('DRAFT #1')),true);
    assert.equal(await page.locator('.groove-mini-cell[data-part="SNARE"][data-step="4"]').evaluate(e=>e.classList.contains('on')),true);
    assert.equal(await page.locator('.step-cell[data-step="4"] .pitch').textContent(),'·',
      'Preview must not commit pattern until Apply');
    await page.locator('#groove-next').click();
    assert.equal(await page.locator('#groove-meta').textContent().then(s=>s.includes('DRAFT #2')),true);
    await page.locator('#groove-cancel').click();
    assert.equal(await page.locator('#groove-apply').isDisabled(),true);
    assert.equal(await page.locator('.step-cell[data-step="4"] .pitch').textContent(),'·',
      'Cancel must preserve original drum pattern');
    await page.locator('#groove-preview').click();
    await page.locator('#groove-apply').click();
    assert.equal(await page.locator('.step-cell[data-step="4"] .pitch').textContent(),'●',
      'Groove Apply must commit generated kit to original SLOOP pattern');
    await page.locator('#undo').click();
    assert.equal(await page.locator('.step-cell[data-step="4"] .pitch').textContent(),'·',
      'One Undo restores previous native drum sequence');
    await page.locator('#redo').click();
    assert.equal(await page.locator('.step-cell[data-step="4"] .pitch').textContent(),'●');
    await page.screenshot({path:'ui-shots/research-hybrid-'+d.name+'-grooves.png',fullPage:true});
    // Mutate already-generated drum patterns, preserving sound kit and
    // all synth tracks. The candidate remains outside the editor until Apply.
    await page.locator('#tool-mutation').click();
    assert.equal(await page.locator('#mutation-panel').isVisible(),true);
    assert.equal(await page.locator('#groove-panel').isVisible(),false);
    await page.locator('#mutation-mode').selectOption('THIN');
    const oldGrooveHits=await page.locator('.groove-mini-cell.on').count();
    await page.locator('#mutation-preview').click();
    assert.equal(await page.locator('#mutation-apply').isEnabled(),true);
    assert.equal(await page.locator('.mutation-mini-cell.changed').count()>0,true);
    assert.equal(await page.locator('.groove-mini-cell.on').count(),oldGrooveHits,
      'Drum generator visual source stays unchanged through mutation audition');
    await page.locator('#mutation-apply').click();
    // Groove visualization is now lazy and contextual. Reopen the drum
    // generator to inspect the newly committed native score after mutation.
    await page.locator('#tool-groove').click();
    assert.equal(await page.locator('#groove-panel').isVisible(),true);
    const lessGrooveHits=await page.locator('.groove-mini-cell.on').count();
    assert(lessGrooveHits<oldGrooveHits,'Density-minus removes some existing drum hits');
    await page.locator('#undo').click();
    assert.equal(await page.locator('.groove-mini-cell.on').count(),oldGrooveHits,
      'Undo restores original drum pattern in one step');
    await page.locator('#redo').click();
    assert.equal(await page.locator('.groove-mini-cell.on').count(),lessGrooveHits);
    await page.locator('#undo').click();
    await page.screenshot({path:'ui-shots/research-hybrid-'+d.name+'-mutation-drums.png',fullPage:true});


    // SOUND uses a focused synth workflow and keeps complete source metadata in ALL.
    await page.locator('#tracks button').first().click();
    // Instant track sound from PATTERN: change native filter without leaving
    // the score. Same live input and one Undo as full Sound workspace.
    assert.equal(await page.locator('#quick-sound').isVisible(),true);
    assert.equal(await page.locator('#quick-sound-preset option').count()>=3,true);
    const quickFilter=page.locator('#quick-sound-controls .dial-control[data-param="50"] input');
    assert.equal(await quickFilter.count(),1,'Quick filter uses an accessible rotary range');
    const quickOld=Number(await quickFilter.inputValue());
    await page.evaluate(()=>{
      const el=document.querySelector('#quick-sound-controls .dial-control[data-param="50"] input');
      const next=Number(el.value)===Number(el.max)?Number(el.min):Number(el.max);
      el.value=String(next);el.dispatchEvent(new Event('input',{bubbles:true}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
    });
    assert.notEqual(Number(await page.locator('#quick-sound-controls .dial-control[data-param="50"] input').inputValue()),quickOld,
      'Quick native filter edits should apply from the Pattern');
    await page.locator('#undo').click();
    assert.equal(Number(await page.locator('#quick-sound-controls .dial-control[data-param="50"] input').inputValue()),quickOld,
      'One Undo restores the inline filter move');
    await page.locator('#quick-sound-open').click();
    assert.equal(await page.locator('#sound-tab').getAttribute('aria-pressed'),'true',
      'One click from Pattern opens Sound for the selected track');
    assert.equal(await page.locator('#sound-panel').isVisible(),true);
    assert.equal(await page.locator('#pattern-panel').isVisible(),false);
    // Sound graphs now ARE controls. No Edit hop and no decorative dead charts.
    assert.equal(await page.locator('#scope-canvas').isVisible(),false,
      'Real oscilloscope is optional instead of permanently occupying the first viewport');
    assert.equal(await page.locator('#sound-more').getAttribute('open'),null,
      'Rare native pages are collapsed by default');
    assert.equal(await page.locator('.sound-viz').count(),3);
    assert.equal(await page.locator('[data-sound-jump]').count(),0,
      'Every graph is editable here without secondary navigation');
    assert.equal(await page.locator('#viz-env-handles circle').count(),4);
    for(const id of ['viz-env-line','viz-lfo-line','viz-filter-line'])
      assert.match(await page.locator('#'+id).getAttribute('d'),/^M /);
    assert.equal(await page.locator('#viz-lfo-wave option').count(),5,
      'Wave selection must match original SLOOP enum SIN/TRI/SAW/SQR/S&H');
    assert.equal(await page.locator('#viz-lfo-sync option').count(),11);
    assert.equal(await page.locator('#sound-macros .sound-control').count(),8,
      'Native engine macros remain in main sound surface');
    assert.equal(await page.locator('#engine-select option').count(),12);
    assert.equal(await page.locator('#preset-select option').count()>=3,true);
    assert.equal(await page.locator('#sound-shape .sound-control[data-param="28"] input').inputValue(),'-24',
      'Original WOBBLE transpose is untouched');

    // Native ADSR values edit the waveform immediately and Undo restores both.
    const oldAttack=await page.locator('#viz-env-attack').inputValue();
    const envStart=await page.locator('#viz-env-line').getAttribute('d');
    await page.locator('#viz-env-attack').fill(oldAttack==='90'?'35':'90');
    assert.notEqual(await page.locator('#viz-env-line').getAttribute('d'),envStart);
    await page.locator('#viz-env-attack').dispatchEvent('change');
    await page.locator('#undo').click();
    assert.equal(await page.locator('#viz-env-attack').inputValue(),oldAttack);
    assert.equal(await page.locator('#viz-env-line').getAttribute('d'),envStart);

    // The actual Wave enum edits SLOOP parameter #10 in place (no Edit).
    const oldWave=await page.locator('#viz-lfo-wave').inputValue();
    const oldLfoPath=await page.locator('#viz-lfo-line').getAttribute('d');
    await page.locator('#viz-lfo-wave').selectOption(oldWave==='4'?'0':'4');
    assert.notEqual(await page.locator('#viz-lfo-line').getAttribute('d'),oldLfoPath);
    await page.locator('#undo').click();
    assert.equal(await page.locator('#viz-lfo-wave').inputValue(),oldWave);

    // A single two-dimensional gesture simultaneously edits real native
    // RATE and FILTER DEPTH and is one atomic Undo.
    const rateBefore=await page.locator('#viz-lfo-rate').inputValue();
    const depthBefore=await page.locator('#viz-lfo-depth').inputValue();
    await page.locator('#viz-lfo').scrollIntoViewIfNeeded();
    const lfoBox=await page.locator('#viz-lfo').boundingBox();
    assert(lfoBox.y>=0&&lfoBox.y+lfoBox.height<=(d.name==='phone'?844:900),
      'Pointer test must target an actually visible LFO card');
    assert(lfoBox,'Editable LFO plot must have a hit area');
    await page.mouse.move(lfoBox.x+lfoBox.width*.30,lfoBox.y+lfoBox.height*.60);
    await page.mouse.down();
    await page.mouse.move(lfoBox.x+lfoBox.width*.87,lfoBox.y+lfoBox.height*.18,{steps:6});
    await page.mouse.up();
    assert.notEqual(await page.locator('#viz-lfo-rate').inputValue(),rateBefore);
    assert.notEqual(await page.locator('#viz-lfo-depth').inputValue(),depthBefore);
    await page.locator('#undo').click();
    assert.equal(await page.locator('#viz-lfo-rate').inputValue(),rateBefore);
    assert.equal(await page.locator('#viz-lfo-depth').inputValue(),depthBefore,
      'One Undo restores both axes of LFO gesture');

    const tiltBefore=await page.locator('#viz-filter-tilt').inputValue();
    const offsetBefore=await page.locator('#viz-filter-offset').inputValue();
    await page.locator('#viz-filter').scrollIntoViewIfNeeded();
    const filterBox=await page.locator('#viz-filter').boundingBox();
    await page.mouse.move(filterBox.x+filterBox.width*.25,filterBox.y+filterBox.height*.70);
    await page.mouse.down();
    await page.mouse.move(filterBox.x+filterBox.width*.91,filterBox.y+filterBox.height*.14,{steps:6});
    await page.mouse.up();
    assert.notEqual(await page.locator('#viz-filter-tilt').inputValue(),tiltBefore);
    assert.notEqual(await page.locator('#viz-filter-offset').inputValue(),offsetBefore);
    await page.locator('#undo').click();
    assert.equal(await page.locator('#viz-filter-tilt').inputValue(),tiltBefore);
    assert.equal(await page.locator('#viz-filter-offset').inputValue(),offsetBefore);

    // Native rate is bypassed when beat-sync controls LFO speed.
    await page.locator('#viz-lfo-sync').selectOption('3');
    assert.equal(await page.locator('#viz-lfo-rate').isDisabled(),true);
    await page.locator('#viz-lfo-sync').selectOption('0');
    assert.equal(await page.locator('#viz-lfo-rate').isEnabled(),true);
    await page.locator('#sound-scope summary').click();
    assert.equal(await page.locator('#scope-canvas').isVisible(),true);
    // Instrument audition works without any notes placed in the pattern and
    // feeds the real waveform scope via SLOOP's audio-thread meter.
    await page.locator('#sound-audition').click();
    assert.match(await page.locator('#status').textContent(),/AUDITION · [A-G]/);
    await page.waitForFunction(()=>document.getElementById('scope-state').textContent.startsWith('LIVE / DSP AUDIO'),
      {timeout:15000});
    await page.locator('#sound-more summary').click();
    assert.equal(await page.locator('#sound-pages').isVisible(),true);
    await page.locator('#sound-pages button[data-sound-page="lfo"]').click();
    assert.equal(await page.locator('#sound-lfo .sound-control').count(),11);
    assert.equal(await page.locator('#sound-lfo .sound-control[data-param="14"] input').inputValue(),'40',
      'Native WOBBLE filter modulation baseline remains intact');

    // Instrument only the real AudioWorklet boundary: a slider input without
    // mouseup/change MUST emit a live param command before the gesture ends.
    await page.evaluate(async()=>{
      const {LocalPreview}=await import('/web/preview.js');
      const original=LocalPreview.prototype.trackParam;
      window.liveParamMessages=[];
      LocalPreview.prototype.trackParam=function(...args){
        window.liveParamMessages.push(args);
        return original.apply(this,args);
      };
    });
    await page.locator('#play').click();
    await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('PLAYING / SLOOP WASM'),
      {timeout:15000});
    await page.waitForFunction(()=>document.getElementById('scope-state').textContent.startsWith('LIVE / DSP AUDIO'),
      {timeout:15000});
    assert.match(await page.locator('#scope-peak').textContent(),/^PEAK \d+%$/,
      'Oscilloscope reports observed output from SLOOP AudioWorklet');
    const nativeFilter=page.locator('#sound-lfo .sound-control[data-param="14"] input');
    await page.evaluate(()=>{
      const range=document.querySelector('#sound-lfo .sound-control[data-param="14"] input');
      window.draggedFilterNode=range;
      range.value='54';range.dispatchEvent(new Event('input',{bubbles:true}));
      range.value='61';range.dispatchEvent(new Event('input',{bubbles:true}));
    });
    const live=await page.evaluate(()=>({
      moves:window.liveParamMessages,
      connected:window.draggedFilterNode.isConnected,
      current:window.draggedFilterNode.value
    }));
    assert.deepEqual(live.moves.map(x=>x.slice(0,2)),[[0,14],[0,14]],'Live updates reach audio on every input');
    assert.equal(live.moves.at(-1)[2],61);
    assert.equal(live.connected,true,'Dragging must NOT rebuild/replace the control node');
    assert.equal(live.current,'61');
    await nativeFilter.dispatchEvent('change');
    assert.equal(await nativeFilter.inputValue(),'61');
    await page.locator('#undo').click();
    assert.equal(await nativeFilter.inputValue(),'40','Whole drag reverts in one Undo');
    await page.locator('#redo').click();
    assert.equal(await nativeFilter.inputValue(),'61','Redo restores final live setting');

    await page.locator('#sound-pages button[data-sound-page="envelope"]').click();
    assert.equal(await page.locator('#sound-envelope .sound-control').count(),5);
    await page.locator('#sound-pages button[data-sound-page="fx"]').click();
    assert.equal(await page.locator('#sound-fx .sound-control').count(),10);
    await page.locator('#sound-pages button[data-sound-page="performance"]').click();
    assert.equal(await page.locator('#sound-performance .sound-control').count()>15,true);
    await page.locator('#sound-pages button[data-sound-page="mix"]').click();
    assert.equal(await page.locator('#sound-mix .sound-control').count(),4);
    await page.locator('#sound-pages button[data-sound-page="advanced"]').click();
    await page.locator('#all-params summary').click();
    assert.equal(await page.locator('#param-count').textContent(),'63');
    await page.waitForFunction(()=>document.querySelectorAll('#sound-advanced-controls .sound-control').length>20,
      {timeout:10000});
    await page.locator('#sound-search').fill('filter');
    assert.equal(await page.locator('#sound-advanced-controls .sound-control').count()>=1,true);
    assert.equal(await page.locator('#sound-advanced-controls .sound-control').count()<20,true,'Search narrows source controls');
    await page.locator('#sound-search').fill('');
    await page.locator('#all-globals summary').click();
    assert.equal(await page.locator('#global-count').textContent(),'49');
    await page.waitForFunction(()=>document.querySelectorAll('#sound-global-controls .sound-control').length>10,
      {timeout:10000});
    await page.locator('#sound-more summary').click();
    await page.locator('#sound-scope summary').click();
    await page.screenshot({path:'ui-shots/research-hybrid-'+d.name+'-sound.png',fullPage:true});

    // Synth controls must not bleed into the drum kit editor.
    await page.locator('#tracks button').last().click();
    assert.equal(await page.locator('#sound-pages button[data-sound-page="lfo"]').isVisible(),false);
    assert.equal(await page.locator('#sound-pages button[data-sound-page="envelope"]').isVisible(),false);
    assert.equal(await page.locator('#kit-select').isVisible(),true);
    await page.screenshot({path:'ui-shots/research-hybrid-'+d.name+'-kit.png',fullPage:true});
    await page.locator('#tracks button').first().click();
    await page.locator('#engine-select').selectOption('1');
    assert.equal(await page.locator('#engine-select').inputValue(),'1');
    await page.locator('#preset-select').selectOption('1');
    assert.equal(await page.locator('#preset-select').inputValue(),'1');
    // One real browser audio start/stop smoke check; audio doesn't use a second oscillator.
    await page.locator('#stop').click();
    assert.equal(await page.locator('#status').textContent(),'STOPPED');
    await page.locator('#pattern-tab').click();
    // Returning from SOUND must retain the track's previously selected ROLL mode.
    assert.equal(await page.locator('#roll-mode').getAttribute('aria-pressed'),'true');
    await page.locator('#step-mode').click();
    assert.equal(await page.locator('.step-cell[data-step="0"] .pitch').textContent(),'E3',
      'Changing factory sound never erases notes');
    const widths=await page.evaluate(()=>({doc:document.documentElement.scrollWidth,view:innerWidth}));
    assert(widths.doc<=widths.view+1,'Unintended page horizontal overflow '+JSON.stringify(widths));
    assert.deepEqual(failures,[],d.name+' JavaScript console exceptions');
    await context.close();
    console.log('PASS '+d.name+': native 153-bank/WOBBLE, tempo Undo, STEP/ROLL, Sound and real SLOOP WASM');
  }
}finally{await browser?.close();await new Promise(r=>server.close(r));}
