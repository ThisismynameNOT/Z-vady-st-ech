import fs from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = (process.env.FONT_QA_BASE_URL || 'http://127.0.0.1:8788').replace(/\/$/, '');
const CHROME = process.env.CHROME_PATH;
if (!CHROME) throw new Error('CHROME_PATH is required');

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

let result;
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.evaluate(async () => document.fonts.ready);
  await page.waitForTimeout(150);

  result = await page.evaluate(() => {
    const pageText = document.body.innerText || '';
    const hasLatin = /[A-Za-z]/.test(pageText);
    const hasCzech = /[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/.test(pageText);

    const faces = [];
    const visitRules = (rules) => {
      for (const rule of rules) {
        if (rule.type === CSSRule.FONT_FACE_RULE) {
          const src = rule.style.getPropertyValue('src');
          const family = rule.style.getPropertyValue('font-family').replace(/^['"]|['"]$/g, '').trim();
          const weight = (rule.style.getPropertyValue('font-weight') || 'normal').trim();
          const style = (rule.style.getPropertyValue('font-style') || 'normal').trim();
          const urls = [...src.matchAll(/url\((?:['"])?([^'"()]+)(?:['"])?\)/g)]
            .map((match) => new URL(match[1], document.baseURI).href);
          for (const url of urls) faces.push({ family, weight, style, url });
        } else if ('cssRules' in rule && rule.cssRules) {
          visitRules(rule.cssRules);
        }
      }
    };

    for (const sheet of document.styleSheets) {
      try {
        visitRules(sheet.cssRules || []);
      } catch {
        // Same-origin production CSS is expected to be readable. Ignore browser
        // internal/unreadable sheets rather than treating them as font faces.
      }
    }

    const resourceUrls = performance.getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((url) => /\/assets\/fonts\//.test(url));
    const loaded = [...new Set(resourceUrls)].map((url) => {
      const face = faces.find((candidate) => candidate.url === url) || null;
      return { url, face };
    });

    const groups = new Map();
    for (const item of loaded) {
      if (!item.face) continue;
      const key = `${item.face.family}|${item.face.weight}|${item.face.style}`;
      const group = groups.get(key) || {
        family: item.face.family,
        weight: item.face.weight,
        style: item.face.style,
        urls: [],
      };
      group.urls.push(item.url);
      groups.set(key, group);
    }

    const duplicates = [...groups.values()]
      .map((group) => ({ ...group, urls: [...new Set(group.urls)] }))
      .filter((group) => group.urls.length > 1);

    return {
      hasLatin,
      hasCzech,
      fontResourceCount: loaded.length,
      mappedFontResourceCount: loaded.filter((item) => item.face).length,
      loaded,
      duplicates,
    };
  });
} finally {
  await browser.close();
}

fs.writeFileSync('font-resource-dedup.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));

if (!result.hasLatin || !result.hasCzech) {
  console.error('FONT RESOURCE DEDUP: INVALID FIXTURE — homepage must contain ordinary Latin and Czech text');
  process.exit(1);
}
if (result.mappedFontResourceCount !== result.fontResourceCount) {
  console.error('FONT RESOURCE DEDUP: FAIL — one or more loaded font resources could not be mapped to a @font-face descriptor');
  process.exit(1);
}
if (result.duplicates.length) {
  console.error('FONT RESOURCE DEDUP: FAIL — a Czech+Latin page downloaded multiple resources for the same family/weight/style');
  process.exit(1);
}
console.log('FONT RESOURCE DEDUP: PASS');
