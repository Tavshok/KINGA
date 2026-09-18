import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const argumentsList = process.argv.slice(2);
const writeBaseline = argumentsList.includes("--write-baseline");
const cwdFlag = argumentsList.indexOf("--cwd");
const cwd =
  cwdFlag >= 0 ? resolve(argumentsList[cwdFlag + 1] ?? ".") : process.cwd();
const baselinePath = resolve(cwd, "ci/typecheck-baseline.json");
const reportPath = resolve(cwd, "ci/typecheck-report.json");

function normalizeOutput(value) {
  return value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/gu, "");
}

function normalizeDiagnosticMessage(message) {
  const workspacePath = cwd.replaceAll("\\", "/");
  return message.trim().replaceAll(workspacePath, "<workspace>");
}

function collectDiagnostics(output) {
  const diagnostics = [];
  const pattern = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/gmu;
  for (const match of normalizeOutput(output).matchAll(pattern)) {
    const [, file, line, column, code, message] = match;
    diagnostics.push({
      file: file.replaceAll("\\", "/"),
      line: Number(line),
      column: Number(column),
      code,
      message: normalizeDiagnosticMessage(message),
    });
  }
  return diagnostics.sort((left, right) =>
    diagnosticKey(left).localeCompare(diagnosticKey(right))
  );
}

function diagnosticKey(diagnostic) {
  return [
    diagnostic.file,
    diagnostic.line,
    diagnostic.column,
    diagnostic.code,
    diagnostic.message,
  ].join(":");
}

// TypeScript truncates and reorders large inferred types in diagnostic text.
// The stable identity for a debt-baseline gate is therefore the source location
// plus compiler code. Message-only changes remain visible in the report but do
// not turn an unchanged inherited diagnostic into a false new failure.
function diagnosticIdentity(diagnostic) {
  return [
    diagnostic.file,
    diagnostic.line,
    diagnostic.column,
    diagnostic.code,
  ].join(":");
}

function relocationIdentity(diagnostic) {
  return [diagnostic.file, diagnostic.code, diagnostic.message].join(":");
}

function executeTypecheck() {
  const result = spawnSync("pnpm", ["check"], {
    cwd,
    encoding: "utf8",
    env: process.env,
  });
  if (result.error) throw result.error;
  return {
    exitCode: result.status ?? 1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

function currentRevision() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}

function writeSummary(report) {
  const lines = [
    "## KINGA TypeScript Baseline",
    "",
    "| Metric | Count |",
    "| --- | ---: |",
    `| Baseline diagnostics | ${report.baselineCount} |`,
    `| Current diagnostics | ${report.currentCount} |`,
    `| New diagnostics | ${report.newDiagnostics.length} |`,
    `| Resolved diagnostics | ${report.resolvedDiagnostics.length} |`,
    `| Message-only drift | ${report.messageChanges.length} |`,
    `| Relocated inherited diagnostics | ${report.relocatedDiagnostics.length} |`,
    "",
  ];
  if (report.newDiagnostics.length > 0) {
    lines.push("### New diagnostics", "");
    for (const diagnostic of report.newDiagnostics) {
      lines.push(`- \`${diagnosticKey(diagnostic)}\``);
    }
    lines.push("");
  }
  if (report.resolvedDiagnostics.length > 0) {
    lines.push("### Resolved diagnostics", "");
    for (const diagnostic of report.resolvedDiagnostics) {
      lines.push(`- \`${diagnosticKey(diagnostic)}\``);
    }
    lines.push("");
  }
  if (report.messageChanges.length > 0) {
    lines.push("### Message-only drift", "");
    for (const { current, baseline } of report.messageChanges) {
      lines.push(
        `- \`${diagnosticIdentity(current)}\`: ${baseline.message} → ${current.message}`
      );
    }
    lines.push("");
  }
  if (report.relocatedDiagnostics.length > 0) {
    lines.push("### Relocated inherited diagnostics", "");
    for (const { current, baseline } of report.relocatedDiagnostics) {
      lines.push(
        `- \`${diagnosticIdentity(baseline)}\` → \`${diagnosticIdentity(current)}\``
      );
    }
    lines.push("");
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`, {
      flag: "a",
    });
  }
}

const typecheck = executeTypecheck();
const diagnostics = collectDiagnostics(typecheck.output);

if (diagnostics.length === 0 && typecheck.exitCode !== 0) {
  throw new Error(
    "TypeScript exited unsuccessfully but no standard diagnostics could be parsed; refusing to hide an unclassified failure."
  );
}

if (writeBaseline) {
  const baseline = {
    generatedFromCommit: process.env.GITHUB_SHA ?? currentRevision(),
    generatedAt: new Date().toISOString(),
    diagnostics,
  };
  mkdirSync(resolve(cwd, "ci"), { recursive: true });
  writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(
    `Wrote ${diagnostics.length} TypeScript diagnostics to ${baselinePath}`
  );
  process.exit(0);
}

if (!existsSync(baselinePath)) {
  throw new Error(`Missing committed TypeScript baseline: ${baselinePath}`);
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
if (!Array.isArray(baseline.diagnostics)) {
  throw new Error(`Invalid TypeScript baseline: ${baselinePath}`);
}

const baselineByIdentity = new Map(
  baseline.diagnostics.map(diagnostic => [
    diagnosticIdentity(diagnostic),
    diagnostic,
  ])
);
const currentByIdentity = new Map(
  diagnostics.map(diagnostic => [diagnosticIdentity(diagnostic), diagnostic])
);
const unmatchedBaseline = baseline.diagnostics.filter(
  diagnostic => !currentByIdentity.has(diagnosticIdentity(diagnostic))
);
const unmatchedCurrent = diagnostics.filter(
  diagnostic => !baselineByIdentity.has(diagnosticIdentity(diagnostic))
);
const unmatchedBaselineByRelocation = new Map();
for (const diagnostic of unmatchedBaseline) {
  const key = relocationIdentity(diagnostic);
  const matches = unmatchedBaselineByRelocation.get(key) ?? [];
  matches.push(diagnostic);
  unmatchedBaselineByRelocation.set(key, matches);
}
const relocatedDiagnostics = [];
const newDiagnostics = [];
for (const diagnostic of unmatchedCurrent) {
  const matches = unmatchedBaselineByRelocation.get(
    relocationIdentity(diagnostic)
  );
  const baselineDiagnostic = matches?.shift();
  if (baselineDiagnostic) {
    relocatedDiagnostics.push({
      baseline: baselineDiagnostic,
      current: diagnostic,
    });
  } else {
    newDiagnostics.push(diagnostic);
  }
}
const resolvedDiagnostics = [...unmatchedBaselineByRelocation.values()].flat();
const report = {
  baselineCount: baseline.diagnostics.length,
  currentCount: diagnostics.length,
  typecheckExitCode: typecheck.exitCode,
  newDiagnostics,
  resolvedDiagnostics,
  relocatedDiagnostics,
  messageChanges: diagnostics
    .filter(diagnostic => {
      const baselineDiagnostic = baselineByIdentity.get(
        diagnosticIdentity(diagnostic)
      );
      return (
        baselineDiagnostic && baselineDiagnostic.message !== diagnostic.message
      );
    })
    .map(current => ({
      baseline: baselineByIdentity.get(diagnosticIdentity(current)),
      current,
    })),
};

writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
writeSummary(report);
console.log(
  JSON.stringify({
    baseline: report.baselineCount,
    current: report.currentCount,
    new: report.newDiagnostics.length,
    resolved: report.resolvedDiagnostics.length,
  })
);

if (report.newDiagnostics.length > 0) {
  process.exit(1);
}
