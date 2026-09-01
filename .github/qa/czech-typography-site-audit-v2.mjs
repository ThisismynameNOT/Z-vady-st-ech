import fs from 'node:fs';
import { chromium } from 'playwright-core';

const BASE=(process.env.TYPO_BASE_URL||'http://127.0.0.1:8788').replace(/\/$/,'');
const VIEWPORTS=[320,375,390,430,768,1024,1440,1920];
const ROUTES=['/','/firma/','/sluzby/','/realizace/','/reference/','/kontakt/','/ochrana-osobnich-udaju/','/realizace/gymnazium-jana-patocky/','/realizace/hybernska-2-997/','/realizace/narodni-muzeum/','/realizace/prazska-trznice-hala-25/'];
const TARGET='ŘřŮůĚěŠšČčŽžĎďŤťŇňÝýÁáÍíÉéÓó';
const TARGET_SET=new Set([...TARGET]);
const FACE_PROBES=[
  {family:'Inter',weight:'400',style:'normal'},
  {family:'Inter',weight:'500',style:'normal'},
  {family:'Inter',weight:'600',style:'normal'},
  {family:'Cormorant',weight:'400',style:'normal'},
  {family:'Cormorant',weight:'500',style:'normal'},
  {family:'Cormorant',weight:'600',style:'normal'},
  {family:'Cormorant',weight:'400',style:'italic'},
];
const report={baseUrl:BASE,viewports:VIEWPORTS,routes:ROUTES,rows:[],actualNodeChecks:[],explicitFaceChecks:[],fallbacks:[],unmeasured:[],clipping:[],overflow:[],screenshots:[],failures:[]};
const seenChars=new Set();
const addFailure=(kind,data)=>report.failures.push({kind,...data});

function screenshotPlans(route){
  const map={
    '/':[['home-hero','.hero'],['home-problem-heading','.problem'],['home-final-cta','.final-cta']],
    '/kontakt/':[['contact-hero','.subhero'],['contact-form','#poptavka'],['contact-final-cta','.final-cta']],
    '/firma/':[['firma-hero','.subhero'],['firma-story','.story']],
    '/sluzby/':[['services-hero','.subhero'],['services-detail','.service-detail']],
  };
  return map[route]||[];
}
async function platformFontsForSelector(cdp,selector){
  const doc=await cdp.send('DOM.getDocument',{depth:1,pierce:true});
  const q=await cdp.send('DOM.querySelector',{nodeId:doc.root.nodeId,selector});
  if(!q.nodeId)return [];
  return (await cdp.send('CSS.getPlatformFontsForNode',{nodeId:q.nodeId})).fonts||[];
}
function summarizePlatform(fonts){
  const custom=fonts.filter(f=>f.isCustomFont&&(f.glyphCount||0)>0);
  const system=fonts.filter(f=>!f.isCustomFont&&(f.glyphCount||0)>0);
  return {customGlyphs:custom.reduce((n,f)=>n+(f.glyphCount||0),0),systemGlyphs:system.reduce((n,f)=>n+(f.glyphCount||0),0),customFamilies:[...new Set(custom.map(f=>f.familyName))],systemFamilies:[...new Set(system.map(f=>f.familyName))]};
}

