ALTER TABLE `tenants` ADD COLUMN `workos_organization_id` varchar(128) NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `tenants_workos_organization_id_unique` ON `tenants` (`workos_organization_id`);
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `workos_user_id` varchar(128) NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `users_workos_user_id_unique` ON `users` (`workos_user_id`);
