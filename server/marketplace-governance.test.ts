/**
 * Marketplace Governance Model Tests
 *
 * Verifies:
 *   1. insurer_marketplace_relationships table exists with correct columns
 *   2. Dual-filter query logic (platform approval + insurer SLA approval)
 *   3. Blacklisted/suspended providers are excluded from claimant view
 *   4. Preferred providers are sorted first
 *   5. UNIQUE constraint prevents duplicate insurer-profile relationships
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "./db";
import {
  marketplaceProfiles,
  insurerMarketplaceRelationships,
} from "../drizzle/schema";
import { randomUUID } from "crypto";

const TEST_INSURER_TENANT = `test-gov-${Date.now()}`;
const createdProfileIds: string[] = [];

describe("Marketplace Governance Model", () => {
  let db: Awaited<ReturnType<typeof getDb>>;

  beforeAll(async () => {
    db = await getDb();
    if (!db) throw new Error("DB unavailable");
  });

  afterAll(async () => {
    if (!db || createdProfileIds.length === 0) return;
    // Remove all test relationships first (FK constraint)
    await db
      .delete(insurerMarketplaceRelationships)
      .where(inArray(insurerMarketplaceRelationships.marketplaceProfileId, createdProfileIds));
    // Then remove test profiles
    await db
      .delete(marketplaceProfiles)
      .where(inArray(marketplaceProfiles.id, createdProfileIds));
  });

  it("insurer_marketplace_relationships table has required governance columns", async () => {
    const [rows] = await db!.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'insurer_marketplace_relationships'
      ORDER BY ORDINAL_POSITION
    `) as [Array<{ COLUMN_NAME: string }>, unknown];

    const colNames = rows.map(r => r.COLUMN_NAME);
    expect(colNames).toContain("id");
    expect(colNames).toContain("insurer_tenant_id");
    expect(colNames).toContain("marketplace_profile_id");
    expect(colNames).toContain("relationship_status");
    expect(colNames).toContain("sla_signed");
    expect(colNames).toContain("preferred");
    expect(colNames).toContain("notes");
    expect(colNames).toContain("created_at");
    expect(colNames).toContain("updated_at");
  });

  it("relationship_status column has correct ENUM values (approved, suspended, blacklisted)", async () => {
    const [rows] = await db!.execute(`
      SELECT COLUMN_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'insurer_marketplace_relationships'
        AND COLUMN_NAME = 'relationship_status'
    `) as [Array<{ COLUMN_TYPE: string }>, unknown];

    expect(rows.length).toBe(1);
    const colType = rows[0].COLUMN_TYPE;
    expect(colType).toContain("approved");
    expect(colType).toContain("suspended");
    expect(colType).toContain("blacklisted");
  });

  it("dual-filter: only platform-approved + insurer-approved panel beaters are returned", async () => {
    const approvedId = randomUUID();
    const pendingId = randomUUID();
    const suspendedRelId = randomUUID();
    createdProfileIds.push(approvedId, pendingId, suspendedRelId);

    const now = new Date().toISOString().slice(0, 19).replace("T", " ");

    // Profile 1: platform-approved, insurer-approved → should appear
    await db!.insert(marketplaceProfiles).values({
      id: approvedId,
      type: "panel_beater",
      companyName: "Approved PB",
      countryId: "ZA",
      approvalStatus: "approved",
      createdAt: now,
      updatedAt: now,
    });
    await db!.insert(insurerMarketplaceRelationships).values({
      insurerTenantId: TEST_INSURER_TENANT,
      marketplaceProfileId: approvedId,
      relationshipStatus: "approved",
      slaSigned: 1,
      preferred: 0,
      createdAt: now,
      updatedAt: now,
    });

    // Profile 2: platform-pending, insurer-approved → should NOT appear
    await db!.insert(marketplaceProfiles).values({
      id: pendingId,
      type: "panel_beater",
      companyName: "Pending PB",
      countryId: "ZA",
      approvalStatus: "pending",
      createdAt: now,
      updatedAt: now,
    });
    await db!.insert(insurerMarketplaceRelationships).values({
      insurerTenantId: TEST_INSURER_TENANT,
      marketplaceProfileId: pendingId,
      relationshipStatus: "approved",
      slaSigned: 0,
      preferred: 0,
      createdAt: now,
      updatedAt: now,
    });

    // Profile 3: platform-approved, insurer-suspended → should NOT appear
    await db!.insert(marketplaceProfiles).values({
      id: suspendedRelId,
      type: "panel_beater",
      companyName: "Suspended Rel PB",
      countryId: "ZA",
      approvalStatus: "approved",
      createdAt: now,
      updatedAt: now,
    });
    await db!.insert(insurerMarketplaceRelationships).values({
      insurerTenantId: TEST_INSURER_TENANT,
      marketplaceProfileId: suspendedRelId,
      relationshipStatus: "suspended",
      slaSigned: 0,
      preferred: 0,
      createdAt: now,
      updatedAt: now,
    });

    // Run the dual-filter query (mirrors getApprovedPanelBeaters logic)
    const results = await db!
      .select({
        profileId: marketplaceProfiles.id,
        companyName: marketplaceProfiles.companyName,
        approvalStatus: marketplaceProfiles.approvalStatus,
        relationshipStatus: insurerMarketplaceRelationships.relationshipStatus,
      })
      .from(insurerMarketplaceRelationships)
      .innerJoin(
        marketplaceProfiles,
        eq(insurerMarketplaceRelationships.marketplaceProfileId, marketplaceProfiles.id)
      )
      .where(
        and(
          eq(insurerMarketplaceRelationships.insurerTenantId, TEST_INSURER_TENANT),
          eq(insurerMarketplaceRelationships.relationshipStatus, "approved"),
          eq(marketplaceProfiles.approvalStatus, "approved"),
          eq(marketplaceProfiles.type, "panel_beater")
        )
      );

    // Only the first profile should pass both filters
    expect(results.length).toBe(1);
    expect(results[0].profileId).toBe(approvedId);
    expect(results[0].companyName).toBe("Approved PB");
  });

  it("preferred providers sort first in results", async () => {
    const preferredId = randomUUID();
    const normalId = randomUUID();
    createdProfileIds.push(preferredId, normalId);

    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    const preferredTenant = `${TEST_INSURER_TENANT}-pref`;

    // Normal provider (inserted first)
    await db!.insert(marketplaceProfiles).values({
      id: normalId,
      type: "panel_beater",
      companyName: "Normal PB",
      countryId: "ZA",
      approvalStatus: "approved",
      createdAt: now,
      updatedAt: now,
    });
    await db!.insert(insurerMarketplaceRelationships).values({
      insurerTenantId: preferredTenant,
      marketplaceProfileId: normalId,
      relationshipStatus: "approved",
      slaSigned: 0,
      preferred: 0,
      createdAt: now,
      updatedAt: now,
    });

    // Preferred provider (inserted second, should sort first)
    await db!.insert(marketplaceProfiles).values({
      id: preferredId,
      type: "panel_beater",
      companyName: "Preferred PB",
      countryId: "ZA",
      approvalStatus: "approved",
      createdAt: now,
      updatedAt: now,
    });
    await db!.insert(insurerMarketplaceRelationships).values({
      insurerTenantId: preferredTenant,
      marketplaceProfileId: preferredId,
      relationshipStatus: "approved",
      slaSigned: 1,
      preferred: 1,
      createdAt: now,
      updatedAt: now,
    });

    const rawResults = await db!
      .select({
        profileId: marketplaceProfiles.id,
        preferred: insurerMarketplaceRelationships.preferred,
      })
      .from(insurerMarketplaceRelationships)
      .innerJoin(
        marketplaceProfiles,
        eq(insurerMarketplaceRelationships.marketplaceProfileId, marketplaceProfiles.id)
      )
      .where(
        and(
          eq(insurerMarketplaceRelationships.insurerTenantId, preferredTenant),
          eq(insurerMarketplaceRelationships.relationshipStatus, "approved"),
          eq(marketplaceProfiles.approvalStatus, "approved"),
          eq(marketplaceProfiles.type, "panel_beater")
        )
      );

    // Sort: preferred providers first (mirrors router logic)
    rawResults.sort((a, b) => (b.preferred ?? 0) - (a.preferred ?? 0));

    expect(rawResults.length).toBe(2);
    expect(rawResults[0].profileId).toBe(preferredId);
    expect(rawResults[0].preferred).toBe(1);
    expect(rawResults[1].profileId).toBe(normalId);
    expect(rawResults[1].preferred).toBe(0);
  });

  it("blacklisted providers are excluded from claimant view", async () => {
    const blacklistedId = randomUUID();
    createdProfileIds.push(blacklistedId);

    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    const blacklistTenant = `${TEST_INSURER_TENANT}-bl`;

    await db!.insert(marketplaceProfiles).values({
      id: blacklistedId,
      type: "panel_beater",
      companyName: "Blacklisted PB",
      countryId: "ZA",
      approvalStatus: "approved",
      createdAt: now,
      updatedAt: now,
    });
    await db!.insert(insurerMarketplaceRelationships).values({
      insurerTenantId: blacklistTenant,
      marketplaceProfileId: blacklistedId,
      relationshipStatus: "blacklisted",
      slaSigned: 0,
      preferred: 0,
      createdAt: now,
      updatedAt: now,
    });

    const results = await db!
      .select({ profileId: marketplaceProfiles.id })
      .from(insurerMarketplaceRelationships)
      .innerJoin(
        marketplaceProfiles,
        eq(insurerMarketplaceRelationships.marketplaceProfileId, marketplaceProfiles.id)
      )
      .where(
        and(
          eq(insurerMarketplaceRelationships.insurerTenantId, blacklistTenant),
          eq(insurerMarketplaceRelationships.relationshipStatus, "approved"),
          eq(marketplaceProfiles.approvalStatus, "approved"),
          eq(marketplaceProfiles.type, "panel_beater")
        )
      );

    expect(results.length).toBe(0);
  });

  it("UNIQUE constraint prevents duplicate insurer-profile relationships", async () => {
    const dupId = randomUUID();
    createdProfileIds.push(dupId);

    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    const dupTenant = `${TEST_INSURER_TENANT}-dup`;

    await db!.insert(marketplaceProfiles).values({
      id: dupId,
      type: "panel_beater",
      companyName: "Dup Test PB",
      countryId: "ZA",
      approvalStatus: "approved",
      createdAt: now,
      updatedAt: now,
    });

    // First insert should succeed
    await db!.insert(insurerMarketplaceRelationships).values({
      insurerTenantId: dupTenant,
      marketplaceProfileId: dupId,
      relationshipStatus: "approved",
      slaSigned: 0,
      preferred: 0,
      createdAt: now,
      updatedAt: now,
    });

    // Second insert with same tenant+profile should fail (UNIQUE constraint)
    await expect(
      db!.insert(insurerMarketplaceRelationships).values({
        insurerTenantId: dupTenant,
        marketplaceProfileId: dupId,
        relationshipStatus: "approved",
        slaSigned: 0,
        preferred: 0,
        createdAt: now,
        updatedAt: now,
      })
    ).rejects.toThrow();
  });
});
