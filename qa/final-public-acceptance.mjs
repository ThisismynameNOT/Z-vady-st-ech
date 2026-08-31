import { chromium, request as playwrightRequest } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BASE = (process.env.QA_BASE_URL || 'https://zavady-strech-praha.iadamt-93.workers.dev').replace(/\/$/, '');
const OUT = path.resolve('qa-results');
fs.mkdirSync(OUT, { recursive: true });

const viewports = [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

const routes = [
  '/',
  '/sluzby/',
  '/realizace/',
  '/realizace/gymnazium-jana-patocky/',
  '/realizace/hybernska-2-997/',
  '/realizace/narodni-muzeum/',
  '/realizace/prazska-trznice-hala-25/',
  '/reference/',
  '/firma/',
  '/kontakt/',
  '/ochrana-osobnich-udaju/',
];

const legacyRedirects = {
  '/index.html': '/',
  '/firma.html': '/firma/',
  '/sluzby.html': '/sluzby/',
  '/realizace.html': '/realizace/',
  '/reference.html': '/reference/',
  '/kontakt.html': '/kontakt/',
  '/ochrana-osobnich-udaju.html': '/ochrana-osobnich-udaju/',
};

const fontPaths = [
  '/assets/fonts/inter-400.woff2',
  '/assets/fonts/inter-500.woff2',
  '/assets/fonts/inter-600.woff2',
  '/assets/fonts/cormorant-garamond-400.woff2',
  '/assets/fonts/cormorant-garamond-500.woff2',
  '/assets/fonts/cormorant-garamond-600.woff2',
  '/assets/fonts/cormorant-garamond-400-italic.woff2',
];

const report = {
  base: BASE,
  generatedAt: new Date().toISOString(),
  assumptions: { stickyMobileCtaMaxWidth: 680, inlineNavigationMaxWidth: 980 },
  viewports: {},
  routeChecks: [],
  interactionChecks: [],
  formChecks: [],
  redirects: [],
  fonts: [],
  endpoints: [],
  axe: [],
  lighthouse: [],
  failures: [],
  advisories: [],
};

function fail(scope, message, details = {}) {
  report.failures.push({ scope, message, ...details });
}
function advisory(scope, message, details = {}) {
  report.advisories.push({ scope, message, ...details });
}
function abs(p) { return new URL(p, BASE).toString(); }
function visibleEval() {
  return `(el)=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0&&r.width>0&&r.height>0}`;
}

async function settle(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
}

async function routeSweep(browser, vp) {
  const context = await browser.newContext({ viewport: vp, locale: 'cs-CZ' });
  for (const route of routes) {
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    const requestFailures = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', err => pageErrors.push(String(err)));
    page.on('requestfailed', req => requestFailures.push({ url: req.url(), error: req.failure()?.errorText || '' }));
    let response;
    let navigationError = null;
    try {
      response = await page.goto(abs(route), { waitUntil: 'domcontentloaded', timeout: 30000 });
      await settle(page);
    } catch (e) {
      navigationError = String(e);
    }
    const status = response?.status() ?? null;
    if (navigationError || status !== 200) fail(`route:${vp.width}:${route}`, 'Route did not load with HTTP 200', { status, navigationError });

    const metrics = navigationError ? {} : await page.evaluate(() => {
      const visible = el => { const s=getComputedStyle(el),r=el.getBoundingClientRect(); return s.display!=='none'&&s.visibility!=='hidden'&&+s.opacity!==0&&r.width>0&&r.height>0; };
      const interactive = [...document.querySelectorAll('a,button,input,select,textarea,[role="button"]')].filter(visible);
      const targets = interactive.map(el => {
        let r = el.getBoundingClientRect();
        if ((el instanceof HTMLInputElement) && ['checkbox','radio'].includes(el.type) && el.closest('label')) r = el.closest('label').getBoundingClientRect();
        const s=getComputedStyle(el);
        const inlineTextLink = el.tagName==='A' && s.display==='inline' && ['P','SPAN'].includes(el.parentElement?.tagName || '');
        return { tag: el.tagName, text: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0,80), cls: el.className || '', w: Math.round(r.width), h: Math.round(r.height), inlineTextLink };
      });
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        fontStatuses: document.fonts ? [...document.fonts].map(f => ({ family:f.family, weight:f.weight, style:f.style, status:f.status })) : [],
        smallTargets24: targets.filter(t => !t.inlineTextLink && (t.w < 24 || t.h < 24)),
        smallTargets44: targets.filter(t => !t.inlineTextLink && (t.w < 44 || t.h < 44)),
      };
    });

    if ((metrics.overflow || 0) > 1) fail(`overflow:${vp.width}:${route}`, 'Horizontal overflow detected', { overflow: metrics.overflow, scrollWidth: metrics.scrollWidth, clientWidth: metrics.clientWidth });
    const failedFonts = (metrics.fontStatuses || []).filter(f => f.status !== 'loaded');
    if (failedFonts.length) fail(`fonts:${vp.width}:${route}`, 'Document font faces did not all load', { failedFonts });
    if ((metrics.smallTargets24 || []).length) fail(`targets:${vp.width}:${route}`, 'Standalone interactive target below 24px minimum', { targets: metrics.smallTargets24 });
    if ((metrics.smallTargets44 || []).length) advisory(`targets:${vp.width}:${route}`, 'Standalone interactive targets below 44px preferred touch size', { count: metrics.smallTargets44.length, targets: metrics.smallTargets44.slice(0,12) });
    if (pageErrors.length) fail(`runtime:${vp.width}:${route}`, 'Uncaught page error', { pageErrors });
    if (requestFailures.length) fail(`network:${vp.width}:${route}`, 'Browser request failure', { requestFailures });

    let axe = { violations: [] };
    if (!navigationError) {
      try {
        axe = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
      } catch (e) {
        fail(`axe:${vp.width}:${route}`, 'axe execution failed', { error: String(e) });
      }
    }
    const violations = (axe.violations || []).map(v => ({
      id: v.id, impact: v.impact, description: v.description, help: v.help, helpUrl: v.helpUrl,
      nodes: v.nodes.map(n => ({ target:n.target, html:n.html, failureSummary:n.failureSummary })).slice(0,20),
    }));
    if (violations.length) fail(`axe:${vp.width}:${route}`, `${violations.length} axe WCAG violation group(s)`, { ids: violations.map(v=>v.id) });
    report.axe.push({ viewport: vp.width, route, violations });
    report.routeChecks.push({ viewport: vp.width, route, status, finalUrl: page.url(), consoleErrors, pageErrors, requestFailures, ...metrics, axeViolationIds: violations.map(v=>v.id) });
    await page.close();
  }
  await context.close();
}

