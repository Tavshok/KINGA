/**
 * Produces Gate C planning evidence only. It reads the committed source manifest,
 * Gate B evidence and Gate C candidate dispositions. It never opens a database,
 * invokes Drizzle, generates SQL or changes any environment.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(repoRoot, file), "utf8"));
const readGzipJson = (file) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(repoRoot, file))).toString("utf8"));
const outputPath = path.join(repoRoot, "audit", "gate-c-scratch-baseline", "wave-plan.json");

const ledger = readGzipJson("audit/staging-schema-manifest/drift-decision-ledger.json.gz");
const dependencyManifest = readJson("audit/staging-schema-manifest/foreign-key-dependency-manifest.json");
const candidateDispositions = readJson("docs/staging-schema-reconciliation/gate-c-runtime-candidate-dispositions.json");
const gateBCoreEvidence = readJson("audit/gate-b-scratch-evidence/run-a/core-evidence.json");
const claimCommentsContractEvidence = readJson("audit/gate-c-scratch-baseline/claim-comments-physical-contract-replay.json");

const gateBReplayProven = new Set([
  "claims",
  "ai_assessments",
  "claim_comments",
  "governance_notifications",
  "rate_limit_tracking",
]);
const candidateByTable = new Map(candidateDispositions.candidateTables.map((candidate) => [candidate.tableName, candidate]));
const heldCandidateTables = new Set(candidateDispositions.candidateTables
  .filter((candidate) => candidate.status !== "verified_current_path")
  .map((candidate) => candidate.tableName));

if (!gateBCoreEvidence.pass || gateBCoreEvidence.expectedJournalEntryCount !== 61 || gateBCoreEvidence.actualJournalEntryCount !== 61) {
  throw new Error("Gate B replay evidence is absent or incomplete; no repair-first table may enter a Gate C plan.");
}
if (!claimCommentsContractEvidence.result || claimCommentsContractEvidence.result !== "passed" || !claimCommentsContractEvidence.claimComments?.hasClaimId || claimCommentsContractEvidence.claimComments?.hasClaimUnderscoreId) {
  throw new Error("The approved claim_comments.claimId scratch-contract evidence is absent or incomplete; claim_comments must remain held.");
}

function proposedWave(tableName) {
  if (/^(users|tenants|roles|permissions|user_roles|role_permissions|tenant_roles|tenant_config|tenant_members|tenant_users|tenant_settings|tenant_features|tenant_domains|tenant_invitations|tenant_audit_log)$/.test(tableName)) return 1;
  if (/^(claims|policies|vehicles|drivers|vehicle_|measurement_|geometry_|insurance_|claimants|claim_documents|claim_status|claim_assignments)/.test(tableName)) return 2;
  if (/(assessment|damage|evidence|report|quote|fraud|physics|cost|document|photo|extraction|decision|adjuster|currency|repair|market|ai_)/.test(tableName)) return 3;
  if (/(agency|fleet|panel|engineer|inspection|notification|comment|workflow|task|marketplace|invite|client|service_request|rate_limit|governance)/.test(tableName)) return 4;
  return 5;
}

const mysqlEntries = ledger.entries.filter((entry) => entry.dialect === "mysql");
const primaryByTable = new Map();
for (const entry of mysqlEntries) {
  const current = primaryByTable.get(entry.tableName);
  if (!current || entry.sourceFile === "drizzle/schema.ts") primaryByTable.set(entry.tableName, entry);
}

const selectedTables = new Set();
const selectedReasons = new Map();
for (const entry of primaryByTable.values()) {
  if (heldCandidateTables.has(entry.tableName)) continue;
  if (entry.classification === "required_baseline") {
    selectedTables.add(entry.tableName);
    selectedReasons.set(entry.tableName, entry.gateCCandidateVerification
      ? "verified_gate_c_current_runtime_path"
      : "direct_non_test_schema_import_evidence");
  }
  if (gateBReplayProven.has(entry.tableName)) {
    selectedTables.add(entry.tableName);
    selectedReasons.set(entry.tableName, "gate_b_immutable_replay_proven");
  }
}

const dependenciesByTable = new Map(dependencyManifest.entries.map((entry) => [
  entry.tableName,
  entry.dependencies
    .filter((dependency) => dependency.resolution === "resolved_to_configured_mysql_schema" && dependency.tableName)
    .map((dependency) => dependency.tableName),
]));

const waveByTable = new Map([...selectedTables].map((tableName) => [tableName, proposedWave(tableName)]));
const promotedDependencies = [];
let changed = true;
while (changed) {
  changed = false;
  for (const tableName of selectedTables) {
    const currentWave = waveByTable.get(tableName);
    for (const dependency of dependenciesByTable.get(tableName) ?? []) {
      if (!selectedTables.has(dependency)) {
        throw new Error(`${tableName} depends on excluded or unverified table ${dependency}; baseline generation must stop for manual resolution.`);
      }
      const dependencyWave = waveByTable.get(dependency);
      if (dependencyWave > currentWave) {
        waveByTable.set(dependency, currentWave);
        promotedDependencies.push({ dependency, requiredBy: tableName, fromWave: dependencyWave, toWave: currentWave });
        changed = true;
      }
    }
  }
}

const waves = [
  { id: 1, title: "Identity and tenant roots" },
  { id: 2, title: "Vehicle and claim core" },
  { id: 3, title: "Assessment, evidence and reporting" },
  { id: 4, title: "Operational portals and workflows" },
  { id: 5, title: "Intelligence and analytics" },
].map((wave) => ({
  ...wave,
  tables: [...selectedTables]
    .filter((tableName) => waveByTable.get(tableName) === wave.id)
    .sort()
    .map((tableName) => ({
      tableName,
      declarationId: primaryByTable.get(tableName)?.declarationId ?? null,
      sourceFile: primaryByTable.get(tableName)?.sourceFile ?? null,
      selectionReason: selectedReasons.get(tableName),
      dependencies: (dependenciesByTable.get(tableName) ?? []).sort(),
      candidateStatus: candidateByTable.get(tableName)?.status ?? null,
    })),
}));

const plan = {
  scope: "Planning only. No database was opened, no SQL was generated and no DDL was executed.",
  sourceManifestCommit: ledger.metadata.sourceCommit,
  gates: {
    gateBReplayEvidenceVerified: true,
    stagingAndProductionExcluded: true,
    heldCandidateTables: [...heldCandidateTables].sort(),
  },
  selectedTableCount: selectedTables.size,
  selectedReasons: Object.fromEntries([...selectedReasons.entries()].sort()),
  dependencyPromotions: promotedDependencies,
  waves,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`);
console.log(JSON.stringify({ output: path.relative(repoRoot, outputPath), selectedTableCount: plan.selectedTableCount, waves: waves.map((wave) => ({ id: wave.id, tableCount: wave.tables.length })), heldCandidateTables: plan.gates.heldCandidateTables }, null, 2));
