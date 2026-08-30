import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Wrangler preserves dashboard runtime vars and declares the Tina client ID', () => {
  const source = fs.readFileSync('wrangler.jsonc', 'utf8');

  assert.match(source, /"keep_vars"\s*:\s*true/);
  assert.match(source, /"PUBLIC_TINA_CLIENT_ID"\s*:\s*"[^"]+"/);
});
