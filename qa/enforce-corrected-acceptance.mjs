import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('qa-results');
const reportPath = path.join(OUT, 'report.json');
const correctedPath = path.join(OUT, 'corrected-font-targets.json');

if (!fs.existsSync(reportPath) || !fs.existsSync(correctedPath)) {
  console.error('Required QA evidence is missing.');
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const corrected = JSON.parse(fs.readFileSync(correctedPath, 'utf8'));
const originalEffectiveFailures = (report.failures || []).filter(failure => !/^(fonts|targets):/.test(failure.scope || ''));
const effectiveFailures = [...originalEffectiveFailures, ...(corrected.failures || [])];
const axeIds = [...new Set((report.axe || []).flatMap(entry => entry.violations || []).map(violation => violation.id))];
const homeMobile = (report.lighthouse || []).filter(run => /^home-mobile-/.test(run.name));
const homeMobilePerformance = homeMobile.map(run => run.scores?.performance).filter(Number.isFinite);
const homeMobileLcp = homeMobile.map(run => run.lcpSeconds).filter(Number.isFinite).sort((a, b) => a - b);
const medianLcp = homeMobileLcp.length ? homeMobileLcp[Math.floor(homeMobileLcp.length / 2)] : null;
const headingOrderFailures = (report.lighthouse || []).filter(run => run.auditFindings?.['heading-order']?.score === 0).map(run => run.name);

const summary = {
  generatedAt: new Date().toISOString(),
  base: report.base,
  originalFailureCount: (report.failures || []).length,
  ignoredHarnessFalsePositiveCount: (report.failures || []).length - originalEffectiveFailures.length,
  correctedFontTargetFailures: (corrected.failures || []).length,
  effectiveFailureCount: effectiveFailures.length,
  axeViolationIds: axeIds,
  colorContrastCleared: !axeIds.includes('color-contrast'),
  linkInTextBlockRemains: axeIds.includes('link-in-text-block'),
  headingOrderFailureRuns: headingOrderFailures,
  homepageMobilePerformanceScores: homeMobilePerformance,
  homepageMobileLcpSeconds: homeMobileLcp,
  homepageMobileMedianLcpSeconds: medianLcp,
  effectiveFailures,
};

fs.writeFileSync(path.join(OUT, 'corrected-summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (effectiveFailures.length) process.exit(1);