async function testNavigation(browser, vp) {
  const context = await browser.newContext({ viewport: vp, locale: 'cs-CZ' });
  const page = await context.newPage();
  const result = { viewport: vp.width, checks: [] };
  const check = (name, ok, details = {}) => { result.checks.push({ name, ok, ...details }); if (!ok) fail(`interaction:${vp.width}`, name, details); };

  await page.goto(abs('/'), { waitUntil: 'domcontentloaded' }); await settle(page);
  const vis = async sel => page.locator(sel).isVisible().catch(()=>false);
  const topVisible = await vis('.top-links');
  const inlineVisible = await vis('.menu-inline');
  const sideVisible = await vis('.side-trigger');
  if (vp.width <= 980) {
    check('inline navigation visible at <=980px', inlineVisible, { topVisible, inlineVisible, sideVisible });
    check('desktop top links hidden at <=980px', !topVisible, { topVisible });
    check('side trigger hidden at <=980px', !sideVisible, { sideVisible });
  } else {
    check('desktop top links visible above 980px', topVisible, { topVisible });
    check('inline navigation hidden above 980px', !inlineVisible, { inlineVisible });
    check('side trigger visible above 980px', sideVisible, { sideVisible });
  }

  const opener = page.locator(vp.width <= 980 ? '.menu-inline' : '.side-trigger');
  await opener.click();
  check('drawer opens', await page.locator('#drawer').evaluate(el=>el.classList.contains('open')));
  check('drawer aria-hidden=false', (await page.locator('#drawer').getAttribute('aria-hidden')) === 'false');
  check('drawer inert removed while open', (await page.locator('#drawer').getAttribute('inert')) === null);
  check('menu opener aria-expanded=true', (await opener.getAttribute('aria-expanded')) === 'true');
  check('focus moves inside drawer', await page.evaluate(() => document.querySelector('#drawer')?.contains(document.activeElement)));

  const focusables = page.locator('#drawer a, #drawer button, #drawer [tabindex]:not([tabindex="-1"])');
  const count = await focusables.count();
  if (count >= 2) {
    await focusables.first().focus(); await page.keyboard.press('Shift+Tab');
    check('drawer Shift+Tab wraps first→last', await page.evaluate(() => { const d=document.querySelector('#drawer'); const f=[...d.querySelectorAll('a,button,[tabindex]:not([tabindex="-1"])')]; return document.activeElement===f[f.length-1]; }));
    await focusables.last().focus(); await page.keyboard.press('Tab');
    check('drawer Tab wraps last→first', await page.evaluate(() => { const d=document.querySelector('#drawer'); const f=[...d.querySelectorAll('a,button,[tabindex]:not([tabindex="-1"])')]; return document.activeElement===f[0]; }));
  }
  await page.keyboard.press('Escape');
  check('Escape closes drawer', !(await page.locator('#drawer').evaluate(el=>el.classList.contains('open'))));
  check('drawer aria-hidden=true after close', (await page.locator('#drawer').getAttribute('aria-hidden')) === 'true');
  check('drawer inert restored after close', (await page.locator('#drawer').getAttribute('inert')) !== null);
  check('focus returns to opener', await page.evaluate(sel => document.activeElement?.matches(sel), vp.width <= 980 ? '.menu-inline' : '.side-trigger'));

  await opener.click();
  await page.locator('#drawer .drawer-contact a.small').click();
  await page.waitForURL(url => url.pathname === '/kontakt/', { timeout: 10000 }).catch(()=>{});
  check('drawer Contact CTA navigates home→/kontakt/', new URL(page.url()).pathname === '/kontakt/', { url: page.url() });

  await page.goto(abs('/kontakt/'), { waitUntil: 'domcontentloaded' }); await settle(page);
  check('/kontakt/ contains #poptavka target', await page.locator('#poptavka').count() === 1);
  const navHref = await page.locator('.nav-cta').getAttribute('href');
  const drawerHref = await page.locator('#drawer .drawer-contact a.small').getAttribute('href');
  check('/kontakt/ desktop CTA points to #poptavka', navHref === '#poptavka', { navHref });
  check('/kontakt/ drawer CTA points to #poptavka', drawerHref === '#poptavka', { drawerHref });

  const contactOpener = page.locator(vp.width <= 980 ? '.menu-inline' : '.side-trigger');
  await contactOpener.click();
  await page.locator('#drawer .drawer-contact a.small').click();
  await page.waitForTimeout(150);
  check('/kontakt/ drawer CTA closes drawer', !(await page.locator('#drawer').evaluate(el=>el.classList.contains('open'))));
  check('/kontakt/ drawer CTA jumps to #poptavka', new URL(page.url()).hash === '#poptavka', { url:page.url() });

  const mobileCtaVisible = await vis('.mobile-cta');
  if (vp.width <= 680) {
    check('sticky mobile CTA visible at <=680px', mobileCtaVisible, { width:vp.width });
    const mobileHref = await page.locator('.mobile-cta a:last-child').getAttribute('href');
    check('/kontakt/ sticky CTA points to #poptavka', mobileHref === '#poptavka', { mobileHref });
    await page.locator('.mobile-cta a:last-child').click(); await page.waitForTimeout(100);
    check('/kontakt/ sticky CTA jumps to #poptavka', new URL(page.url()).hash === '#poptavka', { url:page.url() });
  } else {
    check('sticky mobile CTA hidden above 680px', !mobileCtaVisible, { width:vp.width, mobileCtaVisible });
  }

  await page.goto(abs('/'), { waitUntil: 'domcontentloaded' }); await settle(page);
  if (vp.width <= 680) {
    const homeMobileHref = await page.locator('.mobile-cta a:last-child').getAttribute('href');
    check('home sticky CTA points to /kontakt/', homeMobileHref === '/kontakt/', { homeMobileHref });
  }

  await page.evaluate(() => { history.replaceState(null,'',location.pathname); window.scrollTo(0,0); document.body.focus(); });
  await page.keyboard.press('Tab');
  check('first keyboard Tab focuses skip link', await page.evaluate(() => document.activeElement?.classList.contains('skip')));
  await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  check('skip link targets #main', new URL(page.url()).hash === '#main', { url:page.url() });

  report.interactionChecks.push(result);
  await context.close();
}

