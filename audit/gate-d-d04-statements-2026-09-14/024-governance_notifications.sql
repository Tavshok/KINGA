CREATE TABLE `governance_notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`type` enum('intake_escalation','auto_assignment','ai_rerun','executive_override','segregation_violation') NOT NULL,
	`claim_id` int,
	`recipients` text NOT NULL,
	`title` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`metadata` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`read_at` timestamp,
	CONSTRAINT `governance_notifications_id` PRIMARY KEY(`id`)
);