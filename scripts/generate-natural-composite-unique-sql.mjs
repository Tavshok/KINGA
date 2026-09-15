#!/usr/bin/env node
/**
 * Generates the reviewed, source-derived unique-index transition for the
 * confirmed assessor/insurer, policy/claim, and fleet/driver pairs.
 * It performs no database operation.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = resolve(root, "drizzle/schema.ts");
const outputDir = resolve(root, "audit/natural-composite-unique-2026-09-15");
const sqlPath = resolve(outputDir, "natural-composite-unique-constraints.sql");
const manifestPath = resolve(outputDir, "manifest.json");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function declaration(schema, name) {
  const start = schema.indexOf(`export const ${name} = mysqlTable(`);
  if (start === -1) throw new Error(`Missing schema declaration ${name}.`);
  const next = schema.indexOf("\nexport const ", start + 1);
  return schema.slice(start, next === -1 ? schema.length : next);
}

function assertIncludes(block, fragment, description) {
  if (!block.includes(fragment)) throw new Error(`Source contract mismatch: ${description}.`);
}

const schema = await readFile(schemaPath, "utf8");
const assessor = declaration(schema, "assessorInsurerRelationships");
const policyClaim = declaration(schema, "policyClaimLinks");
const fleetDriver = declaration(schema, "fleetDrivers");
const entityRelationship = declaration(schema, "entityRelationships");

assertIncludes(assessor, 'assessorId: int("assessor_id").notNull()', "assessor physical column");
assertIncludes(assessor, 'tenantId: varchar("tenant_id", { length: 64 }).notNull()', "insurer tenant physical column");
assertIncludes(assessor, 'uniqueIndex("uq_assessor_insurer_relationship").on(table.assessorId, table.tenantId)', "assessor unique source rule");
if (assessor.includes('index("unique_assessor_tenant")')) throw new Error("Superseded assessor non-unique index is still declared.");

assertIncludes(policyClaim, 'policyId: int("policy_id").notNull()', "policy physical column");
assertIncludes(policyClaim, 'claimId: int("claim_id")', "claim physical column");
assertIncludes(policyClaim, 'uniqueIndex("uq_policy_claim_link").on(table.policyId, table.claimId)', "policy/claim unique source rule");

assertIncludes(fleetDriver, 'fleetId: int("fleet_id").notNull()', "fleet physical column");
assertIncludes(fleetDriver, 'userId: int("user_id").notNull()', "driver user physical column");
assertIncludes(fleetDriver, 'uniqueIndex("uq_fleet_driver_membership").on(table.fleetId, table.userId)', "fleet/driver unique source rule");

if (entityRelationship.includes("uniqueIndex(")) throw new Error("entityRelationships must remain without a source-declared unique index.");

const statements = [
  "DROP INDEX `unique_assessor_tenant` ON `assessor_insurer_relationships`;",
  "CREATE UNIQUE INDEX `uq_assessor_insurer_relationship` ON `assessor_insurer_relationships` (`assessor_id`,`tenant_id`);",
  "CREATE UNIQUE INDEX `uq_policy_claim_link` ON `policy_claim_links` (`policy_id`,`claim_id`);",
  "CREATE UNIQUE INDEX `uq_fleet_driver_membership` ON `fleet_drivers` (`fleet_id`,`user_id`);",
];
const sql = `${statements.join("\n\n")}\n`;

await mkdir(outputDir, { recursive: true });
await writeFile(sqlPath, sql);
await writeFile(manifestPath, `${JSON.stringify({
  generatedAt: "2026-09-15",
  scope: "Natural/composite unique constraints only; source-derived local scratch proof artifact",
  sourceSchemaSha256: sha256(schema),
  sqlSha256: sha256(sql),
  statements: statements.map((statement, ordinal) => ({ ordinal: ordinal + 1, sql: statement, sha256: sha256(statement) })),
  expectedUniqueIndexes: {
    assessor_insurer_relationships: { name: "uq_assessor_insurer_relationship", columns: ["assessor_id", "tenant_id"] },
    policy_claim_links: { name: "uq_policy_claim_link", columns: ["policy_id", "claim_id"] },
    fleet_drivers: { name: "uq_fleet_driver_membership", columns: ["fleet_id", "user_id"] },
  },
  explicitlyUnchanged: ["entity_relationships"],
  prohibitedTargets: ["kinga_staging", "production", "non-loopback hosts"],
}, null, 2)}\n`);

console.log(JSON.stringify({ sqlPath, manifestPath, sqlSha256: sha256(sql), statementCount: statements.length }));
