import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { measureDomPaintCollision } from './czech-dom-paint-collision.mjs';

const BASE=(process.env.TYPO_BASE_URL||'http://127.0.0.1:8788').replace(/\/$/,'');
const VALUES=[.99,.995,1,1.005];
const REPEATS=5;
const TARGET={route:'/realizace/',width:320,selector:'.case h2',text:'Hybernská 2/997'};

const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const report={baseUrl:BASE,target:TARGET,repeats:REPEATS,values:[],smallestStableZero:null};
try{
  for(const value of VALUES){
    let totalPixels=0; let failures=0; const runs=[];
    for(let repeat=1;repeat<=REPEATS;repeat++){
      const context=await browser.newContext({viewport:{width:TARGET.width,height:1000},deviceScaleFactor:1});
      const page=await context.newPage();
      try{
        const response=await page.goto(BASE+TARGET.route,{waitUntil:'domcontentloaded',timeout:30000});
        await page.waitForTimeout(120);
        await page.evaluate(async()=>document.fonts.ready);
        if(response?.status()!==200) throw new Error(`HTTP ${response?.status()} ${TARGET.route}`);
        const found=await page.evaluate(({selector,text,value})=>{
          const normalized=s=>(s||'').replace(/\s+/g,' ').trim();
          const el=[...document.querySelectorAll(selector)].find(node=>normalized(node.textContent)===text);
          if(!el)return false;
          el.setAttribute('data-czech-line-height-sweep','target');
          el.style.setProperty('line-height',String(value),'important');
          return true;
        },{selector:TARGET.selector,text:TARGET.text,value});
        if(!found)throw new Error(`Target not found: ${TARGET.selector} ${TARGET.text}`);
        await page.waitForTimeout(40);
        const m=await measureDomPaintCollision(page,'[data-czech-line-height-sweep="target"]');
        const pixels=m.collisionPixels||0;
        totalPixels+=pixels;
        if(pixels>0)failures++;
        runs.push({repeat,value,fontSize:m.fontSize,lineHeight:m.lineHeight,collisionPixels:pixels,pairs:m.pairs});
      }catch(error){
        failures++;
        runs.push({repeat,value,error:String(error)});
      }finally{
        await page.close();
        await context.close();
      }
    }
    const row={value,totalPixels,failures,runs};
    report.values.push(row);
    console.log(JSON.stringify({value,totalPixels,failures,repeats:REPEATS}));
    if(report.smallestStableZero===null&&failures===0&&totalPixels===0)report.smallestStableZero=value;
  }
}finally{await browser.close();}
fs.writeFileSync('czech-line-height-sweep.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({smallestStableZero:report.smallestStableZero}));
if(report.smallestStableZero===null){console.error('LINE HEIGHT SWEEP: NO STABLE ZERO-COLLISION VALUE');process.exit(1)}
console.log('LINE HEIGHT SWEEP: PASS');
