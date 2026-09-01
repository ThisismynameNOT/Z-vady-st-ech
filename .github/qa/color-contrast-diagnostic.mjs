import fs from 'node:fs';
import { chromium } from 'playwright-core';
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

function firstContrastData(node) {
  for (const check of [...(node.any || []), ...(node.all || []), ...(node.none || [])]) {
    const data = check?.data;
    if (data && (data.contrastRatio != null || data.fgColor || data.bgColor)) return data;
  }
  return {};
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const report = {
  baseUrl: BASE,
  expectedMainCommit: EXPECTED_MAIN,
  generatedAt: new Date().toISOString(),
  viewports: VIEWPORTS,
  routes: ROUTES,
  failures: [],
  settledFailures: [],
  combinations: [],
};

async function inspectTarget(page, target) {
  const selector = Array.isArray(target) ? target[0] : target;
  return page.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (!el) return { selector, found: false };

    const styleSheets = [...document.styleSheets];
    const specificity = (selectorText) => {
      // Sufficient for this site's selectors; :is/:not contents are still counted conservatively.
      const s = selectorText
        .replace(/:where\([^)]*\)/g, '')
        .replace(/::[\w-]+/g, 'x')
        .replace(/:[\w-]+(?:\([^)]*\))?/g, '.x');
      const a = (s.match(/#[\w-]+/g) || []).length;
      const b = (s.match(/\.[\w-]+|\[[^\]]+\]/g) || []).length;
      const stripped = s.replace(/#[\w-]+|\.[\w-]+|\[[^\]]+\]|\*/g, ' ');
      const c = (stripped.match(/(^|[\s>+~,(])([a-zA-Z][\w-]*)/g) || []).length;
      return [a, b, c];
    };
    const compareSpec = (a, b) => a[0]-b[0] || a[1]-b[1] || a[2]-b[2];

    function activeStyleRules() {
      const out = [];
      let order = 0;
      const visit = (rules, href, mediaPath = []) => {
        for (const rule of [...rules]) {
          if (rule.type === CSSRule.STYLE_RULE) {
            out.push({ rule, href, order: order++, mediaPath });
          } else if (rule.type === CSSRule.MEDIA_RULE) {
            if (matchMedia(rule.conditionText).matches) visit(rule.cssRules, href, [...mediaPath, `@media ${rule.conditionText}`]);
          } else if (rule.type === CSSRule.SUPPORTS_RULE) {
            if (CSS.supports(rule.conditionText)) visit(rule.cssRules, href, [...mediaPath, `@supports ${rule.conditionText}`]);
          }
        }
      };
      for (const sheet of styleSheets) {
        try { visit(sheet.cssRules, sheet.href || 'inline'); } catch {}
      }
      return out;
    }
    const rules = activeStyleRules();

    function declarationsFor(node, properties) {
      const matches = [];
      if (node instanceof HTMLElement && node.getAttribute('style')) {
        for (const prop of properties) {
          const value = node.style.getPropertyValue(prop);
          if (value) matches.push({
            selector: '<inline style>', property: prop, value: value.trim(), important: node.style.getPropertyPriority(prop) === 'important',
            specificity: [1000,0,0], order: Number.MAX_SAFE_INTEGER, href: 'inline', media: [], element: node.tagName.toLowerCase(),
          });
        }
      }
      for (const entry of rules) {
        let matchedSelector = null;
        for (const part of entry.rule.selectorText.split(',')) {
          const sel = part.trim();
          try { if (node.matches(sel)) { matchedSelector = sel; break; } } catch {}
        }
        if (!matchedSelector) continue;
        for (const prop of properties) {
          const value = entry.rule.style.getPropertyValue(prop);
          if (!value) continue;
          matches.push({
            selector: matchedSelector,
            property: prop,
            value: value.trim(),
            important: entry.rule.style.getPropertyPriority(prop) === 'important',
            specificity: specificity(matchedSelector),
            order: entry.order,
            href: entry.href,
            media: entry.mediaPath,
            element: node.tagName.toLowerCase(),
          });
        }
      }
      matches.sort((x,y) => Number(x.important)-Number(y.important) || compareSpec(x.specificity,y.specificity) || x.order-y.order);
      return matches;
    }

    function inheritedSource(node, properties) {
      for (let cur = node; cur; cur = cur.parentElement) {
        const candidates = declarationsFor(cur, properties);
        if (candidates.length) {
          const winner = candidates[candidates.length - 1];
          return { ...winner, inheritedFrom: cur === node ? null : `${cur.tagName.toLowerCase()}${cur.id ? '#'+cur.id : ''}${cur.classList.length ? '.'+[...cur.classList].join('.') : ''}` };
        }
      }
      return null;
    }

    function alphaOf(color) {
      const m = color.match(/rgba?\(([^)]+)\)/i);
      if (!m) return color === 'transparent' ? 0 : 1;
      const parts = m[1].split(/[\s,\/]+/).filter(Boolean);
      return parts.length > 3 ? Number(parts[3]) : 1;
    }

    function backgroundContext(node) {
      for (let cur = node; cur; cur = cur.parentElement) {
        const cs = getComputedStyle(cur);
        const bg = cs.backgroundColor;
        const image = cs.backgroundImage;
        if (alphaOf(bg) > 0 || (image && image !== 'none')) {
          const candidates = declarationsFor(cur, ['background-color','background','background-image']);
          const winner = candidates[candidates.length - 1] || null;
          return {
            computedBackgroundColor: bg,
            computedBackgroundImage: image,
            source: winner ? { ...winner, inheritedFrom: cur === node ? null : `${cur.tagName.toLowerCase()}${cur.id ? '#'+cur.id : ''}${cur.classList.length ? '.'+[...cur.classList].join('.') : ''}` } : null,
            backgroundElement: `${cur.tagName.toLowerCase()}${cur.id ? '#'+cur.id : ''}${cur.classList.length ? '.'+[...cur.classList].join('.') : ''}`,
          };
        }
      }
      return null;
    }

    const cs = getComputedStyle(el);
    const opacityChain = [];
    for (let cur = el; cur; cur = cur.parentElement) {
      const curStyle = getComputedStyle(cur);
      if (Number(curStyle.opacity) !== 1) {
        const candidates = declarationsFor(cur, ['opacity']);
        opacityChain.push({
          element: `${cur.tagName.toLowerCase()}${cur.id ? '#'+cur.id : ''}${cur.classList.length ? '.'+[...cur.classList].join('.') : ''}`,
          computedOpacity: curStyle.opacity,
          source: candidates[candidates.length - 1] || null,
        });
      }
    }

    const rect = el.getBoundingClientRect();
    return {
      selector,
      found: true,
      tag: el.tagName.toLowerCase(),
      classes: [...el.classList],
      visibleText: (el.innerText || el.textContent || '').trim().replace(/\s+/g,' ').slice(0,500),
      html: el.outerHTML.slice(0,1200),
      computed: {
        color: cs.color,
        backgroundColor: cs.backgroundColor,
        backgroundImage: cs.backgroundImage,
        opacity: cs.opacity,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        display: cs.display,
        visibility: cs.visibility,
      },
      rect: { x:rect.x, y:rect.y, width:rect.width, height:rect.height },
      foregroundSource: inheritedSource(el, ['color']),
      backgroundContext: backgroundContext(el),
      opacityChain,
    };
  }, selector);
}

