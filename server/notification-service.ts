/**
 * Governance Notification Service
 * 
 * Manages in-app notifications for critical governance events.
 * Provides hook-ready email adapter for future integration.
 * 
 * Notification Types:
 * - intake_escalation: Manager inactivity on intake queue
 * - auto_assignment: Claim auto-assigned to processor
 * - ai_rerun: AI analysis triggered
 * - executive_override: Manual intervention by executive
 * - segregation_violation: Duty separation breach detected
 */

import { getDb } from "./db";
import { governanceNotifications, users } from "../drizzle/schema";
import { eq, and, desc, isNull, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

/**
 * Notification type enum
 */
export type NotificationType =
  | "intake_escalation"
  | "auto_assignment"
  | "ai_rerun"
  | "executive_override"
  | "segregation_violation";

/**
 * Create a new governance notification
 * 
 * Inserts a notification into the database for specified recipients.
 * 
 * @param tenantId - Tenant ID for isolation
 * @param type - Notification type
 * @param title - Notification title
 * @param message - Notification message
 * @param recipients - Array of user IDs to notify
 * @param claimId - Optional claim ID
 * @param metadata - Optional metadata object
 * @returns Created notification ID
 */
export async function createNotification(
  tenantId: string,
  type: NotificationType,
  title: string,
  message: string,
  recipients: number[],
  claimId?: number,
  metadata?: Record<string, any>
): Promise<number> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

  // Insert notification
  const result = await db.insert(governanceNotifications).values({
    tenantId,
    type,
    title,
    message,
    recipients: JSON.stringify(recipients),
    claimId: claimId || null,
    metadata: metadata ? JSON.stringify(metadata) : null,
  });

  const notificationId = result.insertId;

  console.log(
    `[Notification Service] Created ${type} notification for ${recipients.length} recipients in tenant ${tenantId}`
  );

  // TODO: Trigger email notification hook here
  // await sendEmailNotification(notificationId, tenantId, type, title, message, recipients, metadata);

  return notificationId;
}

/**
 * Get notifications for a user
 * 
 * Returns all notifications for the specified user, optionally filtered by read status.
 * 
 * @param userId - User ID to query
 * @param tenantId - Tenant ID for isolation
 * @param unreadOnly - If true, only return unread notifications
 * @param limit - Maximum number of notifications to return (default 50)
 * @returns Array of notifications
 */
export async function getNotifications(
  userId: number,
  tenantId: string,
  unreadOnly: boolean = false,
  limit: number = 50
): Promise<any[]> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

  // Build query conditions
  const conditions = [eq(governanceNotifications.tenantId, tenantId)];

  if (unreadOnly) {
    conditions.push(isNull(governanceNotifications.readAt));
  }

  // Query notifications
  const allNotifications = await db
    .select()
    .from(governanceNotifications)
    .where(and(...conditions))
    .orderBy(desc(governanceNotifications.createdAt))
    .limit(limit);

  // Filter by recipient (recipients is stored as JSON array)
  const userNotifications = allNotifications.filter((notification) => {
    const recipients = JSON.parse(notification.recipients);
    return recipients.includes(userId);
  });

  return userNotifications;
}

/**
 * Get unread notification count for a user
 * 
 * @param userId - User ID to query
 * @param tenantId - Tenant ID for isolation
 * @returns Number of unread notifications
 */
export async function getUnreadCount(userId: number, tenantId: string): Promise<number> {
  const unreadNotifications = await getNotifications(userId, tenantId, true);
  return unreadNotifications.length;
}

/**
 * Mark a notification as read
 * 
 * @param notificationId - Notification ID to mark as read
 * @param userId - User ID marking the notification as read
 * @param tenantId - Tenant ID for isolation
 */
export async function markAsRead(
  notificationId: number,
  userId: number,
  tenantId: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

  // Verify notification exists and belongs to tenant
  const notifications = await db
    .select()
    .from(governanceNotifications)
    .where(
      and(
        eq(governanceNotifications.id, notificationId),
        eq(governanceNotifications.tenantId, tenantId)
      )
    )
    .limit(1);

  if (notifications.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Notification not found" });
  }

  const notification = notifications[0];

  // Verify user is a recipient
  const recipients = JSON.parse(notification.recipients);
  if (!recipients.includes(userId)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "User is not a recipient of this notification",
    });
  }

  // Mark as read
  await db
    .update(governanceNotifications)
    .set({ readAt: new Date() })
    .where(eq(governanceNotifications.id, notificationId));

  console.log(`[Notification Service] Marked notification ${notificationId} as read by user ${userId}`);
}

