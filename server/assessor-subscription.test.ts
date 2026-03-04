/**
 * Tests: Assessor Subscription — Free / Pro Tier
 *
 * Validates:
 *   1. assessor_subscriptions table exists with all required columns.
 *   2. getOrCreateSubscription creates a free-tier default for new assessors.
 *   3. getOrCreateSubscription returns existing row without creating a duplicate.
 *   4. checkAssignmentCap allows assignment when under the free cap.
 *   5. checkAssignmentCap throws FORBIDDEN when free cap is reached.
 *   6. Pro tier bypasses the cap check entirely.
 *   7. Expired pro subscription falls back to free-tier enforcement.
 *   8. upsertSubscription correctly upgrades free → pro and sets cap to 9999.
 *   9. upsertSubscription correctly downgrades pro → free and resets cap to 10.
 *  10. ASSESSOR_TIER_CAPS constants are correct.
 */

import { describe, it, expect, afterEach } from "vitest";
import { getDb } from "./db";
import { assessorSubscriptions, ASSESSOR_TIER_CAPS } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import {
  getOrCreateSubscription,
  getMonthlyAssignmentCount,
  checkAssignmentCap,
  upsertSubscription,
} from "./assessor-subscription";

// ─── Synthetic test user IDs (high to avoid collisions) ──────────────────────
const TEST_USER_FREE  = 9_000_001;
const TEST_USER_PRO   = 9_000_002;
const TEST_USER_EXP   = 9_000_003; // expired pro

