import fs from 'node:fs';
import { chromium } from 'playwright-core';

const BASE=(process.env.TYPO_BASE_URL||'http://127.0.0.1:8788').replace(/\/$/,'');
const VIEWPORTS=[320,375,390,430,768,1024,1440,1920];
const ROUTES=['/','/firma/','/sluzby/','/realizace/','/reference/','/kontakt/','/ochrana-osobnich-udaju/','/realizace/gymnazium-jana-patocky/','/realizace/hybernska-2-997/','/realizace/narodni-muzeum/','/realizace/prazska-trznice-hala-25/'];
const MAJOR='h1,h2,h3,.h2,.problem b,.step-simple b,.fact b,.service-row h3,.service-detail h2,.story-copy h2,.contact-aside h2,.form-step h3,.project-copy h3,.faq summary,.phone-big';
const report={baseUrl:BASE,rows:[],rasterGlyphCollisions:[],neighborOverlaps:[],clipping:[],horizontalOverflow:[],failures:[]};
const add=(kind,data)=>report.failures.push({kind,...data});

const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
  for(const width of VIEWPORTS){
    const context=await browser.newContext({viewport:{width,height:1000},deviceScaleFactor:1});
    for(const route of ROUTES){
      const page=await context.newPage();
      try{
        const response=await page.goto(BASE+route,{waitUntil:'domcontentloaded',timeout:30000});
        await page.waitForTimeout(150);await page.evaluate(async()=>document.fonts.ready);
        const status=response?.status()??null;if(status!==200)add('route',{route,width,status});
        const result=await page.evaluate((major)=>{
          const visible=el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0&&r.width>.5&&r.height>.5};
          const overlap=(a,b)=>({x:Math.min(a.right,b.right)-Math.max(a.left,b.left),y:Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)});
          const clippedByAncestor=el=>{
            const range=document.createRange();range.selectNodeContents(el);const rects=[...range.getClientRects()].filter(r=>r.width>.5&&r.height>.5);
            let p=el;while(p&&p!==document.body){const s=getComputedStyle(p);if(['hidden','clip'].includes(s.overflow)||['hidden','clip'].includes(s.overflowX)||['hidden','clip'].includes(s.overflowY)){const a=p.getBoundingClientRect();if(rects.some(r=>r.left<a.left-1||r.right>a.right+1||r.top<a.top-1||r.bottom>a.bottom+1))return {tag:p.tagName.toLowerCase(),className:typeof p.className==='string'?p.className:''}}p=p.parentElement}return null;
          };
          const styleKey=s=>[s.fontFamily,s.fontWeight,s.fontStyle,s.fontSize,s.letterSpacing,s.fontKerning,s.fontStretch,s.fontVariant].join('|');
          const rasterCollision=el=>{
            const box=el.getBoundingClientRect();if(box.width<1||box.height<1||box.width>2200||box.height>1400)return {lineCount:0,collisionPixels:0,skipped:'geometry'};
            const chars=[];let order=0;const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
            for(let node=walker.nextNode();node;node=walker.nextNode()){
              const parent=node.parentElement;if(!parent||!visible(parent))continue;const s=getComputedStyle(parent),key=styleKey(s);
              for(let i=0;i<node.data.length;i++){
                const ch=node.data[i];const range=document.createRange();range.setStart(node,i);range.setEnd(node,i+1);const rr=range.getBoundingClientRect();
                if(rr.height<.1||(!/\s/.test(ch)&&rr.width<.1)){order++;continue}
                chars.push({ch,order:order++,left:rr.left,top:rr.top,right:rr.right,bottom:rr.bottom,centerY:(rr.top+rr.bottom)/2,key,fontFamily:s.fontFamily,fontWeight:s.fontWeight,fontStyle:s.fontStyle,fontSize:s.fontSize,letterSpacing:s.letterSpacing,fontKerning:s.fontKerning,fontStretch:s.fontStretch,fontVariant:s.fontVariant});
              }
            }
            if(!chars.some(c=>!/\s/.test(c.ch)))return {lineCount:0,collisionPixels:0};
            const nonSpace=chars.filter(c=>!/\s/.test(c.ch)).sort((a,b)=>a.centerY-b.centerY||a.order-b.order),lines=[];
            for(const c of nonSpace){const fs=parseFloat(c.fontSize)||16;let line=lines.find(l=>Math.abs(l.centerY-c.centerY)<=Math.max(3,Math.min(11,fs*.22)));if(!line){line={centerY:c.centerY,chars:[]};lines.push(line)}line.chars.push(c);line.centerY=line.chars.reduce((n,x)=>n+x.centerY,0)/line.chars.length}
            lines.sort((a,b)=>a.centerY-b.centerY);
            for(const line of lines){
              const tolerance=Math.max(3,Math.min(11,(parseFloat(line.chars[0]?.fontSize)||16)*.22));
              line.allChars=chars.filter(c=>Math.abs(c.centerY-line.centerY)<=tolerance).sort((a,b)=>a.order-b.order);
              const runs=[];
              for(const c of line.allChars){let run=runs.at(-1);if(!run||run.key!==c.key||c.order!==run.lastOrder+1){run={key:c.key,lastOrder:c.order,chars:[c]};runs.push(run)}else{run.lastOrder=c.order;run.chars.push(c)}}
              line.runs=runs.filter(r=>r.chars.some(c=>!/\s/.test(c.ch))).map(r=>({text:r.chars.map(c=>c.ch).join(''),left:r.chars.find(c=>!/\s/.test(c.ch))?.left??r.chars[0].left,first:r.chars.find(c=>!/\s/.test(c.ch))??r.chars[0]}));
            }
            if(lines.length<2)return {lineCount:lines.length,collisionPixels:0};
            const pad=64,w=Math.max(1,Math.ceil(box.width+pad*2)),h=Math.max(1,Math.ceil(box.height+pad*2));const masks=[];
            for(const line of lines){
              const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.clearRect(0,0,w,h);ctx.fillStyle='#000';ctx.textAlign='left';ctx.textBaseline='alphabetic';
              for(const run of line.runs){const c=run.first;ctx.font=`${c.fontStyle} ${c.fontWeight} ${c.fontSize} ${c.fontFamily}`;if('fontKerning' in ctx)ctx.fontKerning=c.fontKerning;if('fontStretch' in ctx)ctx.fontStretch=c.fontStretch;if('fontVariantCaps' in ctx)ctx.fontVariantCaps='normal';if('letterSpacing' in ctx)ctx.letterSpacing=c.letterSpacing;
                const metric=ctx.measureText(run.text.replace(/^\s+/,'')||run.text);const ascent=Number.isFinite(metric.fontBoundingBoxAscent)?metric.fontBoundingBoxAscent:metric.actualBoundingBoxAscent;const descent=Number.isFinite(metric.fontBoundingBoxDescent)?metric.fontBoundingBoxDescent:metric.actualBoundingBoxDescent;const baseline=(line.centerY-box.top)+pad+(ascent-descent)/2;ctx.fillText(run.text.replace(/^\s+/,''),(run.left-box.left)+pad,baseline)}
              masks.push(ctx.getImageData(0,0,w,h).data);
            }
            let collisionPixels=0;const pairs=[];
            for(let i=1;i<masks.length;i++){const a=masks[i-1],b=masks[i];let count=0;for(let p=3;p<a.length;p+=4)if(a[p]>40&&b[p]>40)count++;if(count){collisionPixels+=count;pairs.push({upper:i-1,lower:i,pixels:count})}}
            return {lineCount:lines.length,collisionPixels,pairs,lineCenters:lines.map(l=>Math.round(l.centerY*100)/100),lineTexts:lines.map(l=>l.runs.map(r=>r.text).join('').trim())};
          };
          const entries=[];
          for(const el of document.querySelectorAll(major)){
            if(!visible(el))continue;const text=(el.textContent||'').replace(/\s+/g,' ').trim();if(!text)continue;const s=getComputedStyle(el);if(!/(Cormorant|Inter)/i.test(s.fontFamily))continue;
            const raster=rasterCollision(el);const r=el.getBoundingClientRect();const neighbors=[];
            for(const sib of [el.previousElementSibling,el.nextElementSibling]){if(!sib||!visible(sib))continue;const ss=getComputedStyle(sib);if(ss.position==='absolute'||ss.position==='fixed')continue;const sr=sib.getBoundingClientRect(),o=overlap(r,sr);if(o.x>1&&o.y>1)neighbors.push({tag:sib.tagName.toLowerCase(),className:typeof sib.className==='string'?sib.className:'',overlapX:o.x,overlapY:o.y})}
            entries.push({tag:el.tagName.toLowerCase(),className:typeof el.className==='string'?el.className:'',text:text.slice(0,220),fontFamily:s.fontFamily,fontSize:parseFloat(s.fontSize),lineHeight:s.lineHeight==='normal'?null:parseFloat(s.lineHeight),raster,neighbors,clippedBy:clippedByAncestor(el)});
          }
          return {entries,docScrollWidth:document.documentElement.scrollWidth,docClientWidth:document.documentElement.clientWidth,bodyScrollWidth:document.body.scrollWidth,bodyClientWidth:document.body.clientWidth};
        },MAJOR);
        if(result.docScrollWidth>result.docClientWidth+1||result.bodyScrollWidth>result.bodyClientWidth+1){const row={route,width,docScrollWidth:result.docScrollWidth,docClientWidth:result.docClientWidth,bodyScrollWidth:result.bodyScrollWidth,bodyClientWidth:result.bodyClientWidth};report.horizontalOverflow.push(row);add('horizontal-overflow',row)}
        for(const entry of result.entries){
          if(entry.raster.collisionPixels>0){const row={route,width,...entry};report.rasterGlyphCollisions.push(row);add('raster-glyph-collision',row)}
          if(entry.neighbors.length){const row={route,width,...entry};report.neighborOverlaps.push(row);add('neighbor-overlap',row)}
          if(entry.clippedBy){const row={route,width,...entry};report.clipping.push(row);add('text-clipping',row)}
        }
        report.rows.push({route,width,status,majorTextNodes:result.entries.length,multilineNodes:result.entries.filter(x=>x.raster.lineCount>1).length});
      }catch(error){add('matrix-execution',{route,width,error:String(error)})}
      finally{await page.close()}
    }
    await context.close();
  }
}finally{await browser.close()}
report.summary={matrixCombinations:88,matrixRows:report.rows.length,routeFailures:report.failures.filter(x=>x.kind==='route'||x.kind==='matrix-execution').length,rasterGlyphCollisionFailures:report.rasterGlyphCollisions.length,collisionPixels:report.rasterGlyphCollisions.reduce((n,r)=>n+(r.raster?.collisionPixels||0),0),neighborOverlapFailures:report.neighborOverlaps.length,clippingFailures:report.clipping.length,horizontalOverflowFailures:report.horizontalOverflow.length,totalFailures:report.failures.length};
fs.writeFileSync('czech-typography-geometry-audit.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report.summary,null,2));
if(report.failures.length){console.error('CZECH TYPOGRAPHY GEOMETRY AUDIT: FAIL');for(const f of report.failures.slice(0,120))console.error(JSON.stringify(f));process.exit(1)}
console.log('CZECH TYPOGRAPHY GEOMETRY AUDIT: PASS');
