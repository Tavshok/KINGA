/**
 * Driver Intelligence Registry — tRPC Router
 * ─────────────────────────────────────────────
 * Procedures:
 *   driverRegistry.getById          — fetch a single driver by ID
 *   driverRegistry.getByLicense     — fetch a driver by normalised license number
 *   driverRegistry.search           — full-text search across name, license, email, phone
 *   driverRegistry.getClaimHistory  — all driver_claims rows for a driver
 *   driverRegistry.getClaimDrivers  — all drivers linked to a specific claim
 *   driverRegistry.listHighRisk     — drivers sorted by risk score descending
 *   driverRegistry.stats            — aggregate stats for the dashboard
 *   driverRegistry.flagStagedAccident — manually flag a driver as staged-accident suspect
 *   driverRegistry.updateDriver     — manually enrich a driver record
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, sql, or, like } from "drizzle-orm";
import { drivers, driverClaims, claims } from "../../drizzle/schema";
import {
  getDriverById,
  getDriverByLicense,
  getDriverClaimHistory,
  listHighRiskDrivers,
  searchDrivers,
  normaliseLicenseNumber,
  isLicenseExpired,
} from "../driver-registry";
import { getDb } from "../db";

export const driverRegistryRouter = router({
  // ── Get single driver by ID ─────────────────────────────────────────────
  getById: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const driver = await getDriverById(input.id);
      if (!driver) throw new TRPCError({ code: "NOT_FOUND", message: "Driver not found" });
      return {
        ...driver,
        licenseExpired: isLicenseExpired(driver.licenseExpiryDate),
        licenseNeverExpires: driver.licenseExpiryDate === null && driver.licenseNumber !== null,
      };
    }),

  // ── Get driver by license number ────────────────────────────────────────
  getByLicense: protectedProcedure
    .input(z.object({ licenseNumber: z.string().min(1) }))
    .query(async ({ input }) => {
      const driver = await getDriverByLicense(input.licenseNumber);
      if (!driver) throw new TRPCError({ code: "NOT_FOUND", message: "Driver not found" });
      return {
        ...driver,
        licenseExpired: isLicenseExpired(driver.licenseExpiryDate),
        licenseNeverExpires: driver.licenseExpiryDate === null && driver.licenseNumber !== null,
      };
    }),

  // ── Search drivers ──────────────────────────────────────────────────────
  search: protectedProcedure
    .input(z.object({
      query: z.string().min(1),
      limit: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ input, ctx }) => {
      const results = await searchDrivers(input.query, ctx.user?.tenantId ?? undefined, input.limit);
      return results.map((d) => ({
        ...d,
        licenseExpired: isLicenseExpired(d.licenseExpiryDate),
        licenseNeverExpires: d.licenseExpiryDate === null && d.licenseNumber !== null,
      }));
    }),

  // ── Get claim history for a driver ─────────────────────────────────────
  getClaimHistory: protectedProcedure
    .input(z.object({ driverId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const history = await getDriverClaimHistory(input.driverId);
      return history;
    }),

  // ── Get all drivers linked to a specific claim ──────────────────────────
  getClaimDrivers: protectedProcedure
    .input(z.object({ claimId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      // Join driver_claims with drivers to return full driver info + role
      const rows = await db
        .select({
          driverClaimId: driverClaims.id,
          role: driverClaims.role,
          isAtFault: driverClaims.isAtFault,
          wasInjured: driverClaims.wasInjured,
          notes: driverClaims.notes,
          linkedAt: driverClaims.createdAt,
          // Driver fields
          driverId: drivers.id,
          fullName: drivers.fullName,
          licenseNumber: drivers.licenseNumber,
          licenseIssueDate: drivers.licenseIssueDate,
          licenseExpiryDate: drivers.licenseExpiryDate,
          dateOfBirth: drivers.dateOfBirth,
          phone: drivers.phone,
          email: drivers.email,
          nationalIdNumber: drivers.nationalIdNumber,
          licenseCountry: drivers.licenseCountry,
          driverRiskScore: drivers.driverRiskScore,
          totalClaimsCount: drivers.totalClaimsCount,
          isRepeatClaimer: drivers.isRepeatClaimer,
          isStagedAccidentSuspect: drivers.isStagedAccidentSuspect,
          dataSource: drivers.dataSource,
          ocrConfidenceScore: drivers.ocrConfidenceScore,
        })
        .from(driverClaims)
        .innerJoin(drivers, eq(driverClaims.driverId, drivers.id))
        .where(eq(driverClaims.claimId, input.claimId))
        .orderBy(driverClaims.role);

      return rows.map((r) => ({
        ...r,
        licenseExpired: isLicenseExpired(r.licenseExpiryDate),
        licenseNeverExpires: r.licenseExpiryDate === null && r.licenseNumber !== null,
      }));
    }),

  // ── List high-risk drivers ──────────────────────────────────────────────
  listHighRisk: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(200).default(50),
      minRiskScore: z.number().int().min(0).max(100).default(20),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const tenantId = ctx.user?.tenantId ?? undefined;

      const conditions = [sql`driver_risk_score >= ${input.minRiskScore}`];
      if (tenantId) conditions.push(eq(drivers.tenantId, tenantId));

      const results = await db
        .select()
        .from(drivers)
        .where(and(...conditions))
        .orderBy(desc(drivers.driverRiskScore))
        .limit(input.limit);

      return results.map((d) => ({
        ...d,
        licenseExpired: isLicenseExpired(d.licenseExpiryDate),
        licenseNeverExpires: d.licenseExpiryDate === null && d.licenseNumber !== null,
      }));
    }),

  // ── Dashboard stats ─────────────────────────────────────────────────────
  stats: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return null;
      const tenantId = ctx.user?.tenantId ?? undefined;

      const tenantFilter = tenantId ? eq(drivers.tenantId, tenantId) : sql`1=1`;

      const [totals] = await db
        .select({
          totalDrivers: sql<number>`COUNT(*)`,
          repeatClaimers: sql<number>`SUM(is_repeat_claimer)`,
          stagedSuspects: sql<number>`SUM(is_staged_accident_suspect)`,
          highRisk: sql<number>`SUM(CASE WHEN driver_risk_score >= 50 THEN 1 ELSE 0 END)`,
          mediumRisk: sql<number>`SUM(CASE WHEN driver_risk_score >= 20 AND driver_risk_score < 50 THEN 1 ELSE 0 END)`,
          expiredLicenses: sql<number>`SUM(CASE WHEN license_expiry_date IS NOT NULL AND license_expiry_date < CURDATE() THEN 1 ELSE 0 END)`,
          neverExpiresLicenses: sql<number>`SUM(CASE WHEN license_number IS NOT NULL AND license_expiry_date IS NULL THEN 1 ELSE 0 END)`,
          ocrSourced: sql<number>`SUM(CASE WHEN data_source = 'ocr' THEN 1 ELSE 0 END)`,
        })
        .from(drivers)
        .where(tenantFilter);

      const [linkTotals] = await db
        .select({
          totalLinks: sql<number>`COUNT(*)`,
          driverLinks: sql<number>`SUM(CASE WHEN role = 'driver' THEN 1 ELSE 0 END)`,
          claimantLinks: sql<number>`SUM(CASE WHEN role = 'claimant' THEN 1 ELSE 0 END)`,
          thirdPartyLinks: sql<number>`SUM(CASE WHEN role = 'third_party_driver' THEN 1 ELSE 0 END)`,
        })
        .from(driverClaims)
        .where(tenantId ? eq(driverClaims.tenantId, tenantId) : sql`1=1`);

      return {
        totalDrivers: Number(totals?.totalDrivers ?? 0),
        repeatClaimers: Number(totals?.repeatClaimers ?? 0),
        stagedSuspects: Number(totals?.stagedSuspects ?? 0),
        highRisk: Number(totals?.highRisk ?? 0),
        mediumRisk: Number(totals?.mediumRisk ?? 0),
        expiredLicenses: Number(totals?.expiredLicenses ?? 0),
        neverExpiresLicenses: Number(totals?.neverExpiresLicenses ?? 0),
        ocrSourced: Number(totals?.ocrSourced ?? 0),
        totalLinks: Number(linkTotals?.totalLinks ?? 0),
        driverLinks: Number(linkTotals?.driverLinks ?? 0),
        claimantLinks: Number(linkTotals?.claimantLinks ?? 0),
        thirdPartyLinks: Number(linkTotals?.thirdPartyLinks ?? 0),
      };
    }),

  // ── Flag a driver as staged-accident suspect ────────────────────────────
  flagStagedAccident: protectedProcedure
    .input(z.object({
      driverId: z.number().int().positive(),
      isSuspect: z.boolean(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const driver = await getDriverById(input.driverId);
      if (!driver) throw new TRPCError({ code: "NOT_FOUND", message: "Driver not found" });

      await db
        .update(drivers)
        .set({ isStagedAccidentSuspect: input.isSuspect ? 1 : 0 })
        .where(eq(drivers.id, input.driverId));

      return { success: true };
    }),

  // ── Manually enrich a driver record ────────────────────────────────────
  updateDriver: protectedProcedure
    .input(z.object({
      driverId: z.number().int().positive(),
      fullName: z.string().min(2).optional(),
      licenseNumber: z.string().optional().nullable(),
      licenseIssueDate: z.string().optional().nullable(),
      // Explicitly pass null to indicate "does not expire"
      licenseExpiryDate: z.string().optional().nullable(),
      dateOfBirth: z.string().optional().nullable(),
      phone: z.string().optional().nullable(),
      email: z.string().email().optional().nullable(),
      nationalIdNumber: z.string().optional().nullable(),
      licenseCountry: z.string().max(5).optional().nullable(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const { driverId, ...fields } = input;
      const driver = await getDriverById(driverId);
      if (!driver) throw new TRPCError({ code: "NOT_FOUND", message: "Driver not found" });

      const updateData: Record<string, unknown> = {};
      if (fields.fullName !== undefined) updateData.fullName = fields.fullName;
      if (fields.licenseNumber !== undefined) {
        updateData.licenseNumber = normaliseLicenseNumber(fields.licenseNumber);
      }
      if (fields.licenseIssueDate !== undefined) updateData.licenseIssueDate = fields.licenseIssueDate;
      if (fields.licenseExpiryDate !== undefined) updateData.licenseExpiryDate = fields.licenseExpiryDate;
      if (fields.dateOfBirth !== undefined) updateData.dateOfBirth = fields.dateOfBirth;
      if (fields.phone !== undefined) updateData.phone = fields.phone;
      if (fields.email !== undefined) updateData.email = fields.email?.toLowerCase() ?? null;
      if (fields.nationalIdNumber !== undefined) updateData.nationalIdNumber = fields.nationalIdNumber;
      if (fields.licenseCountry !== undefined) updateData.licenseCountry = fields.licenseCountry;

      if (Object.keys(updateData).length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No fields to update" });
      }

      await db.update(drivers).set(updateData as any).where(eq(drivers.id, driverId));
      return { success: true };
    }),

  // ── List all drivers (paginated) ────────────────────────────────────────
  list: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { drivers: [], total: 0 };
      const tenantId = ctx.user?.tenantId ?? undefined;

      const tenantFilter = tenantId ? eq(drivers.tenantId, tenantId) : sql`1=1`;

      const [rows, [countRow]] = await Promise.all([
        db.select().from(drivers).where(tenantFilter)
          .orderBy(desc(drivers.lastSeenAt))
          .limit(input.limit)
          .offset(input.offset),
        db.select({ total: sql<number>`COUNT(*)` }).from(drivers).where(tenantFilter),
      ]);

      return {
        drivers: rows.map((d) => ({
          ...d,
          licenseExpired: isLicenseExpired(d.licenseExpiryDate),
          licenseNeverExpires: d.licenseExpiryDate === null && d.licenseNumber !== null,
        })),
        total: Number(countRow?.total ?? 0),
      };
    }),
});
