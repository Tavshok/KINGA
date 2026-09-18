/**
 * PURPOSE: Prove the tenant-role update service scopes writes to the canonical
 * `(tenantId, roleKey)` identity.
 * RUN: within the dedicated `kinga_ci_test` database only.
 * NEVER: create schemas, change DATABASE_URL, or connect to an admin database.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { assertIsolatedTestDatabaseUrl } from "../../shared/ci-test-database-policy";

const enableScratchTest = process.env.KINGA_LOCAL_SCRATCH_TESTS === "1";

type RoleRow = RowDataPacket & {
  tenant_id: string;
  role_key: string;
  enabled: number;
  permissions: string;
};

const originalDatabaseUrl = process.env.DATABASE_URL;
const testRunId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
const tenantPrefix = `tenant-role-scope-${testRunId}`;
let connection: mysql.Connection | undefined;
let updateTenantRoleConfig: typeof import("./tenant-config").updateTenantRoleConfig;

// Vitest's global setup validates this exact target before this module is
// evaluated. Retain an explicit guard here for future targeted runners.
function getDedicatedTestUrl() {
  return assertIsolatedTestDatabaseUrl(originalDatabaseUrl);
}

describe.skipIf(!enableScratchTest)(
  "tenant role-config update scope (dedicated CI database)",
  () => {
    beforeAll(async () => {
      connection = await mysql.createConnection(getDedicatedTestUrl());
      ({ updateTenantRoleConfig } = await import("./tenant-config"));
    });

    it("updates only the requested role and leaves every other role in the tenant unchanged", async () => {
      const tenantId = `${tenantPrefix}-update`;
      const untouchedPermissions = JSON.stringify({
        canViewReports: true,
        sentinel: "unchanged",
      });
      await connection!.query(
        `INSERT INTO tenant_role_configs (tenant_id, role_key, enabled, permissions)
       VALUES (?, ?, ?, ?), (?, ?, ?, ?)`,
        [
          tenantId,
          "executive",
          1,
          JSON.stringify({ canApprove: false }),
          tenantId,
          "risk_manager",
          1,
          untouchedPermissions,
        ]
      );

      await updateTenantRoleConfig(tenantId, "executive", {
        isEnabled: false,
        canApprove: true,
      });

      const [rows] = await connection!.execute<RoleRow[]>(
        `SELECT tenant_id, role_key, enabled, permissions
       FROM tenant_role_configs
       WHERE tenant_id = ? ORDER BY role_key`,
        [tenantId]
      );
      expect(rows).toHaveLength(2);
      expect(rows.find(row => row.role_key === "executive")).toMatchObject({
        enabled: 0,
        permissions: JSON.stringify({ isEnabled: false, canApprove: true }),
      });
      expect(rows.find(row => row.role_key === "risk_manager")).toMatchObject({
        enabled: 1,
        permissions: untouchedPermissions,
      });
    });

    it("inserts only the requested tenant-role pair when that pair does not exist", async () => {
      const tenantId = `${tenantPrefix}-absent`;
      await connection!.query(
        `INSERT INTO tenant_role_configs (tenant_id, role_key, enabled, permissions)
       VALUES (?, ?, ?, ?)`,
        [tenantId, "executive", 1, JSON.stringify({ canApprove: true })]
      );

      await updateTenantRoleConfig(tenantId, "claims_manager", {
        isEnabled: false,
        canReject: true,
      });

      const [rows] = await connection!.execute<RoleRow[]>(
        `SELECT tenant_id, role_key, enabled, permissions
       FROM tenant_role_configs
       WHERE tenant_id = ? ORDER BY role_key`,
        [tenantId]
      );
      expect(rows).toHaveLength(2);
      expect(rows.find(row => row.role_key === "executive")).toMatchObject({
        enabled: 1,
        permissions: JSON.stringify({ canApprove: true }),
      });
      expect(rows.find(row => row.role_key === "claims_manager")).toMatchObject(
        {
          enabled: 0,
          permissions: JSON.stringify({ isEnabled: false, canReject: true }),
        }
      );
    });

    afterAll(async () => {
      if (!connection) return;
      try {
        await connection.execute(
          "DELETE FROM tenant_role_configs WHERE tenant_id LIKE ?",
          [`${tenantPrefix}%`]
        );
        const [remaining] = await connection.execute<RoleRow[]>(
          "SELECT tenant_id, role_key, enabled, permissions FROM tenant_role_configs WHERE tenant_id LIKE ?",
          [`${tenantPrefix}%`]
        );
        expect(remaining).toHaveLength(0);
      } finally {
        await connection.end();
      }
    });
  }
);
