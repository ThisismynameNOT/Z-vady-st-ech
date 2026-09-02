import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const helper = path.join(repoRoot, '.github', 'qa', 'lighthouse-retry.sh');

function runScenario(scenario, maxAttempts = 3) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'lighthouse-retry-'));
  const stateFile = path.join(dir, 'attempts.txt');
  const outputFile = path.join(dir, 'result.json');
  const runner = path.join(dir, 'fake-lighthouse.mjs');

  writeFileSync(runner, `
    import fs from 'node:fs';
    const stateFile = process.env.STATE_FILE;
    const outputFile = process.env.OUTPUT_FILE;
    const scenario = process.env.SCENARIO;
    const attempt = fs.existsSync(stateFile) ? Number(fs.readFileSync(stateFile, 'utf8')) + 1 : 1;
    fs.writeFileSync(stateFile, String(attempt));

    if (scenario === 'success-first') {
      fs.writeFileSync(outputFile, JSON.stringify({ attempt }));
      process.exit(0);
    }

    if (scenario === 'transient-then-success') {
      if (attempt === 1) {
        console.error('Runtime error encountered: Something went wrong with recording the trace over your page load. Please run Lighthouse again. (NO_NAVSTART)');
        process.exit(1);
      }
      fs.writeFileSync(outputFile, JSON.stringify({ attempt }));
      process.exit(0);
    }

    if (scenario === 'transient-always') {
      fs.writeFileSync(outputFile, '{partial');
      console.error('Runtime error encountered: Something went wrong with recording the trace over your page load. Please run Lighthouse again. (NO_NAVSTART)');
      process.exit(1);
    }

    console.error('Lighthouse configuration failure: invalid audit category');
    process.exit(2);
  `);

  const result = spawnSync('bash', [helper, outputFile, process.execPath, runner], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      LIGHTHOUSE_MAX_ATTEMPTS: String(maxAttempts),
      STATE_FILE: stateFile,
      OUTPUT_FILE: outputFile,
      SCENARIO: scenario,
    },
  });

  const attempts = existsSync(stateFile) ? Number(readFileSync(stateFile, 'utf8')) : 0;
  const outputExists = existsSync(outputFile);
  const output = outputExists ? readFileSync(outputFile, 'utf8') : null;
  rmSync(dir, { recursive: true, force: true });

  return { ...result, attempts, outputExists, output };
}

test('Lighthouse measurement succeeds on the first successful attempt', () => {
  const result = runScenario('success-first');
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.attempts, 1);
  assert.equal(result.outputExists, true);
  assert.deepEqual(JSON.parse(result.output), { attempt: 1 });
});

test('Lighthouse measurement retries NO_NAVSTART and succeeds when the retry succeeds', () => {
  const result = runScenario('transient-then-success');
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.attempts, 2);
  assert.equal(result.outputExists, true);
  assert.deepEqual(JSON.parse(result.output), { attempt: 2 });
  assert.match(result.stdout + result.stderr, /transient.*retry/i);
});

test('Lighthouse measurement fails after exhausting transient retry attempts', () => {
  const result = runScenario('transient-always', 3);
  assert.notEqual(result.status, 0);
  assert.equal(result.attempts, 3);
  assert.equal(result.outputExists, false, 'failed measurements must not leave a partial JSON artifact');
});

test('Lighthouse measurement does not retry ordinary non-transient failures', () => {
  const result = runScenario('non-transient', 3);
  assert.equal(result.status, 2);
  assert.equal(result.attempts, 1);
  assert.equal(result.outputExists, false);
  assert.doesNotMatch(result.stdout + result.stderr, /transient.*retry/i);
});
