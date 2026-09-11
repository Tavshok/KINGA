import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = path.join(repoRoot, "drizzle/schema.ts");

describe("Gate C Wave 5 approved primary-key contract", () => {
  it("permits only the six explicitly approved key reconciliations", () => {
    const output = execFileSync(process.execPath, ["scripts/reconcile-gate-c-wave-five-primary-keys.mjs", "--verify"], { cwd: repoRoot, encoding: "utf8" });
    const result = JSON.parse(output);
    expect(result.status).toBe("passed");
    expect(result.applied).toEqual([
      { declaration: "insurerTenants", tableName: "insurer_tenants", key: "id" },
      { declaration: "isoAuditLogs", tableName: "iso_audit_logs", key: "id" },
      { declaration: "riskRegister", tableName: "risk_register", key: "id" },
      { declaration: "routingHistory", tableName: "routing_history", key: "id" },
      { declaration: "routingThresholdConfig", tableName: "routing_threshold_config", key: "id" },
      { declaration: "tenantRoleConfigs", tableName: "tenant_role_configs", key: "tenantId,roleKey" },
    ]);
  });

  it("declares the approved five existing IDs and tenant-role composite identity without adding a unique contract", () => {
    const schema = fs.readFileSync(schemaPath, "utf8");
    for (const tableName of ["insurer_tenants", "iso_audit_logs", "risk_register", "routing_history", "routing_threshold_config"]) {
      expect(schema).toMatch(new RegExp(`mysqlTable\\(\\"${tableName}\\", \\{[\\s\\S]*?id: varchar\\(\\{ length: 64 \\}\\)\\.notNull\\(\\)\\.primaryKey\\(\\)`));
    }
    expect(schema).toMatch(/export const tenantRoleConfigs = mysqlTable\("tenant_role_configs", \{[\s\S]*?\}, \(table\) => \[primaryKey\(\{ columns: \[table\.tenantId, table\.roleKey\] \}\)\]\);/);
    const tenantRoleDeclaration = schema.match(/export const tenantRoleConfigs = mysqlTable\("tenant_role_configs", \{[\s\S]*?(?=export const tenantWorkflowConfigs)/)?.[0];
    expect(tenantRoleDeclaration).toBeDefined();
    expect(tenantRoleDeclaration).not.toContain("uniqueIndex(");
  });
});
