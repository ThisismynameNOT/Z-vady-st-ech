import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const DIFF_THRESHOLD = 10;
const HIGHLIGHT_NAME = 'czech-collision-line';

function diffMask(paintedBuffer, blankBuffer) {
  const painted = PNG.sync.read(paintedBuffer);
  const blank = PNG.sync.read(blankBuffer);
  if (painted.width !== blank.width || painted.height !== blank.height) {
    throw new Error(`DOM paint screenshots changed dimensions: ${painted.width}x${painted.height} vs ${blank.width}x${blank.height}`);
  }
  const pixels = painted.width * painted.height;
  const mask = new Uint8Array(pixels);
  let paintedPixels = 0;
  for (let i = 0; i < pixels; i++) {
    const p = i * 4;
    const delta = Math.max(
      Math.abs(painted.data[p] - blank.data[p]),
      Math.abs(painted.data[p + 1] - blank.data[p + 1]),
      Math.abs(painted.data[p + 2] - blank.data[p + 2]),
      Math.abs(painted.data[p + 3] - blank.data[p + 3]),
    );
    if (delta > DIFF_THRESHOLD) {
      mask[i] = 1;
      paintedPixels++;
    }
  }
  return { mask, paintedPixels, width: painted.width, height: painted.height };
}

function overlapPixels(a, b) {
  if (a.length !== b.length) throw new Error('DOM paint masks have different lengths');
  let count = 0;
  for (let i = 0; i < a.length; i++) if (a[i] && b[i]) count++;
  return count;
}

function evidenceLinePath(evidencePath, index) {
  if (!evidencePath) return null;
  const ext = path.extname(evidencePath) || '.png';
  const base = evidencePath.slice(0, evidencePath.length - ext.length);
  return `${base}-line-${index + 1}${ext}`;
}

