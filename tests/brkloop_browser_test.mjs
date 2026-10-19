// SPDX-License-Identifier: GPL-3.0-only
// Browser-level regression for the responsive BRKLOOP UI using the actual built site.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright-core';

const root=resolve('dist/site');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{
  try {
    const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const path=resolve(root,'.'+(name==='/'?'/index.html':name));
    if(!(path===root || path.startsWith(root+sep)))throw Error('Invalid path');
    const data=await readFile(path);
    res.writeHead(200,{'content-type':mime[extname(path)]||'application/octet-stream','cache-control':'no-store'});
    res.end(data);
  }catch(error){res.writeHead(404);res.end('Not found');}
});
await new Promise((r)=>server.listen(0,'127.0.0.1',r));
const url='http://127.0.0.1:'+server.address().port+'/';
let browser;
try{
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',
    args:['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required']});
  await mkdir('ui-shots',{recursive:true});
  for(const device of [
    {name:'phone',viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true},
    {name:'desktop',viewport:{width:1440,height:900},deviceScaleFactor:1}
  ]){
    const context=await browser.newContext({viewport:device.viewport,deviceScaleFactor:device.deviceScaleFactor,isMobile:device.isMobile||false,hasTouch:device.hasTouch||false});
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url,{waitUntil:'networkidle'});
    await page.locator('.synth-cells .step-cell').first().waitFor();
    assert.equal(await page.locator('.synth-cells .step-cell').count(),16,device.name+' must expose 16 synth cells without paging');
    assert.equal(await page.locator('.synth-cells .step-cell[data-step="0"]').count(),1,'first step must exist and be visible');
    assert.equal(await page.locator('.synth-cells .step-cell[data-step="15"]').count(),1,'step 16 must exist');
    assert.equal(await page.locator('.white-key').count(),8,'white piano keys C..C');
    assert.equal(await page.locator('.black-key').count(),5,'black piano keys');
    assert.equal(await page.locator('.white-key').first().textContent(),'C3');
    assert.equal(await page.locator('.white-key').last().textContent(),'C4');
    assert.equal(await page.locator('#prev-page').count(),0,'obsolete paginator absent');
    assert.equal(await page.locator('#next-page').count(),0,'obsolete paginator absent');
    // Native SLOOP allows 1..64 independent steps per track; expose the whole range without pagination.
    for(const len of [17,32]){
      await page.locator('#pattern-length').fill(String(len));
      await page.locator('#pattern-length').press('Tab');
      assert.equal(await page.locator('.synth-cells .step-cell').count(),len,'pattern length '+len+' exposes every step');
      assert.equal(await page.locator('.synth-cells .step-cell[data-step="'+(len-1)+'"]').count(),1,'last step is reachable at '+len);
    }
    await page.locator('#pattern-length').fill('64');
    await page.locator('#pattern-length').press('Tab');
    assert.equal(await page.locator('.synth-cells .step-cell').count(),64,'full 64-step synth pattern must be editable');
    assert.equal(await page.locator('.pattern-section').count(),4,'4 sequential 16-step groups');
    assert.equal(await page.locator('.synth-cells .step-cell[data-step="63"]').count(),1,'last step 64 is reachable');
    await page.locator('.synth-cells .step-cell[data-step="63"]').click();
    assert.equal(await page.locator('#step-editor').isVisible(),true,'selected step has parameter editor');
    await page.locator('#voice-0').selectOption('73');
    await page.locator('#step-micro').fill('-12');
    await page.locator('#step-micro').press('Tab');
    await page.locator('#step-fill').selectOption('1');
    await page.locator('#pattern-division').selectOption('3');
    await page.waitForTimeout(450);
    const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('brkloop.groove.v1')));
    assert.equal(before.state.tracks[0].p[29],64,'sequencer length follows firmware param 29');
    assert.equal(before.state.tracks[0].p[30],3,'division follows firmware param 30');
    assert.equal(before.state.tracks[0].step[63].notes[0],73,'edited step 64 note saved');
    assert.equal(before.state.tracks[0].micro[63],-12,'step 64 microtiming saved');
    assert.equal((before.state.tracks[0].fill[15]>>6)&3,1,'step 64 fill condition saved');
    // Reducing length is non-destructive: original data beyond length survives.
    await page.locator('#pattern-length').fill('16');
    await page.locator('#pattern-length').press('Tab');
    assert.equal(await page.locator('.synth-cells .step-cell').count(),16);
    await page.locator('#pattern-length').fill('64');
    await page.locator('#pattern-length').press('Tab');
    assert.equal(await page.locator('.synth-cells .step-cell[data-step="63"]').textContent(),'C#5');
    await page.locator('#pattern-length').fill('16');
    await page.locator('#pattern-length').press('Tab');
    await page.waitForTimeout(250);
    await page.screenshot({path:'ui-shots/'+device.name+'-64-step.png',fullPage:true});
    await page.screenshot({path:'ui-shots/'+device.name+'-sequence.png',fullPage:true});
    await page.locator('.track-card').last().click();
    assert.equal(await page.locator('.drum-lane').count(),16);
    assert.equal(await page.locator('.drum-cells .step-cell').count(),256);
    await page.locator('.drum-cells .step-cell').first().click();
    assert.equal(await page.locator('.drum-cells .selected-step').count(),1,'drum selection cannot highlight every lane');
    await page.locator('#drum-level').selectOption('3');
    await page.locator('#drum-ratchet').selectOption('1');
    await page.waitForTimeout(250);
    const drumState=await page.evaluate(()=>JSON.parse(localStorage.getItem('brkloop.groove.v1')).state.tracks[3].dstep[0]);
    assert.equal(drumState.lvl[0],3,'drum-level persisted');
    assert.equal(drumState.rat[0],1,'drum-ratchet persisted');
    await page.locator('#pattern-length').fill('64');
    await page.locator('#pattern-length').press('Tab');
    assert.equal(await page.locator('.drum-cells .step-cell').count(),1024,'all drum lanes × 64 steps must be available');
    assert.equal(await page.locator('.drum-cells .step-cell[data-step="63"]').count(),16,'step 64 on every lane');
    await page.locator('#pattern-length').fill('16');
    await page.locator('#pattern-length').press('Tab');

    if(device.name==='phone'){
      const width=await page.evaluate(()=>({body:document.documentElement.scrollWidth,viewport:innerWidth}));
      assert(width.body<=width.viewport+1,'horizontal overflow: '+JSON.stringify(width));
    }
    await page.screenshot({path:'ui-shots/'+device.name+'-drums.png',fullPage:true});
    if(device.name==='phone')await page.locator('[data-view="sound"]').click();
    assert.equal(await page.locator('#env-section').isHidden(),true,'ADSR is hidden for drums');
    assert.equal(await page.locator('#drum-sound').isVisible(),true);
    await page.screenshot({path:'ui-shots/'+device.name+'-sound.png',fullPage:true});
    if(device.name==='phone')await page.locator('[data-view="mixer"]').click();
    await page.screenshot({path:'ui-shots/'+device.name+'-mixer.png',fullPage:true});
    assert.deepEqual(errors,[],device.name+' browser errors');
    await context.close();
    console.log(device.name,'16-step layout, keyboard, drum selection and responsive modes passed');
  }
}finally{await browser?.close();await new Promise(r=>server.close(r));}
