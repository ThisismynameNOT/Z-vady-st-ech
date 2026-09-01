import fs from 'node:fs';
import { chromium } from 'playwright-core';
import axeCore from 'axe-core';

const BASE = (process.env.LIVE_URL || 'https://zavady-strech-praha.iadamt-93.workers.dev').replace(/\/$/, '');
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
const EXPECTED_NON_COLOR = {
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
  generatedAt: new Date().toISOString(),
  viewports: VIEWPORTS,
  routes: ROUTES,
  rows: [],
  violationNodesByRule: {},
  failingChecksByRule: {},
};

async function runMatrix() {
  for (const width of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      deviceScaleFactor: 1,
      reducedMotion: 'no-preference',
    });

    for (const route of ROUTES) {
      const page = await context.newPage();
      let response = null;
      let navigationError = null;
      try {
        response = await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 30000 });
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

        report.rows.push({ width, route, status: response?.status() ?? null, navigationError, violations });
        console.log(JSON.stringify({
          width,
          route,
          status: response?.status() ?? null,
          violations: Object.fromEntries(violations.map(v => [v.id, v.nodes])),
        }));
      } catch (error) {
        navigationError = String(error?.stack || error);
        report.rows.push({ width, route, status: response?.status() ?? null, navigationError, violations: [] });
        console.error(JSON.stringify({ width, route, status: response?.status() ?? null, navigationError }));
      } finally {
        await page.close();
      }
    }

    await context.close();
  }
}

async function installRevealProbe(page) {
  return page.evaluate(() => {
    const source = document.querySelector('.reveal');
    if (!source) return { ok: false, reason: 'no .reveal element found' };

    document.querySelector('#qa-reveal-probe')?.remove();
    const probe = source.cloneNode(true);
    probe.id = 'qa-reveal-probe';
    probe.classList.remove('visible');
    probe.removeAttribute('aria-hidden');
    probe.style.position = 'fixed';
    probe.style.top = '300px';
    probe.style.left = '40px';
    probe.style.right = 'auto';
    probe.style.bottom = 'auto';
    probe.style.width = 'min(640px, calc(100vw - 80px))';
    probe.style.maxHeight = '180px';
    probe.style.overflow = 'hidden';
    probe.style.zIndex = '2147483646';
    probe.style.pointerEvents = 'none';
    document.body.appendChild(probe);
    void probe.offsetWidth;
    return { ok: true };
  });
}

async function sampleProbe(page) {
  return page.evaluate(() => {
    const probe = document.querySelector('#qa-reveal-probe');
    if (!probe) return null;
    const cs = getComputedStyle(probe);
    const rect = probe.getBoundingClientRect();
    return {
      top: rect.top,
      opacity: cs.opacity,
      transform: cs.transform,
      transitionProperty: cs.transitionProperty,
      transitionDuration: cs.transitionDuration,
      transitionTimingFunction: cs.transitionTimingFunction,
    };
  });
}

async function probeNormalMotion() {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  const result = { route: '/firma/', mode: 'no-preference' };
  try {
    const response = await page.goto(BASE + '/firma/', { waitUntil: 'networkidle', timeout: 30000 });
    result.status = response?.status() ?? null;
    const installed = await installRevealProbe(page);
    if (!installed.ok) return { ...result, pass: false, reason: installed.reason };

    result.hidden = await sampleProbe(page);
    await page.evaluate(() => document.querySelector('#qa-reveal-probe')?.classList.add('visible'));
    await page.waitForTimeout(50);
    result.early = await sampleProbe(page);
    await page.screenshot({ path: 'reveal-normal-50ms.png', fullPage: false });
    await page.waitForTimeout(300);
    result.mid = await sampleProbe(page);
    await page.screenshot({ path: 'reveal-normal-350ms.png', fullPage: false });
    await page.waitForTimeout(450);
    result.end = await sampleProbe(page);
    await page.screenshot({ path: 'reveal-normal-end.png', fullPage: false });

    const hiddenTop = result.hidden?.top ?? NaN;
    const earlyTop = result.early?.top ?? NaN;
    const midTop = result.mid?.top ?? NaN;
    const endTop = result.end?.top ?? NaN;
    const totalVerticalMove = hiddenTop - endTop;
    const movedDuringTransition = earlyTop > endTop + 0.5 || midTop > endTop + 0.5;
    const endedAtFixedTop = Math.abs(endTop - 300) <= 1;
    const hasExpectedTravel = totalVerticalMove >= 16 && totalVerticalMove <= 20;
    const transformOnly = result.hidden?.transitionProperty.split(',').map(v => v.trim()).includes('transform');
    const durationSeconds = Number.parseFloat(result.hidden?.transitionDuration || '0');
    const expectedDuration = durationSeconds >= 0.65 && durationSeconds <= 0.75;
    const opacityDiscrete = result.early?.opacity === '1';

    result.totalVerticalMovePx = totalVerticalMove;
    result.pass = result.status === 200 && movedDuringTransition && endedAtFixedTop && hasExpectedTravel && transformOnly && expectedDuration && opacityDiscrete;
    return result;
  } finally {
    await page.close();
    await context.close();
  }
}

