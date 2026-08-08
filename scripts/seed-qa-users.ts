/**
 * seed-qa-users.ts — Idempotent QA seed script
 *
 * Creates one synthetic QA user per role under the kinga-qa-internal tenant.
 * Safe to re-run: uses INSERT IGNORE / upsert semantics.
 * These accounts exist to be impersonated by superadmin for QA testing.
 * Direct login is disabled (isQaAccount = 1).
 *
 * Run: npx tsx scripts/seed-qa-users.ts
 */
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "../drizzle/schema";
import { eq } from "drizzle-orm";

const QA_TENANT_ID = "kinga-qa-internal";
const QA_TENANT_NAME = "KINGA QA Internal";

const QA_ROLES: Array<{
  role: typeof schema.users.$inferInsert["role"];
  insurerRole?: typeof schema.users.$inferInsert["insurerRole"];
  email: string;
  name: string;
  openId: string;
}> = [
  { role: "claimant",       email: "qa-claimant@kinga.internal",         name: "QA Claimant",          openId: "qa-claimant-openid" },
  { role: "insurer",        insurerRole: "claims_processor", email: "qa-claims-processor@kinga.internal", name: "QA Claims Processor", openId: "qa-claims-processor-openid" },
  { role: "insurer",        insurerRole: "executive",        email: "qa-executive@kinga.internal",        name: "QA Executive",         openId: "qa-executive-openid" },
  { role: "insurer",        insurerRole: "claims_manager",   email: "qa-claims-manager@kinga.internal",   name: "QA Claims Manager",    openId: "qa-claims-manager-openid" },
  { role: "insurer",        insurerRole: "risk_manager",     email: "qa-risk-manager@kinga.internal",     name: "QA Risk Manager",      openId: "qa-risk-manager-openid" },
  { role: "insurer",        insurerRole: "assessor_internal",email: "qa-assessor-internal@kinga.internal",name: "QA Internal Assessor", openId: "qa-assessor-internal-openid" },
  { role: "insurer",        insurerRole: "recovery_officer", email: "qa-recovery-officer@kinga.internal", name: "QA Recovery Officer",  openId: "qa-recovery-officer-openid" },
  { role: "insurer",        insurerRole: "insurer_admin",    email: "qa-insurer-admin@kinga.internal",    name: "QA Insurer Admin",     openId: "qa-insurer-admin-openid" },
  { role: "assessor",       email: "qa-assessor@kinga.internal",          name: "QA Assessor",          openId: "qa-assessor-openid" },
  { role: "panel_beater",   email: "qa-panel-beater@kinga.internal",      name: "QA Panel Beater",      openId: "qa-panel-beater-openid" },
  { role: "fleet_manager",  email: "qa-fleet-manager@kinga.internal",     name: "QA Fleet Manager",     openId: "qa-fleet-manager-openid" },
  { role: "fleet_admin",    email: "qa-fleet-admin@kinga.internal",       name: "QA Fleet Admin",       openId: "qa-fleet-admin-openid" },
  { role: "fleet_driver",   email: "qa-fleet-driver@kinga.internal",      name: "QA Fleet Driver",      openId: "qa-fleet-driver-openid" },
  { role: "agency",         email: "qa-agency@kinga.internal",            name: "QA Agency",            openId: "qa-agency-openid" },
  { role: "engineer",       email: "qa-engineer@kinga.internal",          name: "QA Engineer",          openId: "qa-engineer-openid" },
];

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const db = drizzle(conn, { schema, mode: "default" });

  console.log("🌱 Seeding QA tenant and users...");

  // 1. Upsert the synthetic tenant
  await db.insert(schema.tenants).values({
    id: QA_TENANT_ID,
    name: QA_TENANT_NAME,
    displayName: QA_TENANT_NAME,
    contactEmail: "qa@kinga.internal",
    billingEmail: "qa@kinga.internal",
    isSyntheticTenant: 1,
    status: "active",
  }).onDuplicateKeyUpdate({
    set: { isSyntheticTenant: 1, displayName: QA_TENANT_NAME },
  });
  console.log(`✅ Tenant: ${QA_TENANT_ID}`);

  // 2. Upsert each QA user
  for (const user of QA_ROLES) {
    await db.insert(schema.users).values({
      openId: user.openId,
      email: user.email,
      name: user.name,
      role: user.role,
      insurerRole: user.insurerRole ?? null,
      tenantId: QA_TENANT_ID,
      isQaAccount: 1,
      isActive: 1,
      emailVerified: 1,
    }).onDuplicateKeyUpdate({
      set: {
        name: user.name,
        role: user.role,
        insurerRole: user.insurerRole ?? null,
        tenantId: QA_TENANT_ID,
        isQaAccount: 1,
        isActive: 1,
      },
    });
    console.log(`✅ User: ${user.email} (${user.role}${user.insurerRole ? `/${user.insurerRole}` : ""})`);
  }

  console.log(`\n✅ Done. ${QA_ROLES.length} QA users seeded under tenant '${QA_TENANT_ID}'.`);
  console.log("   These accounts are QA-only (isQaAccount=1). Use superadmin impersonation to test them.");
  await conn.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
