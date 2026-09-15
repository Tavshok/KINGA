CREATE TABLE `usage_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`claim_id` int,
	`event_type` enum('CLAIM_PROCESSED','AI_EVALUATED','FAST_TRACK_TRIGGERED','AUTO_APPROVED','ASSESSOR_TOOL_USED','FLEET_VEHICLE_ACTIVE','AGENCY_POLICY_BOUND','AI_ASSESSMENT_TRIGGERED','DOCUMENT_INGESTED','EXECUTIVE_ANALYTICS_QUERY','GOVERNANCE_CHECK','FLEET_VEHICLE_MANAGED','MARKETPLACE_QUOTE_REQUEST') NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	`reference_id` varchar(255),
	`metadata` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`user_id` int,
	`resource_type` varchar(100),
	`compute_units` decimal(10,4) DEFAULT '1.0000',
	`processing_time_ms` int,
	`estimated_cost` decimal(10,4),
	CONSTRAINT `usage_events_id` PRIMARY KEY(`id`)
);