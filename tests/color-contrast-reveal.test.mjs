import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const siteCss = fs.readFileSync(new URL('../src/styles/site.css', import.meta.url), 'utf8');
const accessibilityCss = fs.readFileSync(new URL('../src/styles/accessibility.css', import.meta.url), 'utf8');
const cssInLoadOrder = `${siteCss}\n${accessibilityCss}`;

// Exact route/viewport combinations from the final production acceptance run
// that produced the 67 axe color-contrast nodes at the early reveal snapshot.
const acceptanceFailingCombinations = [
  [320, '/firma/'],
  [320, '/realizace/'],
  [375, '/'],
  [375, '/firma/'],
  [375, '/realizace/'],
  [390, '/'],
  [390, '/firma/'],
  [390, '/realizace/'],
  [430, '/'],
  [430, '/firma/'],
  [430, '/sluzby/'],
  [430, '/realizace/'],
  [768, '/'],
  [768, '/firma/'],
  [768, '/realizace/'],
  [1024, '/'],
  [1024, '/firma/'],
  [1024, '/realizace/'],
  [1440, '/'],
  [1440, '/firma/'],
  [1440, '/realizace/'],
  [1920, '/'],
  [1920, '/firma/'],
  [1920, '/realizace/'],
];

test('color-contrast regression fixture preserves all 24 failing acceptance combinations', () => {
  assert.equal(acceptanceFailingCombinations.length, 24);
  assert.deepEqual([...new Set(acceptanceFailingCombinations.map(([width]) => width))], [320, 375, 390, 430, 768, 1024, 1440, 1920]);
  assert.deepEqual([...new Set(acceptanceFailingCombinations.map(([, route]) => route))].sort(), ['/', '/firma/', '/realizace/', '/sluzby/']);
});

test('effective reveal motion must not transition opacity through low-contrast intermediate states', () => {
  const baseReveal = siteCss.match(/\.reveal\{([^}]*)\}/);
  const visible = siteCss.match(/\.reveal\.visible\{([^}]*)\}/);
  assert.ok(baseReveal, 'site.css must contain the base .reveal rule');
  assert.ok(visible, 'site.css must contain the .reveal.visible rule');

  // Preserve the approved hidden pre-reveal state and 18px vertical motion.
  assert.match(baseReveal[1], /(?:^|;)opacity:0(?:;|$)/, '.reveal must remain hidden before it is revealed');
  assert.match(baseReveal[1], /(?:^|;)transform:translateY\(18px\)(?:;|$)/, '.reveal must preserve the approved vertical offset');
  assert.match(visible[1], /(?:^|;)opacity:1(?:;|$)/, '.reveal.visible must become fully opaque');
  assert.match(visible[1], /(?:^|;)transform:none(?:;|$)/, '.reveal.visible must finish the vertical motion');

  // BaseLayout imports site.css and then accessibility.css. Resolve the last
  // transition declaration applying to .reveal in that same cascade order.
  const revealRules = [...cssInLoadOrder.matchAll(/\.reveal\{([^}]*)\}/g)];
  const transition = revealRules
    .map(match => match[1].match(/(?:^|;)transition:([^;}]*)/)?.[1]?.trim())
    .filter(Boolean)
    .at(-1) || '';

  assert.equal(
    transition,
    'transform .7s ease',
    `expected effective reveal transition to animate transform only; got ${JSON.stringify(transition)}. ` +
      `Animating opacity reproduces axe color-contrast failures in ${acceptanceFailingCombinations.length} route/viewport combinations.`,
  );
});
