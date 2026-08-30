import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isAllowedFormOrigin } from '../src/lib/security.mjs';

const workerOrigin = 'https://zavady-strech-praha.example.workers.dev';

test('form origin accepts the configured deployment origin', () => {
  assert.equal(isAllowedFormOrigin(workerOrigin, workerOrigin), true);
});

test('form origin accepts exact localhost development origins', () => {
  assert.equal(isAllowedFormOrigin('http://localhost:4321', workerOrigin), true);
  assert.equal(isAllowedFormOrigin('http://127.0.0.1:4321', workerOrigin), true);
});

test('form origin rejects deceptive hostnames containing localhost', () => {
  assert.equal(
    isAllowedFormOrigin('https://localhost.attacker.example', workerOrigin),
    false,
  );
  assert.equal(
    isAllowedFormOrigin('https://attacker.example/localhost', workerOrigin),
    false,
  );
});

test('missing Origin remains allowed for non-browser/server clients', () => {
  assert.equal(isAllowedFormOrigin(null, workerOrigin), true);
});

test('enquiry endpoint uses the strict origin guard', () => {
  const source = fs.readFileSync('src/pages/api/enquiry.ts', 'utf8');
  assert.ok(source.includes('isAllowedFormOrigin'));
  assert.equal(source.includes("origin.includes('localhost')"), false);
});

test('enquiry endpoint falls back to the actual Worker request origin', () => {
  const source = fs.readFileSync('src/pages/api/enquiry.ts', 'utf8');
  assert.ok(source.includes('new URL(request.url).origin'));
});
