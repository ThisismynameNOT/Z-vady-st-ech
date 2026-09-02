import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTouchTargets } from '../.github/qa/touch-target-evaluator.mjs';

const target = (index, left, top, width, height, extra = {}) => ({
  index,
  tag: extra.tag || 'BUTTON',
  text: extra.text || `target-${index}`,
  cls: extra.cls || '',
  inlineException: Boolean(extra.inlineException),
  rect: { left, top, right: left + width, bottom: top + height, width, height },
});

test('a standalone target at least 24px is not rejected merely for being below 44px', () => {
  const failures = evaluateTouchTargets([target(0, 0, 0, 30, 30)]);
  assert.equal(failures.length, 0);
});

test('an undersized isolated target passes the WCAG 2.2 spacing alternative', () => {
  const failures = evaluateTouchTargets([
    target(0, 0, 0, 18, 18),
    target(1, 80, 0, 30, 30),
  ]);
  assert.equal(failures.length, 0);
});

test('undersized crowded targets fail when their 24px target circles intersect', () => {
  const failures = evaluateTouchTargets([
    target(0, 0, 0, 18, 18),
    target(1, 12, 0, 18, 18),
  ]);
  assert.equal(failures.length, 2);
});

test('an inline text link is not treated as a standalone target-size failure', () => {
  const failures = evaluateTouchTargets([
    target(0, 0, 0, 16, 16, { tag: 'A', text: 'inline link', inlineException: true }),
  ]);
  assert.equal(failures.length, 0);
});
