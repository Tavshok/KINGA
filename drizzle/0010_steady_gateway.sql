CREATE TABLE `assessor_deviation_metrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`assessor_id` int,
	`assessor_name` varchar(255),
	`period_start` date NOT NULL,
	`period_end` date NOT NULL,
	`total_claims` int NOT NULL,
	`average_deviation` decimal(5,2),
	`median_deviation` decimal(5,2),
	`standard_deviation` decimal(5,2),
	`overvaluation_rate` decimal(5,2),
	`undervaluation_rate` decimal(5,2),
	`consistency_score` int,
	`region` varchar(100),
	`vehicle_type` varchar(50),
	`panel_beater_id` int,
	`data_quality_score` int,
	`sample_size` int,
	`calculated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `assessor_deviation_metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `multi_reference_truth` (
	`id` int AUTO_INCREMENT NOT NULL,
	`historical_claim_id` int NOT NULL,
	`synthesized_value` decimal(10,2) NOT NULL,
	`confidence_interval` decimal(5,2),
	`photo_damage_severity_score` int,
	`panel_beater_quote_cluster_score` int,
	`regional_benchmark_score` int,
	`similar_claims_score` int,
	`fraud_probability_score` int,
	`settlement_amount_score` int,
	`photo_damage_estimate` decimal(10,2),
	`panel_beater_median` decimal(10,2),
	`regional_benchmark` decimal(10,2),
	`similar_claims_average` decimal(10,2),
	`final_settlement` decimal(10,2),
	`assessor_value` decimal(10,2),
	`assessor_deviation` decimal(5,2),
	`deviation_absolute` decimal(10,2),
	`synthesis_method` varchar(50),
	`components_used` int,
	`synthesis_quality` enum('high','medium','low'),
	`synthesized_at` timestamp NOT NULL DEFAULT (now()),
	`synthesized_by` varchar(50),
	`synthesis_explanation` text,
	CONSTRAINT `multi_reference_truth_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `regional_benchmarks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`region` varchar(100) NOT NULL,
	`city` varchar(100),
	`vehicle_type` varchar(50),
	`vehicle_make` varchar(100),
	`vehicle_model` varchar(100),
	`year_range` varchar(20),
	`labor_rate_per_hour` decimal(10,2),
	`paint_cost_per_panel` decimal(10,2),
	`common_parts_costs` text,
	`sample_size` int,
	`confidence_level` decimal(5,2),
	`effective_from` date NOT NULL,
	`effective_to` date,
	`last_updated` timestamp NOT NULL DEFAULT (now()),
	`data_source` varchar(255),
	CONSTRAINT `regional_benchmarks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `similar_claims_clusters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`historical_claim_id` int NOT NULL,
	`vehicle_make` varchar(100),
	`vehicle_model` varchar(100),
	`vehicle_year` int,
	`damage_type` varchar(100),
	`damage_severity` enum('minor','moderate','severe','total_loss'),
	`region` varchar(100),
	`cluster_id` int,
	`cluster_size` int,
	`similar_claims` text,
	`cluster_median_cost` decimal(10,2),
	`cluster_average_cost` decimal(10,2),
	`cluster_std_dev` decimal(10,2),
	`similarity_threshold` decimal(5,2),
	`k_neighbors` int,
	`clustered_at` timestamp NOT NULL DEFAULT (now()),
	`clustering_algorithm` varchar(50),
	CONSTRAINT `similar_claims_clusters_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `training_dataset` ADD `training_weight` decimal(3,2) DEFAULT '1.00';--> statement-breakpoint
ALTER TABLE `training_dataset` ADD `negotiated_adjustment` tinyint DEFAULT 0;--> statement-breakpoint
ALTER TABLE `training_dataset` ADD `deviation_reason` enum('none','negotiation','fraud','regional_variance','data_quality','assessor_bias','manual_override') DEFAULT 'none';