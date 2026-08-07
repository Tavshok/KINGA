/**
 * KINGA Development Seed Script
 *
 * Creates a complete test environment for local development:
 * - 1 insurer tenant (Old Mutual Zimbabwe)
 * - 1 claims processor user
 * - 1 claimant user
 * - 1 panel beater
 * - 1 test claim (Toyota Corolla, rear impact)
 *
 * Usage: pnpm exec tsx scripts/seed-dev.ts
 *
 * Author: Tavonga Shoko, Lead Engineer
 * WARNING: Do not run in production. This script creates test data only.
 */

import { getDb } from "../server/db";
import {
  users,
  claims,
  panelBeaters,
  insurerTenants,
} from "../drizzle/schema";

const SEED_TENANT_ID = "dev-tenant-old-mutual-zw";
const SEED_CLAIM_NUMBER = "CLM-DEV-TEST-001";

async function seed() {
  const db = await getDb();
  if (!db) {
    console.error("[Seed] Database not available. Check DATABASE_URL environment variable.");
    process.exit(1);
  }

  console.log("[Seed] Starting development seed...");

  // ── 1. Insurer Tenant ────────────────────────────────────────────────────
  console.log("[Seed] Creating insurer tenant...");
  await db.insert(insurerTenants).values({
    tenantId: SEED_TENANT_ID,
    name: "Old Mutual Zimbabwe (Dev)",
    country: "ZW",
    currency: "USD",
    active: 1,
    createdAt: new Date().toISOString(),
  }).onDuplicateKeyUpdate({ set: { name: "Old Mutual Zimbabwe (Dev)" } });

  // ── 2. Claims Processor User ─────────────────────────────────────────────
  console.log("[Seed] Creating claims processor user...");
  await db.insert(users).values({
    openId: "dev:processor@kinga.ai",
    name: "Dev Processor",
    email: "processor@kinga.ai",
    role: "claims_processor" as any,
    tenantId: SEED_TENANT_ID,
    lastSignedIn: new Date().toISOString(),
  }).onDuplicateKeyUpdate({ set: { name: "Dev Processor" } });

  // ── 3. Claimant User ─────────────────────────────────────────────────────
  console.log("[Seed] Creating claimant user...");
  await db.insert(users).values({
    openId: "dev:claimant@kinga.ai",
    name: "Dev Claimant",
    email: "claimant@kinga.ai",
    role: "claimant" as any,
    tenantId: SEED_TENANT_ID,
    lastSignedIn: new Date().toISOString(),
  }).onDuplicateKeyUpdate({ set: { name: "Dev Claimant" } });

  const [claimant] = await db.select().from(users)
    .where((t: any) => t.email.eq("claimant@kinga.ai")).limit(1);

  // ── 4. Panel Beater ──────────────────────────────────────────────────────
  console.log("[Seed] Creating panel beater...");
  await db.insert(panelBeaters).values({
    name: "Dev Panel Beater Workshop",
    email: "panelbeater@kinga.ai",
    phone: "+263771234567",
    address: "123 Main Street, Harare",
    approved: 1,
    tenantId: SEED_TENANT_ID,
    createdAt: new Date().toISOString(),
  }).onDuplicateKeyUpdate({ set: { name: "Dev Panel Beater Workshop" } });

  // ── 5. Test Claim ────────────────────────────────────────────────────────
  console.log("[Seed] Creating test claim...");
  if (claimant) {
    await db.insert(claims).values({
      claimNumber: SEED_CLAIM_NUMBER,
      claimantId: claimant.id,
      vehicleMake: "Toyota",
      vehicleModel: "Corolla",
      vehicleYear: 2019,
      vehicleRegistration: "ABC 1234",
      incidentDate: "2026-08-01",
      incidentDescription: "Vehicle was rear-ended at traffic lights on Samora Machel Avenue. The other vehicle failed to stop and collided with the rear of my vehicle at approximately 40 km/h. Police attended and a report was filed.",
      incidentLocation: "Samora Machel Avenue, Harare",
      damagePhotos: JSON.stringify([]),
      policyNumber: "OM-POL-2026-001",
      status: "intake_pending" as any,
      workflowState: "intake_queue",
      claimSource: "client_portal",
      tenantId: SEED_TENANT_ID,
      selectedPanelBeaterIds: JSON.stringify([]),
      createdAt: new Date().toISOString(),
    }).onDuplicateKeyUpdate({ set: { status: "intake_pending" as any } });
  }

  console.log("\n[Seed] ✅ Development seed complete!");
  console.log(`\nTest credentials:`);
  console.log(`  Tenant ID:     ${SEED_TENANT_ID}`);
  console.log(`  Processor:     processor@kinga.ai`);
  console.log(`  Claimant:      claimant@kinga.ai`);
  console.log(`  Claim Number:  ${SEED_CLAIM_NUMBER}`);
  console.log(`\nTo trigger the AI pipeline on the test claim:`);
  console.log(`  Find the claim ID in the DB and call triggerAiAssessment(claimId)`);
  console.log(`  Or use the Claims Processor portal to trigger assessment manually.`);

  process.exit(0);
}

seed().catch((err) => {
  console.error("[Seed] Fatal error:", err);
  process.exit(1);
});

