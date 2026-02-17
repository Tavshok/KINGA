CREATE TABLE `usage_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`claim_id` int,
	`event_type` enum('CLAIM_PROCESSED','AI_EVALUATED','FAST_TRACK_TRIGGERED','AUTO_APPROVED','ASSESSOR_TOOL_USED','FLEET_VEHICLE_ACTIVE','AGENCY_POLICY_BOUND') NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	`reference_id` varchar(255),
	`metadata` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `usage_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `tenant_idx` ON `usage_events` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `claim_idx` ON `usage_events` (`claim_id`);--> statement-breakpoint
CREATE INDEX `event_type_idx` ON `usage_events` (`event_type`);--> statement-breakpoint
CREATE INDEX `timestamp_idx` ON `usage_events` (`timestamp`);--> statement-breakpoint
CREATE INDEX `reference_idx` ON `usage_events` (`reference_id`);