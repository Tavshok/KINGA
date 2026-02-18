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
--> statement-breakpoint
CREATE INDEX `idx_tenant_id` ON `governance_notifications` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_claim_id` ON `governance_notifications` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_recipients` ON `governance_notifications` (`recipients`);--> statement-breakpoint
CREATE INDEX `idx_read_at` ON `governance_notifications` (`read_at`);--> statement-breakpoint
CREATE INDEX `idx_created_at` ON `governance_notifications` (`created_at`);