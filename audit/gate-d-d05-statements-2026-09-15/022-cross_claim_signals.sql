CREATE TABLE `cross_claim_signals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`signal_type` enum('repeat_damage_signal','driver_repeat_claim_signal','repairer_repeat_pattern_signal','vehicle_high_claim_frequency','damage_zone_repeat_signal','staged_accident_signal','repairer_driver_collusion_signal','claim_velocity_signal','total_loss_repeat_signal') NOT NULL,
	`signal_label` text NOT NULL,
	`evidence_json` text,
	`confidence` enum('low','medium','high') NOT NULL DEFAULT 'medium',
	`score_contribution` int NOT NULL DEFAULT 0,
	`is_dismissed` tinyint NOT NULL DEFAULT 0,
	`dismissed_by` int,
	`dismissed_at` timestamp,
	`dismissal_note` text,
	`tenant_id` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cross_claim_signals_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_ccs_claim_signal_unique` UNIQUE(`claim_id`,`signal_type`)
);