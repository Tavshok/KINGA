CREATE TABLE `global_search_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`tenant_id` varchar(255),
	`query` varchar(500) NOT NULL,
	`result_count` int NOT NULL DEFAULT 0,
	`searched_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `global_search_history_id` PRIMARY KEY(`id`)
);