const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
  fs.mkdirSync('candidate-screenshots',{recursive:true});
  for(const width of VIEWPORTS){
    const context=await browser.newContext({viewport:{width,height:1000},deviceScaleFactor:1});
    for(const route of ROUTES){
      const page=await context.newPage();
      try{
        const response=await page.goto(BASE+route,{waitUntil:'domcontentloaded',timeout:30000});
        await page.waitForTimeout(160);
        await page.evaluate(async()=>document.fonts.ready);
        const status=response?.status()??null;
        if(status!==200)addFailure('route',{route,width,status});

        const measured=await page.evaluate((target)=>{
          const targetSet=new Set([...target]);
          const visible=el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0&&r.width>.5&&r.height>.5};
          const clipping=[];
          const all=[];
          let id=0;
          for(const el of document.querySelectorAll('body *')){
            if(!visible(el))continue;
            const directText=[...el.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent||'').join(' ').replace(/\s+/g,' ').trim();
            if(directText){
              const s=getComputedStyle(el);
              const chars=[...new Set([...directText].filter(ch=>targetSet.has(ch)))];
              if(chars.length&&/(Cormorant|Inter)/i.test(s.fontFamily)){
                const qa=`real-${id++}`;el.setAttribute('data-qa-czech-node',qa);
                all.push({qa,tag:el.tagName.toLowerCase(),className:typeof el.className==='string'?el.className:'',fontFamily:s.fontFamily,fontWeight:s.fontWeight,fontStyle:s.fontStyle,chars,text:directText.slice(0,180)});
              }
            }
            const fullText=(el.textContent||'').replace(/\s+/g,' ').trim();
            if(!fullText)continue;
            const s=getComputedStyle(el);if(!/(Cormorant|Inter)/i.test(s.fontFamily))continue;
            const range=document.createRange();range.selectNodeContents(el);
            const rects=[...range.getClientRects()].filter(r=>r.width>.5&&r.height>.5);
            let p=el;
            while(p&&p!==document.body){
              const ps=getComputedStyle(p);
              if(['hidden','clip'].includes(ps.overflow)||['hidden','clip'].includes(ps.overflowX)||['hidden','clip'].includes(ps.overflowY)){
                const a=p.getBoundingClientRect();
                if(rects.some(r=>r.left<a.left-1||r.right>a.right+1||r.top<a.top-1||r.bottom>a.bottom+1)){
                  clipping.push({tag:el.tagName.toLowerCase(),className:typeof el.className==='string'?el.className:'',text:fullText.slice(0,180),ancestorTag:p.tagName.toLowerCase(),ancestorClass:typeof p.className==='string'?p.className:''});
                  break;
                }
              }
              p=p.parentElement;
            }
          }
          const byFace=new Map();
          for(const item of all){const key=[item.fontFamily,item.fontWeight,item.fontStyle].join('|');if(!byFace.has(key))byFace.set(key,item)}
          return {candidates:[...byFace.values()],allChars:[...new Set(all.flatMap(x=>x.chars))],candidateCount:all.length,clipping,geometry:{docScrollWidth:document.documentElement.scrollWidth,docClientWidth:document.documentElement.clientWidth,bodyScrollWidth:document.body.scrollWidth,bodyClientWidth:document.body.clientWidth}};
        },TARGET);

        for(const ch of measured.allChars)seenChars.add(ch);
        const g=measured.geometry;
        if(g.docScrollWidth>g.docClientWidth+1||g.bodyScrollWidth>g.bodyClientWidth+1){const row={route,width,geometry:g};report.overflow.push(row);addFailure('horizontal-overflow',row)}
        for(const item of measured.clipping){const row={route,width,...item};report.clipping.push(row);addFailure('text-clipping',row)}

        const cdp=await context.newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');
        for(const item of measured.candidates){
          const selector=`[data-qa-czech-node="${item.qa}"]`;
          const fonts=await platformFontsForSelector(cdp,selector);const p=summarizePlatform(fonts);
          const row={route,width,...item,fonts,...p};report.actualNodeChecks.push(row);
          if(!fonts.length||p.customGlyphs===0){report.unmeasured.push(row);addFailure('actual-node-font-unmeasured',row)}
          else if(p.systemGlyphs>0){report.fallbacks.push(row);addFailure('actual-node-system-fallback',row)}
        }
        await page.evaluate(()=>document.querySelectorAll('[data-qa-czech-node]').forEach(el=>el.removeAttribute('data-qa-czech-node')));

        if(route==='/'&&width===390){
          await page.evaluate(async ({faces,target})=>{
            const panel=document.createElement('div');panel.id='qa-czech-face-panel';
            Object.assign(panel.style,{position:'fixed',left:'0',top:'0',zIndex:'2147483647',background:'#fff',color:'#000',padding:'4px',pointerEvents:'none'});
            for(let i=0;i<faces.length;i++){
              const face=faces[i],e=document.createElement('div');e.dataset.qaFace=String(i);e.textContent=target;
              Object.assign(e.style,{display:'block',whiteSpace:'pre',fontFamily:face.family,fontWeight:face.weight,fontStyle:face.style,fontSize:'28px',lineHeight:'1.15',color:'#000',background:'#fff'});
              panel.appendChild(e);
            }
            document.body.appendChild(panel);
            await document.fonts.ready;
            for(const face of faces)await document.fonts.load(`${face.style} ${face.weight} 28px ${face.family}`,target);
            panel.getBoundingClientRect();
            await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
          },{faces:FACE_PROBES,target:TARGET});
          for(let i=0;i<FACE_PROBES.length;i++){
            const fonts=await platformFontsForSelector(cdp,`[data-qa-face="${i}"]`);const p=summarizePlatform(fonts);
            const row={...FACE_PROBES[i],target:TARGET,fonts,...p};report.explicitFaceChecks.push(row);
            if(!fonts.length||p.customGlyphs===0){report.unmeasured.push(row);addFailure('explicit-face-font-unmeasured',row)}
            else if(p.systemGlyphs>0){report.fallbacks.push(row);addFailure('explicit-face-system-fallback',row)}
          }
          await page.evaluate(()=>document.querySelector('#qa-czech-face-panel')?.remove());
        }

        report.rows.push({route,width,status,actualCzechNodes:measured.candidateCount,checkedFaces:measured.candidates.length,chars:measured.allChars});
        if((width===390||width===1440)&&screenshotPlans(route).length){
          const style=await page.addStyleTag({content:'.mobile-cta{visibility:hidden!important}'});
          for(const [name,selector] of screenshotPlans(route)){
            const loc=page.locator(selector).first();if(!(await loc.count()))continue;
            try{await loc.scrollIntoViewIfNeeded();await page.waitForTimeout(60);const path=`candidate-screenshots/${name}-${width}.png`;await loc.screenshot({path});report.screenshots.push({route,width,name,selector,path})}catch(error){report.screenshots.push({route,width,name,selector,error:String(error)})}
          }
          await style.evaluate(el=>el.remove());
        }
      }catch(error){addFailure('matrix-execution',{route,width,error:String(error)})}
      finally{await page.close()}
    }
    await context.close();
  }
}finally{await browser.close()}

