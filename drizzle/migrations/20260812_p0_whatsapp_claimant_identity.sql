-- P0 Package 2: tenant-bound phone linkage for WhatsApp claimant intake.
ALTER TABLE users ADD COLUMN phone_number VARCHAR(30) NULL;
ALTER TABLE users ADD COLUMN is_unregistered_claimant TINYINT NOT NULL DEFAULT 0;
CREATE INDEX idx_users_phone_tenant ON users(phone_number, tenant_id);
