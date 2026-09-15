CREATE TABLE `risk_register` (
	`id` varchar(64) NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`claim_id` int,
	`risk_type` enum('fraud','cost_overrun','compliance','operational') NOT NULL,
	`likelihood` int NOT NULL,
	`impact` int NOT NULL,
	`risk_score` int NOT NULL,
	`description` text NOT NULL,
	`treatment_plan` enum('accept','mitigate','transfer','avoid'),
	`treatment_notes` text,
	`identified_by` int NOT NULL,
	`identified_at` timestamp NOT NULL DEFAULT (now()),
	`reviewed_by` int,
	`reviewed_at` timestamp,
	`status` enum('open','mitigated','closed') NOT NULL DEFAULT 'open',
	CONSTRAINT `risk_register_id` PRIMARY KEY(`id`)
);