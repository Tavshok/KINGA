import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readMigrationFiles } from "drizzle-orm/migrator";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const migrationsFolder = join(repositoryRoot, "drizzle");
const migrationTag = "0061_workos_auth_transactions";

describe("WorkOS authentication transaction migration contract", () => {
  it("is journaled and loaded by Drizzle's normal migration reader", () => {
    const journal = JSON.parse(
      readFileSync(join(migrationsFolder, "meta", "_journal.json"), "utf8")
    ) as { entries: Array<{ idx: number; tag: string }> };
    const entry = journal.entries.find(item => item.tag === migrationTag);
    expect(entry).toMatchObject({ idx: 61, tag: migrationTag });

    const migrationSql = readFileSync(
      join(migrationsFolder, `${migrationTag}.sql`),
      "utf8"
    );
    const migrationHash = createHash("sha256")
      .update(migrationSql)
      .digest("hex");
    const migrations = readMigrationFiles({ migrationsFolder });
    const loaded = migrations.find(
      migration => migration.hash === migrationHash
    );

    expect(loaded?.sql.join("\n")).toContain(
      "CREATE TABLE `workos_auth_transactions`"
    );
    expect(loaded?.sql.join("\n")).toContain(
      "workos_auth_transactions_expires_at_idx"
    );
  });
});
