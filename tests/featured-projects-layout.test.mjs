import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const renderer = fs.readFileSync(path.join(root, 'src/components/sections/SectionRenderer.astro'), 'utf8');

test('featured projects use one lead card plus a stacked secondary column', () => {
  assert.match(renderer, /class="projects-grid reveal"/);
  assert.match(renderer, /class="project-stack"/);
  assert.match(renderer, /featuredProjects\.slice\(1\)/);
});
