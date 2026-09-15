DROP INDEX `unique_assessor_tenant` ON `assessor_insurer_relationships`;

CREATE UNIQUE INDEX `uq_assessor_insurer_relationship` ON `assessor_insurer_relationships` (`assessor_id`,`tenant_id`);

CREATE UNIQUE INDEX `uq_policy_claim_link` ON `policy_claim_links` (`policy_id`,`claim_id`);

CREATE UNIQUE INDEX `uq_fleet_driver_membership` ON `fleet_drivers` (`fleet_id`,`user_id`);
