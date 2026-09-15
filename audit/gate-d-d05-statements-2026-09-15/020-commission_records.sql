CREATE TABLE `commission_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`policy_id` int NOT NULL,
	`carrier_id` int NOT NULL,
	`product_id` int NOT NULL,
	`premium_amount` int NOT NULL,
	`commission_rate` decimal(5,2) NOT NULL,
	`commission_amount` int NOT NULL,
	`commission_type` enum('new_business','renewal') NOT NULL,
	`payment_status` enum('pending','paid','disputed') NOT NULL DEFAULT 'pending',
	`payment_date` timestamp,
	`payment_reference` varchar(100),
	`commission_period` varchar(20),
	`tenant_id` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `commission_records_id` PRIMARY KEY(`id`)
);