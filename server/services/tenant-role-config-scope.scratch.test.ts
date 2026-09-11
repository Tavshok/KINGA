/**
 * PURPOSE: Prove the tenant-role update service scopes writes to the canonical
 * `(tenantId, roleKey)` identity.
 * RUN: Only with KINGA_LOCAL_SCRATCH_TESTS=1 and a loopback-only admin URL.
 * NEVER: Connect to staging, production, or a caller-supplied non-scratch DB.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mysql, { type RowDataPacket } from "mysql2/promise";

type RoleRow = RowDataPacket & {
  tenant_id: string;
  role_key: string;
  enabled: number;
  permissions: string;
};

const enableScratchTest = process.env.KINGA_LOCAL_SCRATCH_TESTS === "1";
const originalDatabaseUrl = process.env.DATABASE_URL;
const scratchDatabase = `kinga_gatec_tenant_role_scope_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
let adminConnection: mysql.Connection | undefined;
let updateTenantRoleConfig: typeof import("./tenant-config").updateTenantRoleConfig;

function getLoopbackAdminUrl() {
  const value = process.env.KINGA_LOCAL_SCRATCH_ADMIN_URL ?? "mysql://root@127.0.0.1:3317/mysql";
  const url = new URL(value);
  if (url.protocol !== "mysql:" || !["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
    throw new Error("Tenant-role scratch test accepts only a loopback mysql admin URL");
  }
  if (url.pathname !== "/mysql") {
    throw new Error("Tenant-role scratch test requires the mysql administrative database");
  }
  return url;
}

function getScratchUrl(adminUrl: URL) {
  const scratchUrl = new URL(adminUrl);
  scratchUrl.pathname = `/${scratchDatabase}`;
  return scratchUrl.toString();
}

describe.skipIf(!enableScratchTest)("tenant role-config update scope (loopback scratch)", () => {
  beforeAll(async () => {
    const adminUrl = getLoopbackAdminUrl();
    adminConnection = await mysql.createConnection(adminUrl.toString());

    const [existing] = await adminConnection.execute<RowDataPacket[]>(
      "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?",
      [scratchDatabase]
    );
    if (existing.length > 0) {
      throw new Error(`Refusing to reuse existing scratch schema ${scratchDatabase}`);
    }

    await adminConnection.query(`CREATE DATABASE \`${scratchDatabase}\``);
    await adminConnection.query(`
      CREATE TABLE \`${scratchDatabase}\`.tenant_role_configs (
        tenant_id varchar(64) NOT NULL,
        role_key varchar(64) NOT NULL,
        enabled tinyint NOT NULL DEFAULT 1,
        display_name varchar(255),
        permissions text NOT NULL,
        created_at varchar(64),
        updated_at varchar(64),
        PRIMARY KEY (tenant_id, role_key)
      )
    `);

    process.env.DATABASE_URL = getScratchUrl(adminUrl);
    ({ updateTenantRoleConfig } = await import("./tenant-config"));
  });

  it("updates only the requested role and leaves every other role in the tenant unchanged", async () => {
    const tenantId = "tenant-role-update-scope";
    const untouchedPermissions = JSON.stringify({ canViewReports: true, sentinel: "unchanged" });
    await adminConnection!.query(
      `INSERT INTO \`${scratchDatabase}\`.tenant_role_configs (tenant_id, role_key, enabled, permissions)
       VALUES (?, ?, ?, ?), (?, ?, ?, ?)`,
      [
        tenantId, "executive", 1, JSON.stringify({ canApprove: false }),
        tenantId, "risk_manager", 1, untouchedPermissions,
      ]
    );

    await updateTenantRoleConfig(tenantId, "executive", { isEnabled: false, canApprove: true });

    const [rows] = await adminConnection!.execute<RoleRow[]>(
      `SELECT tenant_id, role_key, enabled, permissions
       FROM \`${scratchDatabase}\`.tenant_role_configs
       WHERE tenant_id = ? ORDER BY role_key`,
      [tenantId]
    );
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.role_key === "executive")).toMatchObject({ enabled: 0, permissions: JSON.stringify({ isEnabled: false, canApprove: true }) });
    expect(rows.find((row) => row.role_key === "risk_manager")).toMatchObject({ enabled: 1, permissions: untouchedPermissions });
  });

  it("inserts only the requested tenant-role pair when that pair does not exist", async () => {
    const tenantId = "tenant-role-absent-pair";
    await adminConnection!.query(
      `INSERT INTO \`${scratchDatabase}\`.tenant_role_configs (tenant_id, role_key, enabled, permissions)
       VALUES (?, ?, ?, ?)`,
      [tenantId, "executive", 1, JSON.stringify({ canApprove: true })]
    );

    await updateTenantRoleConfig(tenantId, "claims_manager", { isEnabled: false, canReject: true });

    const [rows] = await adminConnection!.execute<RoleRow[]>(
      `SELECT tenant_id, role_key, enabled, permissions
       FROM \`${scratchDatabase}\`.tenant_role_configs
       WHERE tenant_id = ? ORDER BY role_key`,
      [tenantId]
    );
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.role_key === "executive")).toMatchObject({ enabled: 1, permissions: JSON.stringify({ canApprove: true }) });
    expect(rows.find((row) => row.role_key === "claims_manager")).toMatchObject({ enabled: 0, permissions: JSON.stringify({ isEnabled: false, canReject: true }) });
  });

  afterAll(async () => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    if (adminConnection) {
      await adminConnection.query(`DROP DATABASE IF EXISTS \`${scratchDatabase}\``);
      const [remaining] = await adminConnection.execute<RowDataPacket[]>(
        "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?",
        [scratchDatabase]
      );
      await adminConnection.end();
      expect(remaining).toHaveLength(0);
    }
  });
});
