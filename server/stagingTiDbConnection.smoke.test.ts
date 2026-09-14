/**
 * Staging TiDB connection smoke test.
 *
 * This test is deliberately opt-in: run it only with
 * RUN_STAGING_CONNECTION_SMOKE=1 and KINGA_STAGING_DATABASE_URL configured.
 * It never reads application rows or changes schema/data. It proves only the
 * TLS connection, database identity, effective account and its own grants.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createConnection, type Connection, type RowDataPacket } from "mysql2/promise";

const shouldRun = process.env.RUN_STAGING_CONNECTION_SMOKE === "1";
const stagingUrl = process.env.KINGA_STAGING_DATABASE_URL;

type IdentityRow = RowDataPacket & {
  database_name: string | null;
  effective_user: string;
  server_version: string;
};

describe.skipIf(!shouldRun)("KINGA staging TiDB connection", () => {
  let connection: Connection;

  beforeAll(async () => {
    expect(stagingUrl, "KINGA_STAGING_DATABASE_URL must be configured").toBeTruthy();
    connection = await createConnection(stagingUrl!);
  }, 30_000);

  afterAll(async () => {
    await connection?.end();
  });

  it("uses TLS and identifies the configured staging database without reading application data", async () => {
    const [identity] = await connection.query<IdentityRow[]>(
      "SELECT DATABASE() AS database_name, CURRENT_USER() AS effective_user, VERSION() AS server_version"
    );
    const [tlsRows] = await connection.query<RowDataPacket[]>("SHOW STATUS LIKE 'Ssl_cipher'");

    expect(identity).toHaveLength(1);
    expect(identity[0]?.database_name).toBeTruthy();
    expect(identity[0]?.effective_user).toBeTruthy();
    expect(identity[0]?.server_version).toBeTruthy();

    const tlsCipher = tlsRows[0]?.Value;
    expect(typeof tlsCipher).toBe("string");
    expect(String(tlsCipher).trim().length).toBeGreaterThan(0);

    console.info("[STAGING_TIDB_IDENTITY]", {
      database: identity[0]?.database_name,
      effectiveUser: identity[0]?.effective_user,
      serverVersion: identity[0]?.server_version,
      tlsCipher,
    });
  });

  it("has read-only grants suitable for initial verification", async () => {
    const [grantRows] = await connection.query<RowDataPacket[]>("SHOW GRANTS");
    const grants = grantRows.flatMap(row => Object.values(row).map(String)).join("\n");

    expect(grants).toMatch(/\bSELECT\b/i);
    expect(grants).not.toMatch(/\b(ALL PRIVILEGES|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT OPTION)\b/i);
  });

  it("lists only metadata for the selected staging database", async () => {
    const [tables] = await connection.query<RowDataPacket[]>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name LIMIT 25"
    );

    console.info("[STAGING_TIDB_SCHEMA]", {
      tableCountPreview: tables.length,
      tableNames: tables.map(row => String(row.table_name)),
    });
    expect(Array.isArray(tables)).toBe(true);
  });
});
