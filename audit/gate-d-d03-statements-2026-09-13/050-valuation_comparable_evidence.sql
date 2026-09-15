CREATE TABLE `valuation_comparable_evidence` (
	`id` int AUTO_INCREMENT NOT NULL,
	`valuation_request_id` int NOT NULL,
	`source_type` enum('market_valuation_record','historical_claim') NOT NULL,
	`source_reference` varchar(255) NOT NULL,
	`observed_value_cents` int NOT NULL,
	`observed_at` timestamp,
	`vehicle_year` int,
	`vehicle_match_json` longtext NOT NULL,
	`adjustment_json` longtext,
	`limitation` text,
	`inclusion_status` enum('included','excluded','review_required') NOT NULL DEFAULT 'included',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `valuation_comparable_evidence_id` PRIMARY KEY(`id`)
);