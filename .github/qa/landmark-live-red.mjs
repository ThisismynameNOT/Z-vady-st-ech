import fs from 'node:fs';
import { chromium } from 'playwright-core';
import axeCore from 'axe-core';

const BASE = (process.env.LIVE_URL || 'https://zavady-strech-praha.iadamt-93.workers.dev').replace(/\/$/, '');
const VIEWPORTS = [320, 375, 390, 430, 768, 1024, 1440, 1920];
const ROUTES = ['/', '/firma/', '/sluzby/', '/realizace/', '/reference/', '/kontakt/', '/ochrana-osobnich-udaju/', '/realizace/gymnazium-jana-patocky/', '/realizace/hybernska-2-997/', '/realizace/narodni-muzeum/', '/realizace/prazska-trznice-hala-25/'];

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const report = { baseUrl: BASE, generatedAt: new Date().toISOString(), rows: [], violationNodesByRule: {}, routeFailures: [] };

try {
  for (const width of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
    for (const route of ROUTES) {
      const page = await context.newPage();
      let response = null;
      try {
        response = await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(120);
        await page.addScriptTag({ content: axeCore.source });
        const violations = await page.evaluate(async () => {
          const r = await window.axe.run(document, { resultTypes: ['violations'] });
          return r.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, html: n.html, failureSummary: n.failureSummary })) }));
        });
        const status = response?.status() ?? null;
        if (status !== 200) report.routeFailures.push({ width, route, status });
        for (const v of violations) report.violationNodesByRule[v.id] = (report.violationNodesByRule[v.id] || 0) + v.nodes.length;
        report.rows.push({ width, route, status, violations });
        console.log(JSON.stringify({ width, route, status, violations: Object.fromEntries(violations.map(v => [v.id, v.nodes.length])) }));
      } catch (error) {
        report.routeFailures.push({ width, route, status: response?.status() ?? null, error: String(error) });
      } finally {
        await page.close();
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
}

report.summary = {
  matrixRows: report.rows.length,
  routeFailures: report.routeFailures.length,
  region: report.violationNodesByRule.region || 0,
  complementary: report.violationNodesByRule['landmark-complementary-is-top-level'] || 0,
  colorContrast: report.violationNodesByRule['color-contrast'] || 0,
  allRules: report.violationNodesByRule,
};
fs.writeFileSync('landmark-live-red.json', JSON.stringify(report, null, 2));
console.log('LANDMARK LIVE RED SUMMARY');
console.log(JSON.stringify(report.summary, null, 2));

if (report.summary.matrixRows !== 88 || report.summary.routeFailures !== 0 || report.summary.region !== 44 || report.summary.complementary !== 8 || report.summary.colorContrast !== 0) {
  console.error('Production baseline did not reproduce the expected landmark signature.');
  process.exit(2);
}
console.error('RED CONFIRMED: production still contains the 44 region and 8 complementary landmark nodes.');
process.exit(1);
