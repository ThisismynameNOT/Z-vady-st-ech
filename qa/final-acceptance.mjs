import { chromium, request } from 'playwright';
import axeCore from 'axe-core';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = 'https://zavady-strech-praha.iadamt-93.workers.dev';
const OUT = path.resolve('qa-results');
await fs.mkdir(path.join(OUT, 'screenshots'), { recursive: true });

const viewports = [
  { name: 'mobile-320', width: 320, height: 740 },
  { name: 'mobile-375', width: 375, height: 812 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-430', width: 430, height: 932 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'small-laptop-1024', width: 1024, height: 768 },
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'large-desktop-1920', width: 1920, height: 1080 },
];

const coreRoutes = [
  '/',
  '/sluzby/',
  '/realizace/',
  '/reference/',
  '/firma/',
  '/kontakt/',
  '/ochrana-osobnich-udaju/',
  '/realizace/narodni-muzeum/',
  '/realizace/prazska-trznice-hala-25/',
  '/realizace/gymnazium-jana-patocky/',
  '/realizace/hybernska-2-997/',
];

const redirects = {
  '/index.html': '/',
  '/firma.html': '/firma/',
  '/sluzby.html': '/sluzby/',
  '/realizace.html': '/realizace/',
  '/reference.html': '/reference/',
  '/kontakt.html': '/kontakt/',
  '/ochrana-osobnich-udaju.html': '/ochrana-osobnich-udaju/',
};

const failures = [];
const warnings = [];
const observations = [];
const fail = (scope, detail) => failures.push({ scope, detail });
const warn = (scope, detail) => warnings.push({ scope, detail });
const observe = (scope, detail) => observations.push({ scope, detail });

const browser = await chromium.launch({ headless: true });

async function settle(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(250);
}

async function inspectPage(page, route, viewportName) {
  const scope = `${viewportName} ${route}`;
  const consoleErrors = [];
  const requestFailures = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('requestfailed', (req) => requestFailures.push(`${req.method()} ${req.url()} :: ${req.failure()?.errorText || 'failed'}`));

  const response = await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  if (!response || response.status() >= 400) fail(scope, `navigation status ${response?.status() ?? 'no response'}`);
  await settle(page);

  const metrics = await page.evaluate(() => {
    const root = document.documentElement;
    const images = [...document.images].map((img) => ({ src: img.currentSrc || img.src, complete: img.complete, naturalWidth: img.naturalWidth }));
    const main = document.querySelector('main');
    const h1s = [...document.querySelectorAll('h1')];
    const bodyFont = getComputedStyle(document.body).fontFamily;
    const heading = document.querySelector('h1,h2');
    const headingFont = heading ? getComputedStyle(heading).fontFamily : '';
    return {
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      h1Count: h1s.length,
      hasMain: !!main,
      images,
      interLoaded: document.fonts ? document.fonts.check('400 16px Inter') : false,
      cormorantLoaded: document.fonts ? document.fonts.check('400 16px Cormorant') : false,
      bodyFont,
      headingFont,
      title: document.title,
    };
  });

  if (metrics.scrollWidth > metrics.clientWidth + 1) fail(scope, `horizontal overflow ${metrics.scrollWidth}px > ${metrics.clientWidth}px`);
  if (!metrics.hasMain) fail(scope, 'missing <main> landmark');
  if (metrics.h1Count !== 1) fail(scope, `expected exactly one h1, found ${metrics.h1Count}`);
  if (!metrics.interLoaded || !/Inter/i.test(metrics.bodyFont)) fail(scope, `Inter not confirmed loaded/applied (${metrics.bodyFont})`);
  if (!metrics.cormorantLoaded || !/Cormorant/i.test(metrics.headingFont)) fail(scope, `Cormorant not confirmed loaded/applied (${metrics.headingFont})`);
  for (const img of metrics.images) {
    if (!img.complete || img.naturalWidth === 0) fail(scope, `broken image ${img.src}`);
  }
  for (const err of consoleErrors) fail(scope, `console error: ${err}`);
  for (const err of requestFailures) fail(scope, `request failure: ${err}`);

  if (page.viewportSize()?.width <= 430) {
    const targets = await page.locator('button:visible, a.btn:visible, .nav-cta:visible, .mobile-cta a:visible, .menu-inline:visible, .side-trigger:visible, .drawer-close:visible, .choice:visible, .form-actions button:visible').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { text: (el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 80), width: r.width, height: r.height };
      }),
    );
    for (const target of targets) {
      if (target.width < 24 || target.height < 24) fail(scope, `touch target below 24px: ${target.text} (${target.width.toFixed(1)}x${target.height.toFixed(1)})`);
      else if (target.width < 44 || target.height < 44) warn(scope, `touch target below preferred 44px: ${target.text} (${target.width.toFixed(1)}x${target.height.toFixed(1)})`);
    }
  }

  return metrics;
}

