import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { measureDomPaintCollision } from './czech-dom-paint-collision.mjs';

const BASE=(process.env.TYPO_BASE_URL||'http://127.0.0.1:8788').replace(/\/$/,'');
const VIEWPORTS=[320,375,390,430,768,1024,1440,1920];
const ROUTES=['/','/firma/','/sluzby/','/realizace/','/reference/','/kontakt/','/ochrana-osobnich-udaju/','/realizace/gymnazium-jana-patocky/','/realizace/hybernska-2-997/','/realizace/narodni-muzeum/','/realizace/prazska-trznice-hala-25/'];
const MAJOR='h1,h2,h3,.h2,.problem b,.step-simple b,.fact b,.service-row h3,.service-detail h2,.story-copy h2,.contact-aside h2,.form-step h3,.project-copy h3,.faq summary,.phone-big';
const OLD_FLAGS=[
  ['01','/sluzby/',320,'Opravy a údržba střech',8],
  ['02','/realizace/',320,'Gymnázium prof. Jana Patočky',8],
  ['03','/sluzby/',375,'Opravy a údržba střech',2],
  ['04','/sluzby/',390,'Opravy a údržba střech',2],
  ['05','/kontakt/',390,'Telefon je nejrychlejší cesta, když potřebujete popsat situaci.',14],
  ['06','/firma/',430,'Firma od roku 2019. Práce dohledatelná veřejně.',7],
  ['07','/kontakt/',430,'Telefon je nejrychlejší cesta, když potřebujete popsat situaci.',14],
  ['08','/sluzby/',1024,'Opravy a údržba střech',2],
  ['09','/realizace/',1024,'Gymnázium prof. Jana Patočky',4],
  ['10','/firma/',1440,'Firma od roku 2019. Práce dohledatelná veřejně.',15],
  ['11','/kontakt/',1440,'Telefon je nejrychlejší cesta, když potřebujete popsat situaci.',14],
  ['12','/realizace/gymnazium-jana-patocky/',1440,'Máte podobný problém?',4],
  ['13','/realizace/hybernska-2-997/',1440,'Máte podobný problém?',4],
  ['14','/realizace/narodni-muzeum/',1440,'Máte podobný problém?',4],
  ['15','/realizace/prazska-trznice-hala-25/',1440,'Máte podobný problém?',4],
  ['16','/firma/',1920,'Firma od roku 2019. Práce dohledatelná veřejně.',15],
  ['17','/kontakt/',1920,'Telefon je nejrychlejší cesta, když potřebujete popsat situaci.',14],
  ['18','/realizace/gymnazium-jana-patocky/',1920,'Máte podobný problém?',4],
  ['19','/realizace/hybernska-2-997/',1920,'Máte podobný problém?',4],
  ['20','/realizace/narodni-muzeum/',1920,'Máte podobný problém?',4],
  ['21','/realizace/prazska-trznice-hala-25/',1920,'Máte podobný problém?',4],
].map(([id,route,width,text,oldSyntheticCollisionPixels])=>({id,route,width,text,oldSyntheticCollisionPixels}));
const oldKey=(route,width,text)=>`${route}|${width}|${text}`;
const OLD_BY_KEY=new Map(OLD_FLAGS.map(flag=>[oldKey(flag.route,flag.width,flag.text),flag]));
const report={baseUrl:BASE,rows:[],actualDomCollisions:[],previousFlagClassifications:[],neighborOverlaps:[],clipping:[],horizontalOverflow:[],unmeasured:[],failures:[]};
const add=(kind,data)=>report.failures.push({kind,...data});
fs.mkdirSync('collision-evidence',{recursive:true});

