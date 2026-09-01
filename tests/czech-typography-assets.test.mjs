import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync('src/styles/czech-typography.css', 'utf8');
const layout = fs.readFileSync('src/layouts/BaseLayout.astro', 'utf8');
const provenance = fs.readFileSync('public/assets/fonts/PROVENANCE.md', 'utf8');

const assets = [
  'inter-400-latin-ext.woff2',
  'inter-500-latin-ext.woff2',
  'inter-600-latin-ext.woff2',
  'cormorant-garamond-400-latin-ext.woff2',
  'cormorant-garamond-500-latin-ext.woff2',
  'cormorant-garamond-600-latin-ext.woff2',
  'cormorant-garamond-400-italic-latin-ext.woff2',
];

test('Czech Latin Extended font subsets are local, declared, and documented', () => {
  assert.match(layout, /import ['"]\.\.\/styles\/czech-typography\.css['"]/);
  for (const asset of assets) {
    const path = `public/assets/fonts/${asset}`;
    assert.ok(fs.existsSync(path), `${path} must exist`);
    assert.ok(fs.statSync(path).size > 10_000, `${path} must contain a real WOFF2 payload`);
    assert.ok(css.includes(`/assets/fonts/${asset}`), `${asset} must be declared by @font-face`);
  }
  assert.match(css, /unicode-range:U\+0100-024F,U\+1E00-1EFF/);
  assert.match(provenance, /Fontsource 5\.3\.0/);
  assert.match(provenance, /served locally/i);
});

test('measured Czech display collisions keep the proven selector line heights', () => {
  assert.match(css, /\.hero h1,\.subhero h1,\.split-head \.h2\{line-height:1\}/);
  assert.match(css, /\.final-cta h2\{line-height:1\.01\}/);
  assert.match(css, /\.service-detail h2\{line-height:1\.08\}/);
  assert.match(css, /\.case h2\{line-height:1\}/);
  assert.match(css, /\.contact-aside h2\{line-height:1\.01\}/);
  assert.match(css, /\.story-copy h2\{line-height:\.98\}/);
});