async function advanceToFinalStep(page, check) {
  await page.locator('#nextStep').click();
  check('form requires building choice', (await page.locator('#formStatus').textContent())?.includes('Vyberte prosím typ objektu'));
  await page.locator('.choices[data-key="building"] .choice').first().focus(); await page.keyboard.press('Enter');
  check('building choice keyboard activation sets pressed=true', (await page.locator('.choices[data-key="building"] .choice').first().getAttribute('aria-pressed')) === 'true');
  await page.locator('#nextStep').click();
  await page.locator('#nextStep').click();
  check('form requires problem choice', (await page.locator('#formStatus').textContent())?.includes('Vyberte prosím hlavní problém'));
  await page.locator('.choices[data-key="problem"] .choice').first().focus(); await page.keyboard.press('Enter');
  check('problem choice keyboard activation sets pressed=true', (await page.locator('.choices[data-key="problem"] .choice').first().getAttribute('aria-pressed')) === 'true');
  await page.locator('#nextStep').click();
  await page.locator('#nextStep').click();
  check('form requires name/phone/email', (await page.locator('#formStatus').textContent())?.includes('Doplňte prosím jméno, telefon a e-mail'));
  await page.locator('#name').fill('QA Test');
  await page.locator('#phone').fill('+420 777 000 111');
  await page.locator('#email').fill('not-an-email');
  await page.locator('#nextStep').click();
  check('form rejects invalid email', (await page.locator('#formStatus').textContent())?.includes('Zkontrolujte prosím e-mailovou adresu'));
  await page.locator('#email').fill('qa@example.com');
  await page.locator('#nextStep').click();
  check('form requires privacy consent', (await page.locator('#formStatus').textContent())?.includes('Potvrďte prosím'));
  await page.locator('#privacyAck').check();
}

