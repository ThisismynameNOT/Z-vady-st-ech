import fs from 'node:fs';
import { chromium } from 'playwright-core';

const BASE=(process.env.TYPO_BASE_URL||'http://127.0.0.1:8788').replace(/\/$/,'');
const VIEWPORTS=[320,375,390,430,768,1024,1440,1920];
const ROUTES=['/','/firma/','/sluzby/','/realizace/','/reference/','/kontakt/','/ochrana-osobnich-udaju/','/realizace/gymnazium-jana-patocky/','/realizace/hybernska-2-997/','/realizace/narodni-muzeum/','/realizace/prazska-trznice-hala-25/'];
const TARGET=[...'ŘřŮůĚěŠšČčŽžĎďŤťŇňÝýÁáÍíÉéÓó'];
const report={baseUrl:BASE,viewports:VIEWPORTS,routes:ROUTES,rows:[],fallbacks:[],clipping:[],overflow:[],screenshots:[],failures:[]};

function addFailure(kind,data){report.failures.push({kind,...data})}
function screenshotPlans(route){
  const map={
    '/':[['home-hero','.hero h1'],['home-problem-heading','.split-head .h2'],['home-final-cta','.final-cta h2']],
    '/kontakt/':[['contact-hero','.subhero h1'],['contact-form','#poptavka'],['contact-final-cta','.final-cta h2']],
    '/firma/':[['firma-hero','.subhero h1'],['firma-story','.story-copy h2']],
    '/sluzby/':[['services-hero','.subhero h1'],['services-detail','.service-detail h2']],
  };
  return map[route]||[];
}
async function platformFontsForSelector(cdp,selector){
  const doc=await cdp.send('DOM.getDocument',{depth:1,pierce:true});
  const q=await cdp.send('DOM.querySelector',{nodeId:doc.root.nodeId,selector});
  if(!q.nodeId)return [];
  return (await cdp.send('CSS.getPlatformFontsForNode',{nodeId:q.nodeId})).fonts||[];
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
        await page.waitForTimeout(180);
        await page.evaluate(async()=>document.fonts.ready);
        const status=response?.status()??null;
        if(status!==200)addFailure('route',{route,width,status});

        const measured=await page.evaluate((target)=>{
          const targetSet=new Set(target);
          const visible=el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0&&r.width>.5&&r.height>.5};
          const clipping=[];
          const styles=new Map();
          for(const el of document.querySelectorAll('body *')){
            if(!visible(el))continue;
            let text=[...el.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent||'').join(' ').replace(/\s+/g,' ').trim();
            if(!text&&el.matches('h1,h2,h3,h4,h5,h6,summary,a,button,label'))text=(el.textContent||'').replace(/\s+/g,' ').trim();
            if(!text)continue;
            const s=getComputedStyle(el);
            if(!/(Cormorant|Inter)/i.test(s.fontFamily))continue;
            const czech=[...new Set([...text].filter(ch=>targetSet.has(ch)))];
            for(const ch of czech){
              const key=[s.fontFamily,s.fontWeight,s.fontStyle,ch].join('|');
              if(!styles.has(key))styles.set(key,{key,fontFamily:s.fontFamily,fontWeight:s.fontWeight,fontStyle:s.fontStyle,ch,sampleText:text.slice(0,180)});
            }
            const range=document.createRange();range.selectNodeContents(el);
            const rects=[...range.getClientRects()].filter(r=>r.width>.5&&r.height>.5);
            let p=el;
            while(p&&p!==document.body){
              const ps=getComputedStyle(p);
              if(['hidden','clip'].includes(ps.overflow)||['hidden','clip'].includes(ps.overflowX)||['hidden','clip'].includes(ps.overflowY)){
                const a=p.getBoundingClientRect();
                if(rects.some(r=>r.left<a.left-1||r.right>a.right+1||r.top<a.top-1||r.bottom>a.bottom+1)){
                  clipping.push({tag:el.tagName.toLowerCase(),className:typeof el.className==='string'?el.className:'',text:text.slice(0,180),ancestorTag:p.tagName.toLowerCase(),ancestorClass:typeof p.className==='string'?p.className:''});
                  break;
                }
              }
              p=p.parentElement;
            }
          }
          return {
            styles:[...styles.values()],
            clipping,
            geometry:{docScrollWidth:document.documentElement.scrollWidth,docClientWidth:document.documentElement.clientWidth,bodyScrollWidth:document.body.scrollWidth,bodyClientWidth:document.body.clientWidth}
          };
        },TARGET);

        const g=measured.geometry;
        if(g.docScrollWidth>g.docClientWidth+1||g.bodyScrollWidth>g.bodyClientWidth+1){const row={route,width,geometry:g};report.overflow.push(row);addFailure('horizontal-overflow',row)}
        for(const item of measured.clipping){const row={route,width,...item};report.clipping.push(row);addFailure('text-clipping',row)}

        const cdp=await context.newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');
        for(let i=0;i<measured.styles.length;i++){
          const item=measured.styles[i];
          const probe=`qa-czech-${width}-${route.replace(/\W/g,'')}-${i}`;
          await page.evaluate(({probe,item})=>{
            const e=document.createElement('span');
            e.dataset.qaCzechProbe=probe;e.textContent=item.ch;
            Object.assign(e.style,{position:'fixed',left:'-10000px',top:'0',display:'block',pointerEvents:'none',color:'transparent',fontFamily:item.fontFamily,fontWeight:item.fontWeight,fontStyle:item.fontStyle,fontSize:'48px',lineHeight:'1',whiteSpace:'pre'});
            document.body.appendChild(e);
          },{probe,item});
          const selector=`[data-qa-czech-probe="${probe}"]`;
          const fonts=await platformFontsForSelector(cdp,selector);
          await page.evaluate(probe=>document.querySelector(`[data-qa-czech-probe="${probe}"]`)?.remove(),probe);
          const system=fonts.filter(f=>!f.isCustomFont&&(f.glyphCount||0)>0);
          const custom=fonts.filter(f=>f.isCustomFont&&(f.glyphCount||0)>0);
          if(!custom.length||system.length){const row={route,width,...item,fonts,customGlyphs:custom.reduce((n,f)=>n+(f.glyphCount||0),0),systemGlyphs:system.reduce((n,f)=>n+(f.glyphCount||0),0)};report.fallbacks.push(row);addFailure('czech-font-fallback',row)}
        }

        report.rows.push({route,width,status,czechStyleProbes:measured.styles.length});
        if((width===390||width===1440)&&screenshotPlans(route).length){
          for(const [name,selector] of screenshotPlans(route)){
            const loc=page.locator(selector).first();if(!(await loc.count()))continue;
            try{await loc.scrollIntoViewIfNeeded();await page.waitForTimeout(60);const path=`candidate-screenshots/${name}-${width}.png`;await loc.screenshot({path});report.screenshots.push({route,width,name,selector,path})}catch(error){report.screenshots.push({route,width,name,selector,error:String(error)})}
          }
        }
      }catch(error){addFailure('matrix-execution',{route,width,error:String(error)})}
      finally{await page.close()}
    }
    await context.close();
  }
}finally{await browser.close()}

report.summary={matrixCombinations:88,matrixRows:report.rows.length,routeFailures:report.failures.filter(x=>x.kind==='route'||x.kind==='matrix-execution').length,czechFallbackFailures:report.fallbacks.length,systemFallbackGlyphs:report.fallbacks.reduce((n,r)=>n+(r.systemGlyphs||0),0),clippingFailures:report.clipping.length,horizontalOverflowFailures:report.overflow.length,screenshots:report.screenshots.filter(x=>x.path).length,totalFailures:report.failures.length};
fs.writeFileSync('czech-typography-site-audit.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report.summary,null,2));
if(report.failures.length){console.error('CZECH TYPOGRAPHY SITE AUDIT: FAIL');for(const f of report.failures.slice(0,120))console.error(JSON.stringify(f));process.exit(1)}
console.log('CZECH TYPOGRAPHY SITE AUDIT: PASS');
