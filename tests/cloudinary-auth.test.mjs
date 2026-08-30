import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Tina media auth follows TinaCloud verified-user semantics', () => {
  const source = fs.readFileSync('src/lib/cloudinary.ts', 'utf8');

  assert.match(source, /const\s+user\s*=\s*await\s+isUserAuthorized\s*\(/);
  assert.match(source, /return\s+Boolean\(user\?\.verified\)/);
  assert.doesNotMatch(source, /\.enabled/);
});
