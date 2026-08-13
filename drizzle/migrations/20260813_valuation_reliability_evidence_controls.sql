-- KINGA valuation reliability evidence controls
-- Author: Tavonga Shoko, Lead Engineer
-- Stores only provenance and review-support evidence for standalone valuations.
-- It does not create a policy, premium, claim, repair cost, settlement, or payment record.
CREATE TABLE IF NOT EXISTS valuation_comparable_evidence (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  valuation_request_id INT NOT NULL,
  source_type ENUM('market_valuation_record','historical_claim') NOT NULL,
  source_reference VARCHAR(255) NOT NULL,
  observed_value_cents INT NOT NULL,
  observed_at TIMESTAMP NULL,
  vehicle_year INT NULL,
  vehicle_match_json LONGTEXT NOT NULL,
  adjustment_json LONGTEXT NULL,
  limitation TEXT NULL,
  inclusion_status ENUM('included','excluded','review_required') NOT NULL DEFAULT 'included',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX valuation_comparable_request_idx (valuation_request_id),
  INDEX valuation_comparable_source_idx (source_type, source_reference)
);
