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