const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
  for(const width of VIEWPORTS){
    const context=await browser.newContext({viewport:{width,height:1000},deviceScaleFactor:1});
    for(const route of ROUTES){
      const page=await context.newPage();
      try{
        const response=await page.goto(BASE+route,{waitUntil:'domcontentloaded',timeout:30000});
        await page.waitForTimeout(150);
        await page.evaluate(async()=>document.fonts.ready);
        const status=response?.status()??null;
        if(status!==200)add('route',{route,width,status});

        const result=await page.evaluate((major)=>{
          const visible=el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0&&r.width>.5&&r.height>.5};
          const overlap=(a,b)=>({x:Math.min(a.right,b.right)-Math.max(a.left,b.left),y:Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)});
          const clippedByAncestor=el=>{
            const range=document.createRange();range.selectNodeContents(el);const rects=[...range.getClientRects()].filter(r=>r.width>.5&&r.height>.5);
            let p=el;while(p&&p!==document.body){const s=getComputedStyle(p);if(['hidden','clip'].includes(s.overflow)||['hidden','clip'].includes(s.overflowX)||['hidden','clip'].includes(s.overflowY)){const a=p.getBoundingClientRect();if(rects.some(r=>r.left<a.left-1||r.right>a.right+1||r.top<a.top-1||r.bottom>a.bottom+1))return {tag:p.tagName.toLowerCase(),className:typeof p.className==='string'?p.className:''}}p=p.parentElement}return null;
          };
          const visualLineCount=el=>{
            const centers=[];const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
            for(let node=walker.nextNode();node;node=walker.nextNode())for(let i=0;i<node.data.length;i++){
              if(/\s/.test(node.data[i]))continue;const range=document.createRange();range.setStart(node,i);range.setEnd(node,i+1);const r=range.getBoundingClientRect();if(r.width<.1||r.height<.1)continue;const center=(r.top+r.bottom)/2;if(!centers.some(value=>Math.abs(value-center)<=2))centers.push(center);
            }
            return centers.length;
          };
          const semanticSelector=el=>{
            for(const selector of ['.hero h1','.subhero h1','.split-head .h2','.final-cta h2','.service-detail h2','.contact-aside h2','.story-copy h2','.project-copy h2','.project-copy h3','.form-step h3','.service-row h3','.faq summary','.phone-big'])if(el.matches(selector))return selector;
            if(el.id)return `#${CSS.escape(el.id)}`;
            const cls=[...el.classList].filter(Boolean).slice(0,2).map(name=>`.${CSS.escape(name)}`).join('');
            return `${el.tagName.toLowerCase()}${cls}`;
          };
          const unique=[...new Set(document.querySelectorAll(major))];const entries=[];let id=0;
          for(const el of unique){
            if(!visible(el))continue;const text=(el.textContent||'').replace(/\s+/g,' ').trim();if(!text)continue;const s=getComputedStyle(el);if(!/(Cormorant|Inter)/i.test(s.fontFamily))continue;
            const qa=`geometry-${id++}`;el.setAttribute('data-czech-geometry-id',qa);const r=el.getBoundingClientRect();const neighbors=[];
            for(const sib of [el.previousElementSibling,el.nextElementSibling]){if(!sib||!visible(sib))continue;const ss=getComputedStyle(sib);if(ss.position==='absolute'||ss.position==='fixed')continue;const sr=sib.getBoundingClientRect(),o=overlap(r,sr);if(o.x>1&&o.y>1)neighbors.push({tag:sib.tagName.toLowerCase(),className:typeof sib.className==='string'?sib.className:'',overlapX:o.x,overlapY:o.y})}
            entries.push({qa,selector:semanticSelector(el),tag:el.tagName.toLowerCase(),className:typeof el.className==='string'?el.className:'',text:text.slice(0,220),fontFamily:s.fontFamily,fontSize:parseFloat(s.fontSize),lineHeight:s.lineHeight==='normal'?null:parseFloat(s.lineHeight),visualLineCount:visualLineCount(el),neighbors,clippedBy:clippedByAncestor(el)});
          }
          return {entries,docScrollWidth:document.documentElement.scrollWidth,docClientWidth:document.documentElement.clientWidth,bodyScrollWidth:document.body.scrollWidth,bodyClientWidth:document.body.clientWidth};
        },MAJOR);

        if(result.docScrollWidth>result.docClientWidth+1||result.bodyScrollWidth>result.bodyClientWidth+1){const row={route,width,docScrollWidth:result.docScrollWidth,docClientWidth:result.docClientWidth,bodyScrollWidth:result.bodyScrollWidth,bodyClientWidth:result.bodyClientWidth};report.horizontalOverflow.push(row);add('horizontal-overflow',row)}

        let measuredMultiline=0;
        for(const entry of result.entries){
          if(entry.neighbors.length){const row={route,width,...entry};report.neighborOverlaps.push(row);add('neighbor-overlap',row)}
          if(entry.clippedBy){const row={route,width,...entry};report.clipping.push(row);add('text-clipping',row)}
          if(entry.visualLineCount<2)continue;
          measuredMultiline++;
          const flag=OLD_BY_KEY.get(oldKey(route,width,entry.text));
          const evidencePath=flag?`collision-evidence/flag-${flag.id}-${width}.png`:undefined;
          const measurement=await measureDomPaintCollision(page,`[data-czech-geometry-id="${entry.qa}"]`,{evidencePath});
          const row={route,width,...entry,actualDom:measurement};
          if(!measurement.supported){report.unmeasured.push(row);add('dom-paint-unmeasured',row)}
          if(measurement.collisionPixels>0){report.actualDomCollisions.push(row);add('actual-dom-glyph-collision',row)}
          if(flag){report.previousFlagClassifications.push({...flag,selector:entry.selector,fontSize:entry.fontSize,lineHeight:entry.lineHeight,actualDomCollisionPixels:measurement.collisionPixels,actualDomPairs:measurement.pairs,actualDomMode:measurement.mode,screenshot:evidencePath,classification:measurement.collisionPixels>0?'REAL COLLISION':'FALSE POSITIVE'});}
        }
        await page.evaluate(()=>document.querySelectorAll('[data-czech-geometry-id]').forEach(el=>el.removeAttribute('data-czech-geometry-id')));
        report.rows.push({route,width,status,majorTextNodes:result.entries.length,multilineNodes:measuredMultiline});
      }catch(error){add('matrix-execution',{route,width,error:String(error)})}
      finally{await page.close()}
    }
    await context.close();
  }
}finally{await browser.close()}

