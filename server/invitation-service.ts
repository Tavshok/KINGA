// @ts-nocheck
/**
 * Invitation Service
 *
 * Handles tenant invitation creation, acceptance, and user provisioning.
 * Emails are dispatched via sendEmailSafe (fire-and-forget, never blocks).
 */

import crypto from "crypto";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { tenantInvitations, users, auditTrail, tenants } from "../drizzle/schema";
import { eq, and, gt } from "drizzle-orm";
import { sendEmailSafe } from "./safe-email";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Generate a secure random token for invitation
 */
export function generateInvitationToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function toTitleCase(str: string): string {
  return str.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Create & send invitation ─────────────────────────────────────────────────

/**
 * Create a tenant invitation record and fire an invitation email.
 * The email is dispatched fire-and-forget — invitation creation never fails
 * due to email delivery issues.
 *
 * @param origin  Optional frontend origin (e.g. "https://app.kinga.ai") used
 *                to build the acceptance URL in the email. Defaults to the
 *                BUILT_IN_FORGE_API_URL env var or a sensible fallback.
 */
export async function sendInvitation(params: {
  tenantId: string;
  email: string;
  role: "user" | "admin" | "insurer" | "assessor" | "panel_beater" | "claimant" | "platform_super_admin" | "fleet_admin" | "fleet_manager" | "fleet_driver";
  insurerRole?: "claims_processor" | "assessor_internal" | "assessor_external" | "risk_manager" | "claims_manager" | "executive" | "insurer_admin" | "recovery_officer";
  createdBy: number;
  expirationDays?: number;
  origin?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const { tenantId, email, role, insurerRole, createdBy, expirationDays = 7, origin } = params;

  // ── 1. Check if user already exists ──────────────────────────────────────
  const existingUser = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, email),
  });
  if (existingUser) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `User with email "${email}" already exists`,
    });
  }

  // ── 2. Check for existing pending invitation ──────────────────────────────
  const existingInvitation = await db.query.tenantInvitations.findFirst({
    where: (inv, { and, eq, gt, isNull }) =>
      and(
        eq(inv.email, email),
        eq(inv.tenantId, tenantId),
        isNull(inv.acceptedAt),
        gt(inv.expiresAt, new Date())
      ),
  });
  if (existingInvitation) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `An active invitation for "${email}" already exists`,
    });
  }

  // ── 3. Create invitation record ───────────────────────────────────────────
  const token = generateInvitationToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expirationDays);

  await db.insert(tenantInvitations).values({
    tenantId,
    email,
    role,
    insurerRole: insurerRole || null,
    token,
    expiresAt,
    createdBy,
  });

  console.log(
    `[Invitation] Created for ${email} → tenant ${tenantId} (expires: ${expiresAt.toISOString()})`
  );

  // ── 4. Fire invitation email (non-blocking) ───────────────────────────────
  // Resolve tenant display name and inviter name for the email body.
  let tenantDisplayName = tenantId;
  let inviterName = "Your Administrator";
  try {
    const [tenantRow, inviterRow] = await Promise.all([
      db.query.tenants.findFirst({ where: (t, { eq }) => eq(t.id, tenantId) }),
      db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, createdBy) }),
    ]);
    if (tenantRow?.displayName) tenantDisplayName = tenantRow.displayName;
    if (inviterRow?.name) inviterName = inviterRow.name;
  } catch {
    /* non-fatal — proceed with defaults */
  }

  const roleLabel = insurerRole ? toTitleCase(insurerRole) : toTitleCase(role);
  const base = origin ?? process.env.VITE_FRONTEND_FORGE_API_URL ?? "https://app.kinga.ai";
  const inviteUrl = `${base}/invite/accept/${token}`;
  const expiryLabel = expiresAt.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  sendEmailSafe({
    eventType: "tenant_invitation",
    entityId: `${tenantId}:${email}`,
    // recipientUserId is required by sendEmailSafe for rate-limiting; use
    // createdBy as a proxy since the invitee has no user id yet.
    recipientUserId: createdBy,
    recipientEmail: email,
    tenantId,
    subject: `You've been invited to join ${tenantDisplayName} on KINGA`,
    body: [
      `Hello,`,
      ``,
      `${inviterName} has invited you to join ${tenantDisplayName} on the KINGA AI Insurance Platform as ${roleLabel}.`,
      ``,
      `Click the link below to accept your invitation and set up your account:`,
      `${inviteUrl}`,
      ``,
      `This invitation expires on ${expiryLabel}.`,
      ``,
      `If you did not expect this invitation, you can safely ignore this email.`,
      ``,
      `— The KINGA AI Team`,
    ].join("\n"),
    // Unique per token so re-invites (different token) always send a new email.
    idempotencyKey: `tenant_invitation:${token}`,
  }).catch((err) => {
    console.warn(`[Invitation] Email dispatch failed for ${email}:`, err);
  });

  return {
    token,
    email,
    expiresAt,
  };
}

// ─── Accept invitation ────────────────────────────────────────────────────────

/**
 * Accept an invitation and create user account
 */
export async function acceptInvitation(params: {
  token: string;
  name: string;
  openId: string; // From OAuth
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const { token, name, openId } = params;

  // Find invitation
  const invitation = await db.query.tenantInvitations.findFirst({
    where: (inv, { eq }) => eq(inv.token, token),
  });

  if (!invitation) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Invalid invitation token" });
  }
  if (invitation.acceptedAt) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This invitation has already been accepted" });
  }
  if (new Date() > new Date(invitation.expiresAt)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This invitation has expired" });
  }

  // Check if user already exists
  const existingUser = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, invitation.email),
  });
  if (existingUser) {
    throw new TRPCError({ code: "CONFLICT", message: "A user with this email already exists" });
  }

  // Create user
  const [newUser] = await db.insert(users).values({
    openId,
    name,
    email: invitation.email,
    role: invitation.role,
    insurerRole: invitation.insurerRole || null,
    tenantId: invitation.tenantId,
    emailVerified: 1,
  });

  // Mark invitation as accepted
  await db
    .update(tenantInvitations)
    .set({ acceptedAt: new Date() })
    .where(eq(tenantInvitations.token, token));

  // Audit log
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

  console.log(
    `[Invitation] User ${name} (${invitation.email}) accepted invitation to tenant ${invitation.tenantId}`
  );

  return {
    userId: newUser.insertId,
    tenantId: invitation.tenantId,
    role: invitation.role,
    insurerRole: invitation.insurerRole,
  };
}

// ─── Get invitation details ───────────────────────────────────────────────────

/**
 * Get invitation details by token (for acceptance page)
 */
export async function getInvitationByToken(token: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const invitation = await db.query.tenantInvitations.findFirst({
    where: (inv, { eq }) => eq(inv.token, token),
  });

  if (!invitation) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Invalid invitation token" });
  }
  if (invitation.acceptedAt) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This invitation has already been accepted" });
  }
  if (new Date() > new Date(invitation.expiresAt)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This invitation has expired" });
  }

  // Get tenant details
  const tenant = await db.query.tenants.findFirst({
    where: (t, { eq }) => eq(t.id, invitation.tenantId),
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
