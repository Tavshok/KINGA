import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("drizzle/0062_recovery_deadline_sweep_authorization.sql"),
  "utf8"
);
const isolatedSnapshot = readFileSync(
  resolve("ci/schema/kinga-ci-mariadb-schema.sql"),
  "utf8"
);

describe("REC-SEC-02 isolated schema contract", () => {
  it("keeps all recovery authorization tables and critical constraints in the disposable snapshot", () => {
    for (const tableName of [
      "recovery_sweep_service_capabilities",
      "recovery_sweep_leases",
      "recovery_deadline_alert_outbox",
    ]) {
      expect(migration).toContain(`CREATE TABLE \`${tableName}\``);
      expect(isolatedSnapshot).toContain(`CREATE TABLE \`${tableName}\``);
    }

    for (const contract of [
      "UNIQUE KEY `uq_recovery_deadline_alert_effect` (`recovery_case_id`,`effect_key`)",
      "KEY `idx_recovery_deadline_alert_outbox_due` (`state`,`next_attempt_at`)",
      "FOREIGN KEY (`recovery_case_id`) REFERENCES `recovery_cases` (`id`)",
      "`fence` bigint unsigned NOT NULL DEFAULT 0",
      "`status` enum('active','revoked') NOT NULL DEFAULT 'active'",
    ]) {
      expect(migration).toContain(contract);
      expect(isolatedSnapshot).toContain(contract);
    }
  });
});