if(report.previousFlagClassifications.length!==OLD_FLAGS.length)add('previous-flag-classification-count',{expected:OLD_FLAGS.length,actual:report.previousFlagClassifications.length,missing:OLD_FLAGS.filter(flag=>!report.previousFlagClassifications.some(row=>row.id===flag.id))});
report.summary={matrixCombinations:88,matrixRows:report.rows.length,routeFailures:report.failures.filter(x=>x.kind==='route'||x.kind==='matrix-execution').length,actualDomCollisionFailures:report.actualDomCollisions.length,actualDomCollisionPixels:report.actualDomCollisions.reduce((n,r)=>n+(r.actualDom?.collisionPixels||0),0),previousFlagsClassified:report.previousFlagClassifications.length,falsePositivePreviousFlags:report.previousFlagClassifications.filter(x=>x.classification==='FALSE POSITIVE').length,realPreviousFlags:report.previousFlagClassifications.filter(x=>x.classification==='REAL COLLISION').length,neighborOverlapFailures:report.neighborOverlaps.length,clippingFailures:report.clipping.length,horizontalOverflowFailures:report.horizontalOverflow.length,unmeasuredFailures:report.unmeasured.length,totalFailures:report.failures.length};
fs.writeFileSync('czech-typography-geometry-audit.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report.summary,null,2));
for(const row of report.previousFlagClassifications)console.log(JSON.stringify({previousFlag:row.id,route:row.route,width:row.width,selector:row.selector,text:row.text,fontSize:row.fontSize,lineHeight:row.lineHeight,oldSyntheticCollisionPixels:row.oldSyntheticCollisionPixels,actualDomCollisionPixels:row.actualDomCollisionPixels,classification:row.classification,screenshot:row.screenshot}));
if(report.failures.length){console.error('CZECH TYPOGRAPHY ACTUAL DOM GEOMETRY AUDIT: FAIL');for(const f of report.failures.slice(0,120))console.error(JSON.stringify(f));process.exit(1)}
console.log('CZECH TYPOGRAPHY ACTUAL DOM GEOMETRY AUDIT: PASS');
