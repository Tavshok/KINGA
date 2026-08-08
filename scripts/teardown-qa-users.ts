/**
 * teardown-qa-users.ts — Remove all QA seed data
 *
 * Deletes all users under kinga-qa-internal tenant and the tenant itself.
 * Safe to re-run (idempotent).
 *
 * Run: npx tsx scripts/teardown-qa-users.ts
 */
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "../drizzle/schema";
import { eq } from "drizzle-orm";

const QA_TENANT_ID = "kinga-qa-internal";

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const db = drizzle(conn, { schema, mode: "default" });

  console.log("🗑️  Tearing down QA seed data...");

  // Delete all users under the QA tenant
  const deleted = await db.delete(schema.users).where(eq(schema.users.tenantId, QA_TENANT_ID));
  console.log(`✅ Deleted QA users (tenantId=${QA_TENANT_ID})`);

  // Delete the tenant
  await db.delete(schema.tenants).where(eq(schema.tenants.id, QA_TENANT_ID));
  console.log(`✅ Deleted tenant: ${QA_TENANT_ID}`);

  console.log("\n✅ Teardown complete.");
  await conn.end();
}

main().catch((err) => { console.error(err); process.exit(1); });

