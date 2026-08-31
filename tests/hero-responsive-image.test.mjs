import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const renderer = fs.readFileSync(new URL('../src/components/sections/SectionRenderer.astro', import.meta.url), 'utf8');
const hero = renderer.match(/\{t==='hero'[\s\S]*?(?=\n\{t==='trustBar')/)?.[0] || '';
const assetRoot = new URL('../public/assets/images/', import.meta.url);
const widths = [640, 1024, 1600];

test('homepage hero delivers responsive modern sources with an eager JPEG fallback', () => {
  assert.match(hero, /<picture\b/, 'hero must use picture for format selection');
  assert.match(hero, /type="image\/avif"/, 'hero must expose an AVIF source');
  assert.match(hero, /type="image\/webp"/, 'hero must expose a WebP source');
  assert.match(hero, /srcset=/, 'hero must expose responsive srcset candidates');
  assert.match(hero, /sizes="100vw"/, 'hero must declare its viewport-width sizing');
  assert.match(hero, /src=\{section\.backgroundImage\}/, 'hero must retain the CMS JPEG as the fallback source');
  assert.match(hero, /fetchpriority="high"/, 'hero must keep high fetch priority');
  assert.doesNotMatch(hero, /loading="lazy"/, 'the LCP hero must never be lazy-loaded');
  assert.match(hero, /alt="Pražské střechy a historické centrum"/, 'hero alt text must remain unchanged');
  assert.match(hero, /width="\d+"/, 'hero must expose intrinsic width');
  assert.match(hero, /height="\d+"/, 'hero must expose intrinsic height');

  for (const width of widths) {
    for (const ext of ['avif', 'webp', 'jpg']) {
      const path = new URL(`hero-prague-${width}.${ext}`, assetRoot);
      assert.equal(fs.existsSync(path), true, `missing responsive hero asset: hero-prague-${width}.${ext}`);
    }
  }
});
