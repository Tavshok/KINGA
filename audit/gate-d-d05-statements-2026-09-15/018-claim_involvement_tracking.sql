CREATE TABLE `claim_involvement_tracking` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`user_id` int NOT NULL,
	`workflow_stage` enum('assessment','technical_approval','financial_decision','payment_authorization') NOT NULL,
	`action_type` enum('transition_state','approve_technical','authorize_payment','close_claim','redirect_claim','add_assessment','complete_assessment','start_assessment','submit_quote','request_info','escalate') NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `claim_involvement_tracking_id` PRIMARY KEY(`id`)
);