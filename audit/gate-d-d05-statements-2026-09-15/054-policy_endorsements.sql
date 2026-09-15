CREATE TABLE `policy_endorsements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`policy_id` int NOT NULL,
	`endorsement_number` varchar(50) NOT NULL,
	`endorsement_type` enum('add_driver','remove_driver','change_vehicle','adjust_coverage','change_excess','other') NOT NULL,
	`endorsement_details` text NOT NULL,
	`premium_adjustment` int,
	`new_premium_amount` int,
	`effective_date` timestamp NOT NULL,
	`created_by` int NOT NULL,
	`approved_by` int,
	`approved_at` timestamp,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`tenant_id` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `policy_endorsements_id` PRIMARY KEY(`id`)
);