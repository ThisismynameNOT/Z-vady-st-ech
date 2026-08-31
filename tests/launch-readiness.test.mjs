import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('robots keeps CMS and API endpoints out of search indexes', async () => {
  const source = await read('src/pages/robots.txt.ts');
  assert.match(source, /Disallow:\s*\/admin\//);
  assert.match(source, /Disallow:\s*\/api\//);
});

test('mobile navigation exposes expanded state and keeps the closed drawer inert', async () => {
  const header = await read('src/components/layout/Header.astro');
  const script = await read('public/scripts/site.js');

  assert.match(header, /data-menu-open[^>]*aria-expanded="false"/);
  assert.match(header, /id="drawer"[^>]*\binert\b/);
  assert.match(script, /setAttribute\(['"]aria-expanded['"]/);
  assert.match(script, /drawer\.toggleAttribute\(['"]inert['"]/);
});

test('multi-step choice controls expose their selected state to assistive technology', async () => {
  const form = await read('src/components/sections/ContactForm.astro');
  const script = await read('public/scripts/site.js');

  assert.match(form, /class="choice"[^>]*aria-pressed="false"/);
  assert.match(script, /setAttribute\(['"]aria-pressed['"]/);
  assert.match(form, /id="privacyAck"[^>]*\brequired\b/);
});

test('social metadata is complete when pages are shared', async () => {
  const layout = await read('src/layouts/BaseLayout.astro');
  assert.match(layout, /property="og:site_name"/);
  assert.match(layout, /name="twitter:title"/);
  assert.match(layout, /name="twitter:description"/);
});
