import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const redirectsPath = new URL('../public/_redirects', import.meta.url);

const expectedRules = [
  '/index.html / 301',
  '/firma.html /firma/ 301',
  '/sluzby.html /sluzby/ 301',
  '/realizace.html /realizace/ 301',
  '/reference.html /reference/ 301',
  '/kontakt.html /kontakt/ 301',
  '/ochrana-osobnich-udaju.html /ochrana-osobnich-udaju/ 301',
];

test('Cloudflare static assets preserve all legacy .html redirects', () => {
  assert.equal(
    fs.existsSync(redirectsPath),
    true,
    'public/_redirects must exist so Cloudflare applies legacy .html redirects before Worker routing',
  );

  const rules = fs.readFileSync(redirectsPath, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));

  for (const rule of expectedRules) {
    assert.ok(rules.includes(rule), `missing Cloudflare redirect rule: ${rule}`);
  }
});
