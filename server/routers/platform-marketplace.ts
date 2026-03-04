/**
 * Platform Marketplace Router
 *
 * Provides platform_super_admin with full visibility and management over all
 * marketplace providers (assessors and panel beaters) across every insurer tenant.
 *
 * Access guard: superAdminProcedure — only platform_super_admin can call these.
 *
 * Procedures:
 *   listProviders            — paginated list with relationship stats and filters
 *   getProviderDetail        — single provider with full relationship breakdown
 *   updateApprovalStatus     — approve | reject | suspend a provider
 *   getProviderRelationships — all insurer relationships for a provider (modal data)
 *   getStats                 — platform-wide summary counts
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, sql } from "drizzle-orm";
import { router, superAdminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { marketplaceProfiles } from "../../drizzle/schema";

// ─── Input schemas ────────────────────────────────────────────────────────────

const listProvidersInput = z.object({
  page:           z.number().int().min(1).default(1),
  pageSize:       z.number().int().min(1).max(100).default(25),
  type:           z.enum(["assessor", "panel_beater"]).optional(),
  approvalStatus: z.enum(["pending", "approved", "rejected"]).optional(),
  search:         z.string().max(255).optional(),
});

const updateApprovalStatusInput = z.object({
  profileId:       z.string().uuid(),
  action:          z.enum(["approved", "rejected", "suspended"]),
  rejectionReason: z.string().max(1000).optional(),
});

const profileIdInput = z.object({
  profileId: z.string().uuid(),
});

// ─── Router ───────────────────────────────────────────────────────────────────

export const platformMarketplaceRouter = router({
  /**
   * listProviders
   *
   * Returns a paginated list of all marketplace profiles across all tenants,
   * enriched with per-provider relationship stats:
   *   - totalRelationships: how many insurer tenants have linked this provider
   *   - blacklistedCount:   how many insurers have blacklisted this provider
   *   - preferredCount:     how many insurers have marked this provider as preferred
   *   - suspendedCount:     how many insurers have suspended this provider
   *   - activeCount:        how many insurers have an approved relationship
   *
   * Supports filtering by type, approvalStatus, and a text search on companyName.
   */
  listProviders: superAdminProcedure
    .input(listProvidersInput)
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const offset = (input.page - 1) * input.pageSize;

      // Build dynamic WHERE conditions as raw SQL fragments
      const conditions: string[] = [];
      if (input.type)           conditions.push(`mp.type = '${input.type.replace(/'/g, "''")}'`);
      if (input.approvalStatus) conditions.push(`mp.approval_status = '${input.approvalStatus.replace(/'/g, "''")}'`);
      if (input.search?.trim()) conditions.push(`mp.company_name LIKE '%${input.search.trim().replace(/'/g, "''").replace(/%/g, "\\%")}%'`);

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      // Count total matching rows
      const countResult = await db.execute(sql.raw(
        `SELECT COUNT(*) AS total FROM marketplace_profiles mp ${whereClause}`
      )) as any;
      const total = Number((countResult.rows ?? countResult)[0]?.total ?? 0);

      // Fetch page with relationship stats via LEFT JOIN aggregation
      const rowsResult = await db.execute(sql.raw(
        `SELECT
           mp.id,
           mp.type,
           mp.company_name,
           mp.country_id,
           mp.contact_email,
           mp.contact_phone,
           mp.address,
           mp.license_number,
           mp.approval_status,
           mp.rejection_reason,
           mp.approved_by,
           mp.approved_at,
           mp.created_at,
           mp.updated_at,
           COUNT(DISTINCT imr.id)                                                         AS total_relationships,
           SUM(CASE WHEN imr.relationship_status = 'blacklisted' THEN 1 ELSE 0 END)      AS blacklisted_count,
           SUM(CASE WHEN imr.preferred = 1                       THEN 1 ELSE 0 END)      AS preferred_count,
           SUM(CASE WHEN imr.relationship_status = 'suspended'   THEN 1 ELSE 0 END)      AS suspended_count,
           SUM(CASE WHEN imr.relationship_status = 'approved'    THEN 1 ELSE 0 END)      AS active_count
         FROM marketplace_profiles mp
         LEFT JOIN insurer_marketplace_relationships imr
           ON imr.marketplace_profile_id = mp.id
         ${whereClause}
         GROUP BY mp.id
         ORDER BY mp.created_at DESC
         LIMIT ${input.pageSize} OFFSET ${offset}`
      )) as any;

      const rows: any[] = rowsResult.rows ?? rowsResult;

      const providers = rows.map(r => ({
        id:              r.id,
        type:            r.type as "assessor" | "panel_beater",
        companyName:     r.company_name,
        countryId:       r.country_id,
        contactEmail:    r.contact_email  ?? null,
        contactPhone:    r.contact_phone  ?? null,
        address:         r.address        ?? null,
        licenseNumber:   r.license_number ?? null,
        approvalStatus:  r.approval_status as "pending" | "approved" | "rejected",
        rejectionReason: r.rejection_reason ?? null,
        approvedBy:      r.approved_by ?? null,
        approvedAt:      r.approved_at ?? null,
        createdAt:       r.created_at,
        updatedAt:       r.updated_at,
        stats: {
          totalRelationships: Number(r.total_relationships ?? 0),
          blacklistedCount:   Number(r.blacklisted_count   ?? 0),
          preferredCount:     Number(r.preferred_count     ?? 0),
          suspendedCount:     Number(r.suspended_count     ?? 0),
          activeCount:        Number(r.active_count        ?? 0),
        },
      }));

      return {
        providers,
        pagination: {
          total,
          page:       input.page,
          pageSize:   input.pageSize,
          totalPages: Math.ceil(total / input.pageSize),
        },
      };
    }),

  /**
   * getProviderDetail
   *
   * Returns a single provider's full profile plus aggregate relationship stats.
   */
  getProviderDetail: superAdminProcedure
    .input(profileIdInput)
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const profiles = await db
        .select()
        .from(marketplaceProfiles)
        .where(eq(marketplaceProfiles.id, input.profileId))
        .limit(1);

      if (!profiles.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Marketplace profile not found." });
      }

      const statsResult = await db.execute(sql`
        SELECT
          COUNT(*)                                                                    AS total_relationships,
          SUM(CASE WHEN relationship_status = 'blacklisted' THEN 1 ELSE 0 END)       AS blacklisted_count,
          SUM(CASE WHEN relationship_status = 'suspended'   THEN 1 ELSE 0 END)       AS suspended_count,
          SUM(CASE WHEN relationship_status = 'approved'    THEN 1 ELSE 0 END)       AS active_count,
          SUM(CASE WHEN preferred = 1                       THEN 1 ELSE 0 END)       AS preferred_count,
          SUM(CASE WHEN sla_signed = 1                      THEN 1 ELSE 0 END)       AS sla_signed_count
        FROM insurer_marketplace_relationships
        WHERE marketplace_profile_id = ${input.profileId}
      `) as any;

      const s: any = (statsResult.rows ?? statsResult)[0] ?? {};

      return {
        profile: profiles[0],
        stats: {
          totalRelationships: Number(s.total_relationships ?? 0),
          blacklistedCount:   Number(s.blacklisted_count   ?? 0),
          suspendedCount:     Number(s.suspended_count     ?? 0),
          activeCount:        Number(s.active_count        ?? 0),
          preferredCount:     Number(s.preferred_count     ?? 0),
          slaSignedCount:     Number(s.sla_signed_count    ?? 0),
        },
      };
    }),

  /**
   * updateApprovalStatus
   *
   * Allows platform_super_admin to approve, reject, or suspend a marketplace profile.
   * "suspended" is stored as approval_status = "rejected" with a [SUSPENDED] prefix
   * in rejection_reason, since the enum only has pending/approved/rejected.
   */
  updateApprovalStatus: superAdminProcedure
    .input(updateApprovalStatusInput)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const existing = await db
        .select({ id: marketplaceProfiles.id })
        .from(marketplaceProfiles)
        .where(eq(marketplaceProfiles.id, input.profileId))
        .limit(1);

      if (!existing.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Marketplace profile not found." });
      }

      const now = new Date().toISOString().slice(0, 19).replace("T", " ");

      let dbStatus: "pending" | "approved" | "rejected";
      let rejectionReason: string | null = null;

      if (input.action === "approved") {
        dbStatus = "approved";
      } else if (input.action === "rejected") {
        dbStatus = "rejected";
        rejectionReason = input.rejectionReason ?? "Rejected by platform administrator.";
      } else {
        // "suspended" — stored as rejected with a distinguishable prefix
        dbStatus = "rejected";
        rejectionReason = `[SUSPENDED] ${input.rejectionReason ?? "Suspended by platform administrator."}`;
      }

      await db
        .update(marketplaceProfiles)
        .set({
          approvalStatus:  dbStatus,
          rejectionReason: rejectionReason,
          approvedBy:      input.action === "approved" ? ctx.user.id : null,
          approvedAt:      input.action === "approved" ? now : null,
        })
        .where(eq(marketplaceProfiles.id, input.profileId));

      console.log(
        `[PlatformMarketplace] Profile ${input.profileId} → ${input.action} by super-admin ${ctx.user.id}`
      );

      return { success: true, profileId: input.profileId, action: input.action, newStatus: dbStatus };
    }),

  /**
   * getProviderRelationships
   *
   * Returns all insurer_marketplace_relationships rows for a given provider,
   * used to populate the "View Relationships" modal in the admin UI.
   */
  getProviderRelationships: superAdminProcedure
    .input(profileIdInput)
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const result = await db.execute(sql`
        SELECT
          imr.id,
          imr.insurer_tenant_id,
          imr.relationship_status,
          imr.sla_signed,
          imr.preferred,
          imr.notes,
          imr.created_at,
          imr.updated_at,
          u.name  AS insurer_contact_name,
          u.email AS insurer_contact_email
        FROM insurer_marketplace_relationships imr
        LEFT JOIN users u
          ON u.tenant_id = imr.insurer_tenant_id
         AND u.role = 'insurer'
        WHERE imr.marketplace_profile_id = ${input.profileId}
        ORDER BY imr.created_at DESC
      `) as any;

      const rows: any[] = result.rows ?? result;

      return {
        profileId: input.profileId,
        relationships: rows.map(r => ({
          id:                  Number(r.id),
          insurerTenantId:     r.insurer_tenant_id,
          relationshipStatus:  r.relationship_status as "approved" | "suspended" | "blacklisted",
          slaSigned:           Boolean(r.sla_signed),
          preferred:           Boolean(r.preferred),
          notes:               r.notes ?? null,
          createdAt:           r.created_at,
          updatedAt:           r.updated_at,
          insurerContactName:  r.insurer_contact_name  ?? null,
          insurerContactEmail: r.insurer_contact_email ?? null,
        })),
      };
    }),

  /**
   * getStats
   *
   * Returns platform-wide summary counts for the marketplace management header.
   */
  getStats: superAdminProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const profileStats = await db.execute(sql`
        SELECT
          COUNT(*)                                                                    AS total_providers,
          SUM(CASE WHEN approval_status = 'pending'  THEN 1 ELSE 0 END)              AS pending_count,
          SUM(CASE WHEN approval_status = 'approved' THEN 1 ELSE 0 END)              AS approved_count,
          SUM(CASE WHEN approval_status = 'rejected' THEN 1 ELSE 0 END)              AS rejected_count,
          SUM(CASE WHEN type = 'assessor'            THEN 1 ELSE 0 END)              AS assessor_count,
          SUM(CASE WHEN type = 'panel_beater'        THEN 1 ELSE 0 END)              AS panel_beater_count
        FROM marketplace_profiles
      `) as any;

      const relStats = await db.execute(sql`
        SELECT
          COUNT(*)                                                                    AS total_relationships,
          SUM(CASE WHEN relationship_status = 'blacklisted' THEN 1 ELSE 0 END)       AS blacklisted_count,
          SUM(CASE WHEN relationship_status = 'suspended'   THEN 1 ELSE 0 END)       AS suspended_count,
          SUM(CASE WHEN preferred = 1                       THEN 1 ELSE 0 END)       AS preferred_count
        FROM insurer_marketplace_relationships
      `) as any;

      const p: any = (profileStats.rows ?? profileStats)[0] ?? {};
      const r: any = (relStats.rows    ?? relStats)[0]    ?? {};

      return {
        totalProviders:     Number(p.total_providers    ?? 0),
        pendingCount:       Number(p.pending_count      ?? 0),
        approvedCount:      Number(p.approved_count     ?? 0),
        rejectedCount:      Number(p.rejected_count     ?? 0),
        assessorCount:      Number(p.assessor_count     ?? 0),
        panelBeaterCount:   Number(p.panel_beater_count ?? 0),
        totalRelationships: Number(r.total_relationships ?? 0),
        blacklistedCount:   Number(r.blacklisted_count   ?? 0),
        suspendedCount:     Number(r.suspended_count     ?? 0),
        preferredCount:     Number(r.preferred_count     ?? 0),
      };
    }),
});