async function testForm(browser, vp) {
  const result = { viewport: vp.width, checks: [] };
  const check = (name, ok, details={}) => { result.checks.push({name,ok,...details}); if(!ok) fail(`form:${vp.width}`, name, details); };

  {
    const context = await browser.newContext({ viewport: vp, locale:'cs-CZ' });
    const page = await context.newPage();
    await page.route('**/api/enquiry', r => r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ok:true}) }));
    await page.goto(abs('/kontakt/'), { waitUntil:'domcontentloaded' }); await settle(page);
    await advanceToFinalStep(page, check);
    await page.locator('#nextStep').click(); await page.waitForTimeout(100);
    check('simulated success state shown', (await page.locator('#formStatus').textContent())?.includes('Poptávka byla odeslána'));
    check('success state class applied', (await page.locator('#formStatus').getAttribute('class'))?.includes('success'));
    check('submit button becomes Odesláno', (await page.locator('#nextStep').textContent())?.includes('Odesláno'));
    await context.close();
  }
  {
    const context = await browser.newContext({ viewport: vp, locale:'cs-CZ' });
    const page = await context.newPage();
    await page.route('**/api/enquiry', r => r.fulfill({ status:500, contentType:'application/json', body:JSON.stringify({message:'QA simulated failure'}) }));
    await page.goto(abs('/kontakt/'), { waitUntil:'domcontentloaded' }); await settle(page);
    const silentCheck = () => {};
    await page.locator('.choices[data-key="building"] .choice').first().click(); await page.locator('#nextStep').click();
    await page.locator('.choices[data-key="problem"] .choice').first().click(); await page.locator('#nextStep').click();
    await page.locator('#name').fill('QA Test'); await page.locator('#phone').fill('+420 777 000 111'); await page.locator('#email').fill('qa@example.com'); await page.locator('#privacyAck').check();
    await page.locator('#nextStep').click(); await page.waitForTimeout(100);
    const errorText = (await page.locator('#formStatus').textContent()) || '';
    check('simulated error state shown', errorText.includes('Odeslání se nepodařilo'), { errorText });
    check('error state includes configured fallback phone', /\+420\s?732\s?282\s?409/.test(errorText), { errorText });
    check('submit button re-enabled after error', !(await page.locator('#nextStep').isDisabled()));
    await context.close();
  }
  report.formChecks.push(result);
}

