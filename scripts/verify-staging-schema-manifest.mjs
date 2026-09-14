/**
 * Verifies generated documentation artefacts only. It does not open a database,
 * load environment credentials, execute SQL, or change any external system.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(repoRoot, "audit", "staging-schema-manifest");
const allowedClassifications = new Set([
  "required_baseline",
  "active_but_ambiguous",
  "compatibility_legacy",
  "superseded_duplicate",
  "needs_migration_chain_repair_first",
]);

function readJson(name) {
  const content = fs.readFileSync(path.join(outputDir, name));
  return JSON.parse(name.endsWith(".gz") ? zlib.gunzipSync(content).toString("utf8") : content.toString("utf8"));
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

const source = readJson("source-schema-manifest.json.gz");
const migration = readJson("migration-artifact-manifest.json");
const ledger = readJson("drift-decision-ledger.json.gz");
const dependency = readJson("foreign-key-dependency-manifest.json");
const readme = fs.readFileSync(path.join(outputDir, "README.md"), "utf8");
const gateCDispositionsPath = path.join(repoRoot, "docs", "staging-schema-reconciliation", "gate-c-runtime-candidate-dispositions.json");
const gateCDispositions = JSON.parse(fs.readFileSync(gateCDispositionsPath, "utf8"));

if (source.declarations.length !== ledger.entries.length) {
  fail(`source declaration count ${source.declarations.length} does not equal ledger count ${ledger.entries.length}`);
}

const sourceIds = new Set(source.declarations.map((entry) => entry.declarationId));
const ledgerIds = new Set(ledger.entries.map((entry) => entry.declarationId));
for (const sourceId of sourceIds) {
  if (!ledgerIds.has(sourceId)) fail(`ledger is missing source declaration ${sourceId}`);
}

for (const entry of ledger.entries) {
  if (!allowedClassifications.has(entry.classification)) {
    fail(`${entry.declarationId} has unsupported classification ${entry.classification}`);
  }
  if (!entry.basis || !entry.action) {
    fail(`${entry.declarationId} lacks a documented basis or next action`);
  }
  const hasDirectRuntimeEvidence = entry.nonTestApplicationEvidence.some((item) => /\[(?:direct|namespace)-schema-import\]$/.test(item));
  const hasVerifiedGateCRuntimePath = entry.gateCCandidateVerification?.status === "verified_current_path" &&
    Array.isArray(entry.gateCCandidateVerification.codePath) &&
    entry.gateCCandidateVerification.codePath.length > 0;
  if (entry.classification === "required_baseline" && !hasDirectRuntimeEvidence && !hasVerifiedGateCRuntimePath) {
    fail(`${entry.declarationId} is required_baseline without direct non-test schema-import evidence or verified Gate C current-code-path evidence`);
  }
  if (entry.classification !== "required_baseline" && hasDirectRuntimeEvidence && entry.classification !== "needs_migration_chain_repair_first" && entry.classification !== "superseded_duplicate") {
    fail(`${entry.declarationId} has direct runtime evidence but an unexplained non-required classification`);
  }
}

for (const candidate of gateCDispositions.candidateTables) {
  const entries = ledger.entries.filter((entry) => entry.tableName === candidate.tableName && entry.dialect === "mysql");
  if (entries.length === 0) {
    fail(`Gate C candidate ${candidate.tableName} is absent from the MySQL ledger`);
    continue;
  }
  for (const entry of entries) {
    if (!entry.gateCCandidateVerification || entry.gateCCandidateVerification.status !== candidate.status) {
      fail(`${entry.declarationId} does not preserve the Gate C disposition for ${candidate.tableName}`);
    }
    if (candidate.status === "verified_current_path" && entry.classification !== "required_baseline") {
      fail(`${entry.declarationId} has verified Gate C current-code-path evidence but is not required_baseline`);
    }
    if (candidate.status !== "verified_current_path" && entry.classification === "required_baseline") {
      fail(`${entry.declarationId} is required_baseline despite Gate C status ${candidate.status}`);
    }
  }
}

const claimCommentsEntries = ledger.entries.filter((entry) => entry.tableName === "claim_comments" && entry.dialect === "mysql");
if (claimCommentsEntries.length === 0) {
  fail("claim_comments is absent from the MySQL ledger");
} else {
  for (const entry of claimCommentsEntries) {
    const claimIdColumn = entry.columns.find((column) => column.logicalName === "claimId");
    if (claimIdColumn?.physicalName !== "claimId" || entry.physicalNameDecision?.columnName !== "claimId") {
      fail(`${entry.declarationId} does not preserve the approved claim_comments.claimId physical contract`);
    }
  }
}

const recomputedCounts = Object.fromEntries(
  [...allowedClassifications].sort().map((classification) => [
    classification,
    ledger.entries.filter((entry) => entry.classification === classification).length,
  ]),
);
for (const [classification, count] of Object.entries(recomputedCounts)) {
  if ((ledger.classifications[classification] ?? 0) !== count) {
    fail(`stored ${classification} count ${ledger.classifications[classification] ?? 0} does not equal recomputed ${count}`);
  }
}

if (source.metadata.sourceCommit !== migration.metadata.sourceCommit || source.metadata.sourceCommit !== ledger.metadata.sourceCommit) {
  fail("source commit differs across manifest artefacts");
}
if (source.metadata.counts.schemaDeclarations !== source.declarations.length) {
  fail("source declaration metadata count differs from source manifest contents");
}
if (source.metadata.counts.testFixtureOnlyDeclarationsExcludedFromSchemaLedger !== source.excludedTestFixtureFactoryCalls.length) {
  fail("test-fixture factory metadata count differs from the excluded test-fixture inventory");
}
if (source.metadata.counts.allRepositoryTableFactoryDeclarationsIncludingTestFixtures !== source.declarations.length + source.excludedTestFixtureFactoryCalls.length) {
  fail("all-repository table-factory count does not equal production schema declarations plus excluded test-fixture calls");
}
if (migration.metadata.counts.migrationSqlArtifacts !== migration.migrations.length) {
  fail("migration artefact metadata count differs from migration manifest contents");
}
if (dependency.metadata.sourceCommit !== source.metadata.sourceCommit) {
  fail("foreign-key dependency manifest source commit differs from the source manifest");
}
if (dependency.summary.configuredMySqlDeclarationsAnalysed !== dependency.entries.length) {
  fail("foreign-key dependency summary count differs from dependency manifest contents");
}
if (!readme.includes("254 source tables is not reproducible") || !readme.includes("221 distinct physical names")) {
  fail("README does not preserve the source-table count reconciliation statement");
}
if (!readme.includes("Gate C candidate verification") || !readme.includes("claimId")) {
  fail("README does not preserve Gate C candidate or claim-comments physical-name decisions");
}

const output = {
  result: process.exitCode ? "failed" : "passed",
  sourceCommit: source.metadata.sourceCommit,
  sourceDeclarations: source.declarations.length,
  mysqlDistinctPhysicalTableNames: source.metadata.counts.mysqlDistinctPhysicalTableNames,
  migrationArtifacts: migration.migrations.length,
  classificationCounts: recomputedCounts,
};
console.log(JSON.stringify(output, null, 2));
if (process.exitCode) process.exit(process.exitCode);
