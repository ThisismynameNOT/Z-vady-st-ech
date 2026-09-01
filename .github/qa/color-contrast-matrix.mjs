import fs from 'node:fs';
import { chromium } from 'playwright-core';
import axeCore from 'axe-core';

const BASE = process.env.CANDIDATE_URL || 'http://127.0.0.1:8787';
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

// Final live-production acceptance baseline at a24021b... before this fix.
// These are the only non-color axe findings and are explicitly outside this PR's scope.
const BASELINE_NON_COLOR = {
  region: 44,
  'landmark-complementary-is-top-level': 8,
};

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const report = {
  baseUrl: BASE,
  viewports: VIEWPORTS,
  routes: ROUTES,
  generatedAt: new Date().toISOString(),
  rows: [],
  violationNodesByRule: {},
  failingChecksByRule: {},
};

try {
  for (const width of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    for (const route of ROUTES) {
      const page = await context.newPage();
      const response = await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(120);
      await page.addScriptTag({ content: axeCore.source });
      const violations = await page.evaluate(async () => {
        const result = await window.axe.run(document, { resultTypes: ['violations'] });
        return result.violations.map(v => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          nodes: v.nodes.length,
          targets: v.nodes.map(n => n.target),
        }));
      });

      for (const violation of violations) {
        report.violationNodesByRule[violation.id] = (report.violationNodesByRule[violation.id] || 0) + violation.nodes;
        report.failingChecksByRule[violation.id] = (report.failingChecksByRule[violation.id] || 0) + 1;
      }
      report.rows.push({ width, route, status: response?.status() ?? null, violations });
      console.log(JSON.stringify({ width, route, status: response?.status() ?? null, violations: Object.fromEntries(violations.map(v => [v.id, v.nodes])) }));
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
}

const colorContrastNodes = report.violationNodesByRule['color-contrast'] || 0;
const routeFailures = report.rows.filter(row => row.status !== 200);
const unexpectedRules = Object.entries(report.violationNodesByRule)
  .filter(([id, nodes]) => nodes > 0 && id !== 'color-contrast' && !(id in BASELINE_NON_COLOR))
  .map(([id, nodes]) => ({ id, nodes }));
const increasedBaselineRules = Object.entries(BASELINE_NON_COLOR)
  .map(([id, baselineNodes]) => ({ id, baselineNodes, candidateNodes: report.violationNodesByRule[id] || 0 }))
  .filter(row => row.candidateNodes > row.baselineNodes);

report.summary = {
  matrixCombinations: VIEWPORTS.length * ROUTES.length,
  matrixRows: report.rows.length,
  routeFailures: routeFailures.length,
  colorContrastNodes,
  colorContrastFailingChecks: report.failingChecksByRule['color-contrast'] || 0,
  violationNodesByRule: report.violationNodesByRule,
  failingChecksByRule: report.failingChecksByRule,
  baselineNonColorNodes: BASELINE_NON_COLOR,
  unexpectedRules,
  increasedBaselineRules,
  pass: report.rows.length === 88 && routeFailures.length === 0 && colorContrastNodes === 0 && unexpectedRules.length === 0 && increasedBaselineRules.length === 0,
};

fs.writeFileSync('color-contrast-matrix.json', JSON.stringify(report, null, 2));
console.log('COLOR CONTRAST CANDIDATE MATRIX SUMMARY');
console.log(JSON.stringify(report.summary, null, 2));
if (!report.summary.pass) process.exitCode = 1;
