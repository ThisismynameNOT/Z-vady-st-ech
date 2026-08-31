import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../src/styles/site.css', import.meta.url), 'utf8');

function zIndexFor(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\{[^}]*z-index:(\\d+)`));
  assert.ok(match, `expected ${selector} to declare a numeric z-index`);
  return Number(match[1]);
}

test('mobile sticky CTA stays below the open drawer stack', () => {
  const sticky = zIndexFor('.mobile-cta');
  const backdrop = zIndexFor('.drawer-backdrop');
  const drawer = zIndexFor('.drawer');

  assert.ok(sticky < backdrop, `mobile CTA z-index ${sticky} must be below drawer backdrop ${backdrop}`);
  assert.ok(backdrop < drawer, `drawer backdrop z-index ${backdrop} must be below drawer ${drawer}`);
});
