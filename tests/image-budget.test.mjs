import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const imageDir = fileURLToPath(new URL('../public/assets/images/', import.meta.url));
const maxImageBytes = 700 * 1024;
const maxTotalBytes = 2500 * 1024;

test('public photography stays within the launch performance budget', async () => {
  const files = (await readdir(imageDir)).filter((name) => /\.(?:jpe?g|png|webp|avif)$/i.test(name));
  const sizes = await Promise.all(files.map(async (name) => [name, (await stat(join(imageDir, name))).size]));
  const oversized = sizes.filter(([, size]) => size > maxImageBytes);
  const total = sizes.reduce((sum, [, size]) => sum + size, 0);

  assert.deepEqual(
    oversized,
    [],
    `images over 700 KiB: ${oversized.map(([name, size]) => `${name} (${Math.ceil(size / 1024)} KiB)`).join(', ')}`,
  );
  assert.ok(total <= maxTotalBytes, `public photography is ${Math.ceil(total / 1024)} KiB; budget is 2500 KiB`);
});
