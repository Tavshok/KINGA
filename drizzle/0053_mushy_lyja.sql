CREATE TABLE `super_audit_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`super_admin_user_id` int NOT NULL,
	`super_admin_name` varchar(255),
	`audited_tenant_id` varchar(64),
	`impersonated_role` varchar(64),
	`session_started_at` timestamp NOT NULL DEFAULT (now()),
	`session_ended_at` timestamp,
	`session_duration_seconds` int,
	`accessed_claim_ids` text,
	`accessed_dashboards` text,
	`replayed_claim_ids` text,
	`viewed_ai_scoring_claim_ids` text,
	`viewed_routing_logic_claim_ids` text,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `super_audit_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `claims` ADD `estimated_claim_value` decimal(12,2);--> statement-breakpoint
ALTER TABLE `claims` ADD `final_approved_amount` decimal(12,2);--> statement-breakpoint
ALTER TABLE `claims` ADD `confidence_score` int;--> statement-breakpoint
ALTER TABLE `claims` ADD `routing_decision` varchar(50);--> statement-breakpoint
ALTER TABLE `claims` ADD `policy_version_id` int;--> statement-breakpoint
CREATE INDEX `idx_super_audit_sessions_super_admin_user_id` ON `super_audit_sessions` (`super_admin_user_id`);--> statement-breakpoint
CREATE INDEX `idx_super_audit_sessions_audited_tenant_id` ON `super_audit_sessions` (`audited_tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_super_audit_sessions_session_started_at` ON `super_audit_sessions` (`session_started_at`);--> statement-breakpoint
CREATE INDEX `idx_fraud_risk_score` ON `claims` (`fraud_risk_score`);--> statement-breakpoint
CREATE INDEX `idx_confidence_score` ON `claims` (`confidence_score`);--> statement-breakpoint
CREATE INDEX `idx_routing_decision` ON `claims` (`routing_decision`);--> statement-breakpoint
CREATE INDEX `idx_policy_version_id` ON `claims` (`policy_version_id`);