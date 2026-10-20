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

    // SOUND uses a focused synth workflow and keeps complete source metadata in ALL.
    await page.locator('#tracks button').first().click();
    await page.locator('#sound-tab').click();
    assert.equal(await page.locator('#sound-panel').isVisible(),true);
    assert.equal(await page.locator('#pattern-panel').isVisible(),false);
    assert.equal(await page.locator('#engine-select option').count(),12);
    assert.equal(await page.locator('#preset-select option').count()>=3,true);
    assert.equal(await page.locator('#sound-macros .sound-control').count(),8,'Eight original synth controls in TONE');
    assert.equal(await page.locator('#sound-shape .sound-control[data-param="28"] input').inputValue(),'-24',
      'Native WOBBLE transpose must be exposed in TONE');
    await page.locator('#sound-pages button[data-sound-page="lfo"]').click();
    assert.equal(await page.locator('#sound-lfo .sound-control').count(),11,'Complete native LFO controls');
    assert.equal(await page.locator('#sound-lfo .sound-control[data-param="14"] input').inputValue(),'40',
      'Native WOBBLE LFO-to-filter depth retained');
    assert.equal(await page.locator('#sound-macros').isVisible(),false,'Inactive pages not a long scroll');

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
