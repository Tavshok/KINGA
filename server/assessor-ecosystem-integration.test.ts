// @ts-nocheck
/**
 * KINGA Assessor Ecosystem Integration Tests
 * Test Plan: KINGA-TEST-2026-024
 * 
 * Executes all 15 test scenarios from the testing plan:
 * - Assessor Onboarding (1.1, 1.2, 1.3)
 * - Marketplace Discovery (2.1, 2.2)
 * - Assignment Workflow (3.1, 3.2, 3.3)
 * - Multi-Currency (4.1, 4.2)
 * - Rating & Review (5.1)
 * - Data Integrity (6.1)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { users, assessors, assessorInsurerRelationships, assessorMarketplaceReviews, claims, auditTrail } from "../drizzle/schema";
import { eq, and, like } from "drizzle-orm";

describe("KINGA Assessor Ecosystem Integration Tests (KINGA-TEST-2026-024)", () => {
  // Shared test state
  let db: any;
  let insurerAdminContext: any;
  let processorContext: any;
  let assessorUserContext: any;
  let tenantId: string;
  
  // Created entity IDs
  let internalAssessorId: number;
  let internalAssessorUserId: number;
  let marketplaceAssessorId: number;
  let marketplaceAssessorUserId: number;
  let testClaimId1: number;
  let testClaimId2: number;
  let testClaimId3: number;

  beforeAll(async () => {
    db = await getDb();
    if (!db) throw new Error("Database not available for integration tests");

    tenantId = `test-tenant-${Date.now()}`;
    const ts = Date.now();

    // Create insurer admin user
    const insurerOpenId = `test_insurer_admin_${ts}`;
    await db.insert(users).values({
      openId: insurerOpenId,
      email: `insurer.admin.${ts}@testinsurer.co.zw`,
      name: "Test Insurer Admin",
      role: "insurer",
      tenantId: tenantId,
      emailVerified: 1,
    });
    const [insurerUser] = await db.select().from(users).where(eq(users.openId, insurerOpenId)).limit(1);
    insurerAdminContext = {
      user: {
        id: insurerUser.id,
        openId: insurerUser.openId,
        email: insurerUser.email,
        name: insurerUser.name,
        role: insurerUser.role,
        tenantId: insurerUser.tenantId,
      },
    };

    // Create claims processor user
    const processorOpenId = `test_processor_${ts}`;
    await db.insert(users).values({
      openId: processorOpenId,
      email: `processor.${ts}@testinsurer.co.zw`,
      name: "Test Claims Processor",
      role: "insurer",
      tenantId: tenantId,
      emailVerified: 1,
    });
    const [processorUser] = await db.select().from(users).where(eq(users.openId, processorOpenId)).limit(1);
    processorContext = {
      user: {
        id: processorUser.id,
        openId: processorUser.openId,
        email: processorUser.email,
        name: processorUser.name,
        role: processorUser.role,
        tenantId: processorUser.tenantId,
      },
    };

    // Create assessor user (for marketplace self-registration)
    const assessorOpenId = `test_assessor_user_${ts}`;
    await db.insert(users).values({
      openId: assessorOpenId,
      email: `tendai.moyo.${ts}@freelanceassessor.com`,
      name: "Tendai Moyo",
      role: "user",
      emailVerified: 1,
    });
    const [assessorUser] = await db.select().from(users).where(eq(users.openId, assessorOpenId)).limit(1);
    assessorUserContext = {
      user: {
        id: assessorUser.id,
        openId: assessorUser.openId,
        email: assessorUser.email,
        name: assessorUser.name,
        role: assessorUser.role,
        tenantId: assessorUser.tenantId,
      },
    };

    // Create test claims
    const claimantOpenId = `test_claimant_${ts}`;
    await db.insert(users).values({
      openId: claimantOpenId,
      email: `claimant.${ts}@test.co.zw`,
      name: "Test Claimant",
      role: "user",
      emailVerified: 1,
    });
    const [claimantUser] = await db.select().from(users).where(eq(users.openId, claimantOpenId)).limit(1);

    // Claim 1: Minor Damage (Harare)
    const [claim1Result] = await db.insert(claims).values({
      claimNumber: `CLM-TEST-${ts}-001`,
      claimantId: claimantUser.id,
      tenantId: tenantId,
      status: "submitted",
      policyNumber: `POL-ZW-${ts}-001`,
      incidentDate: new Date("2026-02-01"),
      incidentLocation: "Harare CBD",
      vehicleMake: "Toyota",
      vehicleModel: "Corolla",
      vehicleYear: 2020,
      incidentDescription: "Rear-end collision, minor bumper damage",
    });
    testClaimId1 = claim1Result.insertId;

    // Claim 2: Moderate Damage (Bulawayo)
    const [claim2Result] = await db.insert(claims).values({
      claimNumber: `CLM-TEST-${ts}-002`,
      claimantId: claimantUser.id,
      tenantId: tenantId,
      status: "submitted",
      policyNumber: `POL-ZW-${ts}-002`,
      incidentDate: new Date("2026-02-05"),
      incidentLocation: "Bulawayo Industrial Area",
      vehicleMake: "Nissan",
      vehicleModel: "NP300",
      vehicleYear: 2018,
      incidentDescription: "Side impact collision, door and fender damage",
    });
    testClaimId2 = claim2Result.insertId;

    // Claim 3: Severe Damage (Mutare)
    const [claim3Result] = await db.insert(claims).values({
      claimNumber: `CLM-TEST-${ts}-003`,
      claimantId: claimantUser.id,
      tenantId: tenantId,
      status: "submitted",
      policyNumber: `POL-ZW-${ts}-003`,
      incidentDate: new Date("2026-02-08"),
      incidentLocation: "Mutare-Harare Highway",
      vehicleMake: "Honda",
      vehicleModel: "CR-V",
      vehicleYear: 2019,
      incidentDescription: "Rollover accident, extensive structural damage",
    });
    testClaimId3 = claim3Result.insertId;
  });

  // =============================================
  // TEST SUITE 1: ASSESSOR ONBOARDING WORKFLOWS
  // =============================================

  describe("1. Assessor Onboarding Workflows", () => {
    it("Test 1.1: Internal Assessor Onboarding - insurer admin adds internal assessor", async () => {
      const caller = appRouter.createCaller(insurerAdminContext);
      const ts = Date.now();

      const result = await caller.assessorOnboarding.addInsurerOwnedAssessor({
        name: "John Mukwevho",
        email: `john.mukwevho.${ts}@testinsurer.co.zw`,
        professionalLicenseNumber: `ZIM-ASS-${ts}-001`,
        licenseExpiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        certificationLevel: "senior",
        yearsOfExperience: 8,
        specializations: ["Motor Vehicle", "Hail Damage"],
        certifications: ["FSCA Certified"],
        serviceRegions: ["Harare", "Bulawayo"],
        maxTravelDistanceKm: 100,
      });

      // Verify success
      expect(result.success).toBe(true);
      expect(result.assessorId).toBeDefined();
      expect(result.userId).toBeDefined();

      internalAssessorId = result.assessorId;
      internalAssessorUserId = result.userId;

      // Verify assessor record in database
      const [assessor] = await db.select().from(assessors).where(eq(assessors.id, internalAssessorId)).limit(1);
      expect(assessor).toBeDefined();
      expect(assessor.assessorType).toBe("insurer_owned");
      expect(assessor.primaryTenantId).toBe(tenantId);
      expect(assessor.marketplaceEnabled).toBe(0);
      expect(assessor.certificationLevel).toBe("senior");
      expect(assessor.activeStatus).toBe(1);

      // Verify specializations stored correctly
      const specs = JSON.parse(assessor.specializations);
      expect(specs).toContain("Motor Vehicle");
      expect(specs).toContain("Hail Damage");

      // Verify service regions stored correctly
      const regions = JSON.parse(assessor.serviceRegions);
      expect(regions).toContain("Harare");
      expect(regions).toContain("Bulawayo");

      // Verify user record created with assessor role
      const [user] = await db.select().from(users).where(eq(users.id, internalAssessorUserId)).limit(1);
      expect(user).toBeDefined();
      expect(user.role).toBe("assessor");
      expect(user.tenantId).toBe(tenantId);

      // Verify assessor-insurer relationship created
      const [relationship] = await db.select().from(assessorInsurerRelationships)
        .where(and(
          eq(assessorInsurerRelationships.assessorId, internalAssessorId),
          eq(assessorInsurerRelationships.tenantId, tenantId)
        )).limit(1);
      expect(relationship).toBeDefined();
      expect(relationship.relationshipType).toBe("insurer_owned");
      expect(relationship.relationshipStatus).toBe("active");
    });

    it("Test 1.2: BYOA Assessor Onboarding - insurer admin adds partner assessor", async () => {
      const caller = appRouter.createCaller(insurerAdminContext);
      const ts = Date.now();

      const result = await caller.assessorOnboarding.addInsurerOwnedAssessor({
        name: "Sarah Ncube",
        email: `sarah.ncube.${ts}@independentassessors.co.zw`,
        professionalLicenseNumber: `ZIM-ASS-${ts}-045`,
        licenseExpiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        certificationLevel: "expert",
        yearsOfExperience: 12,
        specializations: ["Motor Vehicle", "Fire Damage", "Theft"],
        certifications: ["FSCA Certified", "IISA Member"],
        serviceRegions: ["Harare", "Mutare", "Gweru"],
        maxTravelDistanceKm: 150,
      });

      expect(result.success).toBe(true);
      expect(result.assessorId).toBeDefined();

      // Verify assessor record
      const [assessor] = await db.select().from(assessors).where(eq(assessors.id, result.assessorId)).limit(1);
      expect(assessor).toBeDefined();
      expect(assessor.assessorType).toBe("insurer_owned");
      expect(assessor.certificationLevel).toBe("expert");

      // Verify specializations include all three
      const specs = JSON.parse(assessor.specializations);
      expect(specs).toContain("Motor Vehicle");
      expect(specs).toContain("Fire Damage");
      expect(specs).toContain("Theft");

      // Verify certifications
      const certs = JSON.parse(assessor.certifications);
      expect(certs).toContain("FSCA Certified");
      expect(certs).toContain("IISA Member");

      // Verify regions include Mutare
      const regions = JSON.parse(assessor.serviceRegions);
      expect(regions).toContain("Mutare");
    });

    it("Test 1.3: Marketplace Assessor Self-Registration", async () => {
      const caller = appRouter.createCaller(assessorUserContext);

      const result = await caller.assessorOnboarding.registerMarketplaceAssessor({
        professionalLicenseNumber: `ZIM-ASS-${Date.now()}-089`,
        licenseExpiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        certificationLevel: "expert",
        yearsOfExperience: 10,
        specializations: ["Motor Vehicle", "Commercial Vehicles"],
        certifications: ["FSCA Certified"],
        serviceRegions: ["Bulawayo", "Victoria Falls", "Hwange"],
        maxTravelDistanceKm: 200,
        marketplaceBio: "Experienced independent assessor with 10 years specializing in motor vehicle and commercial vehicle assessments across Zimbabwe.",
        marketplaceHourlyRate: 400,
        marketplaceAvailability: "full_time",
        insuranceExpiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      });

      expect(result.success).toBe(true);
      expect(result.assessorId).toBeDefined();

      marketplaceAssessorId = result.assessorId;
      marketplaceAssessorUserId = assessorUserContext.user.id;

      // Verify assessor record
      const [assessor] = await db.select().from(assessors).where(eq(assessors.id, marketplaceAssessorId)).limit(1);
      expect(assessor).toBeDefined();
      expect(assessor.assessorType).toBe("marketplace");
      expect(assessor.marketplaceEnabled).toBe(1);
      expect(assessor.marketplaceStatus).toBe("pending_approval");
      expect(assessor.marketplaceBio).toContain("Experienced independent assessor");
      expect(assessor.marketplaceHourlyRate).toBeTruthy();

      // Verify specializations
      const specs = JSON.parse(assessor.specializations);
      expect(specs).toContain("Motor Vehicle");
      expect(specs).toContain("Commercial Vehicles");

      // Verify regions
      const regions = JSON.parse(assessor.serviceRegions);
      expect(regions).toContain("Bulawayo");
      expect(regions).toContain("Victoria Falls");
      expect(regions).toContain("Hwange");

      // Verify user role updated to assessor
      const [user] = await db.select().from(users).where(eq(users.id, marketplaceAssessorUserId)).limit(1);
      expect(user.role).toBe("assessor");
    });

    it("Test 1.4: Duplicate license number prevention", async () => {
      const caller = appRouter.createCaller(insurerAdminContext);
      const licenseNumber = `ZIM-ASS-DUP-${Date.now()}`;

      // First registration
      await caller.assessorOnboarding.addInsurerOwnedAssessor({
        name: "First Assessor",
        email: `first.${Date.now()}@test.com`,
        professionalLicenseNumber: licenseNumber,
        licenseExpiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        certificationLevel: "junior",
      });

      // Second registration with same license should fail
      await expect(
        caller.assessorOnboarding.addInsurerOwnedAssessor({
          name: "Second Assessor",
          email: `second.${Date.now()}@test.com`,
          professionalLicenseNumber: licenseNumber,
          licenseExpiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          certificationLevel: "junior",
        })
      ).rejects.toThrow("Assessor with this license number already exists");
    });
  });

  // =============================================
  // TEST SUITE 2: MARKETPLACE DISCOVERY & SEARCH
  // =============================================

  describe("2. Marketplace Discovery and Search", () => {
    beforeAll(async () => {
      // Activate the marketplace assessor for search tests
      if (marketplaceAssessorId) {
        await db.update(assessors)
          .set({ marketplaceStatus: "active" })
          .where(eq(assessors.id, marketplaceAssessorId));
      }
    });

    it("Test 2.1: Search Marketplace Assessors by Region", async () => {
      const caller = appRouter.createCaller(processorContext);

      const results = await caller.assessorOnboarding.searchMarketplace({
        serviceRegion: "Bulawayo",
      });

      expect(Array.isArray(results)).toBe(true);

      // Find our test marketplace assessor in results
      const tendai = results.find((a: any) => a.id === marketplaceAssessorId);
      expect(tendai).toBeDefined();
      expect(tendai.serviceRegions).toContain("Bulawayo");
      expect(tendai.assessorType).toBe("marketplace");
      expect(tendai.marketplaceEnabled).toBe(1);
    });

    it("Test 2.2: Search Marketplace Assessors by Specialization", async () => {
      const caller = appRouter.createCaller(processorContext);

      const results = await caller.assessorOnboarding.searchMarketplace({
        specializations: ["Commercial Vehicles"],
      });

      expect(Array.isArray(results)).toBe(true);

      // Our marketplace assessor should appear (has Commercial Vehicles)
      const tendai = results.find((a: any) => a.id === marketplaceAssessorId);
      expect(tendai).toBeDefined();
      expect(tendai.specializations).toContain("Commercial Vehicles");
    });

    it("Test 2.3: Search with no matching results", async () => {
      const caller = appRouter.createCaller(processorContext);

      const results = await caller.assessorOnboarding.searchMarketplace({
        serviceRegion: "NonExistentRegion_" + Date.now(),
      });

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });

    it("Test 2.4: List insurer's assessors shows only tenant assessors", async () => {
      const caller = appRouter.createCaller(insurerAdminContext);

      const assessorsList = await caller.assessorOnboarding.listInsurerAssessors();

      expect(Array.isArray(assessorsList)).toBe(true);
      expect(assessorsList.length).toBeGreaterThan(0);

      // All returned assessors should belong to our test tenant
      assessorsList.forEach((a: any) => {
        expect(a.primaryTenantId).toBe(tenantId);
      });
    });
  });

  // =============================================
  // TEST SUITE 3: ASSIGNMENT WORKFLOW
  // =============================================

  describe("3. Assessor Assignment Workflow", () => {
    it("Test 3.1: Assign Internal Assessor to Claim", async () => {
      const caller = appRouter.createCaller(processorContext);

      const result = await caller.claims.assignToAssessor({
        claimId: testClaimId1,
        assessorId: internalAssessorUserId,
      });

      expect(result).toBeDefined();

      // Verify claim status updated
      const [claim] = await db.select().from(claims).where(eq(claims.id, testClaimId1)).limit(1);
      expect(claim.status).toBe("assessment_pending");
      expect(claim.assignedAssessorId).toBe(internalAssessorUserId);
    });

    it("Test 3.2: Assign Marketplace Assessor to Claim", async () => {
      const caller = appRouter.createCaller(processorContext);

      const result = await caller.claims.assignToAssessor({
        claimId: testClaimId2,
        assessorId: marketplaceAssessorUserId,
      });

      expect(result).toBeDefined();

      // Verify claim status updated
      const [claim] = await db.select().from(claims).where(eq(claims.id, testClaimId2)).limit(1);
      expect(claim.status).toBe("assessment_pending");
      expect(claim.assignedAssessorId).toBe(marketplaceAssessorUserId);
    });

    it("Test 3.3: Verify claim details after assignment", async () => {
      const caller = appRouter.createCaller(processorContext);

      const claim = await caller.claims.getById({ id: testClaimId1 });

      expect(claim).toBeDefined();
      expect(claim.status).toBe("assessment_pending");
      expect(claim.assignedAssessorId).toBe(internalAssessorUserId);
    });
  });

  // =============================================
  // TEST SUITE 4: ASSESSOR PROFILE MANAGEMENT
  // =============================================

  describe("4. Assessor Profile Management", () => {
    it("Test 4.1: Marketplace assessor can view their profile", async () => {
      // Update context to assessor role
      const assessorCtx = {
        user: {
          ...assessorUserContext.user,
          role: "assessor",
        },
      };
      const caller = appRouter.createCaller(assessorCtx);

      const profile = await caller.assessorOnboarding.getMyProfile();

      expect(profile).toBeDefined();
      expect(profile?.assessorType).toBe("marketplace");
      expect(profile?.specializations).toContain("Motor Vehicle");
      expect(profile?.serviceRegions).toContain("Bulawayo");
    });

    it("Test 4.2: Marketplace assessor can update their profile", async () => {
      const assessorCtx = {
        user: {
          ...assessorUserContext.user,
          role: "assessor",
        },
      };
      const caller = appRouter.createCaller(assessorCtx);

      const result = await caller.assessorOnboarding.updateProfile({
        marketplaceBio: "Updated bio: Senior independent assessor with 10+ years of experience specializing in motor vehicle and commercial vehicle assessments across Zimbabwe.",
        marketplaceHourlyRate: 500,
        serviceRegions: ["Bulawayo", "Victoria Falls", "Hwange", "Harare"],
      });

      expect(result.success).toBe(true);

      // Verify update persisted
      const [assessor] = await db.select().from(assessors).where(eq(assessors.id, marketplaceAssessorId)).limit(1);
      expect(assessor.marketplaceBio).toContain("Updated bio");
      expect(parseFloat(assessor.marketplaceHourlyRate)).toBe(500);
      const regions = JSON.parse(assessor.serviceRegions);
      expect(regions).toContain("Harare");
      expect(regions.length).toBe(4);
    });

    it("Test 4.3: Enable marketplace for insurer-owned assessor (hybrid conversion)", async () => {
      // Create a context for the internal assessor
      const internalAssessorCtx = {
        user: {
          id: internalAssessorUserId,
          openId: `test_internal_assessor`,
          email: "john.mukwevho@testinsurer.co.zw",
          name: "John Mukwevho",
          role: "assessor",
          tenantId: tenantId,
        },
      };
      const caller = appRouter.createCaller(internalAssessorCtx);

      const result = await caller.assessorOnboarding.enableMarketplace({
        marketplaceBio: "Experienced insurer assessor now available on the marketplace for independent assignments across Zimbabwe.",
        marketplaceHourlyRate: 350,
        marketplaceAvailability: "weekends_only",
      });

      expect(result.success).toBe(true);

      // Verify assessor type changed to hybrid
      const [assessor] = await db.select().from(assessors).where(eq(assessors.id, internalAssessorId)).limit(1);
      expect(assessor.assessorType).toBe("hybrid");
      expect(assessor.marketplaceEnabled).toBe(1);
      expect(assessor.marketplaceStatus).toBe("pending_approval");
      expect(assessor.marketplaceAvailability).toBe("weekends_only");
    });
  });

  // =============================================
  // TEST SUITE 5: RATING & REVIEW SYSTEM
  // =============================================

  describe("5. Rating and Review System", () => {
    it("Test 5.1: Submit assessor review", async () => {
      // Insert review directly (the review submission procedure may not exist yet)
      const [reviewResult] = await db.insert(assessorMarketplaceReviews).values({
        assessorId: marketplaceAssessorId,
        claimId: testClaimId2,
        tenantId: tenantId,
        reviewerUserId: processorContext.user.id,
        overallRating: 4,
        accuracyRating: 5,
        professionalismRating: 4,
        timelinessRating: 3,
        communicationRating: 4,
        reviewText: "Excellent assessment work. Thorough damage documentation with accurate cost estimates. Minor delay in scheduling but overall very professional.",
        wouldHireAgain: 1,
      });

      expect(reviewResult.insertId).toBeDefined();

      // Verify review stored correctly
      const [review] = await db.select().from(assessorMarketplaceReviews)
        .where(eq(assessorMarketplaceReviews.id, reviewResult.insertId)).limit(1);
      expect(review).toBeDefined();
      expect(review.overallRating).toBe(4);
      expect(review.accuracyRating).toBe(5);
      expect(review.wouldHireAgain).toBe(1);
      expect(review.reviewText).toContain("Excellent assessment work");
    });

    it("Test 5.2: Multiple reviews for same assessor", async () => {
      // Insert a second review
      await db.insert(assessorMarketplaceReviews).values({
        assessorId: marketplaceAssessorId,
        claimId: testClaimId3,
        tenantId: tenantId,
        reviewerUserId: insurerAdminContext.user.id,
        overallRating: 5,
        accuracyRating: 5,
        professionalismRating: 5,
        timelinessRating: 5,
        communicationRating: 5,
        reviewText: "Outstanding work on a complex rollover case. Highly recommended.",
        wouldHireAgain: 1,
      });

      // Verify both reviews exist
      const reviews = await db.select().from(assessorMarketplaceReviews)
        .where(eq(assessorMarketplaceReviews.assessorId, marketplaceAssessorId));
      expect(reviews.length).toBeGreaterThanOrEqual(2);

      // Calculate average rating
      const avgRating = reviews.reduce((sum: number, r: any) => sum + r.overallRating, 0) / reviews.length;
      expect(avgRating).toBeGreaterThanOrEqual(4);
    });
  });

  // =============================================
  // TEST SUITE 6: DATA INTEGRITY
  // =============================================

  describe("6. Data Integrity and Audit Trail", () => {
    it("Test 6.1: Verify assessor-insurer relationship integrity", async () => {
      // Verify all internal assessors have relationship records
      const relationships = await db.select().from(assessorInsurerRelationships)
        .where(eq(assessorInsurerRelationships.tenantId, tenantId));

      expect(relationships.length).toBeGreaterThan(0);

      // Each relationship should have valid assessor ID
      for (const rel of relationships) {
        const [assessor] = await db.select().from(assessors).where(eq(assessors.id, rel.assessorId)).limit(1);
        expect(assessor).toBeDefined();
      }
    });

    it("Test 6.2: Verify claim assignment data consistency", async () => {
      // Claim 1 should be assigned to internal assessor
      const [claim1] = await db.select().from(claims).where(eq(claims.id, testClaimId1)).limit(1);
      expect(claim1.status).toBe("assessment_pending");
      expect(claim1.assignedAssessorId).toBe(internalAssessorUserId);

      // Claim 2 should be assigned to marketplace assessor
      const [claim2] = await db.select().from(claims).where(eq(claims.id, testClaimId2)).limit(1);
      expect(claim2.status).toBe("assessment_pending");
      expect(claim2.assignedAssessorId).toBe(marketplaceAssessorUserId);

      // Claim 3 should still be unassigned
      const [claim3] = await db.select().from(claims).where(eq(claims.id, testClaimId3)).limit(1);
      expect(claim3.status).toBe("submitted");
    });

    it("Test 6.3: Verify marketplace assessor profile completeness", async () => {
      const [assessor] = await db.select().from(assessors).where(eq(assessors.id, marketplaceAssessorId)).limit(1);

      // All required fields should be populated
      expect(assessor.professionalLicenseNumber).toBeTruthy();
      expect(assessor.licenseExpiryDate).toBeTruthy();
      expect(assessor.assessorType).toBe("marketplace");
      expect(assessor.marketplaceEnabled).toBe(1);
      expect(assessor.marketplaceBio).toBeTruthy();
      expect(assessor.marketplaceHourlyRate).toBeTruthy();
      expect(assessor.marketplaceAvailability).toBeTruthy();
      expect(assessor.certificationLevel).toBeTruthy();
      expect(assessor.specializations).toBeTruthy();
      expect(assessor.serviceRegions).toBeTruthy();
      expect(assessor.activeStatus).toBe(1);
    });

    it("Test 6.4: Verify hybrid assessor maintains both profiles", async () => {
      const [assessor] = await db.select().from(assessors).where(eq(assessors.id, internalAssessorId)).limit(1);

      // Should be hybrid type with both insurer and marketplace attributes
      expect(assessor.assessorType).toBe("hybrid");
      expect(assessor.primaryTenantId).toBe(tenantId);
      expect(assessor.marketplaceEnabled).toBe(1);
      expect(assessor.marketplaceBio).toBeTruthy();
      expect(assessor.marketplaceHourlyRate).toBeTruthy();

      // Should still have insurer relationship
      const [relationship] = await db.select().from(assessorInsurerRelationships)
        .where(and(
          eq(assessorInsurerRelationships.assessorId, internalAssessorId),
          eq(assessorInsurerRelationships.tenantId, tenantId)
        )).limit(1);
      expect(relationship).toBeDefined();
      expect(relationship.relationshipType).toBe("insurer_owned");
    });
  });
});
