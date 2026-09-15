CREATE TABLE `predictive_risk_scores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entity_type` enum('vehicle','driver','fleet','portfolio') NOT NULL,
	`entity_id` varchar(100) NOT NULL,
	`tenant_id` varchar(255),
	`score_type` varchar(100) NOT NULL,
	`score_value` decimal(8,4) NOT NULL,
	`score_label` enum('very_low','low','medium','high','very_high','critical') NOT NULL,
	`confidence_level` decimal(5,2) NOT NULL,
	`model_version` varchar(50) NOT NULL DEFAULT 'v1.0',
	`factors_json` json,
	`valid_from` timestamp NOT NULL DEFAULT (now()),
	`valid_until` timestamp,
	`computed_at` timestamp NOT NULL DEFAULT (now()),
	`computed_by` varchar(100) NOT NULL DEFAULT 'system',
	CONSTRAINT `predictive_risk_scores_id` PRIMARY KEY(`id`)
);