/**
 * Marketplace Router — Governance Model
 *
 * Manages assessors and panel beaters as cross-tenant marketplace entities.
 *
 * Governance layers:
 *   1. Platform approval: marketplace_profiles.approval_status = 'approved'
 *   2. Insurer SLA relationship: insurer_marketplace_relationships.relationship_status = 'approved'
 *
 * Claimants only see panel_beaters that pass BOTH filters for their insurer's tenant.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { router, protectedProcedure, insurerDomainProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  marketplaceProfiles,
  insurerMarketplaceLinks,
  insurerMarketplaceRelationships,
  users,
} from "../../drizzle/schema";
import { randomUUID } from "crypto";

// ─── Input Schemas ────────────────────────────────────────────────────────────

const createProfileInput = z.object({
  type: z.enum(["assessor", "panel_beater"]),
  companyName: z.string().min(1).max(255),
  countryId: z.string().max(10).default("ZA"),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().max(50).optional(),
  address: z.string().optional(),
  licenseNumber: z.string().max(100).optional(),
  specializations: z.array(z.string()).optional(),
});

const updateProfileInput = z.object({
  id: z.string().uuid(),
  companyName: z.string().min(1).max(255).optional(),
  countryId: z.string().max(10).optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().max(50).optional(),
  address: z.string().optional(),
  licenseNumber: z.string().max(100).optional(),
  specializations: z.array(z.string()).optional(),
});

const approveRejectInput = z.object({
  id: z.string().uuid(),
  action: z.enum(["approved", "rejected"]),
  rejectionReason: z.string().optional(),
});

const linkProfileInput = z.object({
  marketplaceProfileId: z.string().uuid(),
});

const suspendLinkInput = z.object({
  marketplaceProfileId: z.string().uuid(),
  suspensionReason: z.string().optional(),
});

// Governance relationship management
const upsertRelationshipInput = z.object({
  marketplaceProfileId: z.string().uuid(),
  relationshipStatus: z.enum(["approved", "suspended", "blacklisted"]).default("approved"),
  slaSigned: z.boolean().default(false),
  preferred: z.boolean().default(false),
  notes: z.string().optional(),
});

const updateRelationshipStatusInput = z.object({
  marketplaceProfileId: z.string().uuid(),
  relationshipStatus: z.enum(["approved", "suspended", "blacklisted"]),
  notes: z.string().optional(),
});

// Claimant panel beater query — requires insurerTenantId
const getApprovedPanelBeatersInput = z.object({
  insurerTenantId: z.string().min(1),
  countryId: z.string().optional(),
});

// ─── Reusable DB Helper ─────────────────────────────────────────────────────

/**
 * Returns the set of marketplace_profile IDs that are approved for a given insurer.
 * Used by claims.submit for server-side panel beater validation.
 */
