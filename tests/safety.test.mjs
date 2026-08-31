import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const all = fs
  .readdirSync(path.join(root, 'content/pages'))
  .map((file) => fs.readFileSync(path.join(root, 'content/pages', file), 'utf8'))
  .join('\n');

test('public copy has no internal design commentary', () => {
  for (const text of [
    'Web stavíme kolem',
    'Na hlavní stránce jen orientace',
    'Proč samostatná stránka',
  ]) {
    assert.ok(!all.includes(text), text);
  }
});

test('public copy has no internal pre-launch notes', () => {
  for (const text of [
    'před ostrým spuštěním',
    'provozní informace k formuláři',
  ]) {
    assert.ok(!all.includes(text), text);
  }
});

test('no invented high-risk trust claims', () => {
  for (const text of [
    '24/7',
    'garantovaná doba reakce',
    'pojištění odpovědnosti 10',
    'záruka 10 let',
    '100 % spokojenost',
  ]) {
    assert.ok(!all.includes(text), text);
  }
});

test('env example contains no secrets', () => {
  const env = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  assert.ok(!/=[A-Za-z0-9_\-]{16,}/.test(env));
});

test('form endpoint has rate limit and honeypot validation', () => {
  const api = fs.readFileSync(path.join(root, 'src/pages/api/enquiry.ts'), 'utf8');
  const ui = fs.readFileSync(
    path.join(root, 'src/components/sections/ContactForm.astro'),
    'utf8',
  );
  assert.ok(api.includes('FORM_RATE_LIMITER'));
  assert.ok(ui.includes('companyWebsite'));
  assert.ok(api.includes('validateEnquiry'));
});

test('credential-free local CMS build skips TinaCloud checks', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts['build:local'].includes('--skip-cloud-checks'));
});

test('production deployment is Cloudflare-only and migration scaffolding is gone', () => {
  const workflowDir = path.join(root, '.github/workflows');
  const workflows = fs.readdirSync(workflowDir);
  assert.ok(workflows.includes('deploy-cloudflare.yml'));

  for (const legacy of [
    'apply-cms-migration.yml',
    'deploy-conversion.yml',
    'deploy-heritage-pages-v2.yml',
    'deploy-heritage-pages.yml',
    'deploy-production.yml',
    'fix-dependency-lock.yml',
  ]) {
    assert.ok(!workflows.includes(legacy), legacy);
  }

  for (const legacyDir of [
    '.migration',
    '.conversion',
    '.conversion-src',
    '.deploy',
    '.production',
  ]) {
    assert.equal(fs.existsSync(path.join(root, legacyDir)), false, legacyDir);
  }

  const deployment = fs.readFileSync(
    path.join(workflowDir, 'deploy-cloudflare.yml'),
    'utf8',
  );
  assert.ok(deployment.includes('wrangler deploy'));
  assert.ok(deployment.includes('main'));
  assert.ok(!deployment.includes('actions/deploy-pages'));
});

test('CI blocks high-severity production dependency vulnerabilities', () => {
  const ci = fs.readFileSync(
    path.join(root, '.github/workflows/cms-platform-ci.yml'),
    'utf8',
  );
  assert.ok(ci.includes('npm audit --omit=dev --audit-level=high'));
});

test('repo does not assume an unowned custom domain', () => {
  const files = [
    '.env.example',
    'astro.config.mjs',
    'content/settings/site/site.json',
    'src/layouts/BaseLayout.astro',
    'src/pages/api/enquiry.ts',
    'src/pages/robots.txt.ts',
    'src/pages/sitemap.xml.ts',
    'wrangler.jsonc',
    '.github/workflows/cms-platform-ci.yml',
    '.github/workflows/deploy-cloudflare.yml',
  ];
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.equal(source.includes('zavadystrech.cz'), false, file);
  }
});

test('Tina detects Cloudflare Workers build branches', () => {
  const tina = fs.readFileSync(path.join(root, 'tina/config.ts'), 'utf8');
  assert.ok(tina.includes('process.env.WORKERS_CI_BRANCH'));
});

test('Tina lock file is committed for TinaCloud indexing', () => {
  assert.equal(fs.existsSync(path.join(root, 'tina/tina-lock.json')), true);
});

test('unused Astro sessions are disabled to avoid unnecessary KV provisioning', () => {
  const astro = fs.readFileSync(path.join(root, 'astro.config.mjs'), 'utf8');
  assert.match(astro, /session\s*:\s*false/);
});

test('Astro does not provision an unused Cloudflare Images binding', () => {
  const astro = fs.readFileSync(path.join(root, 'astro.config.mjs'), 'utf8');
  assert.match(astro, /imageService\s*:\s*['"]passthrough['"]/);
});
