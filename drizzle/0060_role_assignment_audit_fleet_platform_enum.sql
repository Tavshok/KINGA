-- Migration: Expand roleAssignmentAudit previousRole / newRole enums
-- Adds fleet_admin, fleet_manager, fleet_driver, platform_super_admin
-- so that fleet role upgrades and platform super-admin assignments
-- can be written to the audit table without a DB enum violation.

ALTER TABLE `role_assignment_audit`
  MODIFY COLUMN `previous_role`
    ENUM('user','admin','insurer','assessor','panel_beater','claimant',
         'fleet_admin','fleet_manager','fleet_driver','platform_super_admin')
    NULL;

ALTER TABLE `role_assignment_audit`
  MODIFY COLUMN `new_role`
    ENUM('user','admin','insurer','assessor','panel_beater','claimant',
         'fleet_admin','fleet_manager','fleet_driver','platform_super_admin')
    NOT NULL;
