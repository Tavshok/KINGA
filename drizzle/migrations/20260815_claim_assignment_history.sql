CREATE TABLE IF NOT EXISTS claim_assignments (
  id INT NOT NULL AUTO_INCREMENT,
  claim_id INT NOT NULL,
  tenant_id VARCHAR(255) NOT NULL,
  assignment_role ENUM('assessor', 'claims_assessor', 'claims_manager') NOT NULL,
  assigned_to_user_id INT NOT NULL,
  assigned_by_user_id INT NULL,
  assignment_source ENUM('manual', 'workflow', 'reassignment', 'system', 'legacy_import') NOT NULL DEFAULT 'manual',
  status ENUM('assigned', 'accepted', 'declined', 'reassigned', 'completed', 'cancelled') NOT NULL DEFAULT 'assigned',
  parent_assignment_id INT NULL,
  in_app_notification_created TINYINT NOT NULL DEFAULT 0,
  email_notification_requested TINYINT NOT NULL DEFAULT 0,
  email_notification_sent_at TIMESTAMP NULL,
  email_notification_reference VARCHAR(255) NULL,
  decision_reason TEXT NULL,
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  accepted_at TIMESTAMP NULL,
  declined_at TIMESTAMP NULL,
  reassigned_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_claim_assignments_claim_active (claim_id, status),
  KEY idx_claim_assignments_assignee_active (assigned_to_user_id, status),
  KEY idx_claim_assignments_tenant_role (tenant_id, assignment_role, status),
  KEY idx_claim_assignments_parent (parent_assignment_id),
  CONSTRAINT fk_claim_assignments_claim FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_claim_assignments_assignee FOREIGN KEY (assigned_to_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_claim_assignments_assigner FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_claim_assignments_parent FOREIGN KEY (parent_assignment_id) REFERENCES claim_assignments(id) ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO claim_assignments (
  claim_id,
  tenant_id,
  assignment_role,
  assigned_to_user_id,
  assignment_source,
  status,
  decision_reason
)
SELECT
  c.id,
  c.tenant_id,
  'assessor',
  c.assigned_assessor_id,
  'legacy_import',
  'assigned',
  'Legacy assignment snapshot created during assignment-history introduction; original assigner and timestamp were not available.'
FROM claims c
LEFT JOIN claim_assignments existing
  ON existing.claim_id = c.id
  AND existing.assignment_role = 'assessor'
  AND existing.assignment_source = 'legacy_import'
WHERE c.assigned_assessor_id IS NOT NULL
  AND c.tenant_id IS NOT NULL
  AND existing.id IS NULL;