async function cleanupTestUsers() {
  const db = await getDb();
  if (!db) return;
  for (const uid of [TEST_USER_FREE, TEST_USER_PRO, TEST_USER_EXP]) {
    await db.delete(assessorSubscriptions).where(eq(assessorSubscriptions.userId, uid));
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Assessor Subscription — Free / Pro Tier", () => {
  afterEach(cleanupTestUsers);

  // 1. Table structure
  it("assessor_subscriptions table has all required columns", async () => {
    const db = await getDb();
    if (!db) return;

    const [rows] = await db.execute(`
      SELECT COLUMN_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_NAME = 'assessor_subscriptions'
      ORDER BY COLUMN_NAME
    `);

    const cols = (rows as { COLUMN_NAME: string }[]).map((r) => r.COLUMN_NAME);
    const required = [
      "id", "marketplace_profile_id", "user_id",
      "tier", "max_claims_per_month", "expires_at",
      "created_at", "updated_at",
    ];
    for (const col of required) {
      expect(cols, `Missing column: ${col}`).toContain(col);
    }
  });

  // 2. Auto-create free tier
  it("creates a free-tier subscription for a new assessor", async () => {
    const sub = await getOrCreateSubscription(TEST_USER_FREE, "mp-test-free");
    expect(sub).not.toBeNull();
    expect(sub.tier).toBe("free");
    expect(sub.maxClaimsPerMonth).toBe(10);
    expect(sub.userId).toBe(TEST_USER_FREE);
  });

  // 3. No duplicate on second call
  it("returns existing subscription without creating a duplicate", async () => {
    const sub1 = await getOrCreateSubscription(TEST_USER_FREE, "mp-test-free");
    const sub2 = await getOrCreateSubscription(TEST_USER_FREE, "mp-test-free");
    expect(sub1.id).toBe(sub2.id);

    const db = await getDb();
    if (!db) return;
    const rows = await db
      .select()
      .from(assessorSubscriptions)
      .where(eq(assessorSubscriptions.userId, TEST_USER_FREE));
    expect(rows.length).toBe(1);
  });

  // 4. Cap check allows when under limit
  it("allows assignment when monthly count is below free cap", async () => {
    await getOrCreateSubscription(TEST_USER_FREE, "mp-test-free");
    // Monthly count for TEST_USER_FREE will be 0 (no real claims in test DB)
    const result = await checkAssignmentCap(TEST_USER_FREE);
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe("free");
    expect(result.cap).toBe(10);
  });

  // 5. Cap check throws when free cap is reached
  it("throws FORBIDDEN when free-tier monthly cap is reached", async () => {
    const db = await getDb();
    if (!db) return;

    // Set max_claims_per_month to 0 to simulate cap reached
    await db.insert(assessorSubscriptions).values({
      userId: TEST_USER_FREE,
      marketplaceProfileId: "mp-test-cap",
      tier: "free",
      maxClaimsPerMonth: 0, // cap = 0 → immediately reached
      createdAt: new Date().toISOString().slice(0, 19).replace("T", " "),
      updatedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
    });

    await expect(checkAssignmentCap(TEST_USER_FREE)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  // 6. Pro tier bypasses cap
  it("pro tier always allows assignment (no cap check)", async () => {
    const db = await getDb();
    if (!db) return;

    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    const futureExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

    await db.insert(assessorSubscriptions).values({
      userId: TEST_USER_PRO,
      marketplaceProfileId: "mp-test-pro",
      tier: "pro",
      maxClaimsPerMonth: 9999,
      expiresAt: futureExpiry,
      createdAt: now,
      updatedAt: now,
    });

    const result = await checkAssignmentCap(TEST_USER_PRO);
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe("pro");
    expect(result.cap).toBe(9999);
  });

  // 7. Expired pro falls back to free enforcement
  it("expired pro subscription falls back to free-tier enforcement", async () => {
    const db = await getDb();
    if (!db) return;

    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    const pastExpiry = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

    // Insert expired pro with cap=0 to force cap-reached scenario
    await db.insert(assessorSubscriptions).values({
      userId: TEST_USER_EXP,
      marketplaceProfileId: "mp-test-exp",
      tier: "pro",
      maxClaimsPerMonth: 0, // expired → falls back to free cap of 10, but we override to 0 to test
      expiresAt: pastExpiry,
      createdAt: now,
      updatedAt: now,
    });

    // The effective cap after expiry is ASSESSOR_TIER_CAPS.free.maxClaimsPerMonth (10)
    // Monthly count for TEST_USER_EXP = 0, so it should still be allowed
    const result = await checkAssignmentCap(TEST_USER_EXP);
    expect(result.isExpired).toBe(true);
    expect(result.tier).toBe("free");
    expect(result.cap).toBe(ASSESSOR_TIER_CAPS.free.maxClaimsPerMonth);
    expect(result.allowed).toBe(true); // 0 used < 10 cap
  });

  // 8. Upgrade free → pro
  it("upsertSubscription upgrades free to pro with cap 9999", async () => {
    await getOrCreateSubscription(TEST_USER_FREE, "mp-test-free");
    const updated = await upsertSubscription(TEST_USER_FREE, "mp-test-free", "pro");
    expect(updated.tier).toBe("pro");
    expect(updated.maxClaimsPerMonth).toBe(9999);
  });

  // 9. Downgrade pro → free
  it("upsertSubscription downgrades pro to free with cap 10", async () => {
    await upsertSubscription(TEST_USER_FREE, "mp-test-free", "pro");
    const downgraded = await upsertSubscription(TEST_USER_FREE, "mp-test-free", "free");
    expect(downgraded.tier).toBe("free");
    expect(downgraded.maxClaimsPerMonth).toBe(10);
  });

  // 10. Tier cap constants
  it("ASSESSOR_TIER_CAPS constants are correct", () => {
    expect(ASSESSOR_TIER_CAPS.free.maxClaimsPerMonth).toBe(10);
    expect(ASSESSOR_TIER_CAPS.free.label).toBe("Free");
    expect(ASSESSOR_TIER_CAPS.pro.maxClaimsPerMonth).toBe(9999);
    expect(ASSESSOR_TIER_CAPS.pro.label).toBe("Pro");
  });
});
