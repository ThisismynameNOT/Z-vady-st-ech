import fs from 'node:fs';
import { chromium, request as playwrightRequest } from 'playwright-core';
import axeCore from 'axe-core';

const BASE = 'https://zavady-strech-praha.iadamt-93.workers.dev';
const EXPECTED_MAIN = 'a24021b17d945dfea36464b1bde78e523d429600';
const VIEWPORTS = [320, 375, 390, 430, 768, 1024, 1440, 1920];
const ROUTES = [
  '/',
  '/firma/',
  '/sluzby/',
  '/realizace/',
  '/reference/',
  '/kontakt/',
  '/ochrana-osobnich-udaju/',
  '/realizace/gymnazium-jana-patocky/',
  '/realizace/hybernska-2-997/',
  '/realizace/narodni-muzeum/',
  '/realizace/prazska-trznice-hala-25/',
];
const LEGACY = [
  ['/index.html', '/'],
  ['/firma.html', '/firma/'],
  ['/sluzby.html', '/sluzby/'],
  ['/realizace.html', '/realizace/'],
  ['/reference.html', '/reference/'],
  ['/kontakt.html', '/kontakt/'],
  ['/ochrana-osobnich-udaju.html', '/ochrana-osobnich-udaju/'],
];
const FONTS = [
  '/assets/fonts/inter-400.woff2',
  '/assets/fonts/inter-500.woff2',
  '/assets/fonts/inter-600.woff2',
  '/assets/fonts/cormorant-garamond-400.woff2',
  '/assets/fonts/cormorant-garamond-500.woff2',
  '/assets/fonts/cormorant-garamond-600.woff2',
  '/assets/fonts/cormorant-garamond-400-italic.woff2',
];
const TARGET_AXE_RULES = [
  'color-contrast',
  'link-in-text-block',
  'heading-order',
  'label-content-name-mismatch',
];

const report = {
  baseUrl: BASE,
  expectedMainCommit: EXPECTED_MAIN,
  generatedAt: new Date().toISOString(),
  viewports: VIEWPORTS,
  routes: ROUTES,
  matrix: [],
  checks: [],
  failures: [],
  axe: { scans: 0, violations: {}, targetRuleViolations: Object.fromEntries(TARGET_AXE_RULES.map(id => [id, 0])), rulesPresent: {} },
  touchTargets: { scans: 0, failures: [] },
  fonts: { direct: [], matrixFailures: [] },
  redirects: [],
  interactions: [],
  keyboard: [],
  forms: [],
  hero: {},
};

function addCheck(kind, name, pass, details = {}) {
  const row = { kind, name, pass: Boolean(pass), ...details };
  report.checks.push(row);
  if (!pass) report.failures.push(row);
  return pass;
}

function normPath(value) {
  try { return new URL(value, BASE).pathname + new URL(value, BASE).hash; } catch { return value; }
}

function isInteractionKind(kind) {
  return ['interaction', 'navigation', 'keyboard', 'form'].includes(kind);
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const api = await playwrightRequest.newContext({ baseURL: BASE, ignoreHTTPSErrors: false });

async function waitFonts(page) {
  return page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.allSettled([
      document.fonts.load('16px Inter'),
      document.fonts.load('16px Cormorant'),
    ]);
    return {
      status: document.fonts.status,
      inter: document.fonts.check('16px Inter'),
      cormorant: document.fonts.check('16px Cormorant'),
      bodyFamily: getComputedStyle(document.body).fontFamily,
      headingFamily: getComputedStyle(document.querySelector('h1,h2') || document.body).fontFamily,
    };
  });
}

