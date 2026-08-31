// @ts-nocheck
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "../routers";
import { users, assessors, assessorInsurerRelationships } from "../../drizzle/schema";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../db";

describe("Assessor Onboarding Router", () => {
  let insurerContext: any;
  let assessorContext: any;
  const ownedUserIds: number[] = [];
  const ownedAssessorIds: number[] = [];

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available for tests");

    // Create test insurer user
    const insurerOpenId = `test_insurer_${Date.now()}`;
    await db.insert(users).values({
      openId: insurerOpenId,
      email: `insurer_${Date.now()}@test.com`,
      name: "Test Insurer",
      role: "insurer",
      tenantId: "test-tenant-001",
      emailVerified: 1,
    });

    const insurerUser = await db
      .select()
      .from(users)
      .where(eq(users.openId, insurerOpenId))
      .limit(1);

    insurerContext = {
      user: {
        id: insurerUser[0].id,
        openId: insurerUser[0].openId,
        email: insurerUser[0].email,
        name: insurerUser[0].name,
        role: insurerUser[0].role,
        tenantId: insurerUser[0].tenantId,
      },
    };

    // Create test assessor user
    const assessorOpenId = `test_assessor_${Date.now()}`;
    await db.insert(users).values({
      openId: assessorOpenId,
      email: `assessor_${Date.now()}@test.com`,
      name: "Test Assessor",
      role: "user",
      emailVerified: 1,
    });

    const assessorUser = await db
      .select()
      .from(users)
      .where(eq(users.openId, assessorOpenId))
      .limit(1);

    assessorContext = {
      user: {
        id: assessorUser[0].id,
        openId: assessorUser[0].openId,
        email: assessorUser[0].email,
        name: assessorUser[0].name,
        role: assessorUser[0].role,
        tenantId: assessorUser[0].tenantId,
      },
    };
    ownedUserIds.push(insurerUser[0].id, assessorUser[0].id);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    const relationshipIds = ownedAssessorIds.length > 0
      ? (await db.select({ id: assessorInsurerRelationships.id }).from(assessorInsurerRelationships).where(inArray(assessorInsurerRelationships.assessorId, ownedAssessorIds))).map((row) => row.id)
      : [];
    if (relationshipIds.length > 0) await db.delete(assessorInsurerRelationships).where(inArray(assessorInsurerRelationships.id, relationshipIds));
    if (ownedAssessorIds.length > 0) await db.delete(assessors).where(inArray(assessors.id, ownedAssessorIds));
    if (ownedUserIds.length > 0) await db.delete(users).where(inArray(users.id, ownedUserIds));

    // No-leak proof: lookup filters comprise only exact IDs returned by this suite's writes.
    const [remainingRelationships, remainingAssessors, remainingUsers] = await Promise.all([
      relationshipIds.length > 0 ? db.select({ id: assessorInsurerRelationships.id }).from(assessorInsurerRelationships).where(inArray(assessorInsurerRelationships.id, relationshipIds)) : Promise.resolve([]),
      ownedAssessorIds.length > 0 ? db.select({ id: assessors.id }).from(assessors).where(inArray(assessors.id, ownedAssessorIds)) : Promise.resolve([]),
      ownedUserIds.length > 0 ? db.select({ id: users.id }).from(users).where(inArray(users.id, ownedUserIds)) : Promise.resolve([]),
    ]);
    expect(remainingRelationships).toHaveLength(0);
    expect(remainingAssessors).toHaveLength(0);
    expect(remainingUsers).toHaveLength(0);
  });

  it("should allow insurer to add insurer-owned assessor", async () => {
    const caller = appRouter.createCaller(insurerContext);

    const result = await caller.assessorOnboarding.addInsurerOwnedAssessor({
      name: "John Assessor",
      email: `john_assessor_${Date.now()}@test.com`,
      professionalLicenseNumber: `LIC-${Date.now()}`,
      licenseExpiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      certificationLevel: "senior",
      yearsOfExperience: 5,
      specializations: ["collision", "theft"],
      serviceRegions: ["Gauteng", "Western Cape"],
      maxTravelDistanceKm: 100,
    });

    expect(result.success).toBe(true);
    expect(result.assessorId).toBeDefined();
    expect(result.userId).toBeDefined();
    ownedAssessorIds.push(result.assessorId);
    ownedUserIds.push(result.userId);
  });

  it("should allow user to register as marketplace assessor", async () => {
    const caller = appRouter.createCaller(assessorContext);

    const result = await caller.assessorOnboarding.registerMarketplaceAssessor({
      professionalLicenseNumber: `LIC-MKT-${Date.now()}`,
      licenseExpiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      certificationLevel: "expert",
      yearsOfExperience: 10,
      specializations: ["collision", "hail_damage"],
      serviceRegions: ["Gauteng"],
      maxTravelDistanceKm: 50,
      marketplaceBio: "Experienced assessor with 10 years in the industry specializing in collision and hail damage assessments.",
      marketplaceHourlyRate: 850,
      marketplaceAvailability: "full_time",
      insuranceExpiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });

    expect(result.success).toBe(true);
    expect(result.assessorId).toBeDefined();
    ownedAssessorIds.push(result.assessorId);
  });

  it("should retrieve assessor profile after registration", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available for tests");

    // Create a new unique assessor user for this test
    const uniqueAssessorOpenId = `test_assessor_profile_${Date.now()}`;
    await db.insert(users).values({
      openId: uniqueAssessorOpenId,
      email: `assessor_profile_${Date.now()}@test.com`,
      name: "Test Profile Assessor",
      role: "user",
      emailVerified: 1,
    });

    const uniqueAssessorUser = await db
      .select()
      .from(users)
      .where(eq(users.openId, uniqueAssessorOpenId))
      .limit(1);

    const uniqueContext = {
      user: {
        id: uniqueAssessorUser[0].id,
        openId: uniqueAssessorUser[0].openId,
        email: uniqueAssessorUser[0].email,
        name: uniqueAssessorUser[0].name,
        role: uniqueAssessorUser[0].role,
        tenantId: uniqueAssessorUser[0].tenantId,
      },
    };

    // First register
    const caller = appRouter.createCaller(uniqueContext);

    const registration = await caller.assessorOnboarding.registerMarketplaceAssessor({
      professionalLicenseNumber: `LIC-PROF-${Date.now()}`,
      licenseExpiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      certificationLevel: "master",
      yearsOfExperience: 15,
      specializations: ["total_loss", "fire_damage"],
      serviceRegions: ["KwaZulu-Natal"],
      maxTravelDistanceKm: 75,
      marketplaceBio: "Master assessor with extensive experience in complex claims including total loss and fire damage.",
      marketplaceHourlyRate: 1200,
      marketplaceAvailability: "on_demand",
      insuranceExpiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });
    ownedUserIds.push(uniqueAssessorUser[0].id);
    ownedAssessorIds.push(registration.assessorId);

    // Update context to assessor role
    uniqueContext.user.role = "assessor";

    // Then retrieve profile
    const profile = await caller.assessorOnboarding.getMyProfile();

    expect(profile).toBeDefined();
    expect(profile?.assessorType).toBe("marketplace");
    expect(profile?.specializations).toContain("total_loss");
    expect(profile?.serviceRegions).toContain("KwaZulu-Natal");
  });

  it("should list insurer's assessors", async () => {
    const caller = appRouter.createCaller(insurerContext);

    // Add an assessor first
    const listAssessor = await caller.assessorOnboarding.addInsurerOwnedAssessor({
      name: "Jane Assessor",
      email: `jane_assessor_${Date.now()}@test.com`,
      professionalLicenseNumber: `LIC-LIST-${Date.now()}`,
      licenseExpiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      certificationLevel: "junior",
      yearsOfExperience: 2,
      specializations: ["minor_damage"],
      serviceRegions: ["Eastern Cape"],
      maxTravelDistanceKm: 30,
    });
    ownedAssessorIds.push(listAssessor.assessorId);
    ownedUserIds.push(listAssessor.userId);

    // List assessors
    const assessors = await caller.assessorOnboarding.listInsurerAssessors();

    expect(Array.isArray(assessors)).toBe(true);
    expect(assessors.length).toBeGreaterThan(0);
  });

  it("should prevent duplicate license numbers", async () => {
    const caller = appRouter.createCaller(insurerContext);

    const licenseNumber = `LIC-DUP-${Date.now()}`;

    // Add first assessor
    const firstAssessor = await caller.assessorOnboarding.addInsurerOwnedAssessor({
      name: "First Assessor",
      email: `first_${Date.now()}@test.com`,
      professionalLicenseNumber: licenseNumber,
      licenseExpiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      certificationLevel: "senior",
    });
    ownedAssessorIds.push(firstAssessor.assessorId);
    ownedUserIds.push(firstAssessor.userId);

    // Try to add second with same license
    await expect(
      caller.assessorOnboarding.addInsurerOwnedAssessor({
        name: "Second Assessor",
        email: `second_${Date.now()}@test.com`,
        professionalLicenseNumber: licenseNumber,
        licenseExpiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        certificationLevel: "junior",
      })
    ).rejects.toThrow("Assessor with this license number already exists");
  });
});
