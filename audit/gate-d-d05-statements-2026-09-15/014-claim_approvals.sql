CREATE TABLE `claim_approvals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`workflow_template_id` int,
	`stage_order` int NOT NULL,
	`stage_name` varchar(255) NOT NULL,
	`role_key` varchar(100) NOT NULL,
	`actor_user_id` int,
	`actor_name` varchar(255),
	`decision` enum('approved','rejected','returned','escalated','external_received') NOT NULL,
	`notes` text,
	`metadata_json` text,
	`acted_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `claim_approvals_id` PRIMARY KEY(`id`)
);