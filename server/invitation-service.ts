// @ts-nocheck
/**
 * Invitation Service
 * 
 * Handles tenant invitation creation, acceptance, and user provisioning.
 */

import crypto from "crypto";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { tenantInvitations, users, auditTrail } from "../drizzle/schema";
import { eq, and, gt } from "drizzle-orm";

/**
 * Generate a secure random token for invitation
 */
export function generateInvitationToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Create and send a tenant invitation
 */
export async function sendInvitation(params: {
  tenantId: string;
  email: string;
  role: "user" | "admin" | "insurer" | "assessor" | "panel_beater" | "claimant" | "platform_super_admin" | "fleet_admin" | "fleet_manager" | "fleet_driver";
  insurerRole?: "claims_processor" | "assessor_internal" | "assessor_external" | "risk_manager" | "claims_manager" | "executive" | "insurer_admin";
  createdBy: number;
  expirationDays?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database unavailable');
  const { tenantId, email, role, insurerRole, createdBy, expirationDays = 7 } = params;

  // Check if user already exists with this email
  const existingUser = await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.email, email),
  });

  if (existingUser) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `User with email "${email}" already exists`,
    });
  }

  // Check if there's already a pending invitation
  const existingInvitation = await db.query.tenantInvitations.findFirst({
    where: (invitations, { and, eq, gt, isNull }) =>
      and(
        eq(invitations.email, email),
        eq(invitations.tenantId, tenantId),
        isNull(invitations.acceptedAt),
        gt(invitations.expiresAt, new Date())
      ),
  });

  if (existingInvitation) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `An active invitation for "${email}" already exists`,
    });
  }

  // Generate secure token
  const token = generateInvitationToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expirationDays);

  // Create invitation
  const [invitation] = await db.insert(tenantInvitations).values({
    tenantId,
    email,
    role,
    insurerRole: insurerRole || null,
    token,
    expiresAt,
    createdBy,
  });

  console.log(`[Invitation] Created invitation for ${email} to tenant ${tenantId} (expires: ${expiresAt.toISOString()})`);

  // TODO: Send email with invitation link
  // const invitationUrl = `${process.env.FRONTEND_URL}/invite/accept/${token}`;
  // await sendEmail({
  //   to: email,
  //   subject: "You're invited to join KINGA",
  //   body: `Click here to accept: ${invitationUrl}`,
  // });

  return {
    token,
    email,
    expiresAt,
  };
}

/**
 * Accept an invitation and create user account
 */
export async function acceptInvitation(params: {
  token: string;
  name: string;
  openId: string; // From OAuth
}) {
  const db = await getDb();
  if (!db) throw new Error('Database unavailable');
  const { token, name, openId } = params;

  // Find invitation
  const invitation = await db.query.tenantInvitations.findFirst({
    where: (invitations, { eq }) => eq(invitations.token, token),
  });

  if (!invitation) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Invalid invitation token",
    });
  }

  // Check if already accepted
  if (invitation.acceptedAt) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This invitation has already been accepted",
    });
  }

  // Check if expired
  if (new Date() > invitation.expiresAt) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This invitation has expired",
    });
  }

  // Check if user already exists
  const existingUser = await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.email, invitation.email),
  });

  if (existingUser) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "A user with this email already exists",
    });
  }

  // Create user
  const [newUser] = await db.insert(users).values({
    openId,
    name,
    email: invitation.email,
    role: invitation.role,
    insurerRole: invitation.insurerRole || null,
    tenantId: invitation.tenantId,
    emailVerified: 1, // Email is verified through invitation acceptance
  });

  // Mark invitation as accepted
  await db
    .update(tenantInvitations)
    .set({ acceptedAt: new Date() })
    .where(eq(tenantInvitations.token, token));

  // Create audit log entry
  await db.insert(auditTrail).values({
    tenantId: invitation.tenantId,
    userId: newUser.insertId as number,
    actionType: "TENANT_USER_ONBOARDED",
    actionDescription: `User ${name} (${invitation.email}) onboarded to tenant ${invitation.tenantId} with role ${invitation.role}`,
    actor: "SYSTEM",
    metadata: JSON.stringify({
      invitationToken: token,
      role: invitation.role,
      insurerRole: invitation.insurerRole,
      invitedBy: invitation.createdBy,
    }),
  });

  console.log(`[Invitation] User ${name} (${invitation.email}) accepted invitation to tenant ${invitation.tenantId}`);

  return {
    userId: newUser.insertId,
    tenantId: invitation.tenantId,
    role: invitation.role,
    insurerRole: invitation.insurerRole,
  };
}

/**
 * Get invitation details by token (for acceptance page)
 */
export async function getInvitationByToken(token: string) {
  const db = await getDb();
  if (!db) throw new Error('Database unavailable');

  const invitation = await db.query.tenantInvitations.findFirst({
    where: (invitations, { eq }) => eq(invitations.token, token),
  });

  if (!invitation) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Invalid invitation token",
    });
  }

  if (invitation.acceptedAt) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This invitation has already been accepted",
    });
  }

  if (new Date() > invitation.expiresAt) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This invitation has expired",
    });
  }

  // Get tenant details
  const tenant = await db.query.tenants.findFirst({
    where: (tenants, { eq }) => eq(tenants.id, invitation.tenantId),
  });

  return {
    email: invitation.email,
    role: invitation.role,
    insurerRole: invitation.insurerRole,
    tenantId: invitation.tenantId,
    tenantName: tenant?.displayName || invitation.tenantId,
    expiresAt: invitation.expiresAt,
  };
}
