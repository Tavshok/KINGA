CREATE TABLE `federated_learning_metadata` (
	`id` int AUTO_INCREMENT NOT NULL,
	`round_number` int NOT NULL,
	`model_type` varchar(100) NOT NULL,
	`participant_count` int NOT NULL,
	`participant_tenant_ids` json,
	`global_model_version` varchar(50) NOT NULL,
	`local_model_contributions` json,
	`aggregation_method` varchar(50) DEFAULT 'federated_averaging',
	`global_model_accuracy` decimal(5,4),
	`convergence_status` enum('converging','converged','diverged') DEFAULT 'converging',
	`training_started_at` timestamp NOT NULL,
	`training_completed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `federated_learning_metadata_id` PRIMARY KEY(`id`)
);