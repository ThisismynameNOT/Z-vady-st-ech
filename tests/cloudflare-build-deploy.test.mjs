import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

test('Cloudflare deploy script promotes build secrets into Worker runtime', () => {
  assert.equal(packageJson.scripts.deploy, 'node scripts/deploy-cloudflare.mjs');
  assert.equal(fs.existsSync('scripts/deploy-cloudflare.mjs'), true);

  const source = fs.readFileSync('scripts/deploy-cloudflare.mjs', 'utf8');
  assert.match(source, /CLOUDINARY_API_KEY/);
  assert.match(source, /CLOUDINARY_API_SECRET/);
  assert.match(source, /--secrets-file/);
  assert.match(source, /wrangler/);
  assert.match(source, /rm\(/);
  assert.doesNotMatch(source, /console\.log\([^)]*CLOUDINARY_API_(?:KEY|SECRET)/);
});
