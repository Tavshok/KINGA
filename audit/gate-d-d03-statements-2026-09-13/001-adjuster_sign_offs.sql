CREATE TABLE `adjuster_sign_offs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`adjuster_user_id` int,
	`adjuster_name` varchar(255) NOT NULL,
	`decision` enum('APPROVE','REJECT','ESCALATE','DEFER') NOT NULL,
	`notes` text,
	`ai_decision` varchar(50),
	`signed_at` bigint NOT NULL,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `adjuster_sign_offs_id` PRIMARY KEY(`id`)
);