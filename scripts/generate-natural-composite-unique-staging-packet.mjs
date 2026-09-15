import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const mode = process.argv[2] ?? "generate";
if (!new Set(["generate", "verify"]).has(mode)) {
  throw new Error("Usage: node scripts/generate-natural-composite-unique-staging-packet.mjs <generate|verify>");
}

const root = resolve(import.meta.dirname, "..");
const outputDir = resolve(root, "audit/natural-composite-unique-staging-2026-09-15");
const transitionPath = resolve(root, "audit/natural-composite-unique-2026-09-15/natural-composite-unique-constraints.sql");
const sourceSchemaPath = resolve(root, "drizzle/schema.ts");
const finalSourceInputs = [
  ["D-01", "/home/ubuntu/kinga-replit-d05-packet/audit/gate-c-scratch-baseline/wave-01-generated/wave-01-identity-tenant-roots.sql"],
  ["D-02", "/home/ubuntu/kinga-replit-d05-packet/audit/gate-c-scratch-baseline/wave-02-generated/wave-02-vehicle-claim-core.sql"],
  ["D-03", "/home/ubuntu/kinga-replit-d05-packet/audit/gate-d-d03-tidb-compatible-source-2026-09-14.sql"],
  ["D-04", "/home/ubuntu/kinga-replit-d05-packet/audit/gate-d-text-index-compatibility-2026-09-14/wave-04-tidb-compatible-source-v2.sql"],
  ["D-05", "/home/ubuntu/kinga-replit-d05-packet/audit/gate-d-text-index-compatibility-2026-09-14/wave-05-tidb-compatible-source-v2.sql"],
];
const expectedTransition = [
  {
    ordinal: 1,
    kind: "DROP INDEX",
    table_name: "assessor_insurer_relationships",
    object_name: "unique_assessor_tenant",
    sql: "DROP INDEX `unique_assessor_tenant` ON `assessor_insurer_relationships`;",
  },
  {
    ordinal: 2,
    kind: "CREATE UNIQUE INDEX",
    table_name: "assessor_insurer_relationships",
    object_name: "uq_assessor_insurer_relationship",
    columns: ["assessor_id", "tenant_id"],
    sql: "CREATE UNIQUE INDEX `uq_assessor_insurer_relationship` ON `assessor_insurer_relationships` (`assessor_id`,`tenant_id`);",
  },
  {
    ordinal: 3,
    kind: "CREATE UNIQUE INDEX",
    table_name: "policy_claim_links",
    object_name: "uq_policy_claim_link",
    columns: ["policy_id", "claim_id"],
    sql: "CREATE UNIQUE INDEX `uq_policy_claim_link` ON `policy_claim_links` (`policy_id`,`claim_id`);",
  },
  {
    ordinal: 4,
    kind: "CREATE UNIQUE INDEX",
    table_name: "fleet_drivers",
    object_name: "uq_fleet_driver_membership",
    columns: ["fleet_id", "user_id"],
    sql: "CREATE UNIQUE INDEX `uq_fleet_driver_membership` ON `fleet_drivers` (`fleet_id`,`user_id`);",
  },
];
const sourceConstraints = [
  'uniqueIndex("uq_assessor_insurer_relationship").on(table.assessorId, table.tenantId)',
  'uniqueIndex("uq_policy_claim_link").on(table.policyId, table.claimId)',
  'uniqueIndex("uq_fleet_driver_membership").on(table.fleetId, table.userId)',
];
const marker = "--> statement-breakpoint";
const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const sqlLiteral = (value) => `'${value.replaceAll("'", "''")}'`;

function splitSourceStatements(sql, label) {
  return sql.split(marker).map((fragment) => fragment.trim()).filter(Boolean).map((fragment) => {
    if (!fragment.endsWith(";")) throw new Error(`${label} contains a non-terminated SQL fragment.`);
    return fragment;
  });
}