/**
 * Mark all notifications as read for a user
 * 
 * @param userId - User ID marking notifications as read
 * @param tenantId - Tenant ID for isolation
 */
export async function markAllAsRead(userId: number, tenantId: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

  // Get all unread notifications for user
  const unreadNotifications = await getNotifications(userId, tenantId, true);

  // Mark each as read
  for (const notification of unreadNotifications) {
    await db
      .update(governanceNotifications)
      .set({ readAt: new Date() })
      .where(eq(governanceNotifications.id, notification.id));
  }

  console.log(
    `[Notification Service] Marked ${unreadNotifications.length} notifications as read for user ${userId}`
  );
}

/**
 * Send email notification (hook-ready adapter)
 * 
 * This function is a placeholder for future email integration.
 * Replace with actual email service (e.g., SendGrid, AWS SES, Postmark).
 * 
 * @param notificationId - Notification ID
 * @param tenantId - Tenant ID
 * @param type - Notification type
 * @param title - Notification title
 * @param message - Notification message
 * @param recipients - Array of user IDs
 * @param metadata - Optional metadata object
 */
export async function sendEmailNotification(
  notificationId: number,
  tenantId: string,
  type: NotificationType,
  title: string,
  message: string,
  recipients: number[],
  metadata?: Record<string, any>
): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.error("[Notification Service] Database not available for email notification");
    return;
  }

  // Get recipient email addresses
  const recipientUsers = await db
    .select()
    .from(users)
    .where(and(inArray(users.id, recipients), eq(users.tenantId, tenantId)));

  const emailAddresses = recipientUsers
    .filter((user) => user.email)
    .map((user) => user.email as string);

  if (emailAddresses.length === 0) {
    console.warn(
      `[Notification Service] No email addresses found for recipients in notification ${notificationId}`
    );
    return;
  }

  // TODO: Replace with actual email service integration
  console.log(`[Notification Service] Email notification hook triggered:`);
  console.log(`  - Type: ${type}`);
  console.log(`  - Title: ${title}`);
  console.log(`  - Message: ${message}`);
  console.log(`  - Recipients: ${emailAddresses.join(", ")}`);
  console.log(`  - Metadata: ${JSON.stringify(metadata)}`);

  // Example integration with SendGrid:
  // const sgMail = require('@sendgrid/mail');
  // sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  // const msg = {
  //   to: emailAddresses,
  //   from: 'notifications@kinga.ai',
  //   subject: title,
  //   text: message,
  //   html: formatEmailTemplate(type, title, message, metadata),
  // };
  // await sgMail.send(msg);
}

/**
 * Format notification title based on type
 * 
 * @param type - Notification type
 * @param context - Context object with relevant data
 * @returns Formatted title
 */
export function formatNotificationTitle(
  type: NotificationType,
  context: Record<string, any>
): string {
  switch (type) {
    case "intake_escalation":
      return `⚠️ Intake Queue Escalation: ${context.count} Claims Auto-Assigned`;
    case "auto_assignment":
      return `📋 Claim Auto-Assigned: ${context.claimNumber}`;
    case "ai_rerun":
      return `🤖 AI Analysis Rerun: ${context.claimNumber}`;
    case "executive_override":
      return `👤 Executive Override: ${context.claimNumber}`;
    case "segregation_violation":
      return `🚨 Segregation Violation Detected: ${context.claimNumber}`;
    default:
      return "Governance Notification";
  }
}

/**
 * Format notification message based on type
 * 
 * @param type - Notification type
 * @param context - Context object with relevant data
 * @returns Formatted message
 */
export function formatNotificationMessage(
  type: NotificationType,
  context: Record<string, any>
): string {
  switch (type) {
    case "intake_escalation":
      return `${context.count} claims in the intake queue exceeded the ${context.thresholdHours}-hour threshold and were automatically assigned to processors due to manager inactivity.`;
    case "auto_assignment":
      return `Claim ${context.claimNumber} has been automatically assigned to ${context.processorName} (workload score: ${context.workloadScore}).`;
    case "ai_rerun":
      return `AI analysis was rerun for claim ${context.claimNumber} by ${context.triggeredBy} (${context.triggeredRole}). Version ${context.versionNumber} created.`;
    case "executive_override":
      return `${context.executiveName} (Executive) manually overrode the routing decision for claim ${context.claimNumber}. Previous state: ${context.previousState}, New state: ${context.newState}.`;
    case "segregation_violation":
      return `Segregation of duties violation detected for claim ${context.claimNumber}. User ${context.userName} (${context.userRole}) attempted to perform ${context.action} on a claim they previously ${context.previousAction}.`;
    default:
      return "A governance event occurred.";
  }
}
