CREATE TABLE `historical_replay_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`historical_claim_id` int NOT NULL,
	`original_claim_reference` varchar(100),
	`replayed_at` timestamp NOT NULL DEFAULT (now()),
	`replayed_by_user_id` int,
	`replay_version` int DEFAULT 1,
	`policy_version_id` int,
	`policy_version` int,
	`policy_name` varchar(255),
	`original_decision` enum('approved','rejected','referred','total_loss','cash_settlement'),
	`original_payout` decimal(12,2),
	`original_processing_time_hours` decimal(10,2),
	`original_assessor_name` varchar(255),
	`ai_damage_detection_score` decimal(5,2),
	`ai_estimated_cost` decimal(12,2),
	`ai_fraud_score` decimal(5,2),
	`ai_confidence_score` decimal(5,2),
	`kinga_routing_decision` enum('auto_approve','hybrid_review','escalate','fraud_review'),
	`kinga_predicted_payout` decimal(12,2),
	`kinga_estimated_processing_time_hours` decimal(10,2),
	`decision_match` tinyint NOT NULL,
	`payout_variance` decimal(12,2),
	`payout_variance_percentage` decimal(5,2),
	`processing_time_delta` decimal(10,2),
	`processing_time_delta_percentage` decimal(5,2),
	`confidence_level` enum('very_high','high','medium','low','very_low'),
	`confidence_justification` text,
	`fraud_risk_level` enum('none','low','medium','high','critical'),
	`fraud_indicators` json,
	`simulated_workflow_steps` json,
	`is_replay` tinyint NOT NULL DEFAULT 1,
	`no_live_mutation` tinyint NOT NULL DEFAULT 1,
	`performance_summary` text,
	`recommended_action` enum('adopt_kinga','review_policy','manual_review','no_action'),
	`replay_duration_ms` int,
	`replay_status` enum('success','partial_success','failed') NOT NULL DEFAULT 'success',
	`replay_errors` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `historical_replay_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `historical_claims` ADD `replay_mode` tinyint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `historical_claims` ADD `last_replayed_at` timestamp;--> statement-breakpoint
ALTER TABLE `historical_claims` ADD `replay_count` int DEFAULT 0;--> statement-breakpoint
CREATE INDEX `idx_historical_replay_results_tenant_id` ON `historical_replay_results` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_historical_replay_results_historical_claim_id` ON `historical_replay_results` (`historical_claim_id`);--> statement-breakpoint
CREATE INDEX `idx_historical_replay_results_replayed_at` ON `historical_replay_results` (`replayed_at`);--> statement-breakpoint
CREATE INDEX `idx_historical_replay_results_policy_version_id` ON `historical_replay_results` (`policy_version_id`);