function uniqueTableInventory() {
  const names = [];
  for (const [wave, path] of finalSourceInputs) {
    const source = readFileSync(path, "utf8");
    for (const statement of splitSourceStatements(source, wave)) {
      const match = statement.match(/^CREATE TABLE `([^`]+)`/);
      if (match) names.push(match[1]);
    }
  }
  const unique = [...new Set(names)].sort();
  if (names.length !== 188 || unique.length !== 188) throw new Error(`Expected exactly 188 distinct baseline tables; found ${names.length} statements / ${unique.length} unique names.`);
  return unique;
}

function tableInventoryQuery(tables) {
  return `SELECT table_name\nFROM information_schema.tables\nWHERE table_schema = 'kinga_staging'\n  AND table_type = 'BASE TABLE'\nORDER BY table_name;\n`;
}

function zeroRowsQuery(tables) {
  return `SELECT\n  COUNT(*) AS tables_checked,\n  COALESCE(SUM(row_count), 0) AS total_rows,\n  MIN(row_count) AS minimum_rows,\n  MAX(row_count) AS maximum_rows\nFROM (\n${tables.map((table) => `  SELECT ${sqlLiteral(table)} AS table_name, COUNT(*) AS row_count FROM \`kinga_staging\`.\`${table}\``).join("\n  UNION ALL\n")}\n) AS per_table;\n`;
}

function targetColumnsQuery() {
  return `SELECT table_name, ordinal_position, column_name, column_type, is_nullable, column_default, extra, column_key\nFROM information_schema.columns\nWHERE table_schema = 'kinga_staging'\n  AND table_name IN ('assessor_insurer_relationships', 'policy_claim_links', 'fleet_drivers')\nORDER BY table_name, ordinal_position;\n`;
}

function indexStateQuery() {
  return `SELECT table_name, index_name, non_unique, seq_in_index, column_name\nFROM information_schema.statistics\nWHERE table_schema = 'kinga_staging'\n  AND table_name IN ('assessor_insurer_relationships', 'policy_claim_links', 'fleet_drivers')\n  AND index_name IN ('unique_assessor_tenant', 'uq_assessor_insurer_relationship', 'uq_policy_claim_link', 'uq_fleet_driver_membership')\nORDER BY table_name, index_name, seq_in_index;\n`;
}

function duplicatePairQuery() {
  return `SELECT 'assessor_insurer_relationships (assessor_id, tenant_id)' AS pair_rule,\n       COUNT(*) AS duplicate_groups,\n       COALESCE(SUM(pair_rows), 0) AS rows_in_duplicate_groups\nFROM (\n  SELECT assessor_id, tenant_id, COUNT(*) AS pair_rows\n  FROM \`kinga_staging\`.\`assessor_insurer_relationships\`\n  GROUP BY assessor_id, tenant_id\n  HAVING COUNT(*) > 1\n) AS duplicate_pairs\nUNION ALL\nSELECT 'policy_claim_links (policy_id, claim_id)' AS pair_rule,\n       COUNT(*) AS duplicate_groups,\n       COALESCE(SUM(pair_rows), 0) AS rows_in_duplicate_groups\nFROM (\n  SELECT policy_id, claim_id, COUNT(*) AS pair_rows\n  FROM \`kinga_staging\`.\`policy_claim_links\`\n  GROUP BY policy_id, claim_id\n  HAVING COUNT(*) > 1\n) AS duplicate_pairs\nUNION ALL\nSELECT 'fleet_drivers (fleet_id, user_id)' AS pair_rule,\n       COUNT(*) AS duplicate_groups,\n       COALESCE(SUM(pair_rows), 0) AS rows_in_duplicate_groups\nFROM (\n  SELECT fleet_id, user_id, COUNT(*) AS pair_rows\n  FROM \`kinga_staging\`.\`fleet_drivers\`\n  GROUP BY fleet_id, user_id\n  HAVING COUNT(*) > 1\n) AS duplicate_pairs;\n`;
}

function buildPacket() {
  const schema = readFileSync(sourceSchemaPath, "utf8");
  for (const constraint of sourceConstraints) {
    if (!schema.includes(constraint)) throw new Error(`Source schema is missing approved constraint: ${constraint}`);
  }
  const entityStart = schema.indexOf("export const entityRelationships = mysqlTable(");
  const entityEnd = schema.indexOf("\nexport const ", entityStart + 1);
  if (entityStart < 0 || schema.slice(entityStart, entityEnd < 0 ? undefined : entityEnd).includes("uniqueIndex(")) {
    throw new Error("entity_relationships source declaration unexpectedly contains a unique index.");
  }

  const transitionText = readFileSync(transitionPath, "utf8");
  const transitionStatements = transitionText.split("\n").map((line) => line.trim()).filter(Boolean);
  if (JSON.stringify(transitionStatements) !== JSON.stringify(expectedTransition.map((statement) => statement.sql))) {
    throw new Error("Transition SQL differs from the approved four-statement source contract.");
  }
  const statements = expectedTransition.map((statement) => ({ ...statement, sha256: sha256(statement.sql) }));
  const baselineTables = uniqueTableInventory();
  const baselineSourceInputs = finalSourceInputs.map(([wave, path]) => ({ wave, path: path.replace(`${root}/`, ""), sha256: sha256(readFileSync(path, "utf8")) }));
  const statementFiles = statements.map((statement) => `${String(statement.ordinal).padStart(3, "0")}-${statement.object_name}.sql`);
  const orderedFileSha256 = sha256(`${statements.map((statement) => statement.sha256).join("\n")}\n`);
  const preflightQueries = {
    "01-baseline-table-inventory.sql": tableInventoryQuery(baselineTables),
    "02-baseline-zero-row-assertion.sql": zeroRowsQuery(baselineTables),
    "03-target-column-metadata.sql": targetColumnsQuery(),
    "04-current-index-state.sql": indexStateQuery(),
    "05-duplicate-pair-preflight.sql": duplicatePairQuery(),
  };
  const queriesManifest = Object.fromEntries(Object.entries(preflightQueries).map(([name, sql]) => [name, sha256(sql)]));
  return {
    schema: "kinga-natural-composite-unique-staging-packet/v1",
    generated_on: "2026-09-15",
    source_schema: "drizzle/schema.ts",
    source_schema_sha256: sha256(schema),
    transition_source: "audit/natural-composite-unique-2026-09-15/natural-composite-unique-constraints.sql",
    transition_source_sha256: sha256(transitionText),
    statement_count: statements.length,
    statement_counts: { "DROP INDEX": 1, "CREATE UNIQUE INDEX": 3 },
    statements,
    ordered_file_hash_rule: "SHA-256 of each one-statement file in ordinal order, joined as lowercase hexadecimal values with LF separators and one trailing LF.",
    ordered_statement_file_sha256: orderedFileSha256,
    statement_files: statementFiles,
    baseline: {
      expected_table_count: baselineTables.length,
      expected_table_inventory_sha256: sha256(`${baselineTables.join("\n")}\n`),
      baseline_source_inputs: baselineSourceInputs,
    },
    expected_postflight: {
      removed_index: { table_name: "assessor_insurer_relationships", index_name: "unique_assessor_tenant" },
      unique_indexes: expectedTransition.slice(1).map(({ table_name, object_name, columns }) => ({ table_name, index_name: object_name, columns })),
      entity_relationships: "unchanged; no secondary unique index",
    },
    preflight_queries: queriesManifest,
  };
}

function summary(ledger) {
  const rows = ledger.statements.map((statement) => `| ${statement.ordinal} | ${statement.kind} | \`${statement.table_name}\` | \`${statement.object_name}\` | \`${statement.sha256}\` |`).join("\n");
  return `# Natural/Composite Unique Constraints — Staging Statement Hash Ledger\n\nThis ledger is deterministically derived from the approved source declarations and the scratch-proven transition SQL. It is review material only and grants no execution authority.\n\n| Control | Value |\n|---|---|\n| Source schema SHA-256 | \`${ledger.source_schema_sha256}\` |\n| Transition-source SHA-256 | \`${ledger.transition_source_sha256}\` |\n| Statements | ${ledger.statement_count}: one \`DROP INDEX\`, three \`CREATE UNIQUE INDEX\` |\n| Ordered statement-file SHA-256 | \`${ledger.ordered_statement_file_sha256}\` |\n| Required staging baseline | ${ledger.baseline.expected_table_count} tables, inventory SHA-256 \`${ledger.baseline.expected_table_inventory_sha256}\` |\n\n> Do not submit the raw transition through \`mysql < file.sql\`. The owner-authorised local Claude Code route must hash-verify and execute only the one-statement files in ordinal order. A server or tool error is a stop-and-report event, never a blind retry.\n\n## Ordered execution ledger\n\n| # | Statement class | Table | Index | SHA-256 of exact SQL |\n|---:|---|---|---|---|\n${rows}\n\n## Reproducibility\n\n\`\`\`bash\nnode scripts/generate-natural-composite-unique-staging-packet.mjs verify\n\`\`\`\n`;
}

function buildFiles(packet) {
  const entries = new Map();
  entries.set("source-contract.json", `${JSON.stringify(packet, null, 2)}\n`);
  entries.set("statement-hash-ledger.json", `${JSON.stringify({
    schema: packet.schema,
    source_schema_sha256: packet.source_schema_sha256,
    transition_source: packet.transition_source,
    transition_source_sha256: packet.transition_source_sha256,
    statement_count: packet.statement_count,
    statement_counts: packet.statement_counts,
    ordered_file_hash_rule: packet.ordered_file_hash_rule,
    ordered_statement_file_sha256: packet.ordered_statement_file_sha256,
    statements: packet.statements,
  }, null, 2)}\n`);
  entries.set("statement-hash-ledger.md", summary(packet));
  entries.set("expected-baseline-table-inventory.txt", `${uniqueTableInventory().join("\n")}\n`);
  for (const [name, sql] of Object.entries({
    "01-baseline-table-inventory.sql": tableInventoryQuery(uniqueTableInventory()),
    "02-baseline-zero-row-assertion.sql": zeroRowsQuery(uniqueTableInventory()),
    "03-target-column-metadata.sql": targetColumnsQuery(),
    "04-current-index-state.sql": indexStateQuery(),
    "05-duplicate-pair-preflight.sql": duplicatePairQuery(),
  })) entries.set(`preflight/${name}`, sql);
  for (const statement of packet.statements) entries.set(`statements/${String(statement.ordinal).padStart(3, "0")}-${statement.object_name}.sql`, statement.sql);
  entries.set("preflight/query-hash-manifest.json", `${JSON.stringify(packet.preflight_queries, null, 2)}\n`);
  return entries;
}

const packet = buildPacket();
const expectedFiles = buildFiles(packet);
if (mode === "generate") {
  rmSync(outputDir, { recursive: true, force: true });
  for (const [relativePath, content] of expectedFiles) {
    const path = resolve(outputDir, relativePath);
    mkdirSync(resolve(path, ".."), { recursive: true });
    writeFileSync(path, content, "utf8");
  }
  console.log(JSON.stringify({ status: "generated", output_dir: outputDir, transition_source_sha256: packet.transition_source_sha256, statement_count: packet.statement_count, ordered_statement_file_sha256: packet.ordered_statement_file_sha256, baseline_table_count: packet.baseline.expected_table_count }, null, 2));
} else {
  const missingOrMismatched = [];
  for (const [relativePath, content] of expectedFiles) {
    const path = resolve(outputDir, relativePath);
    try {
      if (readFileSync(path, "utf8") !== content) missingOrMismatched.push(relativePath);
    } catch {
      missingOrMismatched.push(relativePath);
    }
  }
  if (missingOrMismatched.length) throw new Error(`Packet verification failed for: ${missingOrMismatched.join(", ")}`);
  console.log(JSON.stringify({ status: "PASS", transition_source_sha256: packet.transition_source_sha256, statement_count: packet.statement_count, ordered_statement_file_sha256: packet.ordered_statement_file_sha256, baseline_table_count: packet.baseline.expected_table_count }, null, 2));
}
