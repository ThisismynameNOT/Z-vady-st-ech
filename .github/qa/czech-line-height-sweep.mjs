import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { measureDomPaintCollision } from './czech-dom-paint-collision.mjs';

const BASE=(process.env.TYPO_BASE_URL||'http://127.0.0.1:8788').replace(/\/$/,'');
const GROUPS=[
  {
    name:'service-detail', selector:'.service-detail h2', values:[1,1.01,1.02,1.03,1.04,1.05,1.06],
    cases:[
      ['/sluzby/',320,'Opravy a údržba střech'],['/sluzby/',375,'Opravy a údržba střech'],['/sluzby/',390,'Opravy a údržba střech'],['/sluzby/',1024,'Opravy a údržba střech'],
      ['/sluzby/',320,'Klempířské a detailní práce'],['/sluzby/',375,'Klempířské a detailní práce'],
    ],
  },
  {
    name:'realizace-case', selector:'.case h2', values:[.9,.91,.92,.93,.94,.95,.96,.97,.98,.99,1],
    cases:[['/realizace/',320,'Gymnázium prof. Jana Patočky'],['/realizace/',1024,'Gymnázium prof. Jana Patočky'],['/realizace/',320,'Hybernská 2/997']],
  },
  {
    name:'contact-aside', selector:'.contact-aside h2', values:[.95,.96,.97,.98,.99,1,1.01,1.02],
    cases:[['/kontakt/',390,'Telefon je nejrychlejší cesta, když potřebujete popsat situaci.'],['/kontakt/',430,'Telefon je nejrychlejší cesta, když potřebujete popsat situaci.'],['/kontakt/',1440,'Telefon je nejrychlejší cesta, když potřebujete popsat situaci.'],['/kontakt/',1920,'Telefon je nejrychlejší cesta, když potřebujete popsat situaci.']],
  },
  {
    name:'story-copy', selector:'.story-copy h2', values:[.92,.93,.94,.95,.96,.97,.98,.99,1,1.01],
    cases:[['/firma/',430,'Firma od roku 2019. Práce dohledatelná veřejně.'],['/firma/',1440,'Firma od roku 2019. Práce dohledatelná veřejně.'],['/firma/',1920,'Firma od roku 2019. Práce dohledatelná veřejně.']],
  },
  {
    name:'final-cta', selector:'.final-cta h2', values:[1,1.005,1.01,1.015,1.02,1.025,1.03,1.04],
    cases:[
      ['/realizace/',1024,'Máte podobný problém? Pošlete nám ho.'],
      ['/realizace/gymnazium-jana-patocky/',1440,'Máte podobný problém?'],['/realizace/gymnazium-jana-patocky/',1920,'Máte podobný problém?'],
      ['/realizace/hybernska-2-997/',1440,'Máte podobný problém?'],['/realizace/hybernska-2-997/',1920,'Máte podobný problém?'],
      ['/realizace/narodni-muzeum/',1440,'Máte podobný problém?'],['/realizace/narodni-muzeum/',1920,'Máte podobný problém?'],
      ['/realizace/prazska-trznice-hala-25/',1440,'Máte podobný problém?'],['/realizace/prazska-trznice-hala-25/',1920,'Máte podobný problém?'],
    ],
  },
];

const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const report={baseUrl:BASE,groups:[]};
try{
  for(const group of GROUPS){
    const groupReport={name:group.name,selector:group.selector,values:[],smallestZero:null};
    for(const value of group.values){
      let totalPixels=0; let failures=0; const cases=[];
      for(const [route,width,text] of group.cases){
        const context=await browser.newContext({viewport:{width,height:1000},deviceScaleFactor:1});
        const page=await context.newPage();
        try{
          const response=await page.goto(BASE+route,{waitUntil:'domcontentloaded',timeout:30000});
          await page.waitForTimeout(120);
          await page.evaluate(async()=>document.fonts.ready);
          if(response?.status()!==200) throw new Error(`HTTP ${response?.status()} ${route}`);
          const found=await page.evaluate(({selector,text,value})=>{
            const normalized=s=>(s||'').replace(/\s+/g,' ').trim();
            const el=[...document.querySelectorAll(selector)].find(node=>normalized(node.textContent)===text);
            if(!el)return false;
            el.setAttribute('data-czech-line-height-sweep','target');
            el.style.setProperty('line-height',String(value),'important');
            return true;
          },{selector:group.selector,text,value});
          if(!found)throw new Error(`Target not found: ${route} ${width} ${group.selector} ${text}`);
          await page.waitForTimeout(40);
          const m=await measureDomPaintCollision(page,'[data-czech-line-height-sweep="target"]');
          const pixels=m.collisionPixels||0; totalPixels+=pixels; if(pixels>0)failures++;
          cases.push({route,width,text,value,fontSize:m.fontSize,lineHeight:m.lineHeight,collisionPixels:pixels,pairs:m.pairs});
        }catch(error){failures++;cases.push({route,width,text,value,error:String(error)});}
        finally{await page.close();await context.close();}
      }
      const row={value,totalPixels,failures,cases};
      groupReport.values.push(row);
      console.log(JSON.stringify({group:group.name,value,totalPixels,failures}));
      if(groupReport.smallestZero===null&&failures===0&&totalPixels===0)groupReport.smallestZero=value;
    }
    report.groups.push(groupReport);
    console.log(JSON.stringify({group:group.name,smallestZero:groupReport.smallestZero}));
  }
}finally{await browser.close();}
fs.writeFileSync('czech-line-height-sweep.json',JSON.stringify(report,null,2));
if(report.groups.some(g=>g.smallestZero===null)){console.error('LINE HEIGHT SWEEP: NO ZERO-COLLISION VALUE FOR AT LEAST ONE GROUP');process.exit(1)}
console.log('LINE HEIGHT SWEEP: PASS');
