CREATE TABLE `global_search_analytics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(255),
	`query` varchar(500) NOT NULL,
	`result_count` int NOT NULL DEFAULT 0,
	`clicked_type` varchar(50),
	`clicked_id` varchar(100),
	`user_role` varchar(50),
	`searched_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `global_search_analytics_id` PRIMARY KEY(`id`)
);