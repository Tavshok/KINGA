CREATE TABLE `claim_comment_reads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`comment_id` int NOT NULL,
	`user_id` int NOT NULL,
	`read_at` varchar(50) NOT NULL,
	CONSTRAINT `claim_comment_reads_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_ccr_comment_user` UNIQUE(`comment_id`,`user_id`)
);