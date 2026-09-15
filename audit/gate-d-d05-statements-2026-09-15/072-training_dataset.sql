CREATE TABLE `training_dataset` (
	`id` int AUTO_INCREMENT NOT NULL,
	`historical_claim_id` int NOT NULL,
	`tenant_id` varchar(64),
	`dataset_version` varchar(50) NOT NULL,
	`included_at` timestamp NOT NULL DEFAULT (now()),
	`included_by` int NOT NULL,
	`inclusion_reason` text,
	`used_in_model_versions` text,
	`last_used_for_training` timestamp,
	`is_active` tinyint DEFAULT 1,
	`deactivated_at` timestamp,
	`deactivation_reason` text,
	`training_weight` decimal(3,2) DEFAULT '1.00',
	`negotiated_adjustment` tinyint DEFAULT 0,
	`deviation_reason` enum('none','negotiation','fraud','regional_variance','data_quality','assessor_bias','manual_override') DEFAULT 'none',
	CONSTRAINT `training_dataset_id` PRIMARY KEY(`id`)
);