CREATE TABLE `policy_claim_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`policy_id` int NOT NULL,
	`claim_id` int NOT NULL,
	`coverage_verified` tinyint DEFAULT 0,
	`verified_by` int,
	`verified_at` timestamp,
	`coverage_approved` tinyint,
	`coverage_decision_reason` text,
	`tenant_id` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `policy_claim_links_id` PRIMARY KEY(`id`)
);