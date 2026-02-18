import { mysqlTable, int, varchar, timestamp, text, tinyint } from "drizzle-orm/mysql-core";

/**
 * Super Audit Sessions
 * 
 * Tracks all super-admin audit sessions for compliance and security.
 * Records tenant selection, role impersonation, and accessed resources.
 */
export const superAuditSessions = mysqlTable("super_audit_sessions", {
  id: int("id").autoincrement().primaryKey(),
  
  // Super admin user
  superAdminUserId: int("super_admin_user_id").notNull(),
  superAdminName: varchar("super_admin_name", { length: 255 }),
  
  // Audit context
  auditedTenantId: varchar("audited_tenant_id", { length: 64 }), // Tenant being audited
  impersonatedRole: varchar("impersonated_role", { length: 64 }), // Role being impersonated
  
  // Session tracking
  sessionStartedAt: timestamp("session_started_at").defaultNow().notNull(),
  sessionEndedAt: timestamp("session_ended_at"),
  sessionDurationSeconds: int("session_duration_seconds"),
  
  // Accessed resources
  accessedClaimIds: text("accessed_claim_ids"), // JSON array of claim IDs viewed
  accessedDashboards: text("accessed_dashboards"), // JSON array of dashboards viewed
  replayedClaimIds: text("replayed_claim_ids"), // JSON array of claim IDs replayed
  viewedAiScoringClaimIds: text("viewed_ai_scoring_claim_ids"), // JSON array of AI scoring viewed
  viewedRoutingLogicClaimIds: text("viewed_routing_logic_claim_ids"), // JSON array of routing logic viewed
  
  // Audit trail
  isActive: tinyint("is_active").default(1).notNull(), // 1 = active session, 0 = ended
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type SuperAuditSession = typeof superAuditSessions.$inferSelect;
export type InsertSuperAuditSession = typeof superAuditSessions.$inferInsert;