async function runContrast(page) {
  const result = await page.evaluate(async () => {
    const out = await window.axe.run(document, {
      runOnly: { type: 'rule', values: ['color-contrast'] },
      resultTypes: ['violations'],
    });
    return out.violations.find(v => v.id === 'color-contrast') || null;
  });
  return result;
}

try {
  for (const width of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    for (const route of ROUTES) {
      const page = await context.newPage();
      const response = await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(120);
      await page.addScriptTag({ content: axeCore.source });

      const initial = await runContrast(page);
      const initialNodes = initial?.nodes || [];
      for (const node of initialNodes) {
        const data = firstContrastData(node);
        const target = node.target;
        const detail = await inspectTarget(page, target);
        report.failures.push({
          route,
          viewport: width,
          target,
          selector: detail.selector,
          visibleText: detail.visibleText,
          axe: {
            impact: node.impact,
            failureSummary: node.failureSummary,
            html: node.html,
            foregroundColor: data.fgColor ?? null,
            backgroundColor: data.bgColor ?? null,
            contrastRatio: data.contrastRatio ?? null,
            requiredRatio: data.expectedContrastRatio ?? null,
            fontSize: data.fontSize ?? null,
            fontWeight: data.fontWeight ?? null,
            messageKey: data.messageKey ?? null,
          },
          computed: detail.computed,
          foregroundSource: detail.foregroundSource,
          backgroundContext: detail.backgroundContext,
          opacityChain: detail.opacityChain,
        });
      }

      // Second diagnostic sample after reveal/transitions should have settled.
      await page.waitForTimeout(1200);
      const settled = await runContrast(page);
      for (const node of settled?.nodes || []) {
        const data = firstContrastData(node);
        const detail = await inspectTarget(page, node.target);
        report.settledFailures.push({
          route,
          viewport: width,
          target: node.target,
          selector: detail.selector,
          visibleText: detail.visibleText,
          axe: {
            foregroundColor: data.fgColor ?? null,
            backgroundColor: data.bgColor ?? null,
            contrastRatio: data.contrastRatio ?? null,
            requiredRatio: data.expectedContrastRatio ?? null,
            failureSummary: node.failureSummary,
          },
          computed: detail.computed,
          foregroundSource: detail.foregroundSource,
          backgroundContext: detail.backgroundContext,
          opacityChain: detail.opacityChain,
        });
      }

      report.combinations.push({
        route,
        viewport: width,
        status: response?.status() ?? null,
        initialNodes: initialNodes.length,
        settledNodes: settled?.nodes?.length || 0,
      });
      console.log(JSON.stringify({ route, viewport: width, initialNodes: initialNodes.length, settledNodes: settled?.nodes?.length || 0 }));
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
}

const initialCombos = report.combinations.filter(x => x.initialNodes > 0).length;
const settledCombos = report.combinations.filter(x => x.settledNodes > 0).length;
report.summary = {
  matrixCombinations: VIEWPORTS.length * ROUTES.length,
  initialFailingNodes: report.failures.length,
  initialFailingCombinations: initialCombos,
  settledFailingNodes: report.settledFailures.length,
  settledFailingCombinations: settledCombos,
};
fs.writeFileSync('color-contrast-diagnostic.json', JSON.stringify(report, null, 2));
console.log('COLOR CONTRAST DIAGNOSTIC SUMMARY');
console.log(JSON.stringify(report.summary, null, 2));
