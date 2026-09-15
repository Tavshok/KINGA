CREATE TABLE `replay_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` varchar(50) NOT NULL,
	`tenant_id` varchar(50) NOT NULL,
	`original_snapshot_id` int,
	`original_snapshot_version` int NOT NULL,
	`original_verdict` varchar(50) NOT NULL,
	`new_verdict` varchar(50) NOT NULL,
	`changed` tinyint NOT NULL DEFAULT 0,
	`differences_json` text NOT NULL,
	`impact_analysis` text NOT NULL,
	`replay_result_json` text NOT NULL,
	`replayed_at` bigint NOT NULL,
	`replayed_by_user_id` varchar(50),
	`lifecycle_state_at_replay` varchar(20) NOT NULL,
	CONSTRAINT `replay_logs_id` PRIMARY KEY(`id`)
);