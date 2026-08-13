-- KINGA feature-separation correction
-- Author: Tavonga Shoko, Lead Engineer
-- Future client valuation and insurance-service submissions must not share
-- quotation, policy, claim, repair, payment, or settlement records.

CREATE TABLE IF NOT EXISTS client_vehicle_valuation_requests (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  request_number VARCHAR(50) NOT NULL,
  user_id INT NULL,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(320) NOT NULL,
  phone VARCHAR(50) NULL,
  vehicle_make VARCHAR(100) NOT NULL,
  vehicle_model VARCHAR(100) NOT NULL,
  vehicle_year INT NOT NULL,
  vehicle_registration VARCHAR(50) NULL,
  vehicle_vin VARCHAR(50) NULL,
  mileage INT NULL,
  `condition` ENUM('excellent','good','fair','poor') NOT NULL,
  photo_urls_json LONGTEXT NULL,
  registration_book_url TEXT NULL,
  status ENUM('pending','processing','complete','review_required','failed') NOT NULL DEFAULT 'pending',
  submission_token VARCHAR(64) NOT NULL,
  kinga_market_valuation_cents INT NULL,
  valuation_provenance_json LONGTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX client_valuation_request_number_idx (request_number),
  INDEX client_valuation_token_idx (submission_token),
  INDEX client_valuation_user_idx (user_id)
);

CREATE TABLE IF NOT EXISTS client_insurance_service_requests (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  request_number VARCHAR(50) NOT NULL,
  user_id INT NULL,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(320) NOT NULL,
  phone VARCHAR(50) NULL,
  product_category VARCHAR(50) NOT NULL,
  cover_type VARCHAR(100) NOT NULL,
  vehicle_registration VARCHAR(50) NULL,
  client_proposed_value_cents INT NULL,
  request_payload_json LONGTEXT NOT NULL,
  status ENUM('submitted','under_review','closed_without_quote') NOT NULL DEFAULT 'submitted',
  submission_token VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX client_insurance_service_request_number_idx (request_number),
  INDEX client_insurance_service_user_idx (user_id)
);