async function requestChecks() {
  const api = await playwrightRequest.newContext({ baseURL: BASE, ignoreHTTPSErrors:false });
  for (const [from,to] of Object.entries(legacyRedirects)) {
    const r = await api.get(from, { maxRedirects:0 });
    const status = r.status(); const location = r.headers()['location'] || '';
    const resolved = location ? new URL(location, BASE).pathname : '';
    const ok = [301,302,307,308].includes(status) && resolved === to;
    report.redirects.push({ from,to,status,location,resolved,ok });
    if (!ok) fail(`redirect:${from}`, 'Legacy redirect mismatch', { expected:to,status,location,resolved });
  }
  for (const p of fontPaths) {
    const r = await api.get(p); const ct = r.headers()['content-type'] || '';
    const ok = r.status()===200 && /font|woff|octet-stream/i.test(ct);
    report.fonts.push({ path:p,status:r.status(),contentType:ct,ok });
    if(!ok) fail(`font:${p}`, 'Font asset failed', { status:r.status(),contentType:ct });
  }
  for (const p of ['/robots.txt','/sitemap.xml']) {
    const r=await api.get(p); const text=await r.text(); const ok=r.status()===200 && text.length>10;
    report.endpoints.push({path:p,status:r.status(),contentType:r.headers()['content-type']||'',length:text.length,ok});
    if(!ok) fail(`endpoint:${p}`, 'Public endpoint failed', {status:r.status(),length:text.length});
  }
  const r404 = await api.get('/__qa_nonexistent_public_route__', { maxRedirects:0 });
  report.endpoints.push({ path:'/__qa_nonexistent_public_route__', status:r404.status(), ok:r404.status()===404 });
  if(r404.status()!==404) fail('404','Unknown public route did not return 404',{status:r404.status()});
  await api.dispose();
}

