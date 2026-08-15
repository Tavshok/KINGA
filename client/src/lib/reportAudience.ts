export type KingaClaimsReportAudience = "client" | "professional";

/**
 * Keeps client disclosure distinct from authorised professional evidence views.
 * A claimant receives concise outcome-only report sections; every other role
 * retains the professional evidence view subject to existing object authority.
 */
export function getKingaClaimsReportAudience(role?: string | null): KingaClaimsReportAudience {
  return role === "claimant" ? "client" : "professional";
}
