CREATE TABLE `pipeline_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`run_id` varchar(64) NOT NULL,
	`claim_id` int NOT NULL,
	`tenant_id` varchar(255),
	`triggered_by` varchar(255),
	`trigger_reason` varchar(255),
	`status` enum('running','completed','failed','partial') NOT NULL DEFAULT 'running',
	`is_rerun` tinyint NOT NULL DEFAULT 0,
	`stages_completed` int NOT NULL DEFAULT 0,
	`stages_failed` int NOT NULL DEFAULT 0,
	`stages_degraded` int NOT NULL DEFAULT 0,
	`total_duration_ms` int,
	`total_llm_tokens` int,
	`started_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`completed_at` timestamp,
	CONSTRAINT `pipeline_runs_id` PRIMARY KEY(`id`)
);