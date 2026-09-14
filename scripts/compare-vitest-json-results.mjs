#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function fail(message) {
  throw new Error(`[compare-vitest-json-results] ${message}`);
}

function readResults(filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!Array.isArray(parsed.testResults)) fail(`${filePath} has no Vitest testResults array`);
  const failures = [];
  for (const result of parsed.testResults) {
    for (const assertion of result.assertionResults ?? []) {
      if (assertion.status !== "failed") continue;
      const hierarchy = [...(assertion.ancestorTitles ?? []), assertion.title].filter(Boolean).join(" > ");
      failures.push(`${path.basename(result.name)} > ${hierarchy}`);
    }
  }
  return {
    aggregate: {
      failedFiles: parsed.numFailedTestSuites,
      failedTests: parsed.numFailedTests,
      passedTests: parsed.numPassedTests,
      skippedTests: parsed.numPendingTests,
      totalFiles: parsed.numTotalTestSuites,
      totalTests: parsed.numTotalTests,
      success: parsed.success,
    },
    failures: [...new Set(failures)].sort(),
  };
}

const [branchPath, basePath, outputPath] = process.argv.slice(2);
if (!branchPath || !basePath || !outputPath) fail("usage: node scripts/compare-vitest-json-results.mjs <branch.json> <base.json> <out.json>");

const branch = readResults(branchPath);
const base = readResults(basePath);
const branchSet = new Set(branch.failures);
const baseSet = new Set(base.failures);
const report = {
  branch: branch.aggregate,
  base: base.aggregate,
  branchOnlyFailures: branch.failures.filter((failure) => !baseSet.has(failure)),
  baseOnlyFailures: base.failures.filter((failure) => !branchSet.has(failure)),
  commonFailures: branch.failures.filter((failure) => baseSet.has(failure)),
};
report.failureSetsMatch = report.branchOnlyFailures.length === 0 && report.baseOnlyFailures.length === 0;
fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({
  branch: report.branch,
  base: report.base,
  branchOnlyFailureCount: report.branchOnlyFailures.length,
  baseOnlyFailureCount: report.baseOnlyFailures.length,
  commonFailureCount: report.commonFailures.length,
  failureSetsMatch: report.failureSetsMatch,
}, null, 2)}\n`);
