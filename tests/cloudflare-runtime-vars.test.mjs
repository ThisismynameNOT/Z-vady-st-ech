import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Wrangler preserves dashboard runtime vars and declares required production bindings', () => {
  const source = fs.readFileSync('wrangler.jsonc', 'utf8');

  assert.match(source, /"keep_vars"\s*:\s*true/);
  assert.match(source, /"PUBLIC_TINA_CLIENT_ID"\s*:\s*"[^"]+"/);
  assert.match(source, /"PUBLIC_CLOUDINARY_CLOUD_NAME"\s*:\s*"tq5ifejn"/);
  assert.match(source, /"secrets"\s*:\s*\{[\s\S]*"required"\s*:\s*\[[\s\S]*"CLOUDINARY_API_KEY"[\s\S]*"CLOUDINARY_API_SECRET"[\s\S]*\]/);
});
