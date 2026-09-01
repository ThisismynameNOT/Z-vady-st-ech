import fs from 'node:fs';
import { chromium } from 'playwright-core';
import axe from 'axe-core';
import { evaluateTouchTargets } from './touch-target-evaluator.mjs';

const BASE = (process.env.QA_BASE_URL || 'http://127.0.0.1:8788').replace(/\/$/, '');
const CHROME = process.env.CHROME_PATH;
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
const REDIRECTS = [
  ['/index.html', '/'],
  ['/firma.html', '/firma/'],
  ['/sluzby.html', '/sluzby/'],
  ['/realizace.html', '/realizace/'],
  ['/reference.html', '/reference/'],
  ['/kontakt.html', '/kontakt/'],
  ['/ochrana-osobnich-udaju.html', '/ochrana-osobnich-udaju/'],
];
const CZECH = /[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/;

const report = {
  matrixRows: [],
  routeFailures: [],
  interactionFailures: [],
  horizontalOverflow: [],
  fontFailures: [],
  touchTargetFailures: [],
  runtimeFailures: [],
  axe: [],
  legacyRedirects: [],
  functional: {},
  summary: {},
};
const fail = (bucket, data) => report[bucket].push(data);

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  for (const width of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 1 });

    for (const route of ROUTES) {
      const page = await context.newPage();
      const runtime = [];
      page.on('pageerror', (error) => runtime.push({ type: 'pageerror', message: String(error) }));
      page.on('console', (message) => {
        if (message.type() === 'error') runtime.push({ type: 'console', message: message.text() });
      });

      try {
        const response = await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.evaluate(async () => document.fonts.ready);
        await page.evaluate(() => document.querySelectorAll('.reveal').forEach((el) => el.classList.add('visible')));

        const status = response?.status() ?? null;
        if (status !== 200) fail('routeFailures', { route, width, status });

        const metrics = await page.evaluate(({ czech }) => {
          const re = new RegExp(czech, 'u');
          const visible = (el) => {
            const style = getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              Number(style.opacity) !== 0 &&
              style.pointerEvents !== 'none' &&
              rect.width > 0 &&
              rect.height > 0 &&
              rect.right > 0 &&
              rect.bottom > 0 &&
              rect.left < innerWidth &&
              rect.top < innerHeight;
          };
          const selectorFor = (el) => {
            if (el.id) return `#${CSS.escape(el.id)}`;
            const classes = [...el.classList].slice(0, 3).map((name) => `.${CSS.escape(name)}`).join('');
            return `${el.tagName.toLowerCase()}${classes}`;
          };

          const fontFailures = [];
          for (const el of document.querySelectorAll('h1,h2,h3,h4,p,a,button,li,label,summary,strong,b,span')) {
            const text = (el.textContent || '').trim();
            if (!text || !re.test(text) || !visible(el)) continue;
            const family = getComputedStyle(el).fontFamily;
            if (!/(Cormorant|Inter)/i.test(family)) {
              fontFailures.push({
                tag: el.tagName.toLowerCase(),
                className: typeof el.className === 'string' ? el.className : '',
                text: text.slice(0, 120),
                family,
              });
            }
          }

          const touchTargets = [...document.querySelectorAll('a,button,input,select,textarea,[role="button"]')]
            .filter(visible)
            .map((el, index) => {
              let rect = el.getBoundingClientRect();
              if (el instanceof HTMLInputElement && ['checkbox', 'radio'].includes(el.type) && el.closest('label')) {
                rect = el.closest('label').getBoundingClientRect();
              }
              const style = getComputedStyle(el);
              return {
                index,
                tag: el.tagName,
                text: (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 100),
                cls: typeof el.className === 'string' ? el.className : '',
                selector: selectorFor(el),
                rect: {
                  left: rect.left,
                  top: rect.top,
                  right: rect.right,
                  bottom: rect.bottom,
                  width: rect.width,
                  height: rect.height,
                },
                inlineException: el.tagName === 'A' && style.display === 'inline',
              };
            });

          const topLinks = getComputedStyle(document.querySelector('.top-links')).display;
          const inlineMenu = getComputedStyle(document.querySelector('.menu-inline')).display;
          const mobileCta = getComputedStyle(document.querySelector('.mobile-cta')).display;
          const hero = document.querySelector('.hero h1,.subhero h1');
          const heroRect = hero?.getBoundingClientRect();

          return {
            docScrollWidth: document.documentElement.scrollWidth,
            docClientWidth: document.documentElement.clientWidth,
            bodyScrollWidth: document.body.scrollWidth,
            bodyClientWidth: document.body.clientWidth,
            fontFailures,
            touchTargets,
            fontsStatus: document.fonts.status,
            topLinks,
            inlineMenu,
            mobileCta,
            hero: heroRect ? { left: heroRect.left, right: heroRect.right, width: heroRect.width } : null,
          };
        }, { czech: CZECH.source });

        if (metrics.docScrollWidth > metrics.docClientWidth + 1 || metrics.bodyScrollWidth > metrics.bodyClientWidth + 1) {
          fail('horizontalOverflow', { route, width, ...metrics });
        }
        if (metrics.fontsStatus !== 'loaded' || metrics.fontFailures.length) {
          fail('fontFailures', { route, width, fontsStatus: metrics.fontsStatus, nodes: metrics.fontFailures });
        }
        for (const targetFailure of evaluateTouchTargets(metrics.touchTargets)) {
          fail('touchTargetFailures', { route, width, ...targetFailure });
        }

        if (width <= 980
          ? (metrics.inlineMenu === 'none' || metrics.topLinks !== 'none')
          : (metrics.inlineMenu !== 'none' || metrics.topLinks === 'none')) {
          fail('interactionFailures', {
            kind: 'navigation-breakpoint',
            route,
            width,
            topLinks: metrics.topLinks,
            inlineMenu: metrics.inlineMenu,
          });
        }
        if (width <= 680 ? metrics.mobileCta === 'none' : metrics.mobileCta !== 'none') {
          fail('interactionFailures', { kind: 'sticky-cta-breakpoint', route, width, mobileCta: metrics.mobileCta });
        }
        if (metrics.hero && (metrics.hero.left < -1 || metrics.hero.right > width + 1)) {
          fail('interactionFailures', { kind: 'responsive-hero', route, width, hero: metrics.hero });
        }

        await page.addScriptTag({ content: axe.source });
        const axeResult = await page.evaluate(async () => axe.run(document, { resultTypes: ['violations'] }));
        for (const violation of axeResult.violations) {
          for (const node of violation.nodes) {
            report.axe.push({
              route,
              width,
              id: violation.id,
              impact: violation.impact,
              target: node.target,
              html: node.html.slice(0, 240),
            });
          }
        }
        for (const error of runtime) fail('runtimeFailures', { route, width, ...error });
        report.matrixRows.push({
          route,
          width,
          status,
          axeViolationNodes: axeResult.violations.reduce((count, violation) => count + violation.nodes.length, 0),
        });
      } catch (error) {
        fail('routeFailures', { route, width, error: String(error) });
      } finally {
        await page.close();
      }
    }
    await context.close();
  }

  const redirectContext = await browser.newContext();
  for (const [from, to] of REDIRECTS) {
    try {
      const response = await redirectContext.request.get(BASE + from, { maxRedirects: 0 });
      const location = response.headers().location || '';
      const ok = response.status() === 301 && (location === to || location.endsWith(to));
      report.legacyRedirects.push({ from, to, status: response.status(), location, ok });
      if (!ok) fail('interactionFailures', { kind: 'legacy-redirect', from, to, status: response.status(), location });
    } catch (error) {
      report.legacyRedirects.push({ from, to, error: String(error), ok: false });
      fail('interactionFailures', { kind: 'legacy-redirect', from, to, error: String(error) });
    }
  }
  await redirectContext.close();

  {
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
    const page = await context.newPage();
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.click('.menu-inline');
    let state = await page.evaluate(() => ({
      open: document.querySelector('#drawer')?.classList.contains('open'),
      hidden: document.querySelector('#drawer')?.getAttribute('aria-hidden'),
      locked: document.body.classList.contains('locked'),
    }));
    report.functional.drawer = state.open && state.hidden === 'false' && state.locked;
    if (!report.functional.drawer) fail('interactionFailures', { kind: 'drawer-open', state });

    const trap = await page.evaluate(() => {
      const drawer = document.querySelector('#drawer');
      const focusable = [...drawer.querySelectorAll('a,button,[tabindex]:not([tabindex="-1"])')].filter((el) => !el.disabled);
      focusable[focusable.length - 1].focus();
      return focusable[0].className || focusable[0].tagName;
    });
    await page.keyboard.press('Tab');
    const active = await page.evaluate(() => document.activeElement?.className || document.activeElement?.tagName);
    report.functional.focusTrap = active === trap;
    if (!report.functional.focusTrap) fail('interactionFailures', { kind: 'focus-trap', expected: trap, actual: active });

    await page.keyboard.press('Escape');
    state = await page.evaluate(() => ({
      open: document.querySelector('#drawer')?.classList.contains('open'),
      hidden: document.querySelector('#drawer')?.getAttribute('aria-hidden'),
    }));
    report.functional.escape = !state.open && state.hidden === 'true';
    if (!report.functional.escape) fail('interactionFailures', { kind: 'drawer-escape', state });

    await page.click('.menu-inline');
    await Promise.all([
      page.waitForURL(/\/kontakt\/$/),
      page.click('.drawer-contact a[data-menu-close]'),
    ]);
    report.functional.drawerCTA = page.url().endsWith('/kontakt/');
    if (!report.functional.drawerCTA) fail('interactionFailures', { kind: 'drawer-cta', url: page.url() });
    await context.close();
  }

  const prepare = async (page) => {
    await page.goto(BASE + '/kontakt/#poptavka', { waitUntil: 'networkidle' });
    const building = page.locator('.choices[data-key="building"] .choice').first();
    await building.click();
    await page.waitForFunction(() => document.querySelector('.choices[data-key="building"] .choice[aria-pressed="true"]') !== null);
    await page.click('#nextStep');
    await page.locator('.form-step.active .choices[data-key="problem"] .choice').first().waitFor({ state: 'visible' });
    const problem = page.locator('.form-step.active .choices[data-key="problem"] .choice').first();
    await problem.click();
    await page.waitForFunction(() => document.querySelector('.choices[data-key="problem"] .choice[aria-pressed="true"]') !== null);
    await page.click('#nextStep');
    await page.locator('.form-step.active #name').waitFor({ state: 'visible' });
  };

  {
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
    const page = await context.newPage();
    await page.goto(BASE + '/kontakt/#poptavka', { waitUntil: 'networkidle' });
    report.functional.contactHash = page.url().endsWith('/kontakt/#poptavka') && await page.locator('#poptavka').count() === 1;
    if (!report.functional.contactHash) fail('interactionFailures', { kind: 'contact-hash', url: page.url() });

    const sticky = await page.locator('.mobile-cta').evaluate((el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return { display: style.display, position: style.position, height: rect.height };
    });
    report.functional.mobileStickyCTA = sticky.display !== 'none' && sticky.position === 'fixed' && sticky.height >= 63;
    if (!report.functional.mobileStickyCTA) fail('interactionFailures', { kind: 'mobile-sticky-cta', sticky });

    await prepare(page);
    await page.click('#nextStep');
    await page.waitForFunction(() => document.querySelector('#formStatus')?.textContent?.trim().length > 0);
    const status = await page.locator('#formStatus').innerText();
    report.functional.formValidation = status.includes('Doplňte prosím');
    if (!report.functional.formValidation) fail('interactionFailures', { kind: 'form-validation', status });
    await context.close();
  }

  const simulate = async (ok) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
    const page = await context.newPage();
    let requests = 0;
    await page.route('**/api/enquiry', async (route) => {
      requests += 1;
      await route.fulfill({
        status: ok ? 200 : 500,
        contentType: 'application/json',
        body: JSON.stringify(ok ? { ok: true } : { message: 'simulated failure' }),
      });
    });
    await prepare(page);
    await page.fill('#name', 'QA Test');
    await page.fill('#phone', '777 777 777');
    await page.fill('#email', 'qa@example.com');
    await page.check('#privacyAck');
    await page.click('#nextStep');
    await page.waitForFunction(({ ok }) => {
      const text = document.querySelector('#formStatus')?.textContent || '';
      return ok ? text.includes('Děkujeme') : text.includes('Odeslání se nepodařilo');
    }, { ok });
    const status = await page.locator('#formStatus').innerText();
    await context.close();
    return {
      requests,
      status,
      pass: requests === 1 && (ok ? status.includes('Děkujeme') : status.includes('Odeslání se nepodařilo')),
    };
  };

  report.functional.formSuccess = await simulate(true);
  if (!report.functional.formSuccess.pass) fail('interactionFailures', { kind: 'form-success', ...report.functional.formSuccess });
  report.functional.formError = await simulate(false);
  if (!report.functional.formError.pass) fail('interactionFailures', { kind: 'form-error', ...report.functional.formError });

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    report.functional.navigation = await page.locator('.top-links').evaluate((el) => getComputedStyle(el).display !== 'none');
    if (!report.functional.navigation) fail('interactionFailures', { kind: 'desktop-navigation' });

    await page.keyboard.press('Tab');
    const first = await page.evaluate(() => ({
      className: document.activeElement?.className,
      href: document.activeElement?.getAttribute('href'),
      top: document.activeElement?.getBoundingClientRect().top,
    }));
    report.functional.skipLink = String(first.className).includes('skip') && first.href === '#main' && first.top >= 0;
    if (!report.functional.skipLink) fail('interactionFailures', { kind: 'skip-link', first });

    const sequence = [];
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      sequence.push(await page.evaluate(() => document.activeElement?.tagName + ':' + (document.activeElement?.getAttribute('href') || document.activeElement?.className || '')));
    }
    report.functional.keyboardNavigation = new Set(sequence).size >= 6;
    if (!report.functional.keyboardNavigation) fail('interactionFailures', { kind: 'keyboard-navigation', seq: sequence });

    await Promise.all([
      page.waitForURL(/\/sluzby\/$/),
      page.click('.top-links a[href="/sluzby/"]'),
    ]);
    if (!page.url().endsWith('/sluzby/')) fail('interactionFailures', { kind: 'nav-link', url: page.url() });
    await context.close();
  }
} finally {
  await browser.close();
}

