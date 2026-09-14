CREATE TABLE `currency_exchange_rates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`currency_code` varchar(3) NOT NULL,
	`currency_name` varchar(100),
	`currency_symbol` varchar(10),
	`rate_to_usd` decimal(18,6) NOT NULL,
	`source` varchar(100) DEFAULT 'manual',
	`last_updated` timestamp NOT NULL DEFAULT (now()),
	`is_active` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `currency_exchange_rates_id` PRIMARY KEY(`id`)
);