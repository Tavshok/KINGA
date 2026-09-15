CREATE TABLE `pre_accident_damage` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`damage_type` enum('rust','dent','scratch','paint_damage','mechanical','glass','interior','other') NOT NULL,
	`location` varchar(200) NOT NULL,
	`severity` enum('minor','moderate','severe') NOT NULL,
	`description` text,
	`photo_url` varchar(500),
	`documented_date` timestamp,
	`estimated_age` varchar(100),
	`is_related_to_current_claim` tinyint DEFAULT 0,
	`assessor_notes` text,
	`documented_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pre_accident_damage_id` PRIMARY KEY(`id`)
);