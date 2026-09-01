import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { measureDomPaintCollision } from './czech-dom-paint-collision.mjs';

const BASE=(process.env.TYPO_BASE_URL||'http://127.0.0.1:8788').replace(/\/$/,'');
const TEXT='Řekněte nám, co se děje.';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const report={baseUrl:BASE,text:TEXT,negative:null,positive:null,pass:false};
try{
  const context=await browser.newContext({viewport:{width:390,height:900},deviceScaleFactor:1});
  const page=await context.newPage();
  const response=await page.goto(BASE+'/',{waitUntil:'domcontentloaded',timeout:30000});
  if(response?.status()!==200) throw new Error(`fixture route status ${response?.status()}`);
  await page.evaluate(async()=>document.fonts.ready);
  await page.evaluate((text)=>{
    const host=document.createElement('div');
    host.id='collision-calibration-host';
    host.style.cssText='position:fixed;left:0;top:0;width:390px;height:900px;padding:20px;background:#fff;z-index:2147483647;overflow:hidden;';
    host.innerHTML=`<h2 id="collision-negative">${text}</h2><h2 id="collision-positive">${text}</h2>`;
    document.body.append(host);
    for(const [id,lineHeight,top] of [['collision-negative','1','40px'],['collision-positive','.65','360px']]){
      const el=document.getElementById(id);
      el.style.cssText=`position:absolute;left:20px;top:${top};width:285px;margin:0;color:#111;background:#fff;font-family:Cormorant, Georgia, serif;font-size:58px;font-weight:500;font-style:normal;letter-spacing:-0.02em;line-height:${lineHeight};`;
    }
  },TEXT);
  await page.evaluate(async(text)=>{await document.fonts.load('500 58px Cormorant',text);await document.fonts.ready;},TEXT);
  const fixtureMeta=await page.evaluate(()=>Object.fromEntries(['collision-negative','collision-positive'].map(id=>{const el=document.getElementById(id),s=getComputedStyle(el),r=el.getBoundingClientRect();return [id,{fontFamily:s.fontFamily,fontSize:s.fontSize,fontWeight:s.fontWeight,lineHeight:s.lineHeight,width:r.width,height:r.height,text:el.textContent}]})));
  report.negative={fixture:fixtureMeta['collision-negative'],measurement:await measureDomPaintCollision(page,'#collision-negative',{evidencePath:'calibration-negative.png'})};
  report.positive={fixture:fixtureMeta['collision-positive'],measurement:await measureDomPaintCollision(page,'#collision-positive',{evidencePath:'calibration-positive.png'})};
  report.pass=report.negative.measurement.collisionPixels===0&&report.positive.measurement.collisionPixels>0;
  fs.writeFileSync('czech-dom-paint-calibration.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  if(!report.pass){
    console.error(`DOM PAINT COLLISION CALIBRATION: FAIL negative=${report.negative.measurement.collisionPixels} positive=${report.positive.measurement.collisionPixels}`);
    process.exitCode=1;
  }else console.log('DOM PAINT COLLISION CALIBRATION: PASS');
  await context.close();
}finally{await browser.close();}