const axeByRule = {};
for (const row of report.axe) axeByRule[row.id] = (axeByRule[row.id] || 0) + 1;
report.summary = {
  matrixRows: report.matrixRows.length,
  expectedMatrixRows: 88,
  routeFailures: report.routeFailures.length,
  interactionFailures: report.interactionFailures.length,
  horizontalOverflowFailures: report.horizontalOverflow.length,
  fontFailures: report.fontFailures.length,
  touchTargetFailures: report.touchTargetFailures.length,
  runtimeFailures: report.runtimeFailures.length,
  legacyRedirectPasses: report.legacyRedirects.filter((row) => row.ok).length,
  legacyRedirectTotal: report.legacyRedirects.length,
  axeViolationNodes: report.axe.length,
  axeByRule,
};

fs.writeFileSync('final-public-acceptance.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary, null, 2));
console.log(JSON.stringify(report.functional, null, 2));
for (const id of ['color-contrast', 'region', 'landmark-complementary-is-top-level', 'link-in-text-block', 'heading-order', 'label-content-name-mismatch']) {
  console.log(`AXE ${id}: ${axeByRule[id] || 0}`);
}

if (
  report.summary.matrixRows !== 88 ||
  report.summary.routeFailures ||
  report.summary.interactionFailures ||
  report.summary.horizontalOverflowFailures ||
  report.summary.fontFailures ||
  report.summary.touchTargetFailures ||
  report.summary.runtimeFailures ||
  report.summary.legacyRedirectPasses !== 7 ||
  report.summary.axeViolationNodes
) {
  console.error('FINAL PUBLIC ACCEPTANCE: FAIL');
  process.exit(1);
}
console.log('FINAL PUBLIC ACCEPTANCE: PASS');
