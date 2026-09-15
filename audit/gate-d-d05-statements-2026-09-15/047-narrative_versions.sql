CREATE TABLE `narrative_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`assessment_id` int NOT NULL,
	`mismatch_index` int NOT NULL,
	`mismatch_type` varchar(64) NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`base_narrative` text NOT NULL,
	`enriched_narrative` text,
	`external_narrative` text,
	`preserves_meaning` tinyint,
	`source` varchar(64) NOT NULL,
	`created_at` bigint NOT NULL,
	`created_by` int,
	CONSTRAINT `narrative_versions_id` PRIMARY KEY(`id`)
);