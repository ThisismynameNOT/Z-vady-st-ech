import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedFormOrigin } from '../src/lib/security.mjs';

test('form origin accepts the configured production origin', () => {
  assert.equal(
    isAllowedFormOrigin('https://zavadystrech.cz', 'https://zavadystrech.cz'),
    true,
  );
});

test('form origin accepts exact localhost development origins', () => {
  assert.equal(
    isAllowedFormOrigin('http://localhost:4321', 'https://zavadystrech.cz'),
    true,
  );
  assert.equal(
    isAllowedFormOrigin('http://127.0.0.1:4321', 'https://zavadystrech.cz'),
    true,
  );
});

test('form origin rejects deceptive hostnames containing localhost', () => {
  assert.equal(
    isAllowedFormOrigin('https://localhost.attacker.example', 'https://zavadystrech.cz'),
    false,
  );
  assert.equal(
    isAllowedFormOrigin('https://attacker.example/localhost', 'https://zavadystrech.cz'),
    false,
  );
});

test('missing Origin remains allowed for non-browser/server clients', () => {
  assert.equal(isAllowedFormOrigin(null, 'https://zavadystrech.cz'), true);
});
