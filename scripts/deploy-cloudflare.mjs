import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const requiredSecrets = ['CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
const missing = requiredSecrets.filter((name) => !process.env[name]);

if (missing.length) {
  console.error(`Missing Cloudflare build secrets: ${missing.join(', ')}`);
  process.exit(1);
}

const secretValues = Object.fromEntries(
  requiredSecrets.map((name) => [name, process.env[name]]),
);
const tempDir = await mkdtemp(join(tmpdir(), 'zavady-strech-secrets-'));
const secretsFile = join(tempDir, 'worker-secrets.json');

try {
  await writeFile(secretsFile, JSON.stringify(secretValues), { mode: 0o600 });

  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const child = spawn(
    npx,
    ['wrangler', 'deploy', '--secrets-file', secretsFile],
    { stdio: 'inherit', env: process.env },
  );

  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });

  if (exitCode !== 0) {
    process.exitCode = typeof exitCode === 'number' ? exitCode : 1;
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
