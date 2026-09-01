import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('mobile sticky CTA is a labelled navigation landmark without changing its links', async () => {
  const footer = await read('src/components/layout/Footer.astro');

  assert.match(footer, /<nav class="mobile-cta" aria-label="Rychlý kontakt">/);
  assert.match(footer, /<a href=\{telHref\(company\.phone\)\}>Zavolat<\/a>/);
  assert.match(footer, /<a href=\{contactCtaHref\}>Poptat opravu<\/a>/);
  assert.match(footer, /path===['"]\/kontakt\/['"]\?['"]#poptavka['"]:site\.primaryCTALink/);
  assert.doesNotMatch(footer, /<div class="mobile-cta">/);
});

test('contact details are primary section content rather than a complementary aside', async () => {
  const form = await read('src/components/sections/ContactForm.astro');

  assert.match(form, /<section class="contact-aside">/);
  assert.match(form, /<section class="contact-aside">[\s\S]*?<h2[^>]*>\{heading\}<\/h2>/);
  assert.match(form, /<\/section><form id="roofForm"/);
  assert.doesNotMatch(form, /<aside class="contact-aside">/);
});
