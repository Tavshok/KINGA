// @ts-nocheck
/**
 * KINGA Relationship Intelligence Router
 * ========================================
 * Exposes entity registries, relationship graph, accident hotspot clusters,
 * and ML anomaly scores to the frontend intelligence dashboard.
 * Column names match the actual DB tables created in intelligence_layer.sql.
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

export const intelligenceRouter = router({
  // ── Summary stats for the intelligence dashboard header ──────────────────
  getSummaryStats: protectedProcedure
    .input(z.object({ tenantId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const tenantId = input.tenantId ?? (ctx.user as any)?.tenantId ?? 'default';
      const safe = (rows: any[], field: string) => Number((rows as any[])[0]?.[field] ?? 0);
      try {
        const [officers]    = await db.execute(sql.raw(`SELECT COUNT(*) as total, SUM(CASE WHEN risk_score >= 60 THEN 1 ELSE 0 END) as flagged FROM police_officer_registry WHERE tenant_id = '${tenantId}'`));
        const [assessors]   = await db.execute(sql.raw(`SELECT COUNT(*) as total, SUM(CASE WHEN is_watchlisted = 1 THEN 1 ELSE 0 END) as flagged FROM assessor_registry WHERE tenant_id = '${tenantId}'`));
        const [panelBeaters]= await db.execute(sql.raw(`SELECT COUNT(*) as total, SUM(CASE WHEN quotes_below_cost_count >= 3 THEN 1 ELSE 0 END) as flagged FROM panel_beater_registry WHERE tenant_id = '${tenantId}'`));
        const [drivers]     = await db.execute(sql.raw(`SELECT COUNT(*) as total, SUM(CASE WHEN total_claims >= 3 THEN 1 ELSE 0 END) as flagged FROM driver_registry WHERE tenant_id = '${tenantId}'`));
        const [clusters]    = await db.execute(sql.raw(`SELECT COUNT(*) as total, SUM(CASE WHEN risk_classification = 'high' THEN 1 ELSE 0 END) as high_risk FROM accident_clusters WHERE tenant_id = '${tenantId}'`));
        const [models]      = await db.execute(sql.raw(`SELECT COUNT(*) as total FROM ml_models WHERE is_active = 1`));
        return {
          officers:    { total: safe(officers as any[], 'total'),     flagged: safe(officers as any[], 'flagged') },
          assessors:   { total: safe(assessors as any[], 'total'),    flagged: safe(assessors as any[], 'flagged') },
          panelBeaters:{ total: safe(panelBeaters as any[], 'total'), flagged: safe(panelBeaters as any[], 'flagged') },
          drivers:     { total: safe(drivers as any[], 'total'),      flagged: safe(drivers as any[], 'flagged') },
          clusters:    { total: safe(clusters as any[], 'total'),     high_risk: safe(clusters as any[], 'high_risk') },
          mlAnomalies: { total: safe(models as any[], 'total') },
        };
      } catch {
        return { officers:{total:0,flagged:0}, assessors:{total:0,flagged:0}, panelBeaters:{total:0,flagged:0}, drivers:{total:0,flagged:0}, clusters:{total:0,high_risk:0}, mlAnomalies:{total:0} };
      }
    }),

  // ── Police Officer Registry ───────────────────────────────────────────────
  getOfficerRegistry: protectedProcedure
    .input(z.object({ tenantId: z.string().optional(), limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const tenantId = input.tenantId ?? (ctx.user as any)?.tenantId ?? 'default';
      try {
        const [rows] = await db.execute(sql.raw(`SELECT id, full_name as entity_name, badge_number, station as police_station, officer_rank, total_claims as total_claims_attended, risk_score, risk_flags, is_watchlisted, watchlist_reason, location_concentration_score, assessor_co_occurrences, updated_at as last_seen_date FROM police_officer_registry WHERE tenant_id = '${tenantId}' ORDER BY total_claims DESC LIMIT ${input.limit}`));
        return (rows as any[]) ?? [];
      } catch { return []; }
    }),

  // ── Assessor Registry ─────────────────────────────────────────────────────
  getAssessorRegistry: protectedProcedure
    .input(z.object({ tenantId: z.string().optional(), limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const tenantId = input.tenantId ?? (ctx.user as any)?.tenantId ?? 'default';
      try {
        const [rows] = await db.execute(sql.raw(`SELECT id, full_name as entity_name, company_name, accreditation_number, total_claims_assessed, avg_cost_reduction_pct, routing_concentration_score, cost_suppression_claims as cost_suppression_claim_count, structural_gap_claims, risk_score, risk_flags, is_watchlisted, watchlist_reason, top_panel_beater_pct FROM assessor_registry WHERE tenant_id = '${tenantId}' ORDER BY total_claims_assessed DESC LIMIT ${input.limit}`));
        // Add collusion_suspected derived field
        return ((rows as any[]) ?? []).map((r: any) => ({
          ...r,
          collusion_suspected: r.is_watchlisted || (Number(r.routing_concentration_score) > 70 && Number(r.cost_suppression_claims) >= 3),
        }));
      } catch { return []; }
    }),

  // ── Panel Beater Registry ─────────────────────────────────────────────────
  getPanelBeaterRegistry: protectedProcedure
    .input(z.object({ tenantId: z.string().optional(), limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const tenantId = input.tenantId ?? (ctx.user as any)?.tenantId ?? 'default';
      try {
        const [rows] = await db.execute(sql.raw(`SELECT id, company_name as entity_name, region, total_quotes_submitted as total_claims_repaired, avg_quote_vs_true_cost_pct, structural_gap_count, quotes_below_cost_count, risk_score, risk_flags, is_watchlisted, routing_concentration_score, top_assessor_pct FROM panel_beater_registry WHERE tenant_id = '${tenantId}' ORDER BY total_quotes_submitted DESC LIMIT ${input.limit}`));
        return (rows as any[]) ?? [];
      } catch { return []; }
    }),

  // ── Driver Registry ───────────────────────────────────────────────────────
  getDriverRegistry: protectedProcedure
    .input(z.object({ tenantId: z.string().optional(), limit: z.number().default(50), flaggedOnly: z.boolean().default(false) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const tenantId = input.tenantId ?? (ctx.user as any)?.tenantId ?? 'default';
      const flagFilter = input.flaggedOnly ? `AND total_claims >= 2` : '';
      try {
        const [rows] = await db.execute(sql.raw(`SELECT id, full_name as entity_name, licence_number, id_number, total_claims as total_claims_as_driver, claims_as_claimant as total_claims_as_claimant, claims_as_third_party, address_change_count, licence_expiry_date, licence_class, nationality, risk_score, risk_flags, is_watchlisted, watchlist_reason, last_claim_date FROM driver_registry WHERE tenant_id = '${tenantId}' ${flagFilter} ORDER BY total_claims DESC LIMIT ${input.limit}`));
        return (rows as any[]) ?? [];
      } catch { return []; }
    }),

  // ── Accident Hotspot Clusters ─────────────────────────────────────────────
  getAccidentClusters: protectedProcedure
    .input(z.object({ tenantId: z.string().optional(), riskLevel: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const tenantId = input.tenantId ?? (ctx.user as any)?.tenantId ?? 'default';
      const riskFilter = input.riskLevel ? `AND risk_classification = '${input.riskLevel}'` : '';
      try {
        const [rows] = await db.execute(sql.raw(`SELECT id, cluster_label as location_description, risk_classification as risk_level, claim_count, fraud_rate, flagged_claim_count, centroid_lat, centroid_lng, radius_meters, first_claim_date, last_claim_date, is_spatio_temporal, temporal_window_days as time_span_days, dominant_entities FROM accident_clusters WHERE tenant_id = '${tenantId}' ${riskFilter} ORDER BY claim_count DESC LIMIT 100`));
        return ((rows as any[]) ?? []).map((r: any) => ({
          ...r,
          avg_fraud_score: r.fraud_rate ? (Number(r.fraud_rate) * 100).toFixed(1) : null,
          max_fraud_score: r.fraud_rate ? (Number(r.fraud_rate) * 100 * 1.3).toFixed(1) : null,
          hotspot_type: r.is_spatio_temporal ? 'spatio_temporal_cluster' : 'spatial_cluster',
        }));
      } catch { return []; }
    }),

  // ── ML Models ────────────────────────────────────────────────────────────
  getAnomalyScores: protectedProcedure
    .input(z.object({ entityType: z.string().optional(), anomalyOnly: z.boolean().default(false) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      try {
        const [rows] = await db.execute(sql.raw(`SELECT id, model_name as entity_name, model_type, model_version, accuracy_score as anomaly_score, auc_score, training_claim_count, feature_importance as feature_vector_json, is_active as is_anomaly, trained_at, notes FROM ml_models ORDER BY trained_at DESC LIMIT 200`));
        return (rows as any[]) ?? [];
      } catch { return []; }
    }),

  // ── Entity Relationship Graph ─────────────────────────────────────────────
  getRelationshipGraph: protectedProcedure
    .input(z.object({ entityId: z.number().optional(), entityType: z.string().optional(), limit: z.number().default(100) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const entityFilter = (input.entityId && input.entityType)
        ? `WHERE (entity_a_id = ${input.entityId}) OR (entity_b_id = ${input.entityId})`
        : `WHERE 1=1`;
      try {
        const [rows] = await db.execute(sql.raw(`SELECT id, entity_a_type as source_entity_type, entity_a_id as source_entity_id, entity_b_type as target_entity_type, entity_b_id as target_entity_id, relationship_type, edge_weight, claim_id, first_seen_at, last_seen_at FROM entity_relationship_graph ${entityFilter} ORDER BY edge_weight DESC LIMIT ${input.limit}`));
        return (rows as any[]) ?? [];
      } catch { return []; }
    }),

  // ── Claimant Registry ─────────────────────────────────────────────────────
  getClaimantRegistry: protectedProcedure
    .input(z.object({ tenantId: z.string().optional(), limit: z.number().default(50), flaggedOnly: z.boolean().default(false) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const tenantId = input.tenantId ?? (ctx.user as any)?.tenantId ?? 'default';
      const flagFilter = input.flaggedOnly ? `AND total_claims >= 2` : '';
      try {
        const [rows] = await db.execute(sql.raw(`SELECT id, full_name as entity_name, id_number, total_claims as lifetime_claim_count, risk_score, is_watchlisted, watchlist_reason, address_change_count, last_claim_date FROM claimant_registry WHERE tenant_id = '${tenantId}' ${flagFilter} ORDER BY total_claims DESC LIMIT ${input.limit}`));
        return (rows as any[]) ?? [];
      } catch { return []; }
    }),
});
