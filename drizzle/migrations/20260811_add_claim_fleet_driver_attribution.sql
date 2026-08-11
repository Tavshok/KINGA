-- Fleet Driver attribution for company claims.
-- Applied to the production schema on 2026-08-11 after verifying that neither
-- the nullable column nor its index existed. This is additive and non-destructive.
ALTER TABLE claims ADD COLUMN fleet_driver_id INT NULL;
CREATE INDEX idx_claims_fleet_driver_id ON claims (fleet_driver_id);
