ALTER TABLE `claim_routing_decisions` ADD `policy_version` int NOT NULL;--> statement-breakpoint
ALTER TABLE `claim_routing_decisions` ADD `policy_snapshot_json` json NOT NULL;--> statement-breakpoint
ALTER TABLE `claim_routing_decisions` ADD `claim_version` int DEFAULT 1 NOT NULL;