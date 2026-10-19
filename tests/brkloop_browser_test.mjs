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
    await page.screenshot({path:'ui-shots/'+device.name+'-sequence.png',fullPage:true});
    await page.locator('.track-card').last().click();
    assert.equal(await page.locator('.drum-lane').count(),16);
    assert.equal(await page.locator('.drum-cells .step-cell').count(),256);
    await page.locator('.drum-cells .step-cell').first().click();
    assert.equal(await page.locator('.drum-cells .selected-step').count(),1,'drum selection cannot highlight every lane');
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