async function testDrawer(page, width) {
  const scope = `drawer-${width}`;
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await settle(page);
  const opener = page.locator(width <= 1024 ? '.menu-inline:visible' : '.side-trigger:visible').first();
  if (!(await opener.count())) return fail(scope, 'no visible drawer opener');
  await opener.click();
  const drawer = page.locator('#drawer');
  if (!(await drawer.evaluate((el) => el.classList.contains('open')))) fail(scope, 'drawer did not open');
  if ((await drawer.getAttribute('aria-hidden')) !== 'false') fail(scope, 'drawer aria-hidden was not false when open');
  if ((await opener.getAttribute('aria-expanded')) !== 'true') fail(scope, 'opener aria-expanded was not true when open');
  const activeInDrawer = await page.evaluate(() => document.querySelector('#drawer')?.contains(document.activeElement));
  if (!activeInDrawer) fail(scope, 'focus did not move into drawer');

  await page.locator('#drawer a, #drawer button').last().focus();
  await page.keyboard.press('Tab');
  const wrappedToFirst = await page.evaluate(() => document.activeElement === document.querySelector('#drawer button, #drawer a'));
  if (!wrappedToFirst) fail(scope, 'Tab did not wrap from last drawer control to first');

  await page.keyboard.press('Escape');
  if (await drawer.evaluate((el) => el.classList.contains('open'))) fail(scope, 'Escape did not close drawer');
  if ((await opener.getAttribute('aria-expanded')) !== 'false') fail(scope, 'opener aria-expanded was not false after close');
  const focusRestored = await opener.evaluate((el) => document.activeElement === el);
  if (!focusRestored) fail(scope, 'focus was not restored to opener after closing drawer');
}

async function testContactCtas(page, width) {
  const scope = `contact-cta-${width}`;
  await page.goto(`${BASE}/kontakt/`, { waitUntil: 'domcontentloaded' });
  await settle(page);

  if (width <= 1024) {
    const opener = page.locator('.menu-inline:visible').first();
    if (!(await opener.count())) fail(scope, 'mobile/tablet menu opener not visible');
    else {
      await opener.click();
      const drawerCta = page.locator('#drawer .drawer-contact a[href="#poptavka"]');
      if (!(await drawerCta.count())) fail(scope, 'drawer contact CTA is not same-page #poptavka');
      else {
        await drawerCta.click();
        await page.waitForTimeout(300);
        if (!page.url().endsWith('/kontakt/#poptavka')) fail(scope, `drawer CTA URL mismatch: ${page.url()}`);
        if (await page.locator('#drawer').evaluate((el) => el.classList.contains('open'))) fail(scope, 'drawer remained open after same-page CTA');
        if (await page.locator('body').evaluate((el) => el.classList.contains('locked'))) fail(scope, 'body remained scroll-locked after drawer CTA');
      }
    }

    const sticky = page.locator('.mobile-cta a[href="#poptavka"]:visible');
    if (!(await sticky.count())) fail(scope, 'sticky mobile CTA is not visible/same-page on Contact');
    else {
      await page.evaluate(() => history.replaceState(null, '', '/kontakt/'));
      await sticky.click();
      await page.waitForTimeout(200);
      if (!page.url().endsWith('/kontakt/#poptavka')) fail(scope, `sticky CTA URL mismatch: ${page.url()}`);
    }
  } else {
    const cta = page.locator('.nav-cta[href="#poptavka"]:visible');
    if (!(await cta.count())) fail(scope, 'desktop Contact nav CTA is not same-page #poptavka');
    else {
      await cta.click();
      await page.waitForTimeout(200);
      if (!page.url().endsWith('/kontakt/#poptavka')) fail(scope, `desktop nav CTA URL mismatch: ${page.url()}`);
    }
  }

  const visible = await page.locator('#poptavka').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight;
  });
  if (!visible) fail(scope, '#poptavka was not brought into the viewport');
}

