import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { claims } from "../../drizzle/schema";
import { getDb } from "../db";

/**
 * Resolve a claim only after proving that a non-null session tenant owns it.
 *
 * This is the common authority boundary for governed claim artefacts. Callers
 * must never substitute a requested tenant or claim-only lookup for this check.
 */
export async function requireGovernedTenantClaim(
  claimId: string,
  tenantId: string | null | undefined,
) {
  if (!tenantId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "A tenant-scoped session is required" });
  }

  const numericClaimId = Number(claimId);
  if (!Number.isInteger(numericClaimId) || numericClaimId <= 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found or access denied" });
  }

  const db = await getDb();
  if (!db) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  }

  const [claim] = await db
    .select({ id: claims.id, tenantId: claims.tenantId })
    .from(claims)
    .where(and(eq(claims.id, numericClaimId), eq(claims.tenantId, tenantId)))
    .limit(1);

  if (!claim) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found or access denied" });
  }

  return { claim, tenantId };
}
