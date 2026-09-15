CREATE TABLE `weight_adjustment_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`mismatch_type` varchar(64) NOT NULL,
	`old_multiplier` decimal(7,4) NOT NULL,
	`raw_multiplier` decimal(7,4) NOT NULL,
	`new_multiplier` decimal(7,4) NOT NULL,
	`total_annotations` int NOT NULL,
	`confirmation_rate` decimal(6,4) NOT NULL,
	`sensitivity_direction` enum('increase','decrease') NOT NULL,
	`reason` text NOT NULL,
	`created_at` bigint NOT NULL,
	CONSTRAINT `weight_adjustment_log_id` PRIMARY KEY(`id`)
);