function runLighthouse(route, mode, name) {
  const out = path.join(OUT, `${name}.json`);
  const args = ['lighthouse', abs(route), '--quiet', '--output=json', `--output-path=${out}`, '--only-categories=performance,accessibility,best-practices,seo', '--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage'];
  if (mode === 'desktop') args.push('--preset=desktop');
  try {
    execFileSync('npx', args, { stdio:'pipe', timeout:180000 });
    const lhr = JSON.parse(fs.readFileSync(out,'utf8'));
    const cats = Object.fromEntries(Object.entries(lhr.categories).map(([k,v])=>[k,Math.round((v.score || 0)*100)]));
    const lcp = lhr.audits['largest-contentful-paint']?.numericValue ? lhr.audits['largest-contentful-paint'].numericValue/1000 : null;
    const lcpNode = lhr.audits['largest-contentful-paint-element']?.details?.items?.[0]?.items?.[0]?.node || lhr.audits['largest-contentful-paint-element']?.details?.items?.[0]?.node || null;
    const auditFindings = {};
    for (const id of ['color-contrast','heading-order','link-name','label-content-name-mismatch']) {
      const a=lhr.audits[id]; if(a) auditFindings[id]={score:a.score,title:a.title,displayValue:a.displayValue,details:a.details?.items?.slice?.(0,10) || null};
    }
    const entry={route,mode,name,scores:cats,lcpSeconds:lcp,lcpElement:lcpNode?{snippet:lcpNode.snippet,selector:lcpNode.selector,nodeLabel:lcpNode.nodeLabel}:null,auditFindings};
    report.lighthouse.push(entry);
    if(mode==='mobile' && route==='/' && lcp!==null && lcp>4.0) fail(`lighthouse:${name}`,'Homepage mobile LCP is in the poor range (>4.0s)',{lcpSeconds:lcp});
    return entry;
  } catch(e) {
    fail(`lighthouse:${name}`,'Lighthouse execution failed',{error:String(e),stdout:e.stdout?.toString?.().slice(-4000),stderr:e.stderr?.toString?.().slice(-4000)});
    return null;
  }
}

async function main() {
  await requestChecks();
  const browser = await chromium.launch({ headless:true, args:['--no-sandbox','--disable-dev-shm-usage'] });
  for (const vp of viewports) {
    await routeSweep(browser, vp);
    await testNavigation(browser, vp);
    await testForm(browser, vp);
  }
  await browser.close();

  runLighthouse('/', 'mobile', 'home-mobile-1');
  runLighthouse('/', 'mobile', 'home-mobile-2');
  runLighthouse('/', 'mobile', 'home-mobile-3');
  runLighthouse('/', 'desktop', 'home-desktop');
  runLighthouse('/kontakt/', 'mobile', 'contact-mobile');
  runLighthouse('/kontakt/', 'desktop', 'contact-desktop');

  const homeMobile = report.lighthouse.filter(x=>x.route==='/'&&x.mode==='mobile'&&x.lcpSeconds!==null).map(x=>x.lcpSeconds).sort((a,b)=>a-b);
  const median = homeMobile.length ? homeMobile[Math.floor(homeMobile.length/2)] : null;
  report.mobileLcpSummary = { runs:homeMobile, medianSeconds:median, minSeconds:homeMobile[0]??null, maxSeconds:homeMobile.at(-1)??null };

  for (const vp of viewports) {
    const scoped=report.failures.filter(f=>String(f.scope).includes(`:${vp.width}`));
    report.viewports[vp.width]={pass:scoped.length===0,failures:scoped.length};
  }

  const uniqueAxe=[...new Set(report.axe.flatMap(a=>a.violations.map(v=>v.id)))];
  const summary={
    base:BASE,
    assumptions:report.assumptions,
    viewportStatus:report.viewports,
    failureCount:report.failures.length,
    interactionFailures:report.failures.filter(f=>f.scope.startsWith('interaction:')||f.scope.startsWith('form:')),
    axeViolationIds:uniqueAxe,
    lighthouse:report.lighthouse.map(x=>({name:x.name,scores:x.scores,lcpSeconds:x.lcpSeconds,lcpElement:x.lcpElement,auditFindings:Object.fromEntries(Object.entries(x.auditFindings).map(([k,v])=>[k,{score:v.score,title:v.title}]))})),
    mobileLcpSummary:report.mobileLcpSummary,
  };
  fs.writeFileSync(path.join(OUT,'report.json'), JSON.stringify(report,null,2));
  fs.writeFileSync(path.join(OUT,'summary.json'), JSON.stringify(summary,null,2));
  console.log('QA_SUMMARY_START'); console.log(JSON.stringify(summary,null,2)); console.log('QA_SUMMARY_END');
  if(report.failures.length) process.exitCode=1;
}

main().catch(e=>{ console.error(e); fail('runner','Unhandled QA runner error',{error:String(e),stack:e.stack}); fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2)); process.exitCode=1; });
