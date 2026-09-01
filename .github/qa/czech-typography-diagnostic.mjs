import fs from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = process.env.LIVE_URL || 'https://zavady-strech-praha.iadamt-93.workers.dev';
const EXPECTED_MAIN = process.env.EXPECTED_MAIN || '1cc9ca6f89242b3ac31ee4e848ebad1bec1ecf32';
const VIEWPORTS = [320, 375, 390, 430, 768, 1024, 1440, 1920];
const ROUTES = [
  '/', '/firma/', '/sluzby/', '/realizace/', '/reference/', '/kontakt/', '/ochrana-osobnich-udaju/',
  '/realizace/gymnazium-jana-patocky/', '/realizace/hybernska-2-997/', '/realizace/narodni-muzeum/', '/realizace/prazska-trznice-hala-25/'
];
const TARGET = [...'ŘřŮůĚěŠšČčŽžÝýÁáÍíÉéÓóĎďŤťŇň'];
const TARGET_SET = new Set(TARGET);
const SCREENSHOT_WIDTHS = new Set([390, 1440]);
const report = {
  baseUrl: BASE,
  expectedMain: EXPECTED_MAIN,
  generatedAt: new Date().toISOString(),
  viewports: VIEWPORTS,
  routes: ROUTES,
  rows: [],
  routeFailures: [],
  fontFallbacks: [],
  czechGlyphFontSamples: [],
  geometryProblems: [],
  screenshots: [],
};