async function auditTouchTargets(page) {
  return page.evaluate(() => {
    const selector = 'a[href],button:not([disabled]),input:not([type="hidden"]):not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[role="button"],[role="link"]';
    const all = [...document.querySelectorAll(selector)];
    const visible = (el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && s.pointerEvents !== 'none' && r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
    };
    const inlineException = (el) => {
      if (el.tagName !== 'A') return false;
      const p = el.closest('p,li,dd,dt,figcaption,label,.rich-copy,.breadcrumbs,.ledger-note');
      if (!p) return false;
      return getComputedStyle(el).display === 'inline';
    };
    const effectiveRect = (el) => {
      if (el instanceof HTMLInputElement && ['checkbox','radio'].includes(el.type) && el.labels?.length) {
        return el.labels[0].getBoundingClientRect();
      }
      return el.getBoundingClientRect();
    };
    const targets = all.filter(visible).map((el) => {
      const r = effectiveRect(el);
      return {
        el,
        rect: { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height },
        cx:(r.left+r.right)/2,
        cy:(r.top+r.bottom)/2,
        inline:inlineException(el),
      };
    });
    const failures = [];
    for (const t of targets) {
      if (t.inline) continue;
      if (t.rect.width >= 24 && t.rect.height >= 24) continue;
      let nearest = Infinity;
      for (const o of targets) {
        if (o === t || o.inline) continue;
        const d = Math.hypot(t.cx-o.cx, t.cy-o.cy);
        nearest = Math.min(nearest, d);
      }
      if (nearest >= 24) continue;
      failures.push({
        tag: t.el.tagName.toLowerCase(),
        text: (t.el.getAttribute('aria-label') || t.el.textContent || '').trim().replace(/\s+/g,' ').slice(0,100),
        href: t.el.getAttribute('href'),
        width: Number(t.rect.width.toFixed(2)),
        height: Number(t.rect.height.toFixed(2)),
        nearestTargetCenterDistance: Number(nearest.toFixed(2)),
      });
    }
    return failures;
  });
}

async function axeAudit(page) {
  await page.addScriptTag({ content: axeCore.source });
  const result = await page.evaluate(async () => {
    const allRules = window.axe.getRules().map(r => r.ruleId);
    const run = await window.axe.run(document, { resultTypes: ['violations'] });
    return { allRules, violations: run.violations.map(v => ({ id:v.id, impact:v.impact, nodes:v.nodes.length, help:v.help })) };
  });
  return result;
}

