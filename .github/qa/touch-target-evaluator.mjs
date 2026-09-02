const MIN_TARGET = 24;
const RADIUS = MIN_TARGET / 2;

function isUndersized(target) {
  return target.rect.width < MIN_TARGET || target.rect.height < MIN_TARGET;
}

function isException(target) {
  return Boolean(
    target.inlineException ||
    target.equivalentException ||
    target.userAgentException ||
    target.essentialException
  );
}

function pointRectDistance(x, y, rect) {
  const dx = Math.max(rect.left - x, 0, x - rect.right);
  const dy = Math.max(rect.top - y, 0, y - rect.bottom);
  return Math.hypot(dx, dy);
}

export function evaluateTouchTargets(targets) {
  const normalized = targets.map((target, index) => ({
    ...target,
    index: Number.isInteger(target.index) ? target.index : index,
  }));
  const failures = [];

  for (const target of normalized) {
    if (!isUndersized(target) || isException(target)) continue;

    const cx = (target.rect.left + target.rect.right) / 2;
    const cy = (target.rect.top + target.rect.bottom) / 2;
    const conflicts = [];

    for (const other of normalized) {
      if (other.index === target.index || isException(other)) continue;

      if (isUndersized(other)) {
        const ox = (other.rect.left + other.rect.right) / 2;
        const oy = (other.rect.top + other.rect.bottom) / 2;
        const centerDistance = Math.hypot(cx - ox, cy - oy);
        if (centerDistance < MIN_TARGET) {
          conflicts.push({
            index: other.index,
            text: other.text,
            selector: other.selector,
            distance: Math.round(centerDistance * 100) / 100,
            reason: '24px target circles intersect',
          });
        }
      } else {
        const edgeDistance = pointRectDistance(cx, cy, other.rect);
        if (edgeDistance < RADIUS) {
          conflicts.push({
            index: other.index,
            text: other.text,
            selector: other.selector,
            distance: Math.round(edgeDistance * 100) / 100,
            reason: '24px target circle intersects another target',
          });
        }
      }
    }

    if (conflicts.length) {
      failures.push({
        tag: target.tag,
        text: target.text,
        cls: target.cls,
        selector: target.selector,
        width: Math.round(target.rect.width * 100) / 100,
        height: Math.round(target.rect.height * 100) / 100,
        conflicts: conflicts.slice(0, 8),
      });
    }
  }

  return failures;
}