function slug(value) {
  return String(value).replace(/^\/+|\/+$/g,'').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'') || 'home';
}
function num(value) { const n = Number.parseFloat(value); return Number.isFinite(n) ? n : null; }
function normalizedFamily(value) { return String(value || '').split(',')[0].replace(/["']/g,'').trim(); }
function hasCzech(text) { return [...String(text || '')].some(ch => TARGET_SET.has(ch)); }

async function collectCandidates(page) {
  return page.evaluate((targetChars) => {
    const target = new Set(targetChars);
    const all = [...document.querySelectorAll('body *')];
    const visible = (el) => {
      const s = getComputedStyle(el), r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    };
    const directText = (el) => [...el.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent || '').join(' ').replace(/\s+/g,' ').trim();
    const semantic = (el) => /^H[1-6]$/.test(el.tagName) || el.tagName === 'SUMMARY';
    const special = (el) => el.matches('.brand-copy strong,.mark,.phone-big,.problem b,.step-simple b,.fact b,.ledger-row strong,.project-copy h3,.service-row h3,.service-detail h2,.story-copy h2,.contact-aside h2,.form-step h3,.final-cta h2,.h2');
    const rows = [];
    let i = 0;
    for (const el of all) {
      if (!visible(el)) continue;
      const s = getComputedStyle(el);
      const family = s.fontFamily || '';
      if (!/(Cormorant|Inter)/i.test(family)) continue;
      const text = (semantic(el) || special(el) ? el.textContent : directText(el))?.replace(/\s+/g,' ').trim() || '';
      if (!text) continue;
      const large = parseFloat(s.fontSize) >= 18;
      const czech = [...text].some(ch => target.has(ch));
      if (!(semantic(el) || special(el) || large || czech)) continue;
      const id = `typo-${i++}`;
      el.setAttribute('data-qa-typo-id', id);
      rows.push({
        id,
        tag: el.tagName.toLowerCase(),
        className: typeof el.className === 'string' ? el.className : '',
        text: text.slice(0, 240),
        cssFontFamily: family,
        intendedFamily: family.split(',')[0].replace(/["']/g,'').trim(),
        fontSize: s.fontSize,
        fontWeight: s.fontWeight,
        fontStyle: s.fontStyle,
        lineHeight: s.lineHeight,
        letterSpacing: s.letterSpacing,
        overflow: s.overflow,
      });
    }
    return rows;
  }, TARGET);
}

async function platformFontsForSelector(cdp, selector) {
  const doc = await cdp.send('DOM.getDocument', { depth: 1, pierce: true });
  const found = await cdp.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector });
  if (!found.nodeId) return [];
  const result = await cdp.send('CSS.getPlatformFontsForNode', { nodeId: found.nodeId });
  return result.fonts || [];
}

async function perCharacterFonts(page, cdp, candidate) {
  const chars = [...new Set([...candidate.text].filter(ch => TARGET_SET.has(ch)))];
  const out = [];
  for (const ch of chars) {
    const probeId = await page.evaluate(({ch, id}) => {
      const source = document.querySelector(`[data-qa-typo-id="${id}"]`);
      if (!source) return null;
      const cs = getComputedStyle(source);
      const probe = document.createElement('span');
      probe.dataset.qaGlyphProbe = `${id}-${ch.codePointAt(0)}`;
      probe.textContent = ch;
      Object.assign(probe.style, {
        position: 'fixed', left: '-10000px', top: '0', visibility: 'hidden', whiteSpace: 'pre',
        fontFamily: cs.fontFamily, fontSize: cs.fontSize, fontWeight: cs.fontWeight, fontStyle: cs.fontStyle,
        fontStretch: cs.fontStretch, fontVariant: cs.fontVariant, fontFeatureSettings: cs.fontFeatureSettings,
        fontKerning: cs.fontKerning, letterSpacing: cs.letterSpacing, lineHeight: 'normal'
      });
      document.body.appendChild(probe);
      return probe.dataset.qaGlyphProbe;
    }, { ch, id: candidate.id });
    if (!probeId) continue;
    const fonts = await platformFontsForSelector(cdp, `[data-qa-glyph-probe="${probeId}"]`);
    out.push({ ch, codePoint: `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4,'0')}`, fonts });
    await page.evaluate((probeId) => document.querySelector(`[data-qa-glyph-probe="${probeId}"]`)?.remove(), probeId);
  }
  return out;
}

async function geometryFor(page, candidate) {
  return page.evaluate(({id}) => {
    const el = document.querySelector(`[data-qa-typo-id="${id}"]`);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const elementRect = el.getBoundingClientRect();
    const chars = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      for (let i = 0; i < node.textContent.length; i++) {
        if (!node.textContent[i].trim()) continue;
        const range = document.createRange();
        range.setStart(node, i); range.setEnd(node, i + 1);
        const r = range.getBoundingClientRect();
        if (r.width || r.height) chars.push({ ch: node.textContent[i], left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height });
      }
    }
    chars.sort((a,b) => a.top - b.top || a.left - b.left);
    const lines = [];
    for (const c of chars) {
      let line = lines.find(x => Math.abs(x.top - c.top) <= 2.5);
      if (!line) { line = { top:c.top, bottom:c.bottom, left:c.left, right:c.right, chars:[] }; lines.push(line); }
      line.top = Math.min(line.top,c.top); line.bottom=Math.max(line.bottom,c.bottom); line.left=Math.min(line.left,c.left); line.right=Math.max(line.right,c.right); line.chars.push(c.ch);
    }
    lines.sort((a,b)=>a.top-b.top);
    const linePairs = [];
    for (let i=1;i<lines.length;i++) {
      linePairs.push({ previousBottom: lines[i-1].bottom, nextTop: lines[i].top, gap: lines[i].top-lines[i-1].bottom, overlaps: lines[i].top < lines[i-1].bottom - 0.5 });
    }
    const clipping = cs.overflow !== 'visible' && chars.some(c => c.top < elementRect.top - .5 || c.bottom > elementRect.bottom + .5 || c.left < elementRect.left - .5 || c.right > elementRect.right + .5);
    const horizontalOverflow = elementRect.right > document.documentElement.clientWidth + 1 || elementRect.left < -1;
    const prev = el.previousElementSibling?.getBoundingClientRect?.();
    const next = el.nextElementSibling?.getBoundingClientRect?.();
    const neighborOverlap = Boolean((prev && prev.bottom > elementRect.top + .5 && prev.top < elementRect.bottom - .5) || (next && next.top < elementRect.bottom - .5 && next.bottom > elementRect.top + .5));
    return {
      elementRect:{left:elementRect.left,top:elementRect.top,right:elementRect.right,bottom:elementRect.bottom,width:elementRect.width,height:elementRect.height},
      fontSizePx: parseFloat(cs.fontSize),
      lineHeightPx: cs.lineHeight === 'normal' ? null : parseFloat(cs.lineHeight),
      lineCount: lines.length,
      lines: lines.map(l=>({top:l.top,bottom:l.bottom,height:l.bottom-l.top,left:l.left,right:l.right,text:l.chars.join('').replace(/\s+/g,' ')})),
      linePairs,
      lineCollision: linePairs.some(p=>p.overlaps),
      clipping,
      horizontalOverflow,
      neighborOverlap,
      overflow: cs.overflow,
    };
  }, { id: candidate.id });
}

async function maybeScreenshots(page, route, width) {
  if (!SCREENSHOT_WIDTHS.has(width)) return;
  const plans = [];
  if (route === '/') {
    plans.push(['home-hero','.hero h1']);
    plans.push(['home-problem-heading','h2.h2']);
    plans.push(['home-final-cta','.final-cta h2']);
  }
  if (route === '/kontakt/') {
    plans.push(['contact-hero','.subhero h1']);
    plans.push(['contact-form','#poptavka']);
    plans.push(['contact-final-cta','.final-cta h2']);
  }
  if (route === '/firma/') {
    plans.push(['firma-subhero','.subhero h1']);
    plans.push(['firma-story','.story-copy h2']);
  }
  if (route === '/sluzby/') {
    plans.push(['services-subhero','.subhero h1']);
    plans.push(['services-detail','.service-detail']);
  }
  for (const [name, selector] of plans) {
    const locator = page.locator(selector).first();
    if (!(await locator.count())) continue;
    try {
      await locator.scrollIntoViewIfNeeded();
      await page.waitForTimeout(80);
      const path = `screenshots/baseline-${name}-${width}.png`;
      await locator.screenshot({ path });
      report.screenshots.push({ route, width, name, selector, path });
    } catch (error) {
      report.screenshots.push({ route, width, name, selector, error:String(error) });
    }
  }
}

fs.mkdirSync('screenshots', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args:['--no-sandbox','--disable-dev-shm-usage'] });
try {
  for (const width of VIEWPORTS) {
    const context = await browser.newContext({ viewport:{width,height:1000}, deviceScaleFactor:1 });
    for (const route of ROUTES) {
      const page = await context.newPage();
      try {
        const response = await page.goto(BASE + route, { waitUntil:'domcontentloaded', timeout:30000 });
        await page.waitForTimeout(250);
        await page.evaluate(async () => { await document.fonts.ready; });
        if (response?.status() !== 200) report.routeFailures.push({route,width,status:response?.status() ?? null});
        const cdp = await context.newCDPSession(page);
        await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
        const candidates = await collectCandidates(page);
        const pageRow = { route, width, status:response?.status() ?? null, candidates:[] };
        for (const candidate of candidates) {
          const selector = `[data-qa-typo-id="${candidate.id}"]`;
          const platformFonts = await platformFontsForSelector(cdp, selector);
          const geometry = await geometryFor(page, candidate);
          const intended = normalizedFamily(candidate.intendedFamily);
          const systemFonts = platformFonts.filter(f => !f.isCustomFont && (f.glyphCount || 0) > 0);
          const customFonts = platformFonts.filter(f => f.isCustomFont && (f.glyphCount || 0) > 0);
          const fallback = /^(Cormorant|Inter)$/i.test(intended) && systemFonts.length > 0;
          let characterFonts = [];
          if (hasCzech(candidate.text)) characterFonts = await perCharacterFonts(page, cdp, candidate);
          const row = { ...candidate, platformFonts, characterFonts, geometry, fallback };
          pageRow.candidates.push(row);
          if (fallback) report.fontFallbacks.push({ route,width,selector,text:candidate.text,intendedFamily:intended,cssFontFamily:candidate.cssFontFamily,fontSize:candidate.fontSize,fontWeight:candidate.fontWeight,fontStyle:candidate.fontStyle,platformFonts,characterFonts });
          for (const sample of characterFonts) {
            report.czechGlyphFontSamples.push({route,width,selector,text:candidate.text,intendedFamily:intended,fontWeight:candidate.fontWeight,fontStyle:candidate.fontStyle,...sample});
          }
          if (geometry && (geometry.lineCollision || geometry.clipping || geometry.horizontalOverflow || geometry.neighborOverlap)) {
            report.geometryProblems.push({route,width,selector,text:candidate.text,font:intended,fontSize:candidate.fontSize,lineHeight:candidate.lineHeight,actualProblem:{lineCollision:geometry.lineCollision,clipping:geometry.clipping,horizontalOverflow:geometry.horizontalOverflow,neighborOverlap:geometry.neighborOverlap},geometry});
          }
        }
        report.rows.push(pageRow);
        await maybeScreenshots(page, route, width);
      } catch (error) {
        report.routeFailures.push({route,width,error:String(error)});
      } finally { await page.close(); }
    }
    await context.close();
  }
} finally { await browser.close(); }

report.summary = {
  matrixCombinations: VIEWPORTS.length * ROUTES.length,
  matrixRows: report.rows.length,
  routeFailures: report.routeFailures.length,
  inspectedNodes: report.rows.reduce((n,row)=>n+row.candidates.length,0),
  fallbackNodes: report.fontFallbacks.length,
  czechGlyphSamples: report.czechGlyphFontSamples.length,
  geometryProblemNodes: report.geometryProblems.length,
  screenshots: report.screenshots.filter(x=>x.path).length,
};
fs.writeFileSync('czech-typography-diagnostic.json', JSON.stringify(report,null,2));
console.log(JSON.stringify(report.summary,null,2));
console.log('FALLBACK SAMPLE');
console.log(JSON.stringify(report.fontFallbacks.slice(0,25),null,2));
console.log('GEOMETRY SAMPLE');
console.log(JSON.stringify(report.geometryProblems.slice(0,25),null,2));
