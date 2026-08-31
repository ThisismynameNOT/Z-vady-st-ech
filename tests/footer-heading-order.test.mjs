import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const footer = fs.readFileSync(new URL('../src/components/layout/Footer.astro', import.meta.url), 'utf8');
const css = [
  fs.readFileSync(new URL('../src/styles/site.css', import.meta.url), 'utf8'),
  fs.readFileSync(new URL('../src/styles/accessibility.css', import.meta.url), 'utf8'),
].join('\n');

const expectedVisualRule = 'color:#fff;font-family:var(--serif);font-size:23px;font-weight:500;margin:0 0 12px';

test('footer headings use h2 semantics while preserving the existing visual rule', () => {
  const h2Headings = [...footer.matchAll(/<h2>(.*?)<\/h2>/g)].map(match => match[1]);

  assert.equal(h2Headings.length, 3, 'footer must expose exactly three h2 section headings');
  assert.deepEqual(h2Headings, ['{company.legalName}', 'Navigace', 'Kontakt']);
  assert.doesNotMatch(footer, /<h4>/, 'footer must not skip directly to h4 headings');

  const h2Rules = [...css.matchAll(/\.footer h2\{([^}]*)\}/g)];
  const effectiveH2Rule = h2Rules.at(-1)?.[1] || '';
  assert.equal(effectiveH2Rule, expectedVisualRule, 'footer h2 styling must preserve the previous h4 appearance exactly');
});
