import { chromium } from 'playwright';
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

const fontFaces = [
  { family: 'Inter', weight: '400', style: 'normal' },
  { family: 'Inter', weight: '500', style: 'normal' },
  { family: 'Inter', weight: '600', style: 'normal' },
  { family: 'Cormorant', weight: '400', style: 'normal' },
  { family: 'Cormorant', weight: '500', style: 'normal' },
  { family: 'Cormorant', weight: '600', style: 'normal' },
  { family: 'Cormorant', weight: '400', style: 'italic' },
];

const result = {
  base: BASE,
  generatedAt: new Date().toISOString(),
  methodology: {
    fonts: 'Explicitly load every declared public font face with FontFaceSet.load(), then verify FontFaceSet.check(). Unused faces are not failures merely because their initial status is unloaded.',
    targets: 'WCAG 2.2 SC 2.5.8: require 24x24 CSS px unless the inline or spacing exception applies. For undersized targets, a 24px-diameter circle centered on the target must not intersect another target or another undersized-target circle.',
  },
  routeChecks: [],
  failures: [],
};

function abs(route) { return new URL(route, BASE).toString(); }

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, locale: 'cs-CZ' });
    for (const route of routes) {
      const page = await context.newPage();
      const response = await page.goto(abs(route), { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
      if (response?.status() !== 200) {
        result.failures.push({ scope: `route:${viewport.width}:${route}`, message: 'Route did not load with HTTP 200', status: response?.status() ?? null });
      }

      const fontResults = await page.evaluate(async faces => {
        if (!document.fonts) return faces.map(face => ({ ...face, ok: false, error: 'FontFaceSet unavailable' }));
        await document.fonts.ready;
        const probe = 'Hamburgefontsiv 0123456789';
        return Promise.all(faces.map(async face => {
          const spec = `${face.style === 'normal' ? '' : `${face.style} `}${face.weight} 16px "${face.family}"`;
          try {
            const loaded = await document.fonts.load(spec, probe);
            const checked = document.fonts.check(spec, probe);
            return { ...face, spec, loadedCount: loaded.length, checked, ok: loaded.length > 0 && checked };
          } catch (error) {
            return { ...face, spec, loadedCount: 0, checked: false, ok: false, error: String(error) };
          }
        }));
      }, fontFaces);

      const targetResults = await page.evaluate(() => {
        const visible = el => {
          const style = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 &&
            style.pointerEvents !== 'none' && rect.width > 0 && rect.height > 0 &&
            rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight;
        };
        const candidates = [...document.querySelectorAll('a,button,input,select,textarea,[role="button"]')].filter(visible);
        const targets = candidates.map((el, index) => {
          let rect = el.getBoundingClientRect();
          if (el instanceof HTMLInputElement && ['checkbox', 'radio'].includes(el.type) && el.closest('label')) {
            rect = el.closest('label').getBoundingClientRect();
          }
          const style = getComputedStyle(el);
          const inlineException = el.tagName === 'A' && style.display === 'inline';
          return {
            index,
            tag: el.tagName,
            text: (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 100),
            cls: typeof el.className === 'string' ? el.className : '',
            rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
            inlineException,
            undersized: rect.width < 24 || rect.height < 24,
          };
        });

        const pointRectDistance = (x, y, rect) => {
          const dx = Math.max(rect.left - x, 0, x - rect.right);
          const dy = Math.max(rect.top - y, 0, y - rect.bottom);
          return Math.hypot(dx, dy);
        };

        const failures = [];
        for (const target of targets) {
          if (!target.undersized || target.inlineException) continue;
          const cx = (target.rect.left + target.rect.right) / 2;
          const cy = (target.rect.top + target.rect.bottom) / 2;
          const conflicts = [];
          for (const other of targets) {
            if (other.index === target.index) continue;
            if (other.undersized && !other.inlineException) {
              const ox = (other.rect.left + other.rect.right) / 2;
              const oy = (other.rect.top + other.rect.bottom) / 2;
              if (Math.hypot(cx - ox, cy - oy) < 24) conflicts.push({ index: other.index, text: other.text, reason: '24px circles intersect' });
            } else if (pointRectDistance(cx, cy, other.rect) < 12) {
              conflicts.push({ index: other.index, text: other.text, reason: '24px circle intersects another target' });
            }
          }
          if (conflicts.length) {
            failures.push({
              tag: target.tag,
              text: target.text,
              cls: target.cls,
              width: Math.round(target.rect.width * 100) / 100,
              height: Math.round(target.rect.height * 100) / 100,
              conflicts: conflicts.slice(0, 8),
            });
          }
        }

        return {
          totalTargets: targets.length,
          undersizedRaw: targets.filter(target => target.undersized).length,
          inlineExceptions: targets.filter(target => target.undersized && target.inlineException).length,
          spacingPasses: targets.filter(target => target.undersized && !target.inlineException).length - failures.length,
          failures,
        };
      });

      const failedFonts = fontResults.filter(font => !font.ok);
      if (failedFonts.length) result.failures.push({ scope: `fonts:${viewport.width}:${route}`, message: 'Explicit font load/check failed', failedFonts });
      if (targetResults.failures.length) result.failures.push({ scope: `targets:${viewport.width}:${route}`, message: 'WCAG 2.2 SC 2.5.8 target-size failure after inline/spacing exceptions', targets: targetResults.failures });

      result.routeChecks.push({ viewport: viewport.width, route, fontResults, targetResults });
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
}

fs.writeFileSync(path.join(OUT, 'corrected-font-targets.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ correctedFontTargetFailures: result.failures.length }, null, 2));
