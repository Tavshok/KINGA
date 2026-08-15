-- KINGA vehicle-specific benchmark precision hierarchy
-- Author: Tavonga Shoko, Lead Engineer
-- Adds internal comparison context only. It does not create or change a claim,
-- quote, policy, payment, settlement, repair decision, or client-facing benchmark disclosure.

ALTER TABLE component_repair_outcomes
  ADD COLUMN vehicle_variant VARCHAR(100) NULL AFTER vehicle_age_years,
  ADD COLUMN vehicle_body_type VARCHAR(60) NULL AFTER vehicle_variant,
  ADD COLUMN market_region VARCHAR(20) NULL AFTER vehicle_body_type,
  ADD COLUMN currency_code VARCHAR(10) NULL AFTER market_region,
  ADD COLUMN evidence_quality ENUM('verified','accepted_quote','assessor_validated','review_required') NOT NULL DEFAULT 'accepted_quote' AFTER currency_code,
  ADD INDEX idx_cro_vehicle_precision (component_name, vehicle_make, vehicle_model, vehicle_year),
  ADD INDEX idx_cro_market_currency (market_region, currency_code, evidence_quality);

ALTER TABLE component_benchmarks
  ADD COLUMN vehicle_model VARCHAR(100) NULL AFTER vehicle_make,
  ADD COLUMN year_band VARCHAR(20) NULL AFTER vehicle_model,
  ADD COLUMN vehicle_variant VARCHAR(100) NULL AFTER year_band,
  ADD COLUMN body_type VARCHAR(60) NULL AFTER vehicle_variant,
  ADD COLUMN market_region VARCHAR(20) NULL AFTER body_type,
  ADD COLUMN currency_code VARCHAR(10) NULL AFTER market_region,
  ADD COLUMN evidence_quality ENUM('verified','accepted_quote','assessor_validated','review_required') NOT NULL DEFAULT 'accepted_quote' AFTER currency_code,
  ADD INDEX idx_cb_vehicle_precision (component_id, vehicle_make, vehicle_model, year_band),
  ADD INDEX idx_cb_market_currency (market_region, currency_code, evidence_quality);

ALTER TABLE cost_learning_records
  ADD COLUMN vehicle_make VARCHAR(100) NULL,
  ADD COLUMN vehicle_model VARCHAR(100) NULL,
  ADD COLUMN vehicle_year INT NULL,
  ADD COLUMN vehicle_variant VARCHAR(100) NULL,
  ADD COLUMN vehicle_body_type VARCHAR(60) NULL;

ALTER TABLE cost_learning_records
  ADD INDEX idx_clr_vehicle_precision (vehicle_make, vehicle_model, vehicle_year),
  ADD INDEX idx_clr_market_currency (market_region, currency);