export async function measureDomPaintCollision(page, selector, options = {}) {
  const locator = page.locator(selector).first();
  if (!(await locator.count())) throw new Error(`DOM paint target not found: ${selector}`);
  await locator.scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  const token = `czech-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const prepared = await page.evaluate(({ selector, token, highlightName }) => {
    const target = document.querySelector(selector);
    if (!target) return { found: false };

    const targetRect = target.getBoundingClientRect();
    const intersects = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
    const hiddenOverlays = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el === target || el.contains(target) || target.contains(el)) continue;
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) continue;
      if (s.position !== 'fixed' && s.position !== 'sticky') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1 || !intersects(rect, targetRect)) continue;
      el.setAttribute('data-czech-collision-overlay', token);
      hiddenOverlays.push({
        tag: el.tagName.toLowerCase(),
        className: typeof el.className === 'string' ? el.className : '',
        position: s.position,
      });
    }

    const textNodes = [];
    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) textNodes.push(node);

    const chars = [];
    for (let nodeIndex = 0; nodeIndex < textNodes.length; nodeIndex++) {
      const node = textNodes[nodeIndex];
      for (let offset = 0; offset < node.data.length; offset++) {
        const ch = node.data[offset];
        if (/\s/.test(ch)) continue;
        const range = document.createRange();
        range.setStart(node, offset);
        range.setEnd(node, offset + 1);
        const rect = range.getBoundingClientRect();
        if (rect.width < 0.1 || rect.height < 0.1) continue;
        chars.push({
          nodeIndex,
          offset,
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          centerY: (rect.top + rect.bottom) / 2,
        });
      }
    }

    chars.sort((a, b) => a.centerY - b.centerY || a.left - b.left);
    const grouped = [];
    for (const char of chars) {
      let line = grouped.find(candidate => Math.abs(candidate.centerY - char.centerY) <= 2);
      if (!line) {
        line = { centerY: char.centerY, chars: [] };
        grouped.push(line);
      }
      line.chars.push(char);
      line.centerY = line.chars.reduce((sum, item) => sum + item.centerY, 0) / line.chars.length;
    }
    grouped.sort((a, b) => a.centerY - b.centerY);

    const ranges = [];
    const lineMeta = [];
    for (const line of grouped) {
      const ordered = [...line.chars].sort((a, b) => a.nodeIndex - b.nodeIndex || a.offset - b.offset);
      const first = ordered[0];
      const last = ordered[ordered.length - 1];
      const range = document.createRange();
      range.setStart(textNodes[first.nodeIndex], first.offset);
      range.setEnd(textNodes[last.nodeIndex], last.offset + 1);
      ranges.push(range);
      const rects = [...range.getClientRects()].filter(rect => rect.width > 0.1 && rect.height > 0.1);
      const rect = rects.length ? rects[0] : range.getBoundingClientRect();
      lineMeta.push({
        text: range.toString().replace(/\s+/g, ' ').trim(),
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        centerY: (rect.top + rect.bottom) / 2,
      });
    }

    const style = document.createElement('style');
    style.id = `czech-collision-style-${token}`;
    style.textContent = `
      html *, html *::before, html *::after {
        transition: none !important;
        animation: none !important;
        scroll-behavior: auto !important;
      }
      .reveal {
        opacity: 1 !important;
        transform: none !important;
      }
      [data-czech-collision-overlay="${token}"] {
        visibility: hidden !important;
      }
      [data-czech-collision-target="${token}"],
      [data-czech-collision-target="${token}"] * {
        color: transparent !important;
        text-shadow: none !important;
        caret-color: transparent !important;
      }
      ::highlight(${highlightName}) {
        color: rgb(0 0 0) !important;
        background-color: transparent !important;
        text-shadow: none !important;
      }
      ::selection {
        color: rgb(0 0 0) !important;
        background-color: transparent !important;
        text-shadow: none !important;
      }
    `;
    document.head.append(style);
    target.setAttribute('data-czech-collision-target', token);

    const customHighlight = Boolean(globalThis.CSS?.highlights && globalThis.Highlight);
    globalThis.__czechPaintCollision = { target, ranges, style, token, highlightName, customHighlight };
    globalThis.CSS?.highlights?.delete(highlightName);
    globalThis.getSelection()?.removeAllRanges();

    const cs = getComputedStyle(target);
    return {
      found: true,
      customHighlight,
      hiddenOverlays,
      lineCount: ranges.length,
      lines: lineMeta,
      text: (target.textContent || '').replace(/\s+/g, ' ').trim(),
      fontFamily: cs.fontFamily,
      fontSize: parseFloat(cs.fontSize),
      lineHeight: cs.lineHeight === 'normal' ? null : parseFloat(cs.lineHeight),
    };
  }, { selector, token, highlightName: HIGHLIGHT_NAME });

  if (!prepared.found) throw new Error(`DOM paint target disappeared: ${selector}`);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  try {
    if (options.evidencePath) {
      await page.evaluate(({ token, highlightName }) => {
        const state = globalThis.__czechPaintCollision;
        globalThis.CSS?.highlights?.delete(highlightName);
        globalThis.getSelection()?.removeAllRanges();
        state.target.removeAttribute('data-czech-collision-target');
      }, { token, highlightName: HIGHLIGHT_NAME });
      await locator.screenshot({ path: options.evidencePath, animations: 'disabled' });
      await page.evaluate(({ token }) => {
        globalThis.__czechPaintCollision.target.setAttribute('data-czech-collision-target', token);
      }, { token });
    }

    const blank = await locator.screenshot({ animations: 'disabled' });
    const masks = [];
    const paintedPixelsPerLine = [];
    let mode = prepared.customHighlight ? 'custom-highlight' : 'selection';

    for (let index = 0; index < prepared.lineCount; index++) {
      await page.evaluate(({ index, highlightName, mode }) => {
        const state = globalThis.__czechPaintCollision;
        globalThis.CSS?.highlights?.delete(highlightName);
        globalThis.getSelection()?.removeAllRanges();
        const range = state.ranges[index];
        if (mode === 'custom-highlight') {
          globalThis.CSS.highlights.set(highlightName, new Highlight(range));
        } else {
          const selection = globalThis.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }, { index, highlightName: HIGHLIGHT_NAME, mode });

      let painted = await locator.screenshot({ animations: 'disabled' });
      let current = diffMask(painted, blank);

      if (current.paintedPixels === 0 && mode === 'custom-highlight') {
        mode = 'selection';
        await page.evaluate(({ index, highlightName }) => {
          const state = globalThis.__czechPaintCollision;
          globalThis.CSS.highlights.delete(highlightName);
          const selection = globalThis.getSelection();
          selection.removeAllRanges();
          selection.addRange(state.ranges[index]);
        }, { index, highlightName: HIGHLIGHT_NAME });
        painted = await locator.screenshot({ animations: 'disabled' });
        current = diffMask(painted, blank);
      }

      const linePath = evidenceLinePath(options.evidencePath, index);
      if (linePath) fs.writeFileSync(linePath, painted);
      masks.push(current.mask);
      paintedPixelsPerLine.push(current.paintedPixels);
    }

    const pairs = [];
    let collisionPixels = 0;
    for (let index = 1; index < masks.length; index++) {
      const pixels = overlapPixels(masks[index - 1], masks[index]);
      if (pixels > 0) {
        pairs.push({ upper: index - 1, lower: index, pixels });
        collisionPixels += pixels;
      }
    }

    return {
      supported: prepared.lineCount > 0 && paintedPixelsPerLine.every(count => count > 0),
      mode,
      hiddenOverlays: prepared.hiddenOverlays,
      lineCount: prepared.lineCount,
      collisionPixels,
      pairs,
      paintedPixelsPerLine,
      lines: prepared.lines,
      text: prepared.text,
      fontFamily: prepared.fontFamily,
      fontSize: prepared.fontSize,
      lineHeight: prepared.lineHeight,
    };
  } finally {
    await page.evaluate(({ token, highlightName }) => {
      const state = globalThis.__czechPaintCollision;
      globalThis.CSS?.highlights?.delete(highlightName);
      globalThis.getSelection()?.removeAllRanges();
      if (state?.style?.isConnected) state.style.remove();
      if (state?.target) state.target.removeAttribute('data-czech-collision-target');
      document.querySelectorAll(`[data-czech-collision-overlay="${token}"]`).forEach(el => el.removeAttribute('data-czech-collision-overlay'));
      delete globalThis.__czechPaintCollision;
    }, { token, highlightName: HIGHLIGHT_NAME }).catch(() => {});
  }
}
