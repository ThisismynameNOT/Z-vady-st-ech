import { chromium } from 'playwright-core';

const BASE = (process.env.TYPO_BASE_URL || 'https://zavady-strech-praha.iadamt-93.workers.dev').replace(/\/$/, '');
const cases = [
  { route:'/', width:390, selector:'.hero h1', label:'homepage hero', family:'Cormorant', multiline:true },
  { route:'/', width:1440, selector:'.hero h1', label:'homepage hero desktop', family:'Cormorant', multiline:true },
  { route:'/', width:390, selector:'.split-head .h2', text:'Řekněte nám, co se děje.', label:'homepage problem heading', family:'Cormorant', multiline:true },
  { route:'/', width:1440, selector:'.split-head .h2', text:'Řekněte nám, co se děje.', label:'homepage problem heading desktop', family:'Cormorant', multiline:false },
  { route:'/', width:390, selector:'.final-cta h2', label:'homepage final CTA', family:'Cormorant', multiline:true },
  { route:'/', width:1440, selector:'.final-cta h2', label:'homepage final CTA desktop', family:'Cormorant', multiline:true },
  { route:'/kontakt/', width:390, selector:'.subhero h1', label:'contact hero', family:'Cormorant', multiline:true },
  { route:'/kontakt/', width:1440, selector:'.subhero h1', label:'contact hero desktop', family:'Cormorant', multiline:true },
  { route:'/', width:390, selector:'.hero-lede', label:'homepage lead body', family:'Inter', multiline:true },
  { route:'/kontakt/', width:390, selector:'.subhero p', label:'contact lead body', family:'Inter', multiline:true },
];

const failures = [];
const results = [];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless:true, args:['--no-sandbox','--disable-dev-shm-usage'] });
try {
  for (const testCase of cases) {
    const context = await browser.newContext({ viewport:{width:testCase.width,height:1000}, deviceScaleFactor:1 });
    const page = await context.newPage();
    const response = await page.goto(BASE + testCase.route, {waitUntil:'domcontentloaded',timeout:30000});
    await page.evaluate(async()=>{ await document.fonts.ready; });
    const locator = testCase.text
      ? page.locator(testCase.selector).filter({hasText:testCase.text}).first()
      : page.locator(testCase.selector).first();
    if (!(await locator.count())) {
      failures.push(`${testCase.label}: selector not found`);
      await context.close();
      continue;
    }
    const handle = await locator.elementHandle();
    const cdp = await context.newCDPSession(page);
    await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
    const remote = await cdp.send('DOM.describeNode', {objectId: handle._objectId}).catch(()=>null);
    let nodeId = remote?.node?.nodeId || 0;
    if (!nodeId) {
      const doc = await cdp.send('DOM.getDocument',{depth:1,pierce:true});
      const query = await cdp.send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:testCase.selector});
      nodeId = query.nodeId;
    }
    const platform = nodeId ? (await cdp.send('CSS.getPlatformFontsForNode',{nodeId})).fonts : [];
    const metrics = await locator.evaluate(el=>{
      const s=getComputedStyle(el), r=el.getBoundingClientRect();
      const fs=parseFloat(s.fontSize), lh=s.lineHeight==='normal'?null:parseFloat(s.lineHeight);
      const range=document.createRange(); range.selectNodeContents(el);
      const rects=[...range.getClientRects()].filter(x=>x.width>1&&x.height>1);
      const tops=[...new Set(rects.map(x=>Math.round(x.top*10)/10))].sort((a,b)=>a-b);
      return { text:(el.textContent||'').replace(/\s+/g,' ').trim(), fontFamily:s.fontFamily, fontSize:fs, lineHeight:lh, lineHeightRatio:lh&&fs?lh/fs:null, rect:{width:r.width,height:r.height}, lineTopCount:tops.length };
    });
    const customGlyphs=platform.filter(f=>f.isCustomFont).reduce((n,f)=>n+(f.glyphCount||0),0);
    const systemGlyphs=platform.filter(f=>!f.isCustomFont).reduce((n,f)=>n+(f.glyphCount||0),0);
    const familyOk=metrics.fontFamily.toLowerCase().startsWith(testCase.family.toLowerCase());
    const platformOk=customGlyphs>0 && systemGlyphs===0;
    const lineHeightOk=!testCase.multiline || (metrics.lineHeightRatio!==null && metrics.lineHeightRatio>=1);
    const row={...testCase,status:response?.status()??null,metrics,platform,customGlyphs,systemGlyphs,familyOk,platformOk,lineHeightOk};
    results.push(row);
    if (response?.status()!==200) failures.push(`${testCase.label}: HTTP ${response?.status()}`);
    if (!familyOk) failures.push(`${testCase.label}: intended ${testCase.family}, computed ${metrics.fontFamily}`);
    if (!platformOk) failures.push(`${testCase.label}: system fallback glyphs=${systemGlyphs}; ${JSON.stringify(platform)}`);
    if (!lineHeightOk) failures.push(`${testCase.label}: multiline line-height ratio ${metrics.lineHeightRatio?.toFixed(3)} < 1.000`);
    await context.close();
  }
} finally { await browser.close(); }

console.log(JSON.stringify({base:BASE,results,failures},null,2));
if (failures.length) {
  console.error(`CZECH TYPOGRAPHY BROWSER REGRESSION: FAIL (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('CZECH TYPOGRAPHY BROWSER REGRESSION: PASS');
