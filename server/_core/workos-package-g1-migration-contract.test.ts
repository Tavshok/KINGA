import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const migrationsFolder = join(repositoryRoot, "drizzle");
const migrationTag = "0062_workos_package_g1_service_scheduler_foundation";
const migrationSql = readFileSync(
  join(migrationsFolder, `${migrationTag}.sql`),
  "utf8"
);

describe("WorkOS Package G1 migration contract", () => {
  it("is journaled after 0061 and loaded by Drizzle's migration reader", () => {
    const journal = JSON.parse(
      readFileSync(join(migrationsFolder, "meta", "_journal.json"), "utf8")
    ) as { entries: Array<{ idx: number; tag: string }> };
    const entry = journal.entries.find(item => item.tag === migrationTag);
    expect(entry).toMatchObject({ idx: 62, tag: migrationTag });
    const authTransactionPosition = journal.entries.findIndex(
      item => item.tag === "0061_workos_auth_transactions"
    );
    const g1Position = journal.entries.findIndex(
      item => item.tag === migrationTag
    );
    expect(authTransactionPosition).toBeGreaterThanOrEqual(0);
    expect(g1Position).toBe(authTransactionPosition + 1);

    const hash = createHash("sha256").update(migrationSql).digest("hex");
    const loaded = readMigrationFiles({ migrationsFolder }).find(
      migration => migration.hash === hash
    );
    expect(loaded?.sql).toHaveLength(4);
  });

  it("defines all four additive tables and required uniqueness/fencing indexes", () => {
    expect(migrationSql).toContain("CREATE TABLE `service_credentials`");
    expect(migrationSql).toContain("CREATE TABLE `service_credential_audit`");
    expect(migrationSql).toContain("CREATE TABLE `scheduled_job_executions`");
    expect(migrationSql).toContain("CREATE TABLE `scheduled_job_effects`");
    expect(migrationSql).toContain("service_credentials_active_scope_uq");
    expect(migrationSql).toContain("scheduled_job_executions_job_window_uq");
    expect(migrationSql).toContain("scheduled_job_effects_job_window_uq");
    expect(migrationSql).toContain("PRIMARY KEY (`effect_key`)");
    expect(migrationSql).toContain("enum('scrypt-v1')");
    expect(migrationSql).toContain("`not_before` timestamp(3) NOT NULL");
    expect(migrationSql).toContain(
      "`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)"
    );
    expect(migrationSql).toContain("`lease_expires_at` timestamp(3) NOT NULL");
    expect(migrationSql).toContain("`available_at` timestamp(3) NOT NULL");
  });

  it("contains only the approved capabilities/jobs and no identity or request material columns", () => {
    expect(migrationSql).toContain("scheduled:intake-escalation:run");
    expect(migrationSql).toContain("scheduled:stuck-recovery:run");
    expect(migrationSql).not.toMatch(
      /recovery-deadline|keepwarm|wildcard|trpc/iu
    );
    expect(migrationSql).not.toMatch(
      /raw_bearer|authorization_header|cookie|request_body|provider_id|human_id|user_id|email/iu
    );
  });
});