try {
  const sitemapRes = await api.get('/sitemap.xml');
  const sitemapText = await sitemapRes.text();
  const sitemapPaths = [...sitemapText.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => new URL(m[1]).pathname).sort();
  addCheck('route', 'live sitemap HTTP 200', sitemapRes.status() === 200, { status: sitemapRes.status() });
  addCheck('route', 'live sitemap route set matches 11 expected public routes', JSON.stringify(sitemapPaths) === JSON.stringify([...ROUTES].sort()), { sitemapPaths });

  for (const font of FONTS) {
    const res = await api.get(font);
    const body = await res.body();
    const ok = res.status() === 200 && body.length > 1000;
    report.fonts.direct.push({ font, status: res.status(), bytes: body.length, contentType: res.headers()['content-type'] || '', pass: ok });
    addCheck('font', `font ${font}`, ok, { status: res.status(), bytes: body.length });
  }

  for (const [from, to] of LEGACY) {
    const first = await api.get(from, { maxRedirects: 0 });
    const loc = first.headers().location || '';
    const final = await api.get(from, { maxRedirects: 10 });
    const row = {
      from, to,
      status: first.status(),
      location: loc,
      finalStatus: final.status(),
      finalPath: new URL(final.url()).pathname,
    };
    row.pass = first.status() === 301 && new URL(loc, BASE).pathname === to && final.status() === 200 && row.finalPath === to;
    report.redirects.push(row);
    addCheck('redirect', `legacy ${from} -> ${to}`, row.pass, row);
  }

  let rulePresenceCaptured = false;
  for (const width of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    for (const route of ROUTES) {
      const page = await context.newPage();
      const consoleErrors = [];
      const pageErrors = [];
      page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
      page.on('pageerror', err => pageErrors.push(String(err)));
      let response;
      try {
        response = await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(120);
        const fonts = await waitFonts(page);
        const geometry = await page.evaluate(() => ({
          docScrollWidth: document.documentElement.scrollWidth,
          docClientWidth: document.documentElement.clientWidth,
          bodyScrollWidth: document.body.scrollWidth,
          bodyClientWidth: document.body.clientWidth,
          title: document.title,
          h1Count: document.querySelectorAll('h1').length,
          skipHref: document.querySelector('.skip')?.getAttribute('href') || null,
          mainExists: Boolean(document.querySelector('#main')),
        }));
        const axe = await axeAudit(page);
        report.axe.scans++;
        if (!rulePresenceCaptured) {
          for (const id of TARGET_AXE_RULES) report.axe.rulesPresent[id] = axe.allRules.includes(id);
          rulePresenceCaptured = true;
        }
        for (const v of axe.violations) {
          report.axe.violations[v.id] = (report.axe.violations[v.id] || 0) + v.nodes;
          if (TARGET_AXE_RULES.includes(v.id)) report.axe.targetRuleViolations[v.id] += v.nodes;
        }
        const touchFailures = await auditTouchTargets(page);
        report.touchTargets.scans++;
        for (const failure of touchFailures) report.touchTargets.failures.push({ width, route, ...failure });

        const row = {
          width, route,
          status: response?.status() ?? null,
          fonts,
          geometry,
          axeViolations: axe.violations,
          touchTargetFailures: touchFailures,
          consoleErrors,
          pageErrors,
        };
        report.matrix.push(row);

        addCheck('route', `${width}px ${route} HTTP 200`, response?.status() === 200, { width, route, status: response?.status() ?? null });
        addCheck('overflow', `${width}px ${route} no horizontal overflow`, geometry.docScrollWidth <= geometry.docClientWidth + 1 && geometry.bodyScrollWidth <= geometry.bodyClientWidth + 1, { width, route, geometry });
        const fontsPass = fonts.status === 'loaded' && fonts.inter && fonts.cormorant;
        if (!fontsPass) report.fonts.matrixFailures.push({ width, route, fonts });
        addCheck('font', `${width}px ${route} fonts loaded`, fontsPass, { width, route, fonts });
        addCheck('axe', `${width}px ${route} axe violations = 0`, axe.violations.length === 0, { width, route, violations: axe.violations });
        addCheck('touch-target', `${width}px ${route} WCAG 2.2 target-size failures = 0`, touchFailures.length === 0, { width, route, failures: touchFailures });
        addCheck('runtime', `${width}px ${route} page errors = 0`, pageErrors.length === 0, { width, route, pageErrors });
        addCheck('runtime', `${width}px ${route} console errors = 0`, consoleErrors.length === 0, { width, route, consoleErrors });
        addCheck('keyboard', `${width}px ${route} skip-link contract`, geometry.skipHref === '#main' && geometry.mainExists, { width, route, skipHref: geometry.skipHref });
      } catch (error) {
        report.matrix.push({ width, route, fatal: String(error) });
        addCheck('route', `${width}px ${route} matrix execution`, false, { width, route, error: String(error) });
      } finally {
        await page.close();
      }
    }
    await context.close();
  }

  for (const id of TARGET_AXE_RULES) {
    addCheck('axe', `axe rule ${id} is available`, report.axe.rulesPresent[id] === true, { id, present: report.axe.rulesPresent[id] });
    addCheck('axe', `${id} cleared sitewide`, report.axe.targetRuleViolations[id] === 0, { id, nodes: report.axe.targetRuleViolations[id] });
  }

  for (const width of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    const nav = {
      topLinksVisible: await page.locator('.top-links').isVisible(),
      inlineMenuVisible: await page.locator('.menu-inline').isVisible(),
      sideTriggerVisible: await page.locator('.side-trigger').isVisible(),
      mobileCtaVisible: await page.locator('.mobile-cta').isVisible(),
    };
    if (nav.mobileCtaVisible) {
      nav.mobileCtaStyle = await page.locator('.mobile-cta').evaluate(el => {
        const s=getComputedStyle(el), r=el.getBoundingClientRect();
        return { position:s.position, bottom:Number((innerHeight-r.bottom).toFixed(2)), top:Number(r.top.toFixed(2)), height:Number(r.height.toFixed(2)) };
      });
    }
    report.interactions.push({ type:'navigation-matrix', width, ...nav });
    const desktopExpected = width > 980;
    addCheck('navigation', `${width}px desktop/mobile navigation mode`, desktopExpected ? (nav.topLinksVisible && !nav.inlineMenuVisible) : (!nav.topLinksVisible && nav.inlineMenuVisible), { width, desktopExpected, ...nav });
    const stickyExpected = width <= 680;
    const stickyPass = stickyExpected
      ? nav.mobileCtaVisible && nav.mobileCtaStyle?.position === 'fixed' && Math.abs(nav.mobileCtaStyle?.bottom ?? 99) <= 2
      : !nav.mobileCtaVisible;
    addCheck('navigation', `${width}px sticky mobile CTA visibility/position`, stickyPass, { width, stickyExpected, ...nav });
    await page.close();
    await context.close();
  }

  async function drawerSuite(width) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    const opener = width <= 980 ? page.locator('.menu-inline') : page.locator('.side-trigger');
    const drawer = page.locator('#drawer');
    const close = page.locator('.drawer-close');
    const drawerContact = page.locator('.drawer-contact .small');
    const openerVisible = await opener.isVisible();
    addCheck('interaction', `${width}px drawer opener visible`, openerVisible, { width });
    if (!openerVisible) { await context.close(); return; }

    await opener.click();
    await page.waitForTimeout(100);
    const opened = await drawer.evaluate(el => ({ open:el.classList.contains('open'), hidden:el.getAttribute('aria-hidden'), inert:el.hasAttribute('inert'), activeText:(document.activeElement?.getAttribute('aria-label')||document.activeElement?.textContent||'').trim() }));
    addCheck('interaction', `${width}px drawer opens`, opened.open && opened.hidden === 'false' && !opened.inert, { width, opened });
    addCheck('interaction', `${width}px drawer initial focus enters drawer`, await page.evaluate(() => document.activeElement?.closest?.('#drawer')?.id === 'drawer'), { width, active: opened.activeText });

    const focusables = drawer.locator('a,button,[tabindex]:not([tabindex="-1"])');
    const first = focusables.first();
    const last = focusables.last();
    await last.focus();
    await page.keyboard.press('Tab');
    addCheck('interaction', `${width}px focus trap forward wraps`, await first.evaluate(el => document.activeElement === el), { width });
    await first.focus();
    await page.keyboard.press('Shift+Tab');
    addCheck('interaction', `${width}px focus trap backward wraps`, await last.evaluate(el => document.activeElement === el), { width });

    await page.keyboard.press('Escape');
    await page.waitForTimeout(80);
    const escaped = await drawer.evaluate(el => ({ open:el.classList.contains('open'), hidden:el.getAttribute('aria-hidden'), inert:el.hasAttribute('inert') }));
    const focusRestored = await opener.evaluate(el => document.activeElement === el);
    addCheck('interaction', `${width}px Escape closes drawer`, !escaped.open && escaped.hidden === 'true' && escaped.inert, { width, escaped });
    addCheck('interaction', `${width}px Escape restores opener focus`, focusRestored, { width });

    await opener.click(); await page.waitForTimeout(60); await close.click(); await page.waitForTimeout(60);
    addCheck('interaction', `${width}px close button closes drawer`, !(await drawer.evaluate(el => el.classList.contains('open'))), { width });

    await opener.click(); await page.waitForTimeout(60); await page.mouse.click(5, 450); await page.waitForTimeout(60);
    addCheck('interaction', `${width}px backdrop closes drawer`, !(await drawer.evaluate(el => el.classList.contains('open'))), { width });

    await opener.click(); await page.waitForTimeout(60);
    const drawerCtaHref = await drawerContact.getAttribute('href');
    addCheck('interaction', `${width}px drawer Contact CTA points to /kontakt/ from home`, normPath(drawerCtaHref) === '/kontakt/', { width, href: drawerCtaHref });
    await drawerContact.click();
    await page.waitForURL(/\/kontakt\/$/, { timeout: 10000 });
    addCheck('interaction', `${width}px drawer Contact CTA navigates to /kontakt/`, new URL(page.url()).pathname === '/kontakt/', { width, url:page.url() });
    await context.close();
  }
  await drawerSuite(375);
  await drawerSuite(1440);

  for (const width of [375, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    await page.goto(BASE + '/kontakt/', { waitUntil: 'domcontentloaded' });
    const navHref = await page.locator('.nav-cta').getAttribute('href');
    const mobileHref = await page.locator('.mobile-cta a').filter({ hasText: 'Poptat opravu' }).getAttribute('href').catch(() => null);
    const opener = width <= 980 ? page.locator('.menu-inline') : page.locator('.side-trigger');
    await opener.click(); await page.waitForTimeout(60);
    const drawerHref = await page.locator('.drawer-contact .small').getAttribute('href');
    await page.keyboard.press('Escape');
    addCheck('interaction', `${width}px /kontakt/ header CTA -> #poptavka`, navHref === '#poptavka', { width, href:navHref });
    if (width <= 680) addCheck('interaction', `${width}px /kontakt/ sticky CTA -> #poptavka`, mobileHref === '#poptavka', { width, href:mobileHref });
    addCheck('interaction', `${width}px /kontakt/ drawer CTA -> #poptavka`, drawerHref === '#poptavka', { width, href:drawerHref });

    const cta = width <= 680 ? page.locator('.mobile-cta a').filter({ hasText: 'Poptat opravu' }) : page.locator('.nav-cta');
    await cta.click(); await page.waitForTimeout(120);
    const handoff = await page.evaluate(() => ({ hash:location.hash, top:document.querySelector('#poptavka')?.getBoundingClientRect().top ?? null }));
    addCheck('interaction', `${width}px /kontakt/ CTA scroll handoff works`, handoff.hash === '#poptavka' && handoff.top !== null && handoff.top < innerHeight, { width, handoff });
    await context.close();
  }

  for (const width of [375, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    for (const route of ROUTES) {
      const page = await context.newPage();
      await page.goto(BASE + route, { waitUntil:'domcontentloaded' });
      await page.keyboard.press('Tab');
      const skipState = await page.evaluate(() => {
        const el=document.activeElement, r=el?.getBoundingClientRect?.();
        return { isSkip:el?.classList?.contains('skip')||false, top:r?.top??null, href:el?.getAttribute?.('href')||null };
      });
      addCheck('keyboard', `${width}px ${route} first Tab reaches skip link`, skipState.isSkip && skipState.href === '#main' && skipState.top !== null && skipState.top >= 0, { width, route, skipState });
      await page.keyboard.press('Enter'); await page.waitForTimeout(80);
      const afterSkip = await page.evaluate(() => ({ hash:location.hash, mainTop:document.querySelector('#main')?.getBoundingClientRect().top ?? null }));
      addCheck('keyboard', `${width}px ${route} skip link activates #main`, afterSkip.hash === '#main' && afterSkip.mainTop !== null && afterSkip.mainTop < innerHeight, { width, route, afterSkip });
      await page.keyboard.press('Tab');
      const nextFocus = await page.evaluate(() => ({ tag:document.activeElement?.tagName, visible:!!document.activeElement && document.activeElement.getBoundingClientRect().width>0 && document.activeElement.getBoundingClientRect().height>0 }));
      addCheck('keyboard', `${width}px ${route} keyboard continues after skip`, ['A','BUTTON','INPUT','SELECT','TEXTAREA','SUMMARY'].includes(nextFocus.tag) && nextFocus.visible, { width, route, nextFocus });
      await page.close();
    }
    await context.close();
  }

  async function getToFormStep3(page) {
    await page.locator('.form-step.active .choice').first().click();
    await page.locator('#nextStep').click();
    await page.locator('.form-step.active .choice').first().click();
    await page.locator('#nextStep').click();
  }

  for (const width of [375, 1440]) {
    const context = await browser.newContext({ viewport:{width,height:1000} });
    const page = await context.newPage();
    await page.goto(BASE + '/kontakt/#poptavka', { waitUntil:'domcontentloaded' });
    const status = page.locator('#formStatus');
    await page.locator('#nextStep').click();
    addCheck('form', `${width}px form requires building`, (await status.textContent())?.includes('Vyberte prosím typ objektu.'), { width, text:await status.textContent() });
    await page.locator('.form-step.active .choice').first().click(); await page.locator('#nextStep').click();
    await page.locator('#nextStep').click();
    addCheck('form', `${width}px form requires problem`, (await status.textContent())?.includes('Vyberte prosím hlavní problém.'), { width, text:await status.textContent() });
    await page.locator('.form-step.active .choice').first().click(); await page.locator('#nextStep').click();
    await page.locator('#nextStep').click();
    addCheck('form', `${width}px form requires name/phone/email`, (await status.textContent())?.includes('Doplňte prosím jméno, telefon a e-mail.'), { width, text:await status.textContent() });
    await page.locator('#name').fill('QA Test'); await page.locator('#phone').fill('+420 777 111 222'); await page.locator('#email').fill('bad-email'); await page.locator('#nextStep').click();
    addCheck('form', `${width}px form rejects invalid email`, (await status.textContent())?.includes('Zkontrolujte prosím e-mailovou adresu.'), { width, text:await status.textContent() });
    await page.locator('#email').fill('qa@example.com'); await page.locator('#nextStep').click();
    addCheck('form', `${width}px form requires privacy consent`, (await status.textContent())?.includes('Potvrďte prosím seznámení'), { width, text:await status.textContent() });
    await context.close();
  }

  for (const width of [375, 1440]) {
    for (const mode of ['success','error']) {
      const context = await browser.newContext({ viewport:{width,height:1000} });
      const page = await context.newPage();
      let intercepted = 0;
      await page.route('**/api/enquiry', async route => {
        intercepted++;
        if (mode === 'success') await route.fulfill({ status:200, contentType:'application/json', body:'{"ok":true}' });
        else await route.fulfill({ status:500, contentType:'application/json', body:'{"message":"simulated QA error"}' });
      });
      await page.goto(BASE + '/kontakt/#poptavka', { waitUntil:'domcontentloaded' });
      await getToFormStep3(page);
      await page.locator('#name').fill('QA Test');
      await page.locator('#phone').fill('+420 777 111 222');
      await page.locator('#email').fill('qa@example.com');
      await page.locator('#privacyAck').check();
      await page.locator('#nextStep').click();
      await page.waitForTimeout(150);
      const formState = await page.evaluate(() => ({ status:document.querySelector('#formStatus')?.textContent || '', className:document.querySelector('#formStatus')?.className || '', nextDisabled:document.querySelector('#nextStep')?.disabled || false, nextText:document.querySelector('#nextStep')?.textContent || '' }));
      const pass = mode === 'success'
        ? intercepted === 1 && formState.className.includes('success') && formState.status.includes('Děkujeme. Poptávka byla odeslána.') && formState.nextText.includes('Odesláno')
        : intercepted === 1 && formState.className.includes('error') && formState.status.includes('Odeslání se nepodařilo.') && !formState.nextDisabled;
      report.forms.push({ width, mode, intercepted, ...formState, pass });
      addCheck('form', `${width}px simulated form ${mode} path`, pass, { width, mode, intercepted, formState });
      await context.close();
    }
  }

  {
    const context = await browser.newContext({ viewport:{width:390,height:900}, deviceScaleFactor:2 });
    const page = await context.newPage();
    const heroRequests=[];
    page.on('response', res => { if (res.url().includes('hero-prague')) heroRequests.push({url:res.url(),status:res.status()}); });
    await page.goto(BASE + '/', { waitUntil:'load' });
    const hero = await page.evaluate(() => {
      const picture=document.querySelector('.hero-media picture');
      const img=picture?.querySelector('img');
      return {
        picture:Boolean(picture),
        sourceTypes:[...picture?.querySelectorAll('source')||[]].map(s=>s.type),
        srcsets:[...picture?.querySelectorAll('[srcset]')||[]].map(s=>s.getAttribute('srcset')),
        currentSrc:img?.currentSrc||null,
        fallbackSrc:img?.getAttribute('src')||null,
      };
    });
    report.hero = { ...hero, requests:heroRequests };
    addCheck('hero', 'live homepage responsive picture/srcset exists', hero.picture && hero.sourceTypes.includes('image/avif') && hero.sourceTypes.includes('image/webp') && hero.srcsets.length >= 3, hero);
    addCheck('hero', 'live homepage uses an AVIF responsive hero in Chromium', /\/assets\/hero\/hero-prague-\d+\.avif$/.test(new URL(hero.currentSrc).pathname), hero);
    await context.close();
  }

} finally {
  await api.dispose();
  await browser.close();
}

report.summary = {
  matrixCombinations: VIEWPORTS.length * ROUTES.length,
  matrixRows: report.matrix.length,
  totalFailures: report.failures.length,
  interactionFailures: report.failures.filter(f => isInteractionKind(f.kind)).length,
  axeFailureChecks: report.failures.filter(f => f.kind === 'axe').length,
  axeViolationNodes: Object.values(report.axe.violations).reduce((a,b) => a+b, 0),
  fontFailures: report.failures.filter(f => f.kind === 'font').length,
  touchTargetFailures: report.touchTargets.failures.length,
  redirectFailures: report.redirects.filter(r => !r.pass).length,
  overflowFailures: report.failures.filter(f => f.kind === 'overflow').length,
  runtimeFailures: report.failures.filter(f => f.kind === 'runtime').length,
  routeFailures: report.failures.filter(f => f.kind === 'route').length,
};
report.publicFunctionalAccessibilityPass = report.failures.length === 0;
fs.writeFileSync('public-acceptance.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary, null, 2));
if (report.failures.length) {
  console.error('PUBLIC ACCEPTANCE FAILURES');
  for (const f of report.failures.slice(0,100)) console.error(JSON.stringify(f));
}
