/**
 * Assessor Subscription — Free / Pro Tier
 *
 * Responsibilities:
 *   1. getOrCreateSubscription(userId, marketplaceProfileId?)
 *      — Returns the assessor's subscription row, creating a free-tier default if none exists.
 *
 *   2. getMonthlyAssignmentCount(userId)
 *      — Counts claims assigned to this assessor in the current calendar month.
 *
 *   3. checkAssignmentCap(userId)
 *      — Returns { allowed, tier, used, cap, remaining }.
 *        Throws TRPCError(FORBIDDEN) if the free cap is reached.
 *
 *   4. upsertSubscription(userId, marketplaceProfileId, tier)
 *      — Admin-only: create or upgrade/downgrade a subscription.
 *
 * Design decisions:
 *   - Free tier: 10 claims/month (configurable via ASSESSOR_TIER_CAPS).
 *   - Pro tier: 9999/month (effectively unlimited).
 *   - Expired pro subscriptions fall back to free-tier enforcement automatically.
 *   - Cap is checked at assignment time only (not retroactively).
 */

import { getDb } from "./db";
import { assessorSubscriptions, ASSESSOR_TIER_CAPS, claims, users } from "../drizzle/schema";
import { eq, and, gte, count, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AssessorTier = "free" | "pro";

export interface CapCheckResult {
  allowed: boolean;
  tier: AssessorTier;
  used: number;
  cap: number;
  remaining: number;
  isExpired: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function startOfCurrentMonth(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
}

function nowTimestamp(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

// ─── Core functions ───────────────────────────────────────────────────────────

/**
 * Returns the assessor's subscription row.
 * If none exists, inserts a free-tier default and returns it.
 */
export async function getOrCreateSubscription(
  userId: number,
  marketplaceProfileId?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  // Try to find existing subscription by user_id
  const [existing] = await db
    .select()
    .from(assessorSubscriptions)
    .where(eq(assessorSubscriptions.userId, userId))
    .limit(1);

  if (existing) return existing;

  // Resolve marketplace_profile_id: use provided value, or fall back to users.marketplaceProfileId
  let profileId = marketplaceProfileId;
  if (!profileId) {
    const [userRow] = await db
      .select({ marketplaceProfileId: users.marketplaceProfileId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    profileId = userRow?.marketplaceProfileId ?? `auto-${userId}`;
  }

  const now = nowTimestamp();
  await db.insert(assessorSubscriptions).values({
    userId,
    marketplaceProfileId: profileId,
    tier: "free",
    maxClaimsPerMonth: ASSESSOR_TIER_CAPS.free.maxClaimsPerMonth,
    createdAt: now,
    updatedAt: now,
  });

  const [created] = await db
    .select()
    .from(assessorSubscriptions)
    .where(eq(assessorSubscriptions.userId, userId))
    .limit(1);

  return created!;
}

/**
 * Counts claims assigned to this assessor in the current calendar month.
 */
export async function getMonthlyAssignmentCount(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const monthStart = startOfCurrentMonth();

  const [row] = await db
    .select({ total: count() })
    .from(claims)
    .where(
      and(
        eq(claims.assignedAssessorId, userId),
        gte(claims.createdAt, monthStart)
      )
    );

  return row?.total ?? 0;
}

/**
 * Checks whether an assessor is allowed to receive another assignment.
 *
 * Logic:
 *   1. Load (or create) the subscription.
 *   2. If pro tier AND not expired → always allowed.
 *   3. If free tier (or expired pro) → check monthly count vs cap.
 *   4. Throws TRPCError(FORBIDDEN) if cap is reached.
 */
export async function checkAssignmentCap(userId: number): Promise<CapCheckResult> {
  const sub = await getOrCreateSubscription(userId);

  const now = new Date();
  const isExpired =
    sub.tier === "pro" &&
    sub.expiresAt !== null &&
    new Date(sub.expiresAt) < now;

  // Effective tier after expiry check
  const effectiveTier: AssessorTier = isExpired ? "free" : (sub.tier as AssessorTier);
  const cap = isExpired
    ? ASSESSOR_TIER_CAPS.free.maxClaimsPerMonth
    : sub.maxClaimsPerMonth;

  // Pro (non-expired) → always allowed
  if (effectiveTier === "pro") {
    return { allowed: true, tier: "pro", used: 0, cap, remaining: cap, isExpired: false };
  }

  // Free (or expired pro) → count and compare
  const used = await getMonthlyAssignmentCount(userId);
  const remaining = Math.max(0, cap - used);
  const allowed = used < cap;

  if (!allowed) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        `Free tier monthly assignment cap of ${cap} claims has been reached. ` +
        `Upgrade to Pro to receive unlimited assignments this month.`,
    });
  }

  return { allowed, tier: effectiveTier, used, cap, remaining, isExpired };
}

/**
 * Admin: create or update an assessor's subscription tier.
 * Upgrades to pro set maxClaimsPerMonth = 9999.
 * Downgrades to free reset to 10.
 */
export async function upsertSubscription(
  userId: number,
  marketplaceProfileId: string,
  tier: AssessorTier,
  expiresAt?: string | null
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const now = nowTimestamp();
  const cap = ASSESSOR_TIER_CAPS[tier].maxClaimsPerMonth;

  // Check if row exists
  const [existing] = await db
    .select({ id: assessorSubscriptions.id })
    .from(assessorSubscriptions)
    .where(eq(assessorSubscriptions.userId, userId))
    .limit(1);

  if (existing) {
    await db
      .update(assessorSubscriptions)
      .set({
        tier,
        maxClaimsPerMonth: cap,
        expiresAt: expiresAt ?? null,
        updatedAt: now,
      })
      .where(eq(assessorSubscriptions.userId, userId));
  } else {
    await db.insert(assessorSubscriptions).values({
      userId,
      marketplaceProfileId,
      tier,
      maxClaimsPerMonth: cap,
      expiresAt: expiresAt ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  const [updated] = await db
    .select()
    .from(assessorSubscriptions)
    .where(eq(assessorSubscriptions.userId, userId))
    .limit(1);

  return updated!;
}
