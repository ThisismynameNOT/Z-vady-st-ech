export function evaluateTouchTargets(targets) {
  return targets
    .filter((target) => target.rect.width < 44 || target.rect.height < 44)
    .map((target) => ({
      ...target,
      reason: 'rendered target is smaller than 44x44 CSS px',
    }));
}
