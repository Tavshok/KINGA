/**
 * Notifications Router
 * 
 * tRPC procedures for governance notification management.
 * 
 * Procedures:
 * - getAll: Get all notifications for current user (with pagination)
 * - getUnreadCount: Get unread notification count
 * - markAsRead: Mark a notification as read
 * - markAllAsRead: Mark all notifications as read
 */

import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} from "../notification-service";
import { TRPCError } from "@trpc/server";

export const notificationsRouter = router({
  /**
   * Get all notifications for current user
   * 
   * Returns notifications with optional filtering by read status.
   * Supports pagination via limit parameter.
   */
  getAll: protectedProcedure
    .input(
      z.object({
        unreadOnly: z.boolean().optional().default(false),
        limit: z.number().int().positive().optional().default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const { user } = ctx;

      // Verify user has tenant
      if (!user.tenantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "User must belong to a tenant",
        });
      }

      // Get notifications
      const notifications = await getNotifications(
        user.id,
        user.tenantId,
        input.unreadOnly,
        input.limit
      );

      return notifications;
    }),

  /**
   * Get unread notification count
   * 
   * Returns the number of unread notifications for the current user.
   */
  getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
    const { user } = ctx;

    // Verify user has tenant
    if (!user.tenantId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "User must belong to a tenant",
      });
    }

    // Get unread count
    const count = await getUnreadCount(user.id, user.tenantId);

    return { count };
  }),

  /**
   * Mark a notification as read
   * 
   * Updates the read_at timestamp for the specified notification.
   */
  markAsRead: protectedProcedure
    .input(
      z.object({
        notificationId: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { user } = ctx;
      const { notificationId } = input;

      // Verify user has tenant
      if (!user.tenantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "User must belong to a tenant",
        });
      }

      // Mark as read
      await markAsRead(notificationId, user.id, user.tenantId);

      return { success: true };
    }),

  /**
   * Mark all notifications as read
   * 
   * Updates the read_at timestamp for all unread notifications for the current user.
   */
  markAllAsRead: protectedProcedure.mutation(async ({ ctx }) => {
    const { user } = ctx;

    // Verify user has tenant
    if (!user.tenantId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "User must belong to a tenant",
      });
    }

    // Mark all as read
    await markAllAsRead(user.id, user.tenantId);

    return { success: true };
  }),
});