async function moveToFormStepThree(page) {
  const status = page.locator('#formStatus');
  await page.locator('#nextStep').click();
  if (!/Vyberte prosím typ objektu/.test(await status.textContent())) fail('form-validation', 'missing building validation error');
  await page.locator('.choices[data-key="building"] .choice').first().click();
  await page.locator('#nextStep').click();
  await page.locator('#nextStep').click();
  if (!/Vyberte prosím hlavní problém/.test(await status.textContent())) fail('form-validation', 'missing problem validation error');
  await page.locator('.choices[data-key="problem"] .choice').first().click();
  await page.locator('#nextStep').click();
  const indicator = await page.locator('#stepIndicator').textContent();
  if (!/Krok 3 \/ 3/.test(indicator || '')) fail('form-validation', `did not reach step 3: ${indicator}`);
}

async function testForm(page) {
  const scope = 'contact-form';
  await page.goto(`${BASE}/kontakt/#poptavka`, { waitUntil: 'domcontentloaded' });
  await settle(page);
  await moveToFormStepThree(page);

  const status = page.locator('#formStatus');
  await page.locator('#nextStep').click();
  if (!/Doplňte prosím jméno, telefon a e-mail/.test(await status.textContent())) fail(scope, 'missing required contact-fields error');

  await page.locator('#name').fill('QA Test');
  await page.locator('#phone').fill('+420 777 000 111');
  await page.locator('#email').fill('not-an-email');
  await page.locator('#nextStep').click();
  if (!/Zkontrolujte prosím e-mailovou adresu/.test(await status.textContent())) fail(scope, 'missing invalid-email error');

  await page.locator('#email').fill('qa@example.com');
  await page.locator('#nextStep').click();
  if (!/Potvrďte prosím seznámení/.test(await status.textContent())) fail(scope, 'missing privacy-consent error');
  await page.locator('#privacyAck').check();

  await page.route('**/api/enquiry*', async (route) => {
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'simulated failure' }) });
  });
  await page.locator('#nextStep').click();
  await page.waitForTimeout(200);
  const errorText = await status.textContent();
  const fallbackPhone = await page.locator('#roofForm').getAttribute('data-fallback-phone');
  if (!/Odeslání se nepodařilo/.test(errorText || '')) fail(scope, `generic submit failure not shown: ${errorText}`);
  if (fallbackPhone && !errorText?.includes(fallbackPhone)) fail(scope, `failure state did not display configured fallback phone ${fallbackPhone}`);
  if (await page.locator('#nextStep').isDisabled()) fail(scope, 'submit button stayed disabled after error');

  await page.unroute('**/api/enquiry*');
  await page.route('**/api/enquiry*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  await page.locator('#nextStep').click();
  await page.waitForTimeout(200);
  const successText = await status.textContent();
  if (!/Děkujeme\. Poptávka byla odeslána/.test(successText || '')) fail(scope, `success state not shown: ${successText}`);
  if (!/Odesláno/.test((await page.locator('#nextStep').textContent()) || '')) fail(scope, 'success button text was not updated');
  if ((await page.locator('#name').inputValue()) !== '') fail(scope, 'form did not reset after success');
  await page.unroute('**/api/enquiry*');
}