async function probeReducedMotion() {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const result = { route: '/firma/', mode: 'reduce' };
  try {
    const response = await page.goto(BASE + '/firma/', { waitUntil: 'networkidle', timeout: 30000 });
    result.status = response?.status() ?? null;
    const installed = await installRevealProbe(page);
    if (!installed.ok) return { ...result, pass: false, reason: installed.reason };

    result.hidden = await sampleProbe(page);
    await page.evaluate(() => document.querySelector('#qa-reveal-probe')?.classList.add('visible'));
    result.immediate = await sampleProbe(page);
    await page.waitForTimeout(50);
    result.after50ms = await sampleProbe(page);
    await page.screenshot({ path: 'reveal-reduced-motion.png', fullPage: false });

    const hiddenTop = result.hidden?.top ?? NaN;
    const immediateTop = result.immediate?.top ?? NaN;
    const afterTop = result.after50ms?.top ?? NaN;
    const transitionDuration = result.hidden?.transitionDuration || '';
    const noTransition = transitionDuration.split(',').every(value => Number.parseFloat(value) === 0);
    const jumpedToEndImmediately = Math.abs(immediateTop - 300) <= 1 && Math.abs(afterTop - 300) <= 1;
    const hiddenHadOffset = hiddenTop >= 316 && hiddenTop <= 320;
    const opacityImmediate = result.immediate?.opacity === '1' && result.after50ms?.opacity === '1';

    result.pass = result.status === 200 && noTransition && jumpedToEndImmediately && hiddenHadOffset && opacityImmediate;
    return result;
  } finally {
    await page.close();
    await context.close();
  }
}

try {
  await runMatrix();
  report.normalRevealMotion = await probeNormalMotion();
  report.reducedMotion = await probeReducedMotion();
} finally {
  await browser.close();
}

const colorContrastNodes = report.violationNodesByRule['color-contrast'] || 0;
const routeFailures = report.rows.filter(row => row.status !== 200 || row.navigationError);
const nonzeroRules = Object.fromEntries(Object.entries(report.violationNodesByRule).filter(([, nodes]) => nodes > 0));
const unexpectedRules = Object.entries(nonzeroRules)
  .filter(([id]) => !(id in EXPECTED_NON_COLOR))
  .map(([id, nodes]) => ({ id, nodes }));
const exactKnownRuleCounts = Object.entries(EXPECTED_NON_COLOR).every(([id, expected]) => (report.violationNodesByRule[id] || 0) === expected);

report.summary = {
  matrixCombinations: VIEWPORTS.length * ROUTES.length,
  matrixRows: report.rows.length,
  routeFailures: routeFailures.length,
  colorContrastNodes,
  colorContrastFailingChecks: report.failingChecksByRule['color-contrast'] || 0,
  violationNodesByRule: report.violationNodesByRule,
  failingChecksByRule: report.failingChecksByRule,
  expectedNonColorNodes: EXPECTED_NON_COLOR,
  unexpectedRules,
  exactKnownRuleCounts,
  normalRevealMotionPass: report.normalRevealMotion?.pass === true,
  reducedMotionPass: report.reducedMotion?.pass === true,
};

report.summary.pass =
  report.rows.length === 88 &&
  routeFailures.length === 0 &&
  colorContrastNodes === 0 &&
  unexpectedRules.length === 0 &&
  exactKnownRuleCounts &&
  report.normalRevealMotion?.pass === true &&
  report.reducedMotion?.pass === true;

fs.writeFileSync('color-contrast-live-production.json', JSON.stringify(report, null, 2));
console.log('LIVE PRODUCTION COLOR CONTRAST ACCEPTANCE SUMMARY');
console.log(JSON.stringify(report.summary, null, 2));
console.log('NORMAL REVEAL MOTION');
console.log(JSON.stringify(report.normalRevealMotion, null, 2));
console.log('REDUCED MOTION');
console.log(JSON.stringify(report.reducedMotion, null, 2));

if (!report.summary.pass) process.exitCode = 1;
