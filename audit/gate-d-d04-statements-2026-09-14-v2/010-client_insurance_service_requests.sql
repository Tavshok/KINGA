CREATE TABLE `client_insurance_service_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`request_number` varchar(50) NOT NULL,
	`user_id` int,
	`full_name` varchar(255) NOT NULL,
	`email` varchar(320) NOT NULL,
	`phone` varchar(50),
	`product_category` varchar(50) NOT NULL,
	`cover_type` varchar(100) NOT NULL,
	`vehicle_registration` varchar(50),
	`client_proposed_value_cents` int,
	`request_payload_json` longtext NOT NULL,
	`status` enum('submitted','under_review','closed_without_quote') NOT NULL DEFAULT 'submitted',
	`submission_token` varchar(64) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `client_insurance_service_requests_id` PRIMARY KEY(`id`)
);