export async function getApprovedPanelBeaterIds(insurerTenantId: string): Promise<Set<string>> {
  const db = await getDb();
  if (!db) return new Set();

  const rows = await db
    .select({ profileId: marketplaceProfiles.id })
    .from(insurerMarketplaceRelationships)
    .innerJoin(
      marketplaceProfiles,
      eq(insurerMarketplaceRelationships.marketplaceProfileId, marketplaceProfiles.id)
    )
    .where(
      and(
        eq(insurerMarketplaceRelationships.insurerTenantId, insurerTenantId),
        eq(insurerMarketplaceRelationships.relationshipStatus, "approved"),
        eq(marketplaceProfiles.approvalStatus, "approved"),
        eq(marketplaceProfiles.type, "panel_beater")
      )
    );

  return new Set(rows.map(r => r.profileId));
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const marketplaceRouter = router({
  /**
   * Create a marketplace profile for an assessor or panel beater.
   * The creating user's marketplace_profile_id is updated to link them.
   */
  createProfile: protectedProcedure
    .input(createProfileInput)
    .mutation(async ({ ctx, input }) => {
      const { user } = ctx;

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const profileId = randomUUID();
      const now = new Date().toISOString().slice(0, 19).replace("T", " ");

      await db.insert(marketplaceProfiles).values({
        id: profileId,
        type: input.type,
        companyName: input.companyName,
        countryId: input.countryId,
        contactEmail: input.contactEmail ?? null,
        contactPhone: input.contactPhone ?? null,
        address: input.address ?? null,
        licenseNumber: input.licenseNumber ?? null,
        specializations: input.specializations ?? null,
        approvalStatus: "pending",
        createdAt: now,
        updatedAt: now,
      });

      // Link the user to their new marketplace profile
      await db
        .update(users)
        .set({ marketplaceProfileId: profileId })
        .where(eq(users.id, user.id));

      console.log(`[Marketplace] Profile created: ${profileId} (${input.type}) by user ${user.id}`);

      return { id: profileId, approvalStatus: "pending" as const };
    }),

  /**
   * Update an existing marketplace profile.
   * Only the owner (linked user) or admin can update.
   */
  updateProfile: protectedProcedure
    .input(updateProfileInput)
    .mutation(async ({ ctx, input }) => {
      const { user } = ctx;
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Verify ownership or admin
      if (user.role !== "admin" && user.marketplaceProfileId !== input.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can only update your own profile." });
      }

      const updates: Record<string, unknown> = {};
      if (input.companyName !== undefined) updates.companyName = input.companyName;
      if (input.countryId !== undefined) updates.countryId = input.countryId;
      if (input.contactEmail !== undefined) updates.contactEmail = input.contactEmail;
      if (input.contactPhone !== undefined) updates.contactPhone = input.contactPhone;
      if (input.address !== undefined) updates.address = input.address;
      if (input.licenseNumber !== undefined) updates.licenseNumber = input.licenseNumber;
      if (input.specializations !== undefined) updates.specializations = input.specializations;

      await db
        .update(marketplaceProfiles)
        .set(updates)
        .where(eq(marketplaceProfiles.id, input.id));

      return { success: true };
    }),

  /**
   * Admin: approve or reject a marketplace profile.
   */
  approveOrReject: protectedProcedure
    .input(approveRejectInput)
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required." });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const now = new Date().toISOString().slice(0, 19).replace("T", " ");

      await db
        .update(marketplaceProfiles)
        .set({
          approvalStatus: input.action,
          rejectionReason: input.action === "rejected" ? (input.rejectionReason ?? null) : null,
          approvedBy: input.action === "approved" ? ctx.user.id : null,
          approvedAt: input.action === "approved" ? now : null,
        })
        .where(eq(marketplaceProfiles.id, input.id));

      console.log(`[Marketplace] Profile ${input.id} ${input.action} by admin ${ctx.user.id}`);
      return { success: true, status: input.action };
    }),

  /**
   * List marketplace profiles visible to insurers.
   * Only returns profiles with approvalStatus = 'approved'.
   * Optionally filter by type and/or country.
   */
  listApproved: protectedProcedure
    .input(z.object({
      type: z.enum(["assessor", "panel_beater"]).optional(),
      countryId: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const conditions = [eq(marketplaceProfiles.approvalStatus, "approved")];
      if (input.type) conditions.push(eq(marketplaceProfiles.type, input.type));
      if (input.countryId) conditions.push(eq(marketplaceProfiles.countryId, input.countryId));

      const profiles = await db
        .select()
        .from(marketplaceProfiles)
        .where(and(...conditions));

      return { profiles };
    }),

  /**
   * Admin: list all profiles regardless of approval status.
   */
  listAll: protectedProcedure
    .input(z.object({
      approvalStatus: z.enum(["pending", "approved", "rejected"]).optional(),
      type: z.enum(["assessor", "panel_beater"]).optional(),
    }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required." });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const conditions = [];
      if (input.approvalStatus) conditions.push(eq(marketplaceProfiles.approvalStatus, input.approvalStatus));
      if (input.type) conditions.push(eq(marketplaceProfiles.type, input.type));

      const profiles = conditions.length > 0
        ? await db.select().from(marketplaceProfiles).where(and(...conditions))
        : await db.select().from(marketplaceProfiles);

      return { profiles };
    }),

  /**
   * Insurer: link an approved marketplace profile to their tenant.
   * Enforces that only approved profiles can be linked.
   */
  linkProfile: protectedProcedure
    .input(linkProfileInput)
    .mutation(async ({ ctx, input }) => {
      const { user, tenant } = ctx;

      const tenantId = (tenant as { id?: string } | null)?.id ?? user.tenantId;
      if (!tenantId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant ID required to link a profile." });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Verify profile exists and is approved
      const [profile] = await db
        .select({ id: marketplaceProfiles.id, approvalStatus: marketplaceProfiles.approvalStatus })
        .from(marketplaceProfiles)
        .where(eq(marketplaceProfiles.id, input.marketplaceProfileId));

      if (!profile) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Marketplace profile not found." });
      }
      if (profile.approvalStatus !== "approved") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Only approved profiles can be linked." });
      }

      const now = new Date().toISOString().slice(0, 19).replace("T", " ");

      await db.insert(insurerMarketplaceLinks).values({
        insurerTenantId: tenantId,
        marketplaceProfileId: input.marketplaceProfileId,
        status: "active",
        linkedBy: user.id,
        linkedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      console.log(`[Marketplace] Insurer ${tenantId} linked profile ${input.marketplaceProfileId}`);
      return { success: true };
    }),

  /**
   * Insurer: suspend a linked marketplace profile.
   */
  suspendLink: protectedProcedure
    .input(suspendLinkInput)
    .mutation(async ({ ctx, input }) => {
      const { user, tenant } = ctx;

      const tenantId = (tenant as { id?: string } | null)?.id ?? user.tenantId;
      if (!tenantId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant ID required." });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const now = new Date().toISOString().slice(0, 19).replace("T", " ");

      await db
        .update(insurerMarketplaceLinks)
        .set({
          status: "suspended",
          suspendedAt: now,
          suspensionReason: input.suspensionReason ?? null,
        })
        .where(
          and(
            eq(insurerMarketplaceLinks.insurerTenantId, tenantId),
            eq(insurerMarketplaceLinks.marketplaceProfileId, input.marketplaceProfileId)
          )
        );

      return { success: true };
    }),

  /**
   * Get all active links for the current insurer's tenant,
   * joined with the linked marketplace profile details.
   */
  getMyLinks: protectedProcedure
    .query(async ({ ctx }) => {
      const { user, tenant } = ctx;

      const tenantId = (tenant as { id?: string } | null)?.id ?? user.tenantId;
      if (!tenantId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant ID required." });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const links = await db
        .select({
          linkId: insurerMarketplaceLinks.id,
          linkStatus: insurerMarketplaceLinks.status,
          linkedAt: insurerMarketplaceLinks.linkedAt,
          profile: {
            id: marketplaceProfiles.id,
            type: marketplaceProfiles.type,
            companyName: marketplaceProfiles.companyName,
            countryId: marketplaceProfiles.countryId,
            contactEmail: marketplaceProfiles.contactEmail,
            approvalStatus: marketplaceProfiles.approvalStatus,
          },
        })
        .from(insurerMarketplaceLinks)
        .innerJoin(
          marketplaceProfiles,
          eq(insurerMarketplaceLinks.marketplaceProfileId, marketplaceProfiles.id)
        )
        .where(
          and(
            eq(insurerMarketplaceLinks.insurerTenantId, tenantId),
            eq(insurerMarketplaceLinks.status, "active")
          )
        );

      return { links };
    }),

  // ─── GOVERNANCE LAYER ────────────────────────────────────────────────────────

  /**
   * Insurer: create or update a governance relationship with a marketplace provider.
   *
   * Uses insurerDomainProcedure — ctx.insurerTenantId is guaranteed non-null by middleware.
   * All SQL is filtered exclusively by ctx.insurerTenantId; no manual tenant derivation.
   */
  upsertRelationship: insurerDomainProcedure
    .input(upsertRelationshipInput)
    .mutation(async ({ ctx, input }) => {
      // ctx.insurerTenantId is structurally guaranteed by insurerDomainProcedure
      const tenantId = ctx.insurerTenantId;

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Verify profile exists and is platform-approved
      const [profile] = await db
        .select({ id: marketplaceProfiles.id, approvalStatus: marketplaceProfiles.approvalStatus })
        .from(marketplaceProfiles)
        .where(eq(marketplaceProfiles.id, input.marketplaceProfileId));

      if (!profile) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Marketplace profile not found." });
      }
      if (profile.approvalStatus !== "approved") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Only platform-approved profiles can have insurer relationships.",
        });
      }

      const now = new Date().toISOString().slice(0, 19).replace("T", " ");

      // Check if a relationship already exists for THIS tenant only
      const [existing] = await db
        .select({ id: insurerMarketplaceRelationships.id })
        .from(insurerMarketplaceRelationships)
        .where(
          and(
            eq(insurerMarketplaceRelationships.insurerTenantId, tenantId),
            eq(insurerMarketplaceRelationships.marketplaceProfileId, input.marketplaceProfileId)
          )
        );

      if (existing) {
        // Update is scoped to the existing row's primary key — which was fetched
        // with a WHERE insurerTenantId = tenantId filter, so cross-tenant mutation
        // is structurally impossible.
        await db
          .update(insurerMarketplaceRelationships)
          .set({
            relationshipStatus: input.relationshipStatus,
            slaSigned: input.slaSigned ? 1 : 0,
            preferred: input.preferred ? 1 : 0,
            notes: input.notes ?? null,
            updatedAt: now,
          })
          .where(
            and(
              eq(insurerMarketplaceRelationships.id, existing.id),
              // Double-lock: redundant tenant filter prevents any edge-case leakage
              eq(insurerMarketplaceRelationships.insurerTenantId, tenantId)
            )
          );

        console.log(`[Marketplace Governance] Updated relationship: insurer=${tenantId} profile=${input.marketplaceProfileId} status=${input.relationshipStatus}`);
        return { success: true, action: "updated" as const };
      } else {
        // Insert always writes ctx.insurerTenantId as the owner — never user-supplied
        await db.insert(insurerMarketplaceRelationships).values({
          insurerTenantId: tenantId,
          marketplaceProfileId: input.marketplaceProfileId,
          relationshipStatus: input.relationshipStatus,
          slaSigned: input.slaSigned ? 1 : 0,
          preferred: input.preferred ? 1 : 0,
          notes: input.notes ?? null,
          createdAt: now,
          updatedAt: now,
        });

        console.log(`[Marketplace Governance] Created relationship: insurer=${tenantId} profile=${input.marketplaceProfileId} status=${input.relationshipStatus}`);
        return { success: true, action: "created" as const };
      }
    }),

  /**
   * Insurer: update the relationship_status of an existing governance relationship.
   * Quick action for approve/suspend/blacklist without touching SLA or preferred flags.
   */
  updateRelationshipStatus: protectedProcedure
    .input(updateRelationshipStatusInput)
    .mutation(async ({ ctx, input }) => {
      const { user, tenant } = ctx;

      const tenantId = (tenant as { id?: string } | null)?.id ?? user.tenantId;
      if (!tenantId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant ID required." });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const now = new Date().toISOString().slice(0, 19).replace("T", " ");

      const result = await db
        .update(insurerMarketplaceRelationships)
        .set({
          relationshipStatus: input.relationshipStatus,
          notes: input.notes ?? null,
          updatedAt: now,
        })
        .where(
          and(
            eq(insurerMarketplaceRelationships.insurerTenantId, tenantId),
            eq(insurerMarketplaceRelationships.marketplaceProfileId, input.marketplaceProfileId)
          )
        );

      console.log(`[Marketplace Governance] Status updated: insurer=${tenantId} profile=${input.marketplaceProfileId} → ${input.relationshipStatus}`);
      return { success: true };
    }),

  /**
   * Insurer: list all governance relationships for their tenant.
   * Returns profiles with relationship metadata (status, SLA, preferred).
   */
  /**
   * Insurer: list all governance relationships for their tenant.
   *
   * Uses insurerDomainProcedure — ctx.insurerTenantId is guaranteed non-null by middleware.
   * The WHERE clause is built exclusively from ctx.insurerTenantId; no manual tenant derivation.
   */
  listRelationships: insurerDomainProcedure
    .input(z.object({
      relationshipStatus: z.enum(["approved", "suspended", "blacklisted"]).optional(),
      type: z.enum(["assessor", "panel_beater"]).optional(),
    }))
    .query(async ({ ctx, input }) => {
      // ctx.insurerTenantId is structurally guaranteed by insurerDomainProcedure
      const tenantId = ctx.insurerTenantId;

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const conditions: ReturnType<typeof eq>[] = [
        eq(insurerMarketplaceRelationships.insurerTenantId, tenantId),
      ];
      if (input.relationshipStatus) {
        conditions.push(eq(insurerMarketplaceRelationships.relationshipStatus, input.relationshipStatus));
      }
      if (input.type) {
        conditions.push(eq(marketplaceProfiles.type, input.type));
      }

      const relationships = await db
        .select({
          relationshipId: insurerMarketplaceRelationships.id,
          relationshipStatus: insurerMarketplaceRelationships.relationshipStatus,
          slaSigned: insurerMarketplaceRelationships.slaSigned,
          preferred: insurerMarketplaceRelationships.preferred,
          notes: insurerMarketplaceRelationships.notes,
          createdAt: insurerMarketplaceRelationships.createdAt,
          updatedAt: insurerMarketplaceRelationships.updatedAt,
          profile: {
            id: marketplaceProfiles.id,
            type: marketplaceProfiles.type,
            companyName: marketplaceProfiles.companyName,
            countryId: marketplaceProfiles.countryId,
            contactEmail: marketplaceProfiles.contactEmail,
            contactPhone: marketplaceProfiles.contactPhone,
            address: marketplaceProfiles.address,
            approvalStatus: marketplaceProfiles.approvalStatus,
          },
        })
        .from(insurerMarketplaceRelationships)
        .innerJoin(
          marketplaceProfiles,
          eq(insurerMarketplaceRelationships.marketplaceProfileId, marketplaceProfiles.id)
        )
        .where(and(...conditions));

      return { relationships };
    }),

  /**
   * Claimant / portal: get panel beaters approved by a specific insurer.
   *
   * Dual-filter:
   *   1. marketplace_profiles.approval_status = 'approved' (platform-level)
   *   2. insurer_marketplace_relationships.relationship_status = 'approved' (insurer SLA)
   *
   * Only panel_beaters are returned (not assessors).
   * Preferred providers are sorted first.
   */
  getApprovedPanelBeaters: protectedProcedure
    .input(getApprovedPanelBeatersInput)
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const conditions = [
        eq(insurerMarketplaceRelationships.insurerTenantId, input.insurerTenantId),
        eq(insurerMarketplaceRelationships.relationshipStatus, "approved"),
        eq(marketplaceProfiles.approvalStatus, "approved"),
        eq(marketplaceProfiles.type, "panel_beater"),
      ];

      if (input.countryId) {
        conditions.push(eq(marketplaceProfiles.countryId, input.countryId));
      }

      const panelBeaters = await db
        .select({
          profileId: marketplaceProfiles.id,
          companyName: marketplaceProfiles.companyName,
          countryId: marketplaceProfiles.countryId,
          contactEmail: marketplaceProfiles.contactEmail,
          contactPhone: marketplaceProfiles.contactPhone,
          address: marketplaceProfiles.address,
          specializations: marketplaceProfiles.specializations,
          slaSigned: insurerMarketplaceRelationships.slaSigned,
          preferred: insurerMarketplaceRelationships.preferred,
        })
        .from(insurerMarketplaceRelationships)
        .innerJoin(
          marketplaceProfiles,
          eq(insurerMarketplaceRelationships.marketplaceProfileId, marketplaceProfiles.id)
        )
        .where(and(...conditions));

      // Sort: preferred providers first
      panelBeaters.sort((a, b) => (b.preferred ?? 0) - (a.preferred ?? 0));

      return { panelBeaters };
    }),

  /**
   * Claimant / portal: get assessors approved by a specific insurer.
   * Same dual-filter as getApprovedPanelBeaters but for assessors.
   */
  getApprovedAssessors: protectedProcedure
    .input(z.object({
      insurerTenantId: z.string().min(1),
      countryId: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const conditions = [
        eq(insurerMarketplaceRelationships.insurerTenantId, input.insurerTenantId),
        eq(insurerMarketplaceRelationships.relationshipStatus, "approved"),
        eq(marketplaceProfiles.approvalStatus, "approved"),
        eq(marketplaceProfiles.type, "assessor"),
      ];

      if (input.countryId) {
        conditions.push(eq(marketplaceProfiles.countryId, input.countryId));
      }

      const assessors = await db
        .select({
          profileId: marketplaceProfiles.id,
          companyName: marketplaceProfiles.companyName,
          countryId: marketplaceProfiles.countryId,
          contactEmail: marketplaceProfiles.contactEmail,
          contactPhone: marketplaceProfiles.contactPhone,
          address: marketplaceProfiles.address,
          specializations: marketplaceProfiles.specializations,
          slaSigned: insurerMarketplaceRelationships.slaSigned,
          preferred: insurerMarketplaceRelationships.preferred,
        })
        .from(insurerMarketplaceRelationships)
        .innerJoin(
          marketplaceProfiles,
          eq(insurerMarketplaceRelationships.marketplaceProfileId, marketplaceProfiles.id)
        )
        .where(and(...conditions));

      // Sort: preferred providers first
      assessors.sort((a, b) => (b.preferred ?? 0) - (a.preferred ?? 0));

      return { assessors };
    }),
});
