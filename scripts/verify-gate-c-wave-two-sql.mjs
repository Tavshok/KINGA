/**
 * Gate C Wave 2 review-SQL safety guard.
 *
 * Validates a generated SQL file without connecting to any database. It
 * accepts only the exact reviewed Wave 2 tables and CREATE statements.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sqlPath = path.resolve(repoRoot, process.argv[2] ?? "");
const expectedTables = [
  "claim_assignments",
  "claim_documents",
  "claims",
  "drivers",
  "inspections",
  "insurance_audit_logs",
  "insurance_carriers",
  "insurance_policies",
  "insurance_products",
  "insurance_quotes",
  "measurement_types",
  "vehicle_condition_assessment",
  "vehicle_condition_snapshots",
  "vehicle_damage_history",
  "vehicle_geometry_measurements",
  "vehicle_market_valuations",
  "vehicle_mileage_logs",
  "vehicle_models",
  "vehicle_passport_snapshots",
  "vehicle_registry",
].sort();
const approvedPrerequisiteTables = ["tenant_invitations", "tenants", "users"];
const permittedForeignKeyReferences = new Set([...expectedTables, ...approvedPrerequisiteTables]);

if (!sqlPath.startsWith(`${repoRoot}${path.sep}`)) throw new Error("SQL path must be inside the repository.");
const sql = fs.readFileSync(sqlPath, "utf8");
const statements = sql
  .split(/-->\s*statement-breakpoint/)
  .map((statement) => statement.trim())
  .filter(Boolean);
const statementKinds = statements.map((statement) => {
  const match = statement.match(/^CREATE(?:\s+UNIQUE)?\s+(?:TABLE|INDEX)\b/i);
  if (match) return match[0].toUpperCase();

  const foreignKeyMatch = statement.match(/^ALTER\s+TABLE\s+`([^`]+)`\s+ADD\s+CONSTRAINT\s+`[^`]+`\s+FOREIGN\s+KEY\s*\([^)]*\)\s+REFERENCES\s+`([^`]+)`\s*\([^)]*\)(?:\s+ON\s+DELETE\s+[A-Z ]+)?(?:\s+ON\s+UPDATE\s+[A-Z ]+)?;?$/is);
  if (!foreignKeyMatch) {
    throw new Error(`Wave 2 review SQL contains a prohibited statement: ${statement.slice(0, 96)}`);
  }

  const [, tableName, referencedTable] = foreignKeyMatch;
  if (!expectedTables.includes(tableName) || !permittedForeignKeyReferences.has(referencedTable)) {
    throw new Error(`Wave 2 foreign key references an unexpected table: ${tableName} -> ${referencedTable}.`);
  }
  return "ALTER TABLE ADD FOREIGN KEY";
});

const actualTables = [...sql.matchAll(/CREATE\s+TABLE\s+`([^`]+)`/gi)].map((match) => match[1]).sort();
if (JSON.stringify(actualTables) !== JSON.stringify(expectedTables)) {
  throw new Error(`Wave 2 table set mismatch. Expected ${expectedTables.join(", ")}; found ${actualTables.join(", ")}.`);
}

if (statementKinds.length === 0 || statementKinds.some((kind) => !kind.startsWith("CREATE") && kind !== "ALTER TABLE ADD FOREIGN KEY")) {
  throw new Error("Wave 2 review SQL contains an unexpected statement type.");
}

console.log(JSON.stringify({
  scope: "Gate C Wave 2 SQL review only; no database connection was opened.",
  sqlPath: path.relative(repoRoot, sqlPath),
  sourceSqlSha256: crypto.createHash("sha256").update(sql).digest("hex"),
  createdTables: actualTables,
  createTableCount: actualTables.length,
  createIndexCount: statementKinds.filter((kind) => kind.includes("INDEX")).length,
  foreignKeyCount: statementKinds.filter((kind) => kind === "ALTER TABLE ADD FOREIGN KEY").length,
  status: "passed",
}, null, 2));
