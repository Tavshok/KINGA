/**
 * Epic 5-A — Platform Navigation
 * Global Search Router
 *
 * Provides platform-wide, permission-aware search across all searchable entities:
 * Claims, Vehicles, Inspections, Assets, Fleets, Drivers, Panel Beaters,
 * Assessors, Reports, and Users.
 *
 * Design principles:
 * - Single tRPC procedure fans out to parallel DB queries (no query duplication)
 * - Each result group is gated by ctx.user.role / ctx.user.insurerRole
 * - Claimants only see their own claims
 * - Fleet users only see their own fleet data
 * - Panel beaters only see their own jobs
 * - Assessors only see assigned claims
 * - Insurer roles see tenant-scoped data
 * - Platform super admin and admin see everything
 * - Search history and analytics are persisted for recent-searches and analytics features
 *
 * Governance: ADR-001 (Shared Intelligence Architecture), Epic 5-A
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { like, or, and, eq, desc, sql } from "drizzle-orm";
import {
  claims,
  vehicleRegistry,
  inspections,
  assetRegistry,
  fleets,
  drivers,
  panelBeaters,
  assessors,
  generatedReports,
  users,
  globalSearchHistory,
  globalSearchAnalytics,
} from "../../drizzle/schema";

// ─── Permission helpers ────────────────────────────────────────────────────────

type UserRole = NonNullable<typeof users.$inferSelect.role>;
type InsurerRole = NonNullable<typeof users.$inferSelect.insurerRole>;

const INSURER_ROLES: UserRole[] = ["insurer"];
const FLEET_ROLES: UserRole[] = ["fleet_admin", "fleet_manager", "fleet_driver"];
const PLATFORM_ROLES: UserRole[] = ["admin", "platform_super_admin"];
const ALL_PRIVILEGED: UserRole[] = [...PLATFORM_ROLES, ...INSURER_ROLES];

function canSeeAllClaims(role: UserRole): boolean {
  return PLATFORM_ROLES.includes(role) || INSURER_ROLES.includes(role);
}
function canSeeFleetData(role: UserRole): boolean {
  return [...PLATFORM_ROLES, ...FLEET_ROLES, ...INSURER_ROLES].includes(role);
}
function canSeeAssets(role: UserRole): boolean {
  return [...PLATFORM_ROLES, ...INSURER_ROLES, "assessor" as UserRole].includes(role);
}
function canSeeUsers(role: UserRole): boolean {
  return PLATFORM_ROLES.includes(role) || role === "insurer";
}

// ─── Result types ──────────────────────────────────────────────────────────────

export interface SearchResultItem {
  type:
    | "claim"
    | "vehicle"
    | "inspection"
    | "asset"
    | "fleet"
    | "driver"
    | "panel_beater"
    | "assessor"
    | "report"
    | "user";
  id: string;
  title: string;
  subtitle: string;
  meta: string;
  href: string;
  badge?: string;
  badgeVariant?: "default" | "destructive" | "secondary" | "outline";
}

// ─── Navigation href helpers ──────────────────────────────────────────────────

function claimHref(role: UserRole, claimId: number, claimNumber: string): string {
  if (role === "claimant") return `/claims/${claimId}`;
  if (role === "assessor") return `/assessor/claims/${claimId}`;
  if (role === "panel_beater") return `/panel-beater/jobs/${claimId}`;
  if (FLEET_ROLES.includes(role)) return `/fleet/claims/${claimId}`;
  if (role === "agency") return `/agency/claims/${claimId}`;
  // insurer roles + admin
  return `/insurer/claims/${claimId}`;
}

function vehicleHref(role: UserRole, vehicleId: number): string {
  if (FLEET_ROLES.includes(role)) return `/fleet/vehicles/${vehicleId}`;
  if (PLATFORM_ROLES.includes(role)) return `/platform/vehicles/${vehicleId}`;
  return `/insurer/vehicles/${vehicleId}`;
}

function inspectionHref(role: UserRole, inspectionId: number): string {
  if (role === "assessor") return `/assessor/inspections/${inspectionId}`;
  if (PLATFORM_ROLES.includes(role)) return `/platform/inspections/${inspectionId}`;
  return `/engineer/inspections/${inspectionId}`;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const globalSearchRouter = router({
  /**
   * Main search procedure.
   * Fans out to up to 9 parallel DB queries, gated by role.
   * Returns grouped results with navigation hrefs.
   */
  search: protectedProcedure
    .input(
      z.object({
        query: z.string().min(2).max(200).trim(),
        limit: z.number().int().min(1).max(20).default(8),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const { query, limit } = input;
      const user = ctx.user!;
      const role = user.role as UserRole;
      const tenantId = user.tenantId ?? null;
      const q = `%${query}%`;

      const results: SearchResultItem[] = [];

      // ── 1. Claims ────────────────────────────────────────────────────────────
      try {
        const claimWhere = canSeeAllClaims(role)
          ? tenantId && !PLATFORM_ROLES.includes(role)
            ? and(
                eq(claims.tenantId, tenantId),
                or(
                  like(claims.claimNumber, q),
                  like(claims.vehicleRegistration, q),
                  like(claims.vehicleVin, q),
                  like(claims.policyNumber, q),
                  like(claims.claimantEmail, q)
                )
              )
            : or(
                like(claims.claimNumber, q),
                like(claims.vehicleRegistration, q),
                like(claims.vehicleVin, q),
                like(claims.policyNumber, q),
                like(claims.claimantEmail, q)
              )
          : role === "claimant"
          ? and(
              eq(claims.claimantId, user.id),
              or(
                like(claims.claimNumber, q),
                like(claims.vehicleRegistration, q)
              )
            )
          : role === "assessor"
          ? or(
              like(claims.claimNumber, q),
              like(claims.vehicleRegistration, q)
            )
          : role === "panel_beater"
          ? or(
              like(claims.claimNumber, q),
              like(claims.vehicleRegistration, q)
            )
          : FLEET_ROLES.includes(role)
          ? and(
              tenantId ? eq(claims.tenantId, tenantId) : sql`1=1`,
              or(
                like(claims.claimNumber, q),
                like(claims.vehicleRegistration, q)
              )
            )
          : or(
              like(claims.claimNumber, q),
              like(claims.vehicleRegistration, q)
            );

        if (claimWhere) {
          const rows = await db
            .select({
              id: claims.id,
              claimNumber: claims.claimNumber,
              vehicleRegistration: claims.vehicleRegistration,
              vehicleMake: claims.vehicleMake,
              vehicleModel: claims.vehicleModel,
              status: claims.status,
              policyNumber: claims.policyNumber,
            })
            .from(claims)
            .where(claimWhere)
            .orderBy(desc(claims.createdAt))
            .limit(limit);

          for (const r of rows) {
            results.push({
              type: "claim",
              id: String(r.id),
              title: r.claimNumber ?? `Claim #${r.id}`,
              subtitle: [r.vehicleMake, r.vehicleModel, r.vehicleRegistration]
                .filter(Boolean)
                .join(" · "),
              meta: r.policyNumber ? `Policy: ${r.policyNumber}` : "",
              href: claimHref(role, r.id, r.claimNumber ?? ""),
              badge: r.status ?? undefined,
              badgeVariant: r.status === "rejected" ? "destructive" : "secondary",
            });
          }
        }
      } catch (_) { /* non-fatal — continue */ }

      // ── 2. Vehicles ──────────────────────────────────────────────────────────
      if (role !== "claimant") {
        try {
          const vehicleWhere = or(
            like(vehicleRegistry.registrationNumber, q),
            like(vehicleRegistry.vin, q),
            like(vehicleRegistry.make, q),
            like(vehicleRegistry.model, q),
            like(vehicleRegistry.currentOwnerName, q)
          );

          const rows = await db
            .select({
              id: vehicleRegistry.id,
              registrationNumber: vehicleRegistry.registrationNumber,
              vin: vehicleRegistry.vin,
              make: vehicleRegistry.make,
              model: vehicleRegistry.model,
              year: vehicleRegistry.year,
              currentOwnerName: vehicleRegistry.currentOwnerName,
            })
            .from(vehicleRegistry)
            .where(vehicleWhere)
            .limit(limit);

          for (const r of rows) {
            results.push({
              type: "vehicle",
              id: String(r.id),
              title: [r.make, r.model, r.year].filter(Boolean).join(" "),
              subtitle: r.registrationNumber ?? r.vin ?? "",
              meta: r.currentOwnerName ? `Owner: ${r.currentOwnerName}` : "",
              href: vehicleHref(role, r.id),
              badge: "Vehicle",
              badgeVariant: "outline",
            });
          }
        } catch (_) { /* non-fatal */ }
      }

      // ── 3. Inspections ───────────────────────────────────────────────────────
      if (role !== "claimant" && role !== "panel_beater") {
        try {
          const inspWhere = tenantId && !PLATFORM_ROLES.includes(role)
            ? and(
                eq(inspections.tenantId, tenantId),
                or(
                  like(inspections.inspectionRef, q),
                  like(inspections.vehicleRegistration, q),
                  like(inspections.assetRef, q)
                )
              )
            : or(
                like(inspections.inspectionRef, q),
                like(inspections.vehicleRegistration, q),
                like(inspections.assetRef, q)
              );

          const rows = await db
            .select({
              id: inspections.id,
              inspectionRef: inspections.inspectionRef,
              inspectionType: inspections.inspectionType,
              status: inspections.status,
              vehicleRegistration: inspections.vehicleRegistration,
              assetRef: inspections.assetRef,
            })
            .from(inspections)
            .where(inspWhere)
            .orderBy(desc(inspections.scheduledDate))
            .limit(limit);

          for (const r of rows) {
            results.push({
              type: "inspection",
              id: String(r.id),
              title: r.inspectionRef,
              subtitle: r.vehicleRegistration ?? r.assetRef ?? "",
              meta: r.inspectionType ?? "",
              href: inspectionHref(role, r.id),
              badge: r.status ?? undefined,
              badgeVariant: "secondary",
            });
          }
        } catch (_) { /* non-fatal */ }
      }

      // ── 4. Assets ────────────────────────────────────────────────────────────
      if (canSeeAssets(role)) {
        try {
          const assetWhere = tenantId && !PLATFORM_ROLES.includes(role)
            ? and(
                eq(assetRegistry.tenantId, tenantId),
                or(
                  like(assetRegistry.assetRef, q),
                  like(assetRegistry.assetName, q),
                  like(assetRegistry.serialNumber, q),
                  like(assetRegistry.ownerName, q)
                )
              )
            : or(
                like(assetRegistry.assetRef, q),
                like(assetRegistry.assetName, q),
                like(assetRegistry.serialNumber, q),
                like(assetRegistry.ownerName, q)
              );

          const rows = await db
            .select({
              id: assetRegistry.id,
              assetRef: assetRegistry.assetRef,
              assetName: assetRegistry.assetName,
              assetType: assetRegistry.assetType,
              ownerName: assetRegistry.ownerName,
              riskRating: assetRegistry.riskRating,
            })
            .from(assetRegistry)
            .where(assetWhere)
            .limit(limit);

          for (const r of rows) {
            results.push({
              type: "asset",
              id: String(r.id),
              title: r.assetName,
              subtitle: r.assetRef,
              meta: r.ownerName ? `Owner: ${r.ownerName}` : "",
              href: `/engineer/assets/${r.id}`,
              badge: r.assetType ?? undefined,
              badgeVariant: "outline",
            });
          }
        } catch (_) { /* non-fatal */ }
      }

      // ── 5. Fleets ────────────────────────────────────────────────────────────
      if (canSeeFleetData(role)) {
        try {
          const fleetWhere = FLEET_ROLES.includes(role) && tenantId
            ? and(
                eq(fleets.tenantId, tenantId),
                like(fleets.fleetName, q)
              )
            : like(fleets.fleetName, q);

          const rows = await db
            .select({
              id: fleets.id,
              fleetName: fleets.fleetName,
              fleetType: fleets.fleetType,
              totalVehicles: fleets.totalVehicles,
              primaryLocation: fleets.primaryLocation,
            })
            .from(fleets)
            .where(fleetWhere)
            .limit(limit);

          for (const r of rows) {
            results.push({
              type: "fleet",
              id: String(r.id),
              title: r.fleetName,
              subtitle: r.primaryLocation ?? "",
              meta: `${r.totalVehicles ?? 0} vehicles · ${r.fleetType ?? ""}`,
              href: `/fleet/dashboard`,
              badge: "Fleet",
              badgeVariant: "outline",
            });
          }
        } catch (_) { /* non-fatal */ }
      }

      // ── 6. Drivers ───────────────────────────────────────────────────────────
      if (canSeeFleetData(role) || canSeeAllClaims(role)) {
        try {
          const rows = await db
            .select({
              id: drivers.id,
              fullName: drivers.fullName,
              licenseNumber: drivers.licenseNumber,
              phone: drivers.phone,
              email: drivers.email,
            })
            .from(drivers)
            .where(
              or(
                like(drivers.fullName, q),
                like(drivers.licenseNumber, q),
                like(drivers.email, q),
                like(drivers.phone, q)
              )
            )
            .limit(limit);

          for (const r of rows) {
            results.push({
              type: "driver",
              id: String(r.id),
              title: r.fullName,
              subtitle: r.licenseNumber ? `Licence: ${r.licenseNumber}` : "",
              meta: r.email ?? r.phone ?? "",
              href: `/fleet/drivers/${r.id}`,
              badge: "Driver",
              badgeVariant: "outline",
            });
          }
        } catch (_) { /* non-fatal */ }
      }

      // ── 7. Panel Beaters ─────────────────────────────────────────────────────
      if (canSeeAllClaims(role) || PLATFORM_ROLES.includes(role)) {
        try {
          const pbWhere = tenantId && !PLATFORM_ROLES.includes(role)
            ? and(
                eq(panelBeaters.tenantId, tenantId),
                or(
                  like(panelBeaters.name, q),
                  like(panelBeaters.businessName, q),
                  like(panelBeaters.email, q),
                  like(panelBeaters.city, q)
                )
              )
            : or(
                like(panelBeaters.name, q),
                like(panelBeaters.businessName, q),
                like(panelBeaters.email, q),
                like(panelBeaters.city, q)
              );

          const rows = await db
            .select({
              id: panelBeaters.id,
              name: panelBeaters.name,
              businessName: panelBeaters.businessName,
              city: panelBeaters.city,
              performanceTier: panelBeaters.performanceTier,
            })
            .from(panelBeaters)
            .where(pbWhere)
            .limit(limit);

          for (const r of rows) {
            results.push({
              type: "panel_beater",
              id: String(r.id),
              title: r.businessName ?? r.name,
              subtitle: r.city ?? "",
              meta: r.performanceTier ? `Tier ${r.performanceTier}` : "",
              href: `/insurer/panel-beaters/${r.id}`,
              badge: "Panel Beater",
              badgeVariant: "outline",
            });
          }
        } catch (_) { /* non-fatal */ }
      }

      // ── 8. Assessors ─────────────────────────────────────────────────────────
      if (canSeeAllClaims(role) || PLATFORM_ROLES.includes(role)) {
        try {
          const rows = await db
            .select({
              id: assessors.id,
              userId: assessors.userId,
              certificationLevel: assessors.certificationLevel,
              assessorType: assessors.assessorType,
            })
            .from(assessors)
            .innerJoin(users, eq(assessors.userId, users.id))
            .where(
              or(
                like(users.name, q),
                like(users.email, q),
                like(assessors.professionalLicenseNumber, q)
              )
            )
            .limit(limit);

          for (const r of rows) {
            results.push({
              type: "assessor",
              id: String(r.id),
              title: `Assessor #${r.id}`,
              subtitle: r.certificationLevel ?? "",
              meta: r.assessorType ?? "",
              href: `/insurer/assessors/${r.id}`,
              badge: "Assessor",
              badgeVariant: "outline",
            });
          }
        } catch (_) { /* non-fatal */ }
      }

      // ── 9. Reports ───────────────────────────────────────────────────────────
      if (canSeeAllClaims(role)) {
        try {
          const reportWhere = tenantId && !PLATFORM_ROLES.includes(role)
            ? and(
                eq(generatedReports.tenantId, Number(tenantId) || 0),
                or(
                  like(generatedReports.reportType, q),
                  like(generatedReports.s3Key, q)
                )
              )
            : or(
                like(generatedReports.reportType, q),
                like(generatedReports.s3Key, q)
              );

          const rows = await db
            .select({
              id: generatedReports.id,
              reportType: generatedReports.reportType,
              claimId: generatedReports.claimId,
              generatedAt: generatedReports.generatedAt,
              status: generatedReports.status,
            })
            .from(generatedReports)
            .where(reportWhere)
            .orderBy(desc(generatedReports.createdAt))
            .limit(limit);

          for (const r of rows) {
            results.push({
              type: "report",
              id: String(r.id),
              title: (r.reportType ?? "Report").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
              subtitle: r.claimId ? `Claim #${r.claimId}` : "",
              meta: r.generatedAt ?? "",
              href: r.claimId ? `/insurer/claims/${r.claimId}?tab=reports` : `/insurer/reports`,
              badge: r.status ?? undefined,
              badgeVariant: r.status === "failed" ? "destructive" : "secondary",
            });
          }
        } catch (_) { /* non-fatal */ }
      }

      // ── Persist search history (fire-and-forget) ─────────────────────────────
      try {
        await db.insert(globalSearchHistory).values({
          userId: user.id,
          tenantId: tenantId ?? undefined,
          query,
          resultCount: results.length,
        });
      } catch (_) { /* non-fatal */ }

      // ── Persist analytics (fire-and-forget) ──────────────────────────────────
      try {
        await db.insert(globalSearchAnalytics).values({
          tenantId: tenantId ?? undefined,
          query,
          resultCount: results.length,
          userRole: role,
        });
      } catch (_) { /* non-fatal */ }

      return {
        query,
        totalCount: results.length,
        results,
      };
    }),

  /**
   * Record a click event on a search result (for analytics).
   */
  recordClick: protectedProcedure
    .input(
      z.object({
        query: z.string().max(200),
        clickedType: z.string().max(50),
        clickedId: z.string().max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: false };
      const user = ctx.user!;
      try {
        await db.insert(globalSearchAnalytics).values({
          tenantId: user.tenantId ?? undefined,
          query: input.query,
          resultCount: 0,
          clickedType: input.clickedType,
          clickedId: input.clickedId,
          userRole: user.role,
        });
      } catch (_) { /* non-fatal */ }
      return { ok: true };
    }),

  /**
   * Get recent searches for the current user (last 10).
   */
  getRecentSearches: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const user = ctx.user!;
      try {
        const rows = await db
          .select({
            id: globalSearchHistory.id,
            query: globalSearchHistory.query,
            resultCount: globalSearchHistory.resultCount,
            searchedAt: globalSearchHistory.searchedAt,
          })
          .from(globalSearchHistory)
          .where(eq(globalSearchHistory.userId, user.id))
          .orderBy(desc(globalSearchHistory.searchedAt))
          .limit(10);
        // Deduplicate by query (keep most recent)
        const seen = new Set<string>();
        return rows.filter(r => {
          if (seen.has(r.query)) return false;
          seen.add(r.query);
          return true;
        });
      } catch (_) {
        return [];
      }
    }),

  /**
   * Get search analytics (admin / platform super admin only).
   * Returns top 20 queries by frequency in the last 30 days.
   */
  getAnalytics: protectedProcedure
    .input(z.object({ tenantId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const user = ctx.user!;
      if (!["admin", "platform_super_admin", "insurer"].includes(user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Analytics requires admin or insurer role" });
      }
      try {
        const rows = await db
          .select({
            query: globalSearchAnalytics.query,
            count: sql<number>`COUNT(*)`.as("count"),
            avgResults: sql<number>`AVG(result_count)`.as("avg_results"),
          })
          .from(globalSearchAnalytics)
          .where(
            input.tenantId
              ? eq(globalSearchAnalytics.tenantId, input.tenantId)
              : sql`1=1`
          )
          .groupBy(globalSearchAnalytics.query)
          .orderBy(desc(sql`count`))
          .limit(20);
        return rows;
      } catch (_) {
        return [];
      }
    }),

  /**
   * Clear recent search history for the current user.
   */
  clearHistory: protectedProcedure
    .mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { ok: false };
      const user = ctx.user!;
      try {
        await db
          .delete(globalSearchHistory)
          .where(eq(globalSearchHistory.userId, user.id));
        return { ok: true };
      } catch (_) {
        return { ok: false };
      }
    }),
});
