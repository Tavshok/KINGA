import { relations } from "drizzle-orm/relations";
import { claimConfidenceScores, automationAuditLog, claimRoutingDecisions, automationPolicies, claims, claimComments, users } from "./schema";

export const automationAuditLogRelations = relations(automationAuditLog, ({one}) => ({
	claimConfidenceScore: one(claimConfidenceScores, {
		fields: [automationAuditLog.confidenceScoreId],
		references: [claimConfidenceScores.id]
	}),
	claimRoutingDecision: one(claimRoutingDecisions, {
		fields: [automationAuditLog.routingDecisionId],
		references: [claimRoutingDecisions.id]
	}),
	automationPolicy: one(automationPolicies, {
		fields: [automationAuditLog.automationPolicyId],
		references: [automationPolicies.id]
	}),
}));

export const claimConfidenceScoresRelations = relations(claimConfidenceScores, ({many}) => ({
	automationAuditLogs: many(automationAuditLog),
	claimRoutingDecisions: many(claimRoutingDecisions),
}));

export const claimRoutingDecisionsRelations = relations(claimRoutingDecisions, ({one, many}) => ({
	automationAuditLogs: many(automationAuditLog),
	claimConfidenceScore: one(claimConfidenceScores, {
		fields: [claimRoutingDecisions.confidenceScoreId],
		references: [claimConfidenceScores.id]
	}),
	automationPolicy: one(automationPolicies, {
		fields: [claimRoutingDecisions.automationPolicyId],
		references: [automationPolicies.id]
	}),
}));

export const automationPoliciesRelations = relations(automationPolicies, ({many}) => ({
	automationAuditLogs: many(automationAuditLog),
	claimRoutingDecisions: many(claimRoutingDecisions),
}));

export const claimCommentsRelations = relations(claimComments, ({one}) => ({
	claim: one(claims, {
		fields: [claimComments.claimId],
		references: [claims.id]
	}),
	user: one(users, {
		fields: [claimComments.userId],
		references: [users.id]
	}),
}));

export const claimsRelations = relations(claims, ({many}) => ({
	claimComments: many(claimComments),
}));

export const usersRelations = relations(users, ({many}) => ({
	claimComments: many(claimComments),
}));