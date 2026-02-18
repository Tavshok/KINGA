ALTER TABLE `usage_events` MODIFY COLUMN `event_type` enum('CLAIM_PROCESSED','AI_EVALUATED','FAST_TRACK_TRIGGERED','AUTO_APPROVED','ASSESSOR_TOOL_USED','FLEET_VEHICLE_ACTIVE','AGENCY_POLICY_BOUND','AI_ASSESSMENT_TRIGGERED','DOCUMENT_INGESTED','EXECUTIVE_ANALYTICS_QUERY','GOVERNANCE_CHECK','FLEET_VEHICLE_MANAGED','MARKETPLACE_QUOTE_REQUEST') NOT NULL;--> statement-breakpoint
ALTER TABLE `usage_events` ADD `user_id` int;--> statement-breakpoint
ALTER TABLE `usage_events` ADD `resource_type` varchar(100);--> statement-breakpoint
ALTER TABLE `usage_events` ADD `compute_units` decimal(10,4) DEFAULT '1.0000';--> statement-breakpoint
ALTER TABLE `usage_events` ADD `processing_time_ms` int;--> statement-breakpoint
ALTER TABLE `usage_events` ADD `estimated_cost` decimal(10,4);