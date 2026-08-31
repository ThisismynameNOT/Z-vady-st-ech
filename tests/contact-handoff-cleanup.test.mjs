import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('contact-page enquiry CTAs jump directly to the form', async () => {
  const header = await read('src/components/layout/Header.astro');
  const footer = await read('src/components/layout/Footer.astro');

  for (const source of [header, footer]) {
    assert.match(source, /path\s*===\s*['"]\/kontakt\/['"]\s*\?\s*['"]#poptavka['"]/);
    assert.match(source, /contactCtaHref/);
  }

  assert.match(header, /class="nav-cta"\s+href=\{contactCtaHref\}/);
  assert.match(header, /href=\{contactCtaHref\}[^>]*data-menu-close[^>]*>Odeslat poptávku/);
  assert.match(footer, /href=\{contactCtaHref\}>Poptat opravu/);
});

test('form fallback phone comes from global company settings, not a hardcoded number in JavaScript', async () => {
  const form = await read('src/components/sections/ContactForm.astro');
  const script = await read('public/scripts/site.js');

  assert.match(form, /data-fallback-phone=\{company\.phone\}/);
  assert.match(script, /form\.dataset\.fallbackPhone/);
  assert.doesNotMatch(script, /\+420\s*732\s*282\s*409/);
});

test('operator docs describe the real production deploy wrapper', async () => {
  const readme = await read('README.md');
  const operations = await read('OPERATIONS.md');

  assert.match(readme, /Deploy command:\s*`npm run deploy`/);
  assert.match(operations, /Deploy command:\s*`npm run deploy`/);
  assert.match(operations, /deploy-cloudflare\.mjs/);
});

test('production checklist records already verified platform activation', async () => {
  const checklist = await read('docs/production-activation-checklist.md');

  const completed = [
    'Workers Git Build connected to `main` (not Pages)',
    'Build command is `npm run build`',
    'Controlled first Worker deployment succeeds',
    'Exact `workers.dev` URL recorded',
    'Runtime variables/secrets configured as needed',
    'Tina media list/upload/select/delete verified',
    '`RESEND_API_KEY` configured',
    '`FORM_RECIPIENT_EMAIL` configured',
    '`FORM_FROM_EMAIL` configured',
    'One real enquiry delivered successfully',
  ];

  for (const item of completed) {
    assert.ok(checklist.includes(`- [x] ${item}`), `missing completed checklist item: ${item}`);
  }
});