async function testSkipLink(page) {
  const scope = 'keyboard-skip-link';
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await settle(page);
  await page.keyboard.press('Tab');
  const active = await page.evaluate(() => ({ cls: document.activeElement?.className, href: document.activeElement?.getAttribute?.('href') }));
  if (!String(active.cls).includes('skip') || active.href !== '#main') fail(scope, `first Tab did not focus skip link: ${JSON.stringify(active)}`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  if (!page.url().endsWith('/#main')) fail(scope, `skip link did not navigate to #main: ${page.url()}`);
}

async function runAxe(page, route, width) {
  const scope = `axe-${width} ${route}`;
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
  await settle(page);
  await page.addScriptTag({ content: axeCore.source });
  const result = await page.evaluate(async () => window.axe.run(document, { resultTypes: ['violations'] }));
  for (const violation of result.violations) {
    const detail = `${violation.id} (${violation.impact || 'unknown'}): ${violation.help} [${violation.nodes.length} node(s)]`;
    if (violation.impact === 'critical' || violation.impact === 'serious') fail(scope, detail);
    else warn(scope, detail);
  }
  observe(scope, `axe violations=${result.violations.length}`);
}

for (const viewport of viewports) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  for (const route of ['/', '/kontakt/']) {
    await inspectPage(page, route, viewport.name);
    await page.screenshot({ path: path.join(OUT, 'screenshots', `${viewport.name}-${route === '/' ? 'home' : 'kontakt'}.png`), fullPage: true });
  }
  await testDrawer(page, viewport.width);
  await testContactCtas(page, viewport.width);
  await context.close();
}

for (const width of [390, 1440]) {
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
  const page = await context.newPage();
  for (const route of coreRoutes) {
    await inspectPage(page, route, `route-sweep-${width}`);
    await runAxe(page, route, width);
  }
  await context.close();
}

{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await testForm(page);
  await context.close();
}

{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await testSkipLink(page);
  const response = await page.goto(`${BASE}/this-route-must-not-exist-qa/`, { waitUntil: 'domcontentloaded' });
  if (!response || response.status() !== 404) fail('404', `expected 404, got ${response?.status() ?? 'no response'}`);
  if (!(await page.locator('main').count())) fail('404', 'custom 404 page missing main landmark');
  await context.close();
}

{
  const api = await request.newContext({ baseURL: BASE });
  for (const [from, to] of Object.entries(redirects)) {
    const first = await api.get(from, { maxRedirects: 0 });
    if (![301, 302, 307, 308].includes(first.status())) fail('redirects', `${from} returned ${first.status()} instead of redirect`);
    const location = first.headers().location;
    const expected = new URL(to, BASE).toString();
    const actual = location ? new URL(location, BASE).toString() : '';
    if (actual !== expected) fail('redirects', `${from} location ${actual || '(missing)'} != ${expected}`);
    const followed = await api.get(from);
    if (followed.status() >= 400) fail('redirects', `${from} followed to status ${followed.status()}`);
  }
  for (const font of [
    '/assets/fonts/inter-400.woff2',
    '/assets/fonts/inter-500.woff2',
    '/assets/fonts/inter-600.woff2',
    '/assets/fonts/cormorant-garamond-400.woff2',
    '/assets/fonts/cormorant-garamond-500.woff2',
    '/assets/fonts/cormorant-garamond-600.woff2',
    '/assets/fonts/cormorant-garamond-400-italic.woff2',
  ]) {
    const res = await api.get(font);
    if (res.status() !== 200) fail('fonts', `${font} returned ${res.status()}`);
    const type = res.headers()['content-type'] || '';
    if (!/font|woff|octet-stream/i.test(type)) warn('fonts', `${font} content-type ${type}`);
  }
  await api.dispose();
}

await browser.close();

const report = {
  generatedAt: new Date().toISOString(),
  base: BASE,
  failures,
  warnings,
  observations,
};
await fs.writeFile(path.join(OUT, 'acceptance.json'), JSON.stringify(report, null, 2));
await fs.writeFile(path.join(OUT, 'acceptance.txt'), [
  `Final acceptance QA for ${BASE}`,
  `Failures: ${failures.length}`,
  ...failures.map((x) => `FAIL [${x.scope}] ${x.detail}`),
  `Warnings: ${warnings.length}`,
  ...warnings.map((x) => `WARN [${x.scope}] ${x.detail}`),
  `Observations: ${observations.length}`,
  ...observations.map((x) => `INFO [${x.scope}] ${x.detail}`),
].join('\n'));

console.log(`QA failures: ${failures.length}`);
for (const x of failures) console.error(`FAIL [${x.scope}] ${x.detail}`);
console.log(`QA warnings: ${warnings.length}`);
for (const x of warnings) console.warn(`WARN [${x.scope}] ${x.detail}`);

if (failures.length) process.exitCode = 1;
