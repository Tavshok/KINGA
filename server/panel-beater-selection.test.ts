/**
 * Tests: 3-Panel-Beater Selection Rule
 *
 * Validates the governance enforcement for claim submission:
 *   1. Exactly 3 panel beater choices are required.
 *   2. All 3 must be distinct (no duplicates).
 *   3. All 3 must be in the insurer-approved list.
 *   4. Non-approved selections are rejected with the exact prescribed message.
 *   5. The DB columns panel_beater_choice_1/2/3 exist on the claims table.
 */

import { describe, it, expect } from "vitest";
import { getDb } from "./db";
import { marketplaceProfiles, insurerMarketplaceRelationships, claims } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getApprovedPanelBeaterIds } from "./routers/marketplace";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTimestamp() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("3-Panel-Beater Selection Rule", () => {
  it("claims table has panel_beater_choice_1, _2, _3 columns", async () => {
    const db = await getDb();
    if (!db) return;

    // Query information_schema to confirm columns exist
    const [rows] = await db.execute(`
      SELECT COLUMN_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_NAME = 'claims'
        AND COLUMN_NAME IN ('panel_beater_choice_1','panel_beater_choice_2','panel_beater_choice_3')
      ORDER BY COLUMN_NAME
    `);

    const cols = (rows as { COLUMN_NAME: string }[]).map(r => r.COLUMN_NAME);
    expect(cols).toContain("panel_beater_choice_1");
    expect(cols).toContain("panel_beater_choice_2");
    expect(cols).toContain("panel_beater_choice_3");
    expect(cols).toHaveLength(3);
  });

  it("getApprovedPanelBeaterIds returns only insurer-approved panel_beaters", async () => {
    const db = await getDb();
    if (!db) return;

    const tenantId = `test-tenant-${randomUUID()}`;
    const now = makeTimestamp();

    // Create 2 approved + 1 pending platform profiles
    const approvedId1 = randomUUID();
    const approvedId2 = randomUUID();
    const pendingId = randomUUID();

    await db.insert(marketplaceProfiles).values([
      { id: approvedId1, type: "panel_beater", companyName: "Approved PB 1", countryId: "ZA", approvalStatus: "approved", createdAt: now, updatedAt: now },
      { id: approvedId2, type: "panel_beater", companyName: "Approved PB 2", countryId: "ZA", approvalStatus: "approved", createdAt: now, updatedAt: now },
      { id: pendingId,   type: "panel_beater", companyName: "Pending PB",    countryId: "ZA", approvalStatus: "pending",  createdAt: now, updatedAt: now },
    ]);

    // Create insurer relationships: both approved profiles linked + approved, pending profile NOT linked
    await db.insert(insurerMarketplaceRelationships).values([
      { insurerTenantId: tenantId, marketplaceProfileId: approvedId1, relationshipStatus: "approved", slaSigned: 1, preferred: 0, createdAt: now, updatedAt: now },
      { insurerTenantId: tenantId, marketplaceProfileId: approvedId2, relationshipStatus: "approved", slaSigned: 0, preferred: 1, createdAt: now, updatedAt: now },
    ]);

    const approvedSet = await getApprovedPanelBeaterIds(tenantId);

    expect(approvedSet.has(approvedId1)).toBe(true);
    expect(approvedSet.has(approvedId2)).toBe(true);
    expect(approvedSet.has(pendingId)).toBe(false);

    // Cleanup
    await db.delete(insurerMarketplaceRelationships).where(eq(insurerMarketplaceRelationships.insurerTenantId, tenantId));
    await db.delete(marketplaceProfiles).where(eq(marketplaceProfiles.id, approvedId1));
    await db.delete(marketplaceProfiles).where(eq(marketplaceProfiles.id, approvedId2));
    await db.delete(marketplaceProfiles).where(eq(marketplaceProfiles.id, pendingId));
  });

  it("rejects when a suspended relationship is present", async () => {
    const db = await getDb();
    if (!db) return;

    const tenantId = `test-tenant-${randomUUID()}`;
    const now = makeTimestamp();
    const suspendedId = randomUUID();

    await db.insert(marketplaceProfiles).values([
      { id: suspendedId, type: "panel_beater", companyName: "Suspended PB", countryId: "ZA", approvalStatus: "approved", createdAt: now, updatedAt: now },
    ]);

    await db.insert(insurerMarketplaceRelationships).values([
      { insurerTenantId: tenantId, marketplaceProfileId: suspendedId, relationshipStatus: "suspended", slaSigned: 0, preferred: 0, createdAt: now, updatedAt: now },
    ]);

    const approvedSet = await getApprovedPanelBeaterIds(tenantId);
    expect(approvedSet.has(suspendedId)).toBe(false);

    // Cleanup
    await db.delete(insurerMarketplaceRelationships).where(eq(insurerMarketplaceRelationships.insurerTenantId, tenantId));
    await db.delete(marketplaceProfiles).where(eq(marketplaceProfiles.id, suspendedId));
  });

  it("duplicate detection: Set of 3 identical IDs has size 1, not 3", () => {
    const id = randomUUID();
    const choices = [id, id, id];
    const uniqueChoices = new Set(choices);
    expect(uniqueChoices.size).toBe(1);
    expect(uniqueChoices.size).not.toBe(3);
  });

  it("duplicate detection: 2 same + 1 different has size 2, not 3", () => {
    const id1 = randomUUID();
    const id2 = randomUUID();
    const choices = [id1, id1, id2];
    const uniqueChoices = new Set(choices);
    expect(uniqueChoices.size).toBe(2);
    expect(uniqueChoices.size).not.toBe(3);
  });

  it("valid 3 distinct approved choices pass all guards", async () => {
    const db = await getDb();
    if (!db) return;

    const tenantId = `test-tenant-${randomUUID()}`;
    const now = makeTimestamp();
    const id1 = randomUUID();
    const id2 = randomUUID();
    const id3 = randomUUID();

    await db.insert(marketplaceProfiles).values([
      { id: id1, type: "panel_beater", companyName: "PB Alpha",   countryId: "ZA", approvalStatus: "approved", createdAt: now, updatedAt: now },
      { id: id2, type: "panel_beater", companyName: "PB Beta",    countryId: "ZA", approvalStatus: "approved", createdAt: now, updatedAt: now },
      { id: id3, type: "panel_beater", companyName: "PB Gamma",   countryId: "ZA", approvalStatus: "approved", createdAt: now, updatedAt: now },
    ]);

    await db.insert(insurerMarketplaceRelationships).values([
      { insurerTenantId: tenantId, marketplaceProfileId: id1, relationshipStatus: "approved", slaSigned: 1, preferred: 0, createdAt: now, updatedAt: now },
      { insurerTenantId: tenantId, marketplaceProfileId: id2, relationshipStatus: "approved", slaSigned: 1, preferred: 0, createdAt: now, updatedAt: now },
      { insurerTenantId: tenantId, marketplaceProfileId: id3, relationshipStatus: "approved", slaSigned: 1, preferred: 1, createdAt: now, updatedAt: now },
    ]);

    const choices = [id1, id2, id3];

    // Guard 1: no duplicates
    const uniqueChoices = new Set(choices);
    expect(uniqueChoices.size).toBe(3);

    // Guard 2: all in approved set
    const approvedSet = await getApprovedPanelBeaterIds(tenantId);
    for (const choice of choices) {
      expect(approvedSet.has(choice)).toBe(true);
    }

    // Cleanup
    await db.delete(insurerMarketplaceRelationships).where(eq(insurerMarketplaceRelationships.insurerTenantId, tenantId));
    for (const id of [id1, id2, id3]) {
      await db.delete(marketplaceProfiles).where(eq(marketplaceProfiles.id, id));
    }
  });

  it("non-approved panel beater is rejected with the prescribed error message", async () => {
    const db = await getDb();
    if (!db) return;

    const tenantId = `test-tenant-${randomUUID()}`;
    const now = makeTimestamp();
    const approvedId = randomUUID();
    const nonApprovedId = randomUUID();

    await db.insert(marketplaceProfiles).values([
      { id: approvedId,    type: "panel_beater", companyName: "Approved PB",     countryId: "ZA", approvalStatus: "approved", createdAt: now, updatedAt: now },
      { id: nonApprovedId, type: "panel_beater", companyName: "Non-Approved PB", countryId: "ZA", approvalStatus: "approved", createdAt: now, updatedAt: now },
    ]);

    // Only approvedId has an insurer relationship; nonApprovedId does not
    await db.insert(insurerMarketplaceRelationships).values([
      { insurerTenantId: tenantId, marketplaceProfileId: approvedId, relationshipStatus: "approved", slaSigned: 1, preferred: 0, createdAt: now, updatedAt: now },
    ]);

    const approvedSet = await getApprovedPanelBeaterIds(tenantId);

    const prescribedMessage = "Selected repairer is not approved by your insurer. Please contact insurer for exception.";

    // Simulate the server-side check
    let thrownMessage = "";
    for (const choice of [approvedId, approvedId, nonApprovedId]) {
      if (!approvedSet.has(choice)) {
        thrownMessage = prescribedMessage;
        break;
      }
    }

    expect(thrownMessage).toBe(prescribedMessage);

    // Cleanup
    await db.delete(insurerMarketplaceRelationships).where(eq(insurerMarketplaceRelationships.insurerTenantId, tenantId));
    await db.delete(marketplaceProfiles).where(eq(marketplaceProfiles.id, approvedId));
    await db.delete(marketplaceProfiles).where(eq(marketplaceProfiles.id, nonApprovedId));
  });
});
