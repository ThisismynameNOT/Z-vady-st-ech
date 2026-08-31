import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const headerUrl = new URL('../src/components/layout/Header.astro', import.meta.url);

test('brand home link derives its accessible name from its visible content', async () => {
  const source = await readFile(headerUrl, 'utf8');
  const brandLink = source.match(/<a class="brand"[^>]*>/)?.[0] ?? '';

  assert.ok(brandLink, 'expected the brand home link to exist');
  assert.match(brandLink, /href="\/"/);
  assert.doesNotMatch(
    brandLink,
    /aria-label=/,
    'an overriding aria-label can diverge from the visible brand text and trigger WCAG label-in-name failures',
  );
});
