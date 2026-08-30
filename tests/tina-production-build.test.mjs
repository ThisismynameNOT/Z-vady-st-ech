import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

test('production Tina build avoids the local datalayer startup race', () => {
  assert.equal(packageJson.scripts.build, 'tinacms build -c "astro build"');
  assert.doesNotMatch(packageJson.scripts.build, /--content=local/);
  assert.equal(packageJson.scripts['build:local'], 'tinacms build --local --skip-cloud-checks && astro build');
});
