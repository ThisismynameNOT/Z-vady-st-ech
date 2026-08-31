import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const BASE='https://zavady-strech-praha.iadamt-93.workers.dev';
const widths=[320,375,390,430,768,1024,1440,1920];
const routes=['/','/sluzby/','/realizace/','/realizace/gymnazium-jana-patocky/','/realizace/hybernska-2-997/','/realizace/narodni-muzeum/','/realizace/prazska-trznice-hala-25/','/reference/','/firma/','/kontakt/','/ochrana-osobnich-udaju/'];
const results=[];
let failed=false;
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
for(const width of widths){
  const context=await browser.newContext({viewport:{width,height:width<=430?844:900},locale:'cs-CZ'});
  for(const route of routes){
    const page=await context.newPage();
    await page.goto(BASE+route,{waitUntil:'domcontentloaded',timeout:30000});
    await page.waitForLoadState('networkidle',{timeout:6000}).catch(()=>{});
    const fonts=await page.evaluate(async()=>{
      await Promise.all([document.fonts.load('400 16px Inter'),document.fonts.load('500 48px "Cormorant Garamond"')]);
      const body=getComputedStyle(document.body).fontFamily;
      const heading=document.querySelector('h1,h2,h3');
      return {status:document.fonts.status,body,heading:heading?getComputedStyle(heading).fontFamily:null,inter:document.fonts.check('400 16px Inter'),cormorant:document.fonts.check('500 48px "Cormorant Garamond"')};
    });
    const target=await new AxeBuilder({page}).withRules(['target-size']).analyze();
    const violations=target.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,html:n.html,failureSummary:n.failureSummary}))}));
    const ok=fonts.status==='loaded'&&fonts.inter&&fonts.cormorant&&/Inter/i.test(fonts.body)&&/Cormorant/i.test(fonts.heading||'')&&violations.length===0;
    if(!ok) failed=true;
    results.push({width,route,ok,fonts,violations});
    await page.close();
  }
  await context.close();
}
await browser.close();
console.log(JSON.stringify({failed,results},null,2));
if(failed)process.exitCode=1;
