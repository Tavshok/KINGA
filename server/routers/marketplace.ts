/**
 * Marketplace Router
 *
 * Manages assessors and panel beaters as cross-tenant marketplace entities.
 * Only approved marketplace_profiles are visible to insurers.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  marketplaceProfiles,
  insurerMarketplaceLinks,
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
});
