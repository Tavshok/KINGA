/**
 * KINGA Relationship Intelligence Router
 * P0 Package 1: sensitive registry and graph access is role-gated, session
 * tenant-derived, parameterised, and audited for explicit cross-tenant review.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { auditP0CrossTenantAccess, resolveP0TenantScope, validateP0TenantScope, type P0ScopeContext, type P0TenantScope } from "../security/p0TenantBoundary";

const tenantInput = z.object({ tenantId: z.string().optional() });
const boundedLimit = z.number().int().min(1).max(200).default(50);
const intelligenceInsurerRoles = new Set([
  "claims_processor", "claims_manager", "risk_manager", "executive", "insurer_admin", "fraud_investigator",
]);

export function assertIntelligenceRole(ctx: P0ScopeContext & { user: { insurerRole?: string | null } }): void {
  const role = ctx.user.role;
  const insurerRole = ctx.user.insurerRole ?? null;
  if (role === "platform_super_admin" || role === "admin") return;
  if (role === "insurer" && insurerRole && intelligenceInsurerRoles.has(insurerRole)) return;
  throw new TRPCError({ code: "FORBIDDEN", message: "Authorised intelligence role required." });
}

export async function resolveIntelligenceScope(
  ctx: P0ScopeContext & { user: { insurerRole?: string | null } },
  requestedTenantId: string | undefined,
  procedureName: string,
): Promise<P0TenantScope> {
  assertIntelligenceRole(ctx);
  const scope = resolveP0TenantScope(ctx, requestedTenantId, procedureName);
  await validateP0TenantScope(scope);
  return scope;
}

async function finishIntelligenceAccess(
  ctx: P0ScopeContext,
  scope: P0TenantScope,
  procedureName: string,
  resourceId: string,
): Promise<void> {
  await auditP0CrossTenantAccess(ctx, scope, procedureName.replace("intelligence.", "intelligence_"), resourceId, { tenantId: scope.tenantId });
}

const safe = (rows: unknown, field: string) => Number((rows as any[])?.[0]?.[field] ?? 0);

export const intelligenceRouter = router({
  getSummaryStats: protectedProcedure
    .input(tenantInput)
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const scope = await resolveIntelligenceScope(ctx as any, input.tenantId, "intelligence.getSummaryStats");
      const tenantId = scope.tenantId;
      const [officers] = await db.execute(sql`SELECT COUNT(*) as total, SUM(CASE WHEN risk_score >= 60 THEN 1 ELSE 0 END) as flagged FROM police_officer_registry WHERE tenant_id = ${tenantId}`);
      const [assessors] = await db.execute(sql`SELECT COUNT(*) as total, SUM(CASE WHEN is_watchlisted = 1 THEN 1 ELSE 0 END) as flagged FROM assessor_registry WHERE tenant_id = ${tenantId}`);
      const [panelBeaters] = await db.execute(sql`SELECT COUNT(*) as total, SUM(CASE WHEN quotes_below_cost_count >= 3 THEN 1 ELSE 0 END) as flagged FROM panel_beater_registry WHERE tenant_id = ${tenantId}`);
      const [drivers] = await db.execute(sql`SELECT COUNT(*) as total, SUM(CASE WHEN total_claims >= 3 THEN 1 ELSE 0 END) as flagged FROM driver_registry WHERE tenant_id = ${tenantId}`);
      const [clusters] = await db.execute(sql`SELECT COUNT(*) as total, SUM(CASE WHEN risk_classification = 'high' THEN 1 ELSE 0 END) as high_risk FROM accident_clusters WHERE tenant_id = ${tenantId}`);
      const [models] = await db.execute(sql`SELECT COUNT(*) as total FROM ml_models WHERE is_active = 1`);
      await finishIntelligenceAccess(ctx as any, scope, "intelligence.getSummaryStats", tenantId);
      return {
        officers: { total: safe(officers, "total"), flagged: safe(officers, "flagged") },
        assessors: { total: safe(assessors, "total"), flagged: safe(assessors, "flagged") },
        panelBeaters: { total: safe(panelBeaters, "total"), flagged: safe(panelBeaters, "flagged") },
        drivers: { total: safe(drivers, "total"), flagged: safe(drivers, "flagged") },
        clusters: { total: safe(clusters, "total"), high_risk: safe(clusters, "high_risk") },
        mlAnomalies: { total: safe(models, "total") },
      };
    }),

  getOfficerRegistry: protectedProcedure
    .input(tenantInput.extend({ limit: boundedLimit }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const scope = await resolveIntelligenceScope(ctx as any, input.tenantId, "intelligence.getOfficerRegistry");
      const [rows] = await db.execute(sql`SELECT id, full_name as entity_name, badge_number, station as police_station, officer_rank, total_claims as total_claims_attended, risk_score, risk_flags, is_watchlisted, watchlist_reason, location_concentration_score, assessor_co_occurrences, updated_at as last_seen_date FROM police_officer_registry WHERE tenant_id = ${scope.tenantId} ORDER BY total_claims DESC LIMIT ${input.limit}`);
      await finishIntelligenceAccess(ctx as any, scope, "intelligence.getOfficerRegistry", scope.tenantId);
      return (rows as any[]) ?? [];
    }),

  getAssessorRegistry: protectedProcedure
    .input(tenantInput.extend({ limit: boundedLimit }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const scope = await resolveIntelligenceScope(ctx as any, input.tenantId, "intelligence.getAssessorRegistry");
      const [rows] = await db.execute(sql`SELECT id, full_name as entity_name, company_name, accreditation_number, total_claims_assessed, avg_cost_reduction_pct, routing_concentration_score, cost_suppression_claims as cost_suppression_claim_count, structural_gap_claims, risk_score, risk_flags, is_watchlisted, watchlist_reason, top_panel_beater_pct FROM assessor_registry WHERE tenant_id = ${scope.tenantId} ORDER BY total_claims_assessed DESC LIMIT ${input.limit}`);
      await finishIntelligenceAccess(ctx as any, scope, "intelligence.getAssessorRegistry", scope.tenantId);
      return ((rows as any[]) ?? []).map((row) => ({ ...row, collusion_suspected: row.is_watchlisted || (Number(row.routing_concentration_score) > 70 && Number(row.cost_suppression_claims) >= 3) }));
    }),

  getPanelBeaterRegistry: protectedProcedure
    .input(tenantInput.extend({ limit: boundedLimit }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const scope = await resolveIntelligenceScope(ctx as any, input.tenantId, "intelligence.getPanelBeaterRegistry");
      const [rows] = await db.execute(sql`SELECT id, company_name as entity_name, region, total_quotes_submitted as total_claims_repaired, avg_quote_vs_true_cost_pct, structural_gap_count, quotes_below_cost_count, risk_score, risk_flags, is_watchlisted, routing_concentration_score, top_assessor_pct FROM panel_beater_registry WHERE tenant_id = ${scope.tenantId} ORDER BY total_quotes_submitted DESC LIMIT ${input.limit}`);
      await finishIntelligenceAccess(ctx as any, scope, "intelligence.getPanelBeaterRegistry", scope.tenantId);
      return (rows as any[]) ?? [];
    }),

  getDriverRegistry: protectedProcedure
    .input(tenantInput.extend({ limit: boundedLimit, flaggedOnly: z.boolean().default(false) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const scope = await resolveIntelligenceScope(ctx as any, input.tenantId, "intelligence.getDriverRegistry");
      const flaggedFilter = input.flaggedOnly ? sql`AND total_claims >= 2` : sql``;
      const [rows] = await db.execute(sql`SELECT id, full_name as entity_name, licence_number, id_number, total_claims as total_claims_as_driver, claims_as_claimant as total_claims_as_claimant, claims_as_third_party, address_change_count, licence_expiry_date, licence_class, nationality, risk_score, risk_flags, is_watchlisted, watchlist_reason, last_claim_date FROM driver_registry WHERE tenant_id = ${scope.tenantId} ${flaggedFilter} ORDER BY total_claims DESC LIMIT ${input.limit}`);
      await finishIntelligenceAccess(ctx as any, scope, "intelligence.getDriverRegistry", scope.tenantId);
      return (rows as any[]) ?? [];
    }),

  getAccidentClusters: protectedProcedure
    .input(tenantInput.extend({ riskLevel: z.enum(["low", "medium", "high"]).optional() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const scope = await resolveIntelligenceScope(ctx as any, input.tenantId, "intelligence.getAccidentClusters");
      const riskFilter = input.riskLevel ? sql`AND risk_classification = ${input.riskLevel}` : sql``;
      const [rows] = await db.execute(sql`SELECT id, cluster_label as location_description, risk_classification as risk_level, claim_count, fraud_rate, flagged_claim_count, centroid_lat, centroid_lng, radius_meters, first_claim_date, last_claim_date, is_spatio_temporal, temporal_window_days as time_span_days, dominant_entities FROM accident_clusters WHERE tenant_id = ${scope.tenantId} ${riskFilter} ORDER BY claim_count DESC LIMIT 100`);
      await finishIntelligenceAccess(ctx as any, scope, "intelligence.getAccidentClusters", scope.tenantId);
      return ((rows as any[]) ?? []).map((row) => ({ ...row, avg_fraud_score: row.fraud_rate ? (Number(row.fraud_rate) * 100).toFixed(1) : null, max_fraud_score: row.fraud_rate ? (Number(row.fraud_rate) * 130).toFixed(1) : null, hotspot_type: row.is_spatio_temporal ? "spatio_temporal_cluster" : "spatial_cluster" }));
    }),

  getAnomalyScores: protectedProcedure
    .input(z.object({ entityType: z.string().optional(), anomalyOnly: z.boolean().default(false), tenantId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const scope = await resolveIntelligenceScope(ctx as any, input.tenantId, "intelligence.getAnomalyScores");
      const [rows] = await db.execute(sql`SELECT id, model_name as entity_name, model_type, model_version, accuracy_score as anomaly_score, auc_score, training_claim_count, feature_importance as feature_vector_json, is_active as is_anomaly, trained_at, notes FROM ml_models ORDER BY trained_at DESC LIMIT 200`);
      await finishIntelligenceAccess(ctx as any, scope, "intelligence.getAnomalyScores", "ml_models");
      return (rows as any[]) ?? [];
    }),

  getRelationshipGraph: protectedProcedure
    .input(z.object({ tenantId: z.string().optional(), entityId: z.number().int().positive().optional(), entityType: z.enum(["driver", "claimant", "assessor", "panel_beater", "police_officer", "fleet"]).optional(), limit: boundedLimit.default(100) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const scope = await resolveIntelligenceScope(ctx as any, input.tenantId, "intelligence.getRelationshipGraph");
      const entityFilter = input.entityId && input.entityType
        ? sql`AND ((entity_a_id = ${input.entityId} AND entity_a_type = ${input.entityType}) OR (entity_b_id = ${input.entityId} AND entity_b_type = ${input.entityType}))`
        : sql``;
      const [rows] = await db.execute(sql`SELECT id, entity_a_type as source_entity_type, entity_a_id as source_entity_id, entity_b_type as target_entity_type, entity_b_id as target_entity_id, relationship_type, edge_weight, claim_id, first_seen_at, last_seen_at FROM entity_relationship_graph WHERE tenant_id = ${scope.tenantId} ${entityFilter} ORDER BY edge_weight DESC LIMIT ${input.limit}`);
      await finishIntelligenceAccess(ctx as any, scope, "intelligence.getRelationshipGraph", input.entityId ? String(input.entityId) : scope.tenantId);
      return (rows as any[]) ?? [];
    }),

  getClaimantRegistry: protectedProcedure
    .input(tenantInput.extend({ limit: boundedLimit, flaggedOnly: z.boolean().default(false) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const scope = await resolveIntelligenceScope(ctx as any, input.tenantId, "intelligence.getClaimantRegistry");
      const flaggedFilter = input.flaggedOnly ? sql`AND total_claims >= 2` : sql``;
      const [rows] = await db.execute(sql`SELECT id, full_name as entity_name, id_number, total_claims as lifetime_claim_count, risk_score, is_watchlisted, watchlist_reason, address_change_count, last_claim_date FROM claimant_registry WHERE tenant_id = ${scope.tenantId} ${flaggedFilter} ORDER BY total_claims DESC LIMIT ${input.limit}`);
      await finishIntelligenceAccess(ctx as any, scope, "intelligence.getClaimantRegistry", scope.tenantId);
      return (rows as any[]) ?? [];
    }),
});
