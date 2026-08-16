
/**
 * Notifications Router — Epic 5-B
 *
 * tRPC procedures for the platform-wide Notification Centre.
 *
 * Procedures:
 *   getAll           — paginated list (all / unread / archived), optional module filter
 *   getUnreadCount   — badge count
 *   markAsRead       — single notification
 *   markAllAsRead    — all unread for user
 *   archive          — single notification
 *   archiveAll       — all read notifications for user
 *   getPreferences   — user's per-module preferences
 *   updatePreference — upsert one module preference
 */

import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { assertRestrictedAgencyAssistedCapability } from "../agency/agencyAssistedClaimantIdentity";
import {
  notifications,
  notificationPreferences,
} from "../../drizzle/schema";
import { eq, and, isNull, isNotNull, desc } from "drizzle-orm";

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_MODULES = [
  "claims",
  "fraud",
  "vehicle_passport",
  "asset_passport",
  "engineering",
  "fleet",
  "timeline",
  "recoveries",
  "portfolio",
  "predictive",
] as const;

const restrictedCommunicationProcedure = protectedProcedure.use(({ ctx, next }) => {
  assertRestrictedAgencyAssistedCapability(ctx.user, "communication_authority");
  return next();
});

function requireNotificationTenant(ctx: { user?: { tenantId?: string | null } }) {
  const tenantId = ctx.user?.tenantId;
  if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "A tenant-scoped session is required" });
  return tenantId;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const notificationsRouter = router({
  /**
   * Get notifications for the current user.
   * Supports: all | unread | archived, optional module filter, pagination.
   */
  getAll: restrictedCommunicationProcedure
    .input(
      z.object({
        filter: z.enum(["all", "unread", "archived"]).optional().default("all"),
        module: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional().default(50),
        offset: z.number().int().min(0).optional().default(0),
        // Legacy compat — maps to filter: "unread"
        unreadOnly: z.boolean().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const filter = input.unreadOnly ? "unread" : input.filter;
      const conditions: any[] = [eq(notifications.userId, ctx.user.id)];

      if (filter === "unread") {
        conditions.push(isNull(notifications.readAt));
        // @ts-ignore — archived_at added via ALTER TABLE
        conditions.push(isNull(notifications.archivedAt));
      } else if (filter === "archived") {
        // @ts-ignore
        conditions.push(isNotNull(notifications.archivedAt));
      } else {
        // @ts-ignore
        conditions.push(isNull(notifications.archivedAt));
      }

      if (input.module) {
        // @ts-ignore — module column added via ALTER TABLE
        conditions.push(eq(notifications.module, input.module));
      }

      return db
        .select()
        .from(notifications)
        .where(and(...conditions))
        .orderBy(desc(notifications.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  /**
   * Unread badge count (excludes archived).
   */
  getUnreadCount: restrictedCommunicationProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { count: 0 };

    const rows = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, ctx.user.id),
          isNull(notifications.readAt),
          // @ts-ignore
          isNull(notifications.archivedAt)
        )
      );

    return { count: rows.length };
  }),

  /**
   * Mark a single notification as read.
   */
  markAsRead: restrictedCommunicationProcedure
    .input(z.object({ notificationId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      await db
        .update(notifications)
        .set({ readAt: new Date().toISOString().slice(0, 19).replace("T", " ") })
        .where(
          and(
            eq(notifications.id, input.notificationId),
            eq(notifications.userId, ctx.user.id)
          )
        );

      return { success: true };
    }),

  /**
   * Mark all unread notifications as read.
   */
  markAllAsRead: restrictedCommunicationProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

    await db
      .update(notifications)
      .set({ readAt: new Date().toISOString().slice(0, 19).replace("T", " ") })
      .where(
        and(
          eq(notifications.userId, ctx.user.id),
          isNull(notifications.readAt)
        )
      );

    return { success: true };
  }),

  /**
   * Archive a single notification.
   */
  archive: restrictedCommunicationProcedure
    .input(z.object({ notificationId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const now = new Date().toISOString().slice(0, 19).replace("T", " ");
      await db
        .update(notifications)
        .set({
          // @ts-ignore
          archivedAt: now,
          readAt: now,
        })
        .where(
          and(
            eq(notifications.id, input.notificationId),
            eq(notifications.userId, ctx.user.id)
          )
        );

      return { success: true };
    }),

  /**
   * Archive all read notifications for the current user.
   */
  archiveAll: restrictedCommunicationProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    await db
      .update(notifications)
      .set({ // @ts-ignore
        archivedAt: now,
      })
      .where(
        and(
          eq(notifications.userId, ctx.user.id),
          isNotNull(notifications.readAt),
          // @ts-ignore
          isNull(notifications.archivedAt)
        )
      );

    return { success: true };
  }),

  /**
   * Get notification preferences for all modules.
   * Returns defaults for modules without an explicit preference row.
   */
  getPreferences: restrictedCommunicationProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    const tenantId = requireNotificationTenant(ctx);

    const rows = await db
      .select()
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.userId, ctx.user.id),
          eq(notificationPreferences.tenantId, tenantId)
        )
      );

    const prefMap = new Map(rows.map((r) => [r.module, r]));

    return ALL_MODULES.map((module) => {
      const pref = prefMap.get(module);
      return {
        module,
        inAppEnabled: pref ? pref.inAppEnabled === 1 : true,
        emailEnabled: pref ? pref.emailEnabled === 1 : false,
        smsEnabled: pref ? pref.smsEnabled === 1 : false,
        minPriority: pref?.minPriority ?? "low",
      };
    });
  }),

  /**
   * Upsert notification preference for one module.
   */
  updatePreference: restrictedCommunicationProcedure
    .input(
      z.object({
        module: z.enum(ALL_MODULES),
        inAppEnabled: z.boolean(),
        emailEnabled: z.boolean(),
        smsEnabled: z.boolean(),
        minPriority: z.enum(["low", "medium", "high", "urgent"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const tenantId = requireNotificationTenant(ctx);

      await db
        .insert(notificationPreferences)
        .values({
          userId: ctx.user.id,
          tenantId,
          module: input.module,
          inAppEnabled: input.inAppEnabled ? 1 : 0,
          emailEnabled: input.emailEnabled ? 1 : 0,
          smsEnabled: input.smsEnabled ? 1 : 0,
          minPriority: input.minPriority,
        })
        .onDuplicateKeyUpdate({
          set: {
            inAppEnabled: input.inAppEnabled ? 1 : 0,
            emailEnabled: input.emailEnabled ? 1 : 0,
            smsEnabled: input.smsEnabled ? 1 : 0,
            minPriority: input.minPriority,
          },
        });

      return { success: true };
    }),
});
