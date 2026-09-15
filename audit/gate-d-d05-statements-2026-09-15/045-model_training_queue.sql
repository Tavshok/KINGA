CREATE TABLE `model_training_queue` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int,
	`dataset_record_id` int NOT NULL,
	`training_priority` varchar(50) DEFAULT 'normal',
	`processed` tinyint DEFAULT 0,
	`processed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `model_training_queue_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_mtq_claim_id_unique` UNIQUE(`claim_id`)
);