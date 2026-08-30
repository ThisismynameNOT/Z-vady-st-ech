import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Tina media auth treats isUserAuthorized as the authorization result', () => {
  const source = fs.readFileSync('src/lib/cloudinary.ts', 'utf8');

  assert.match(source, /const\s+authorized\s*=\s*await\s+isUserAuthorized\s*\(/);
  assert.match(source, /return\s+Boolean\(authorized\)/);
  assert.doesNotMatch(source, /\.verified\s*&&\s*\w+\.enabled/);
});
