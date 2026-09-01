import fs from 'node:fs';
import { chromium } from 'playwright-core';
import axeCore from 'axe-core';

const BASE = (process.env.CANDIDATE_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
const VIEWPORTS = [320, 375, 390, 430, 768, 1024, 1440, 1920];
const ROUTES = ['/', '/firma/', '/sluzby/', '/realizace/', '/reference/', '/kontakt/', '/ochrana-osobnich-udaju/', '/realizace/gymnazium-jana-patocky/', '/realizace/hybernska-2-997/', '/realizace/narodni-muzeum/', '/realizace/prazska-trznice-hala-25/'];
const REQUIRED_ZERO_RULES = ['region', 'landmark-complementary-is-top-level', 'color-contrast', 'link-in-text-block', 'heading-order', 'label-content-name-mismatch'];

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const report = { baseUrl: BASE, generatedAt: new Date().toISOString(), rows: [], violationNodesByRule: {}, routeFailures: [], interactionFailures: [] };

try {
  for (const width of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
    for (const route of ROUTES) {
      const page = await context.newPage();
      let response = null;
      try {
        response = await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(120);
        const status = response?.status() ?? null;
        if (status !== 200) report.routeFailures.push({ width, route, status });

        const cta = await page.locator('.mobile-cta').evaluate((el) => ({
          tag: el.tagName,
          label: el.getAttribute('aria-label'),
          display: getComputedStyle(el).display,
          position: getComputedStyle(el).position,
          links: [...el.querySelectorAll('a')].map(a => ({ text: a.textContent?.trim(), href: a.getAttribute('href') })),
        }));
        const shouldShow = width <= 430;
        const expectedSecond = route === '/kontakt/' ? '#poptavka' : '/kontakt/';
        if (cta.tag !== 'NAV' || cta.label !== 'Rychlý kontakt' || cta.links.length !== 2 || !cta.links[0].href?.startsWith('tel:') || cta.links[1].href !== expectedSecond || (shouldShow && (cta.display === 'none' || cta.position !== 'fixed')) || (!shouldShow && cta.display !== 'none')) {
          report.interactionFailures.push({ width, route, type: 'mobile-cta-contract', cta, shouldShow, expectedSecond });
        }

        if (route === '/kontakt/') {
          const contact = await page.locator('.contact-aside').evaluate((el) => ({ tag: el.tagName, headingCount: el.querySelectorAll('h2').length }));
          if (contact.tag !== 'SECTION' || contact.headingCount !== 1) report.interactionFailures.push({ width, route, type: 'contact-section-contract', contact });
          if (await page.locator('#roofForm').count() !== 1) report.interactionFailures.push({ width, route, type: 'contact-form-missing' });
        }

        await page.addScriptTag({ content: axeCore.source });
        const violations = await page.evaluate(async () => {
          const r = await window.axe.run(document, { resultTypes: ['violations'] });
          return r.violations.map(v => ({ id: v.id, nodes: v.nodes.length, targets: v.nodes.map(n => n.target) }));
        });
        for (const v of violations) report.violationNodesByRule[v.id] = (report.violationNodesByRule[v.id] || 0) + v.nodes;
        report.rows.push({ width, route, status, violations });
        console.log(JSON.stringify({ width, route, status, violations: Object.fromEntries(violations.map(v => [v.id, v.nodes])) }));
      } catch (error) {
        report.routeFailures.push({ width, route, status: response?.status() ?? null, error: String(error?.stack || error) });
      } finally {
        await page.close();
      }
    }
    await context.close();
  }

  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  await page.goto(BASE + '/firma/', { waitUntil: 'domcontentloaded' });
  await Promise.all([page.waitForURL('**/kontakt/'), page.locator('.mobile-cta a').nth(1).click()]);
  if (new URL(page.url()).pathname !== '/kontakt/') report.interactionFailures.push({ type: 'cta-navigation', from: '/firma/', url: page.url() });
  await page.locator('.mobile-cta a').nth(1).click();
  await page.waitForTimeout(50);
  if (new URL(page.url()).hash !== '#poptavka') report.interactionFailures.push({ type: 'contact-cta-hash', url: page.url() });
  await page.close();
  await context.close();
} finally {
  await browser.close();
}

const zeroRuleCounts = Object.fromEntries(REQUIRED_ZERO_RULES.map(id => [id, report.violationNodesByRule[id] || 0]));
report.summary = {
  matrixRows: report.rows.length,
  routeFailures: report.routeFailures.length,
  interactionFailures: report.interactionFailures.length,
  violationNodesByRule: report.violationNodesByRule,
  requiredZeroRules: zeroRuleCounts,
  newAxeRules: Object.keys(report.violationNodesByRule).filter(id => (report.violationNodesByRule[id] || 0) > 0),
};
report.summary.pass = report.summary.matrixRows === 88 && report.summary.routeFailures === 0 && report.summary.interactionFailures === 0 && Object.values(zeroRuleCounts).every(n => n === 0) && report.summary.newAxeRules.length === 0;
fs.writeFileSync('landmark-candidate.json', JSON.stringify(report, null, 2));
console.log('LANDMARK CANDIDATE SUMMARY');
console.log(JSON.stringify(report.summary, null, 2));
if (!report.summary.pass) process.exitCode = 1;
