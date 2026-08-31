import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../src/styles/site.css', import.meta.url), 'utf8');

function variable(name) {
  const match = css.match(new RegExp(`${name}:(#[0-9a-fA-F]{6})`));
  assert.ok(match, `missing ${name} color token`);
  return match[1];
}

function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map(part => Number.parseInt(part, 16) / 255);
  const linear = rgb.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(a, b) {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

test('muted and brass small text meet WCAG AA on public light surfaces', () => {
  const ivory = variable('--ivory');
  const paper = variable('--paper');
  const muted = variable('--muted');
  const brass = variable('--brass');

  for (const [label, foreground, background] of [
    ['muted on ivory', muted, ivory],
    ['muted on paper', muted, paper],
    ['brass on ivory', brass, ivory],
    ['brass on paper', brass, paper],
  ]) {
    assert.ok(
      contrast(foreground, background) >= 4.5,
      `${label} must be at least 4.5:1; got ${contrast(foreground, background).toFixed(2)}:1`,
    );
  }
});
