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
    // SOUND: native metadata-driven factory sound and controls on the same track.
    await page.locator('#tracks button').first().click();
    await page.locator('#sound-tab').click();
    assert.equal(await page.locator('#sound-panel').isVisible(),true);
    assert.equal(await page.locator('#pattern-panel').isVisible(),false);
    assert.equal(await page.locator('#engine-select option').count(),12);
    assert.equal(await page.locator('#preset-select option').count()>=3,true);
    await page.locator('#engine-select').selectOption('1');
    assert.equal(await page.locator('#engine-select').inputValue(),'1');
    await page.locator('#preset-select').selectOption('1');
    assert.equal(await page.locator('#preset-select').inputValue(),'1');
    assert.equal(await page.locator('#sound-macros .sound-control').count()>1,true);
    assert.equal(await page.locator('#sound-shape .sound-control').count()>1,true);
    assert.equal(await page.locator('#sound-fx .sound-control').count()>1,true);
    // Change a live DSP slider/enum and verify Undo applies in Sound too.
    const firstRange=page.locator('#sound-macros input[type=range]').first();
    if(await firstRange.count()){
      const original=await firstRange.inputValue();
      const max=Number(await firstRange.getAttribute('max'));
      const min=Number(await firstRange.getAttribute('min'));
      const wanted=String(Number(original)===max?min:max);
      await firstRange.fill(wanted);
      await firstRange.dispatchEvent('change');
      assert.equal(await page.locator('#sound-macros input[type=range]').first().inputValue(),wanted);
      await page.locator('#undo').click();
      assert.equal(await page.locator('#sound-macros input[type=range]').first().inputValue(),original);
    }
    await page.locator('#all-params summary').click();
    assert.equal(await page.locator('#param-count').textContent(),'63');
    await page.waitForFunction(()=>document.querySelectorAll('#sound-advanced-controls .sound-control').length>20,
      {timeout:10000});
    assert.equal(await page.locator('#sound-advanced-controls .sound-control').count()>20,true);
    await page.locator('#all-globals summary').click();
    assert.equal(await page.locator('#global-count').textContent(),'49');
    await page.waitForFunction(()=>document.querySelectorAll('#sound-global-controls .sound-control').length>10,
      {timeout:10000});
    assert.equal(await page.locator('#sound-global-controls .sound-control').count()>10,true);
    await page.screenshot({path:'ui-shots/research-hybrid-'+d.name+'-sound.png',fullPage:true});
    // One real browser audio start/stop smoke check; audio doesn't use a second oscillator.
    await page.locator('#play').click();
    await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('PLAYING / SLOOP WASM'),
      {timeout:15000});
    await page.locator('#stop').click();
    assert.equal(await page.locator('#status').textContent(),'STOPPED');
    await page.locator('#pattern-tab').click();
    assert.equal(await page.locator('.step-cell[data-step="0"] .pitch').textContent(),'E3',
      'Changing factory sound never erases notes');
    const widths=await page.evaluate(()=>({doc:document.documentElement.scrollWidth,view:innerWidth}));
    assert(widths.doc<=widths.view+1,'Unintended page horizontal overflow '+JSON.stringify(widths));
    assert.deepEqual(failures,[],d.name+' JavaScript console exceptions');
    await context.close();
    console.log('PASS '+d.name+': direct STEP/ROLL input, Sound UI, Undo, 64 steps and live SLOOP WASM');
  }
}finally{await browser?.close();await new Promise(r=>server.close(r));}
