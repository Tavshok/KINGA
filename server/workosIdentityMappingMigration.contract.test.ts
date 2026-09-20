import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "drizzle/0063_workos_identity_mappings.sql"
);
const journalPath = resolve(process.cwd(), "drizzle/meta/_journal.json");
const qualityGatePath = resolve(
  process.cwd(),
  ".github/workflows/kinga-quality-gate.yml"
);

describe("WorkOS identity mapping migration contract", () => {
  it("records exactly the approved additive user and tenant mapping statements", async () => {
    const sql = await readFile(migrationPath, "utf8");
    const statements = sql
      .split("--> statement-breakpoint")
      .map(statement => statement.trim())
      .filter(Boolean);

    expect(statements).toEqual([
      "ALTER TABLE `tenants` ADD COLUMN `workos_organization_id` varchar(128) NULL;",
      "CREATE UNIQUE INDEX `tenants_workos_organization_id_unique` ON `tenants` (`workos_organization_id`);",
      "ALTER TABLE `users` ADD COLUMN `workos_user_id` varchar(128) NULL;",
      "CREATE UNIQUE INDEX `users_workos_user_id_unique` ON `users` (`workos_user_id`);",
    ]);
  });

  it("registers migration 0063 after the existing WorkOS transaction and G1 migrations", async () => {
    const journal = JSON.parse(await readFile(journalPath, "utf8")) as {
      entries: Array<{ idx: number; tag: string }>;
    };

    expect(journal.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          idx: 61,
          tag: "0061_workos_auth_transactions",
        }),
        expect.objectContaining({
          idx: 62,
          tag: "0062_workos_package_g1_service_scheduler_foundation",
        }),
        expect.objectContaining({
          idx: 63,
          tag: "0063_workos_identity_mappings",
        }),
      ])
    );
  });

  it("requires the guarded DDL proof after the disposable database is provisioned", async () => {
    const workflow = await readFile(qualityGatePath, "utf8");
    const provisionPosition = workflow.indexOf(
      "pnpm exec tsx scripts/ci/provision-isolated-test-db.mjs"
    );
    const proofPosition = workflow.indexOf(
      "pnpm exec tsx scripts/ci/prove-workos-identity-migration.mts"
    );

    expect(provisionPosition).toBeGreaterThanOrEqual(0);
    expect(proofPosition).toBeGreaterThan(provisionPosition);
  });
});
