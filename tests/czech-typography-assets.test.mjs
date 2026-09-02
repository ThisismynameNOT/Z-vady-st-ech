import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync('src/styles/czech-typography.css', 'utf8');
const siteCss = fs.readFileSync('src/styles/site.css', 'utf8');
const layout = fs.readFileSync('src/layouts/BaseLayout.astro', 'utf8');
const provenance = fs.readFileSync('public/assets/fonts/PROVENANCE.md', 'utf8');

const assets = [
  'inter-400.woff2',
  'inter-500.woff2',
  'inter-600.woff2',
  'cormorant-garamond-400.woff2',
  'cormorant-garamond-500.woff2',
  'cormorant-garamond-600.woff2',
  'cormorant-garamond-400-italic.woff2',
];

test('canonical application faces are local Czech-complete resources with no legacy dual-resource CSS', () => {
  assert.match(layout, /import ['"]\.\.\/styles\/czech-typography\.css['"]/);
  for (const asset of assets) {
    const path = `public/assets/fonts/${asset}`;
    assert.ok(fs.existsSync(path), `${path} must exist`);
    assert.ok(fs.statSync(path).size > 20_000, `${path} must contain a real WOFF2 payload`);
    assert.ok(siteCss.includes(`/assets/fonts/${asset}`), `${asset} must remain declared by the canonical @font-face`);
  }
  assert.equal(fs.readdirSync('public/assets/fonts').filter(name => name.endsWith('-latin-ext.woff2')).length, 0);
  assert.doesNotMatch(css, /@font-face/);
  assert.doesNotMatch(css, /latin-ext\.woff2/);
  assert.match(provenance, /Fontsource 5\.3\.0/);
  assert.match(provenance, /FontTools 4\.64\.0/);
  assert.match(provenance, /There is no runtime Google Fonts, Fontsource, npm, or CDN dependency/);
});

test('measured Czech display collisions keep the proven selector line heights', () => {
  assert.match(css, /\.hero h1,\.subhero h1,\.split-head \.h2\{line-height:1\}/);
  assert.match(css, /\.final-cta h2\{line-height:1\.01\}/);
  assert.match(css, /\.service-detail h2\{line-height:1\.08\}/);
  assert.match(css, /\.case h2\{line-height:1\}/);
  assert.match(css, /\.contact-aside h2\{line-height:1\.01\}/);
  assert.match(css, /\.story-copy h2\{line-height:\.98\}/);
});
