CREATE TABLE `fleet_risk_scores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehicle_id` int NOT NULL,
	`fleet_id` int,
	`tenant_id` varchar(64),
	`overall_risk_score` int NOT NULL,
	`maintenance_risk` int,
	`claims_risk` int,
	`vehicle_age_risk` int,
	`usage_risk` int,
	`repair_cost_risk` int,
	`risk_factors` text,
	`premium_impact` enum('decrease','neutral','increase'),
	`recommended_premium_adjustment` decimal(5,2),
	`calculated_at` timestamp NOT NULL DEFAULT (now()),
	`next_review_date` timestamp,
	CONSTRAINT `fleet_risk_scores_id` PRIMARY KEY(`id`)
);