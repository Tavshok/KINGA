#!/usr/bin/env node
/**
 * Deterministically derives the approved Package A additive WorkOS schema
 * transition from the canonical Drizzle source. This script never opens a
 * database connection and refuses to write SQL unless the exact source
 * contract is present.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = resolve(root, "drizzle/schema.ts");
const outputDir = resolve(root, "audit/workos-package-a-2026-09-16");
const migrationPath = resolve(outputDir, "workos-package-a-additive-schema.sql");
const manifestPath = resolve(outputDir, "manifest.json");

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const schema = await readFile(schemaPath, "utf8");
const requiredSourceFragments = [
  'workosOrganizationId: varchar("workos_organization_id", { length: 128 })',
  'uniqueIndex("tenants_workos_organization_id_unique").on(table.workosOrganizationId)',
  'workosUserId: varchar("workos_user_id", { length: 128 })',
  'uniqueIndex("users_workos_user_id_unique").on(table.workosUserId)',
];
for (const fragment of requiredSourceFragments) {
  if (!schema.includes(fragment)) throw new Error(`Canonical schema does not contain required Package A fragment: ${fragment}`);
}

const statements = [
  "ALTER TABLE `tenants` ADD COLUMN `workos_organization_id` varchar(128) NULL;",
  "CREATE UNIQUE INDEX `tenants_workos_organization_id_unique` ON `tenants` (`workos_organization_id`);",
  "ALTER TABLE `users` ADD COLUMN `workos_user_id` varchar(128) NULL;",
  "CREATE UNIQUE INDEX `users_workos_user_id_unique` ON `users` (`workos_user_id`);",
];
const sql = `${statements.join("\n\n")}\n`;
const manifest = {
  scope: "WorkOS Package A additive source contract only",
  sourceSchema: "drizzle/schema.ts",
  sourceSchemaSha256: sha256(schema),
  migrationSqlSha256: sha256(sql),
  statementCount: statements.length,
  statements: statements.map((statement, ordinal) => ({
    ordinal: ordinal + 1,
    sql: statement,
    sha256: sha256(statement),
  })),
  expectedColumns: [
    { table: "tenants", column: "workos_organization_id", dataType: "varchar", maximumLength: 128, nullable: true },
    { table: "users", column: "workos_user_id", dataType: "varchar", maximumLength: 128, nullable: true },
  ],
  expectedUniqueIndexes: [
    { table: "tenants", index: "tenants_workos_organization_id_unique", columns: ["workos_organization_id"] },
    { table: "users", index: "users_workos_user_id_unique", columns: ["workos_user_id"] },
  ],
  prohibitedScope: [
    "WorkOS dependency installation",
    "WorkOS account or secret setup",
    "authentication route or callback change",
    "provider selection or login switch",
    "staging or production database application",
  ],
};

await mkdir(outputDir, { recursive: true });
await writeFile(migrationPath, sql);
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ migrationPath, manifestPath, migrationSqlSha256: manifest.migrationSqlSha256, statementCount: manifest.statementCount }));
