import { createConnection } from "mysql2/promise";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

const execFileAsync = promisify(execFile);
const scratchUrl = process.env.KINGA_GATEB_SCRATCH_URL;
const evidenceDirectory = process.env.KINGA_GATEB_EVIDENCE_DIR;

if (!scratchUrl || !evidenceDirectory) {
  throw new Error(
    "KINGA_GATEB_SCRATCH_URL and KINGA_GATEB_EVIDENCE_DIR are required. This runner never reads DATABASE_URL."
  );
}

const parsedUrl = new URL(scratchUrl);
const databaseName = parsedUrl.pathname.replace(/^\//, "");
const permittedHosts = new Set(["127.0.0.1", "localhost", "::1"]);

if (
  parsedUrl.protocol !== "mysql:" ||
  !permittedHosts.has(parsedUrl.hostname) ||
  !/^kinga_gateb_[a-z0-9_]+$/i.test(databaseName)
) {
  throw new Error(
    "Gate B safety guard rejected the target. Use only a local mysql:// loopback URL whose database name begins kinga_gateb_."
  );
}

const repositoryRoot = resolve(new URL("..", import.meta.url).pathname);
const drizzleDirectory = resolve(repositoryRoot, "drizzle");
const journalPath = join(drizzleDirectory, "meta", "_journal.json");
const absoluteEvidenceDirectory = resolve(evidenceDirectory);
const overlayDirectory = join(absoluteEvidenceDirectory, "immutable-overlay");
const redactedUrl = `${parsedUrl.protocol}//${parsedUrl.username ? `${parsedUrl.username}@` : ""}${parsedUrl.hostname}:${parsedUrl.port}/${databaseName}`;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

/**
 * Gate B repairs are intentionally materialised outside drizzle/. Existing
 * migration history is evidence and may already have run in another database.
 * The overlay gives a fresh scratch target an explicit, checksummed corrected
 * path without rewriting historical SQL or the committed journal.
 */
function correctedContent(tag, original) {
  if (tag === "0045_colossal_molecule_man") {
    return original.replace(
      "CREATE INDEX `idx_recipients` ON `governance_notifications` (`recipients`);--> statement-breakpoint\n",
      "-- Gate B overlay: recipients is JSON text and has no SQL filter consumer; omit its whole-TEXT index.\n"
    );
  }
  if (tag === "0058_claim_comments_extend") {
    return original
      // The fresh baseline follows the approved live physical contract. This is
      // an immutable-overlay correction only; historical migration bytes remain
      // unchanged and no deployed database is contacted by this runner.
      .replace(
        "ALTER TABLE claim_comments\n  CHANGE COLUMN `userId` `author_user_id` INT NOT NULL,",
        "ALTER TABLE claim_comments\n  CHANGE COLUMN `claim_id` `claimId` INT NOT NULL,\n  CHANGE COLUMN `userId` `author_user_id` INT NOT NULL,"
      )
      .replaceAll("`userId`", "`user_id`")
      .replaceAll("`userRole`", "`user_role`")
      .replaceAll("`commentType`", "`comment_type`")
      .replace(
        ") NOT NULL DEFAULT 'general';\n\n-- 2.",
        ") NOT NULL DEFAULT 'general';\n--> statement-breakpoint\n\n-- 2."
      )
      .replace(
        "`to_emails`  TEXT NOT NULL DEFAULT '[]' AFTER `to_user_ids`;\n\n-- 3.",
        "`to_emails`  TEXT NOT NULL DEFAULT '[]' AFTER `to_user_ids`;\n--> statement-breakpoint\n\n-- 3."
      )
      .replace(
        "`resolved_at`       VARCHAR(50) NULL AFTER `resolved_by_user_id`;\n\n-- 4.",
        "`resolved_at`       VARCHAR(50) NULL AFTER `resolved_by_user_id`;\n--> statement-breakpoint\n\n-- 4."
      )
      .replace(
        "`email_sent`           TINYINT NOT NULL DEFAULT 0 AFTER `resolved_at`;\n\n-- 5.",
        "`email_sent`           TINYINT NOT NULL DEFAULT 0 AFTER `resolved_at`;\n--> statement-breakpoint\n\n-- 5."
      );
  }
  if (tag === "0059_kinga_ref_sequence") {
    return original
      .replace(
        "ALTER TABLE `claims` ADD COLUMN `kinga_ref` varchar(40);\n",
        "ALTER TABLE `claims` ADD COLUMN `kinga_ref` varchar(40);\n--> statement-breakpoint\n"
      )
      .replace(
        "ALTER TABLE `tenants` ADD COLUMN `kinga_sequence` int NOT NULL DEFAULT 0;\n",
        "ALTER TABLE `tenants` ADD COLUMN `kinga_sequence` int NOT NULL DEFAULT 0;\n--> statement-breakpoint\n"
      );
  }
  if (tag === "0060_role_assignment_audit_fleet_platform_enum") {
    return original.replace(
      "    NULL;\n\nALTER TABLE `role_assignment_audit`",
      "    NULL;\n--> statement-breakpoint\n\nALTER TABLE `role_assignment_audit`"
    );
  }
  return original;
}

async function queryRows(connection, sql, parameters = []) {
  const [rows] = await connection.query(sql, parameters);
  return rows;
}

async function getMetadata(connection) {
  const queries = {
    tables: `SELECT table_name, engine, table_collation FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name`,
    columns: `SELECT table_name, column_name, ordinal_position, column_type, is_nullable, column_default, extra FROM information_schema.columns WHERE table_schema = ? ORDER BY table_name, ordinal_position`,
    indexes: `SELECT table_name, index_name, non_unique, seq_in_index, column_name, sub_part FROM information_schema.statistics WHERE table_schema = ? ORDER BY table_name, index_name, seq_in_index`,
    foreignKeys: `SELECT table_name, constraint_name, column_name, referenced_table_name, referenced_column_name, ordinal_position FROM information_schema.key_column_usage WHERE table_schema = ? AND referenced_table_name IS NOT NULL ORDER BY table_name, constraint_name, ordinal_position`,
  };
  const [tables, columns, indexes, foreignKeys] = await Promise.all(
    Object.values(queries).map((sql) => queryRows(connection, sql, [databaseName]))
  );
  const journalPresent = tables.some((table) => table.table_name === "__drizzle_migrations");
  const journal = journalPresent
    ? await queryRows(connection, "SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY id")
    : [];
  return { tables, columns, indexes, foreignKeys, journal };
}

function assertCoreEvidence(metadata, expectedEntries) {
  const columnsByTable = new Map();
  for (const column of metadata.columns) {
    const set = columnsByTable.get(column.table_name) ?? new Set();
    set.add(column.column_name);
    columnsByTable.set(column.table_name, set);
  }
  const indexesByTable = new Map();
  for (const index of metadata.indexes) {
    const set = indexesByTable.get(index.table_name) ?? new Set();
    set.add(index.index_name);
    indexesByTable.set(index.table_name, set);
  }
  const requiredColumns = {
    ai_assessments: ["stage2_raw_ocr_text", "narrative_analysis_json"],
    claims: ["kinga_ref"],
    claim_comments: ["claimId", "author_user_id", "author_role", "body", "to_roles", "to_user_ids", "to_emails", "parent_comment_id", "is_resolved", "resolved_by_user_id", "resolved_at", "requires_response", "response_deadline_at", "email_sent"],
    governance_notifications: ["tenant_id", "recipients", "read_at", "created_at"],
    rate_limit_tracking: ["user_id", "tenant_id", "action_type", "window_start", "action_count"],
  };
  const missingColumns = Object.entries(requiredColumns).flatMap(([table, expected]) =>
    expected.filter((column) => !columnsByTable.get(table)?.has(column)).map((column) => `${table}.${column}`)
  );
  const expectedJournalTimes = expectedEntries.map((entry) => Number(entry.when));
  const actualJournalTimes = metadata.journal.map((entry) => Number(entry.created_at));
  const missingJournalTimes = expectedJournalTimes.filter((time) => !actualJournalTimes.includes(time));
  const unexpectedJournalTimes = actualJournalTimes.filter((time) => !expectedJournalTimes.includes(time));
  const unexpectedRecipientsIndex = indexesByTable.get("governance_notifications")?.has("idx_recipients") ?? false;
  const unexpectedSnakeCaseClaimId = columnsByTable.get("claim_comments")?.has("claim_id") ?? false;
  const rateLimitIndexPresent = indexesByTable.get("rate_limit_tracking")?.has("idx_user_tenant_action_window") ?? false;
  return {
    requiredColumns,
    missingColumns,
    unexpectedRecipientsIndex,
    unexpectedSnakeCaseClaimId,
    rateLimitIndexPresent,
    expectedJournalEntryCount: expectedJournalTimes.length,
    actualJournalEntryCount: actualJournalTimes.length,
    missingJournalTimes,
    unexpectedJournalTimes,
    pass: missingColumns.length === 0 && !unexpectedRecipientsIndex && !unexpectedSnakeCaseClaimId && rateLimitIndexPresent && missingJournalTimes.length === 0 && unexpectedJournalTimes.length === 0,
  };
}

async function createOverlay() {
  const historicalJournal = JSON.parse(await readFile(journalPath, "utf8"));
  const historyEntries = historicalJournal.entries;
  const extraEntries = [
    { idx: 56, version: "5", when: 1771494069500, tag: "0056_stage2_raw_ocr_text", breakpoints: true },
    { idx: 57, version: "5", when: 1771494069600, tag: "0057_narrative_analysis_json", breakpoints: true },
    { idx: 58, version: "5", when: 1771494069700, tag: "0058_claim_comments_extend", breakpoints: true },
    { idx: 59, version: "5", when: 1771494069800, tag: "0059_kinga_ref_sequence", breakpoints: true },
  ];
  const overlayJournal = { ...historicalJournal, entries: [...historyEntries.filter((entry) => entry.idx < 60), ...extraEntries, historyEntries.find((entry) => entry.idx === 60)] };
  await mkdir(join(overlayDirectory, "meta"), { recursive: true });
  const overlayFiles = [];
  for (const entry of overlayJournal.entries) {
    const sourcePath = join(drizzleDirectory, `${entry.tag}.sql`);
    const original = await readFile(sourcePath, "utf8");
    const corrected = correctedContent(entry.tag, original);
    const targetPath = join(overlayDirectory, `${entry.tag}.sql`);
    await writeFile(targetPath, corrected);
    overlayFiles.push({ tag: entry.tag, sourceSha256: sha256(original), overlaySha256: sha256(corrected), changed: original !== corrected });
  }
  await writeFile(join(overlayDirectory, "meta", "_journal.json"), `${JSON.stringify(overlayJournal, null, 2)}\n`);
  const configPath = join(overlayDirectory, "drizzle.config.ts");
  const schemaPath = join(drizzleDirectory, "schema.ts").replaceAll("\\", "\\\\");
  const outPath = overlayDirectory.replaceAll("\\", "\\\\");
  await writeFile(
    configPath,
    `import { defineConfig } from "drizzle-kit";\nexport default defineConfig({ schema: "${schemaPath}", out: "${outPath}", dialect: "mysql", dbCredentials: { url: process.env.DATABASE_URL! } });\n`
  );
  await writeFile(
    join(overlayDirectory, "overlay-manifest.json"),
    `${JSON.stringify({
      purpose: "Gate B immutable scratch-only corrected replay overlay",
      historicalJournalSha256: sha256(await readFile(journalPath)),
      files: overlayFiles,
      excludedUnregisteredArtefacts: ["rate-limit-tracking-schema.sql"],
      explanation: "The overlay preserves committed historical migration and journal bytes. It substitutes corrected copies only within the disposable scratch evidence directory.",
    }, null, 2)}\n`
  );
  return { overlayJournal, configPath };
}

async function main() {
  await mkdir(absoluteEvidenceDirectory, { recursive: true });
  const connection = await createConnection(scratchUrl);
  const preflightTables = await queryRows(connection, "SELECT table_name FROM information_schema.tables WHERE table_schema = ?", [databaseName]);
  if (preflightTables.length !== 0) {
    throw new Error(`Gate B safety guard rejected non-empty scratch database ${databaseName}: ${preflightTables.length} table(s) already exist.`);
  }
  const identity = (await queryRows(connection, "SELECT VERSION() AS version, @@version_comment AS version_comment, @@sql_mode AS sql_mode, @@character_set_server AS character_set_server, @@collation_server AS collation_server"))[0];
  const { overlayJournal, configPath } = await createOverlay();
  await writeFile(
    join(absoluteEvidenceDirectory, "run.json"),
    `${JSON.stringify({
      purpose: "Gate B immutable corrected migration replay",
      target: { database: databaseName, url: redactedUrl, loopbackOnly: true, stagingConnectionUsed: false, productionConnectionUsed: false },
      preflight: { tableCount: 0 }, engine: identity, nodeVersion: process.version,
      overlayJournalEntryCount: overlayJournal.entries.length,
    }, null, 2)}\n`
  );
  const cleanEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !["DATABASE_URL", "KINGA_STAGING_DATABASE_URL", "KINGA_PRODUCTION_DATABASE_URL"].includes(key)));
  let replayResult;
  try {
    const output = await execFileAsync("pnpm", ["exec", "drizzle-kit", "migrate", "--config", configPath], { cwd: repositoryRoot, env: { ...cleanEnvironment, DATABASE_URL: scratchUrl }, maxBuffer: 10 * 1024 * 1024 });
    replayResult = { exitCode: 0, stdout: output.stdout, stderr: output.stderr };
  } catch (error) {
    replayResult = { exitCode: Number(error.code) || 1, stdout: error.stdout || "", stderr: error.stderr || error.message };
  }
  await writeFile(join(absoluteEvidenceDirectory, "replay.json"), `${JSON.stringify(replayResult, null, 2)}\n`);
  const metadata = await getMetadata(connection);
  const coreEvidence = assertCoreEvidence(metadata, overlayJournal.entries);
  await writeFile(join(absoluteEvidenceDirectory, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);
  await writeFile(join(absoluteEvidenceDirectory, "core-evidence.json"), `${JSON.stringify(coreEvidence, null, 2)}\n`);
  await connection.end();
  if (replayResult.exitCode !== 0 || !coreEvidence.pass) process.exitCode = 1;
}

await main();
