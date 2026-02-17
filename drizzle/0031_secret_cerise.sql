CREATE TABLE `workflow_states` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`current_state` varchar(100) NOT NULL,
	`previous_state` varchar(100),
	`transitioned_by` int NOT NULL,
	`transitioned_at` timestamp NOT NULL DEFAULT (now()),
	`metadata` json,
	CONSTRAINT `workflow_states_id` PRIMARY KEY(`id`)
);
