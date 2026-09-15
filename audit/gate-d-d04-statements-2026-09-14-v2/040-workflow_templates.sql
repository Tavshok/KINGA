CREATE TABLE `workflow_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`stages_json` text NOT NULL DEFAULT (JSON_ARRAY()),
	`applies_to_json` text DEFAULT (JSON_OBJECT()),
	`is_default` tinyint NOT NULL DEFAULT 0,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workflow_templates_id` PRIMARY KEY(`id`)
);