const missingTarget=[...TARGET].filter(ch=>!seenChars.has(ch));
if(report.explicitFaceChecks.length!==FACE_PROBES.length)addFailure('explicit-face-check-count',{expected:FACE_PROBES.length,actual:report.explicitFaceChecks.length});
report.summary={matrixCombinations:88,matrixRows:report.rows.length,routeFailures:report.failures.filter(x=>x.kind==='route'||x.kind==='matrix-execution').length,actualNodeChecks:report.actualNodeChecks.length,explicitFaceChecks:report.explicitFaceChecks.length,targetCharacters:TARGET.length,siteCharactersSeen:[...seenChars].join(''),siteCharactersAbsent:missingTarget.join(''),fontUnmeasuredFailures:report.unmeasured.length,czechFallbackFailures:report.fallbacks.length,systemFallbackGlyphs:report.fallbacks.reduce((n,r)=>n+(r.systemGlyphs||0),0),clippingFailures:report.clipping.length,horizontalOverflowFailures:report.overflow.length,screenshots:report.screenshots.filter(x=>x.path).length,totalFailures:report.failures.length};
fs.writeFileSync('czech-typography-site-audit.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report.summary,null,2));
if(report.failures.length){console.error('CZECH TYPOGRAPHY SITE AUDIT: FAIL');for(const f of report.failures.slice(0,120))console.error(JSON.stringify(f));process.exit(1)}
console.log('CZECH TYPOGRAPHY SITE AUDIT: PASS');
