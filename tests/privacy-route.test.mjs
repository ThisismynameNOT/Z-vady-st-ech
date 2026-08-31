import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const route = fs.readFileSync(path.join(root, 'src/pages/ochrana-osobnich-udaju.astro'), 'utf8');
const privacy = JSON.parse(fs.readFileSync(path.join(root, 'content/pages/privacy.json'), 'utf8'));

test('privacy route resolves the CMS page by its actual slug', () => {
  assert.equal(privacy.slug, 'ochrana-osobnich-udaju');
  assert.match(route, /getPage\(['"]ochrana-osobnich-udaju['"]\)/);
});
