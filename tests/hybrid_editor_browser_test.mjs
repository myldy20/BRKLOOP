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
    await page.locator('.step-cell[data-step="0"]').click();
    assert.equal(await page.locator('.step-cell[data-step="0"] .pitch').textContent(),'·','Selecting step never silently inserts a note');
    await page.locator('.piano-key[data-note="48"]').click();
    assert.equal(await page.locator('.step-cell[data-step="0"] .pitch').textContent(),'C3','Keyboard writes immediately');
    await page.locator('#roll-mode').click();
    assert.equal(await page.locator('.roll-cell[data-step="0"][data-note="48"]').getAttribute('aria-pressed'),'true',
      'STEP writes appear immediately in ROLL');
    await page.locator('[data-tool="draw"]').click();
    await page.locator('.roll-cell[data-step="1"][data-note="52"]').click();
    assert.equal(await page.locator('.roll-cell[data-step="1"][data-note="52"]').getAttribute('aria-pressed'),'true',
      'ROLL writes a new pitch to native SLOOP step');
    await page.locator('#undo').click();
    assert.equal(await page.locator('.roll-cell[data-step="1"][data-note="52"]').getAttribute('aria-pressed'),'false');
    await page.locator('#redo').click();
    assert.equal(await page.locator('.roll-cell[data-step="1"][data-note="52"]').getAttribute('aria-pressed'),'true');
    await page.locator('#step-mode').click();
    assert.equal(await page.locator('.step-cell[data-step="1"] .pitch').textContent(),'E3','ROLL writes persist in STEP');
    await page.locator('#chord').click();
    await page.locator('.piano-key[data-note="55"]').click();
    await page.locator('.piano-key[data-note="59"]').click();
    await page.locator('#chord-done').click();
    assert.equal(await page.locator('.step-cell[data-step="1"] .pitch').textContent(),'E3 + G3 + B3','Chord one commit');
    await page.locator('#undo').click();
    assert.equal(await page.locator('.step-cell[data-step="1"] .pitch').textContent(),'E3','One Undo removes whole chord addition');
    await page.locator('[data-tool="select"]').click();
    await page.locator('#length').fill('64');await page.locator('#length').press('Tab');
    assert.equal(await page.locator('.step-cell').count(),64);
    await page.locator('.step-cell[data-step="63"]').click();
    await page.locator('.piano-key[data-note="48"]').click();
    assert.equal(await page.locator('.step-cell[data-step="63"] .pitch').textContent(),'C3');
    await page.locator('#length').fill('16');await page.locator('#length').press('Tab');
    assert.equal(await page.locator('.step-cell').count(),16);
    await page.locator('#length').fill('64');await page.locator('#length').press('Tab');
    assert.equal(await page.locator('.step-cell[data-step="63"] .pitch').textContent(),'C3',
      'Non-destructive shortening preserves hidden step 64');
    await page.screenshot({path:'ui-shots/research-hybrid-'+d.name+'-step.png',fullPage:true});
    await page.locator('#roll-mode').click();
    assert.equal(await page.locator('.roll-cell[data-step="63"][data-note="48"]').getAttribute('aria-pressed'),'true');
    await page.screenshot({path:'ui-shots/research-hybrid-'+d.name+'-roll.png',fullPage:true});
    await page.locator('#tracks button').last().click();
    await page.locator('#roll-mode').click();
    await page.locator('[data-tool="draw"]').click();
    await page.locator('.roll-cell[data-step="0"][data-note="0"]').click();
    assert.equal(await page.locator('.roll-cell[data-step="0"][data-note="0"]').getAttribute('aria-pressed'),'true',
      'Drum ROLL writes lane 0');
    await page.locator('#step-mode').click();
    assert.equal(await page.locator('.step-cell[data-step="0"] .pitch').textContent(),'●',
      'Drum native hit is shared across both editors');
    await page.screenshot({path:'ui-shots/research-hybrid-'+d.name+'-drums.png',fullPage:true});
    // One real browser audio start/stop smoke check: the research canvas shares
    // the original SLOOP AudioWorklet, never a synthetic oscillator.
    await page.locator('#play').click();
    await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('PLAYING / SLOOP WASM'),
      {timeout:15000});
    await page.locator('#stop').click();
    assert.equal(await page.locator('#status').textContent(),'STOPPED');
    const widths=await page.evaluate(()=>({doc:document.documentElement.scrollWidth,view:innerWidth}));
    assert(widths.doc<=widths.view+1,'Unintended page horizontal overflow '+JSON.stringify(widths));
    assert.deepEqual(failures,[],d.name+' JavaScript console exceptions');
    await context.close();
    console.log('PASS '+d.name+': equal STEP/ROLL note/chord/drums, Undo, 64-step and responsive layout');
  }
}finally{await browser?.close();await new Promise(r=>server.close(r));}
