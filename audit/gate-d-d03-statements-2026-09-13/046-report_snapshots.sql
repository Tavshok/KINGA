CREATE TABLE `report_snapshots` (
	`id` varchar(255) NOT NULL,
	`claim_id` int NOT NULL,
	`version` int NOT NULL,
	`report_type` enum('insurer','assessor','regulatory') NOT NULL,
	`intelligence_data` json NOT NULL,
	`audit_hash` varchar(64) NOT NULL,
	`generated_by` int NOT NULL,
	`generated_at` timestamp NOT NULL DEFAULT (now()),
	`is_immutable` tinyint NOT NULL DEFAULT 1,
	`tenant_id` varchar(255) NOT NULL,
	CONSTRAINT `report_snapshots_id` PRIMARY KEY(`id`)
);