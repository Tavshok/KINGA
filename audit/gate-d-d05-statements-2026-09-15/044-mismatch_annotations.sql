CREATE TABLE `mismatch_annotations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`assessment_id` int NOT NULL,
	`mismatch_type` varchar(64) NOT NULL,
	`mismatch_index` int NOT NULL DEFAULT 0,
	`action` enum('confirm','dismiss') NOT NULL,
	`note` text,
	`user_id` int NOT NULL,
	`user_role` varchar(64),
	`created_at` bigint NOT NULL,
	CONSTRAINT `mismatch_annotations_id` PRIMARY KEY(`id`)
);