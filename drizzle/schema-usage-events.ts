/**
 * Usage Events Table - Silent Metering System
 * 
 * Tracks all billable activities across the KINGA platform for monetisation.
 * This table silently records usage without user interaction for:
 * - Claims processed
 * - AI assessments triggered
 * - Documents ingested
 * - Executive analytics queries
 * - Governance checks
 * - Fleet vehicles managed
 * - Marketplace quote requests
 */

import { mysqlTable, int, varchar, timestamp, mysqlEnum, decimal } from "drizzle-orm/mysql-core";

export const usageEvents = mysqlTable("usage_events", {
  id: int("id").autoincrement().primaryKey(),
  
  // Tenant isolation
  tenantId: varchar("tenant_id", { length: 64 }).notNull(),
  
  // Event classification
  eventType: mysqlEnum("event_type", [
    "claim_processed",
    "ai_assessment_triggered",
    "document_ingested",
    "executive_analytics_query",
    "governance_check",
    "fleet_vehicle_managed",
    "marketplace_quote_request",
    "user_login",
    "report_generated",
    "api_call",
  ]).notNull(),
  
  // Event metadata
  eventCategory: mysqlEnum("event_category", [
    "claims",
    "ai_processing",
    "document_management",
    "analytics",
    "governance",
    "fleet",
    "marketplace",
    "authentication",
    "reporting",
    "api",
  ]).notNull(),
  
  // Resource identifiers
  resourceId: varchar("resource_id", { length: 255 }), // ID of the claim, document, vehicle, etc.
  resourceType: varchar("resource_type", { length: 100 }), // "claim", "document", "vehicle", etc.
  userId: int("user_id"), // User who triggered the event (if applicable)
  
  // Compute metrics
  computeUnits: decimal("compute_units", { precision: 10, scale: 4 }).default("1.0000"), // Normalized compute cost
  processingTimeMs: int("processing_time_ms"), // Processing duration in milliseconds
  
  // Cost attribution
  estimatedCost: decimal("estimated_cost", { precision: 10, scale: 4 }), // Estimated cost in cents
  
  // Event details (JSON)
  metadata: varchar("metadata", { length: 2000 }), // JSON string with event-specific data
  
  // Timestamps
  eventTimestamp: timestamp("event_timestamp").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type UsageEvent = typeof usageEvents.$inferSelect;
export type InsertUsageEvent = typeof usageEvents.$inferInsert;

/**
 * Tenant Usage Summary - Aggregated usage metrics per tenant
 * 
 * Pre-aggregated table for fast dashboard queries.
 * Updated periodically (hourly/daily) via background job.
 */
export const tenantUsageSummary = mysqlTable("tenant_usage_summary", {
  id: int("id").autoincrement().primaryKey(),
  
  tenantId: varchar("tenant_id", { length: 64 }).notNull(),
  
  // Time period
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  periodType: mysqlEnum("period_type", ["hourly", "daily", "weekly", "monthly"]).notNull(),
  
  // Usage counts
  claimsProcessed: int("claims_processed").default(0),
  aiAssessmentsTriggered: int("ai_assessments_triggered").default(0),
  documentsIngested: int("documents_ingested").default(0),
  analyticsQueriesExecuted: int("analytics_queries_executed").default(0),
  governanceChecksPerformed: int("governance_checks_performed").default(0),
  fleetVehiclesManaged: int("fleet_vehicles_managed").default(0),
  marketplaceQuotesRequested: int("marketplace_quotes_requested").default(0),
  
  // Compute metrics
  totalComputeUnits: decimal("total_compute_units", { precision: 12, scale: 4 }).default("0.0000"),
  totalProcessingTimeMs: int("total_processing_time_ms").default(0),
  
  // Cost metrics
  estimatedTotalCost: decimal("estimated_total_cost", { precision: 12, scale: 4 }).default("0.0000"), // in cents
  
  // User activity
  activeUsers: int("active_users").default(0),
  totalLogins: int("total_logins").default(0),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type TenantUsageSummary = typeof tenantUsageSummary.$inferSelect;
export type InsertTenantUsageSummary = typeof tenantUsageSummary.$inferInsert;

/**
 * Tenant Tier Classification - Historical tier assignments
 * 
 * Tracks how tenants are classified over time for billing purposes.
 */
export const tenantTierHistory = mysqlTable("tenant_tier_history", {
  id: int("id").autoincrement().primaryKey(),
  
  tenantId: varchar("tenant_id", { length: 64 }).notNull(),
  
  // Tier classification
  tierName: varchar("tier_name", { length: 50 }).notNull(), // "starter", "growth", "enterprise", "custom"
  pricingBand: varchar("pricing_band", { length: 50 }), // "0-100", "101-500", "501-2000", "2000+"
  
  // Usage thresholds that determined this tier
  monthlyClaimVolume: int("monthly_claim_volume").default(0),
  userCount: int("user_count").default(0),
  fleetSize: int("fleet_size").default(0),
  aiUsageScore: decimal("ai_usage_score", { precision: 8, scale: 2 }).default("0.00"),
  
  // Financial estimates
  estimatedMonthlyRevenue: decimal("estimated_monthly_revenue", { precision: 12, scale: 2 }), // in cents
  profitabilityScore: decimal("profitability_score", { precision: 5, scale: 2 }), // 0-100 scale
  
  // Period
  effectiveFrom: timestamp("effective_from").notNull(),
  effectiveTo: timestamp("effective_to"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type TenantTierHistory = typeof tenantTierHistory.$inferSelect;
export type InsertTenantTierHistory = typeof tenantTierHistory.$inferInsert;
