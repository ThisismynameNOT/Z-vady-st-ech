import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = [
  fs.readFileSync(new URL('../src/styles/site.css', import.meta.url), 'utf8'),
  fs.readFileSync(new URL('../src/styles/accessibility.css', import.meta.url), 'utf8'),
].join('\n');

test('breadcrumb links have a non-color visual distinction from surrounding text', () => {
  const rule = css.match(/\.breadcrumbs\s+a\s*\{([^}]*)\}/g)?.at(-1) || '';
  assert.ok(rule, 'missing .breadcrumbs a styling');
  assert.match(rule, /text-decoration(?:-line)?:\s*underline/, 'breadcrumb links must be underlined so distinction does not rely on color alone');
});
