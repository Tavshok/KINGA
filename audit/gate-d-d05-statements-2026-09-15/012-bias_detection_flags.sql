CREATE TABLE `bias_detection_flags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`batch_id` varchar(64) NOT NULL,
	`bias_type` varchar(64) NOT NULL,
	`bias_score` decimal(5,4),
	`affected_field` varchar(128),
	`sample_size` int,
	`detected_at` timestamp NOT NULL DEFAULT (now()),
	`mitigation_applied` tinyint NOT NULL DEFAULT 0,
	`mitigation_notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `bias_detection_flags_id` PRIMARY KEY(`id`)
);