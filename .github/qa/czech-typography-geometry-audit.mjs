import fs from 'node:fs';
import { chromium } from 'playwright-core';

const BASE=(process.env.TYPO_BASE_URL||'http://127.0.0.1:8788').replace(/\/$/,'');
const VIEWPORTS=[320,375,390,430,768,1024,1440,1920];
const ROUTES=['/','/firma/','/sluzby/','/realizace/','/reference/','/kontakt/','/ochrana-osobnich-udaju/','/realizace/gymnazium-jana-patocky/','/realizace/hybernska-2-997/','/realizace/narodni-muzeum/','/realizace/prazska-trznice-hala-25/'];
const MAJOR='h1,h2,h3,.h2,.problem b,.step-simple b,.fact b,.service-row h3,.service-detail h2,.story-copy h2,.contact-aside h2,.form-step h3,.project-copy h3,.faq summary,.phone-big,.brand-copy strong,.drawer-nav a,.footer h2,.footer h4';
const report={baseUrl:BASE,rows:[],lineOrGlyphCollisions:[],neighborOverlaps:[],clipping:[],horizontalOverflow:[],failures:[]};
const add=(kind,data)=>report.failures.push({kind,...data});

const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
  for(const width of VIEWPORTS){
    const context=await browser.newContext({viewport:{width,height:1000},deviceScaleFactor:1});
    for(const route of ROUTES){
      const page=await context.newPage();
      try{
        const response=await page.goto(BASE+route,{waitUntil:'domcontentloaded',timeout:30000});
        await page.waitForTimeout(180);
        await page.evaluate(async()=>document.fonts.ready);
        const status=response?.status()??null;
        if(status!==200)add('route',{route,width,status});
        const result=await page.evaluate((major)=>{
          const visible=el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>.5&&r.height>.5};
          const overlap=(a,b)=>({x:Math.min(a.right,b.right)-Math.max(a.left,b.left),y:Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)});
          const clippedByAncestor=el=>{
            const range=document.createRange();range.selectNodeContents(el);
            const rects=[...range.getClientRects()].filter(r=>r.width>.5&&r.height>.5);
            let p=el;
            while(p&&p!==document.body){
              const s=getComputedStyle(p);
              if(['hidden','clip'].includes(s.overflow)||['hidden','clip'].includes(s.overflowX)||['hidden','clip'].includes(s.overflowY)){
                const a=p.getBoundingClientRect();
                if(rects.some(r=>r.left<a.left-1||r.right>a.right+1||r.top<a.top-1||r.bottom>a.bottom+1))return {tag:p.tagName.toLowerCase(),className:typeof p.className==='string'?p.className:''};
              }
              p=p.parentElement;
            }
            return null;
          };
          const lineRects=el=>{
            const range=document.createRange();range.selectNodeContents(el);
            const rects=[...range.getClientRects()].filter(r=>r.width>.5&&r.height>.5).sort((a,b)=>a.top-b.top||a.left-b.left);
            const lines=[];
            for(const r of rects){
              let line=lines.find(l=>Math.abs(l.top-r.top)<=2.5);
              if(!line){line={top:r.top,bottom:r.bottom,left:r.left,right:r.right};lines.push(line)}
              else{line.top=Math.min(line.top,r.top);line.bottom=Math.max(line.bottom,r.bottom);line.left=Math.min(line.left,r.left);line.right=Math.max(line.right,r.right)}
            }
            return lines.sort((a,b)=>a.top-b.top);
          };
          const entries=[];
          for(const el of document.querySelectorAll(major)){
            if(!visible(el))continue;
            const text=(el.textContent||'').replace(/\s+/g,' ').trim();if(!text)continue;
            const s=getComputedStyle(el);if(!/(Cormorant|Inter)/i.test(s.fontFamily))continue;
            const lines=lineRects(el);const collisions=[];
            for(let i=1;i<lines.length;i++){
              const amount=lines[i-1].bottom-lines[i].top;
              if(amount>1)collisions.push({upper:i-1,lower:i,overlapPx:amount,upperRect:lines[i-1],lowerRect:lines[i]});
            }
            const r=el.getBoundingClientRect();const neighbors=[];
            for(const sib of [el.previousElementSibling,el.nextElementSibling]){
              if(!sib||!visible(sib))continue;
              const ss=getComputedStyle(sib);if(ss.position==='absolute'||ss.position==='fixed')continue;
              const sr=sib.getBoundingClientRect(),o=overlap(r,sr);
              if(o.x>1&&o.y>1)neighbors.push({tag:sib.tagName.toLowerCase(),className:typeof sib.className==='string'?sib.className:'',overlapX:o.x,overlapY:o.y});
            }
            entries.push({tag:el.tagName.toLowerCase(),className:typeof el.className==='string'?el.className:'',text:text.slice(0,220),fontFamily:s.fontFamily,fontSize:parseFloat(s.fontSize),lineHeight:s.lineHeight==='normal'?null:parseFloat(s.lineHeight),lineCount:lines.length,collisions,neighbors,clippedBy:clippedByAncestor(el)});
          }
          return {entries,docScrollWidth:document.documentElement.scrollWidth,docClientWidth:document.documentElement.clientWidth,bodyScrollWidth:document.body.scrollWidth,bodyClientWidth:document.body.clientWidth};
        },MAJOR);
        if(result.docScrollWidth>result.docClientWidth+1||result.bodyScrollWidth>result.bodyClientWidth+1){const row={route,width,docScrollWidth:result.docScrollWidth,docClientWidth:result.docClientWidth,bodyScrollWidth:result.bodyScrollWidth,bodyClientWidth:result.bodyClientWidth};report.horizontalOverflow.push(row);add('horizontal-overflow',row)}
        for(const entry of result.entries){
          if(entry.collisions.length){const row={route,width,...entry};report.lineOrGlyphCollisions.push(row);add('line-or-glyph-collision',row)}
          if(entry.neighbors.length){const row={route,width,...entry};report.neighborOverlaps.push(row);add('neighbor-overlap',row)}
          if(entry.clippedBy){const row={route,width,...entry};report.clipping.push(row);add('text-clipping',row)}
        }
        report.rows.push({route,width,status,majorTextNodes:result.entries.length});
      }catch(error){add('matrix-execution',{route,width,error:String(error)})}
      finally{await page.close()}
    }
    await context.close();
  }
}finally{await browser.close()}
report.summary={matrixCombinations:88,matrixRows:report.rows.length,routeFailures:report.failures.filter(x=>x.kind==='route'||x.kind==='matrix-execution').length,lineOrGlyphCollisionFailures:report.lineOrGlyphCollisions.length,neighborOverlapFailures:report.neighborOverlaps.length,clippingFailures:report.clipping.length,horizontalOverflowFailures:report.horizontalOverflow.length,totalFailures:report.failures.length};
fs.writeFileSync('czech-typography-geometry-audit.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report.summary,null,2));
if(report.failures.length){console.error('CZECH TYPOGRAPHY GEOMETRY AUDIT: FAIL');for(const f of report.failures.slice(0,120))console.error(JSON.stringify(f));process.exit(1)}
console.log('CZECH TYPOGRAPHY GEOMETRY AUDIT: PASS');
