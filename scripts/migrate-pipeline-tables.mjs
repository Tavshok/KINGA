/**
 * Direct SQL migration for Historical Claim Intelligence Pipeline tables.
 * Bypasses drizzle-kit interactive prompts by executing SQL directly.
 */
import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

async function migrate() {
  const connection = await mysql.createConnection(DATABASE_URL);
  
  const tables = [
    // 1. Historical Claims Master
    `CREATE TABLE IF NOT EXISTS historical_claims (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id VARCHAR(64) NOT NULL,
      batch_id INT,
      claim_reference VARCHAR(100),
      policy_number VARCHAR(100),
      vehicle_make VARCHAR(100),
      vehicle_model VARCHAR(100),
      vehicle_year INT,
      vehicle_registration VARCHAR(50),
      vehicle_vin VARCHAR(50),
      vehicle_color VARCHAR(50),
      incident_date DATE,
      incident_location TEXT,
      incident_description TEXT,
      accident_type VARCHAR(100),
      estimated_speed INT,
      claimant_name VARCHAR(255),
      claimant_id_number VARCHAR(50),
      claimant_contact VARCHAR(100),
      total_panel_beater_quote DECIMAL(12,2),
      total_assessor_estimate DECIMAL(12,2),
      total_ai_estimate DECIMAL(12,2),
      final_approved_cost DECIMAL(12,2),
      repair_decision ENUM('repair','total_loss','cash_settlement','rejected'),
      assessor_name VARCHAR(255),
      assessor_license_number VARCHAR(100),
      pipeline_status ENUM('pending','documents_uploaded','classification_complete','extraction_complete','ground_truth_captured','variance_calculated','complete','failed') NOT NULL DEFAULT 'pending',
      data_quality_score INT,
      fields_extracted INT,
      fields_missing INT,
      manual_corrections INT DEFAULT 0,
      total_documents INT DEFAULT 0,
      extraction_log JSON,
      last_error TEXT,
      retry_count INT DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,

    // 2. Extracted Repair Items
    `CREATE TABLE IF NOT EXISTS extracted_repair_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      historical_claim_id INT NOT NULL,
      document_id INT,
      source_type ENUM('panel_beater_quote','assessor_report','ai_estimate') NOT NULL,
      item_number INT,
      description VARCHAR(500) NOT NULL,
      part_number VARCHAR(100),
      category ENUM('parts','labor','paint','diagnostic','sundries','sublet','other') NOT NULL,
      damage_location VARCHAR(200),
      repair_action ENUM('repair','replace','refinish','blend','remove_refit'),
      quantity DECIMAL(10,2) DEFAULT 1.00,
      unit_price DECIMAL(10,2),
      line_total DECIMAL(10,2),
      labor_hours DECIMAL(6,2),
      labor_rate DECIMAL(10,2),
      parts_quality ENUM('oem','genuine','aftermarket','used','reconditioned'),
      betterment_percent DECIMAL(5,2),
      betterment_amount DECIMAL(10,2),
      extraction_confidence DECIMAL(5,4),
      is_handwritten TINYINT DEFAULT 0,
      manually_verified TINYINT DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,

    // 3. Cost Components
    `CREATE TABLE IF NOT EXISTS cost_components (
      id INT AUTO_INCREMENT PRIMARY KEY,
      historical_claim_id INT NOT NULL,
      source_type ENUM('panel_beater_quote','assessor_report','ai_estimate','final_approved') NOT NULL,
      document_id INT,
      labor_cost DECIMAL(12,2) DEFAULT 0.00,
      parts_cost DECIMAL(12,2) DEFAULT 0.00,
      paint_cost DECIMAL(12,2) DEFAULT 0.00,
      materials_cost DECIMAL(12,2) DEFAULT 0.00,
      sublet_cost DECIMAL(12,2) DEFAULT 0.00,
      sundries DECIMAL(12,2) DEFAULT 0.00,
      vat_amount DECIMAL(12,2) DEFAULT 0.00,
      total_excl_vat DECIMAL(12,2) DEFAULT 0.00,
      total_incl_vat DECIMAL(12,2) DEFAULT 0.00,
      total_labor_hours DECIMAL(8,2),
      average_labor_rate DECIMAL(10,2),
      total_parts_count INT,
      oem_parts_count INT,
      aftermarket_parts_count INT,
      repair_vs_replace_ratio DECIMAL(5,2),
      total_betterment DECIMAL(12,2) DEFAULT 0.00,
      extraction_confidence DECIMAL(5,4),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,

    // 4. AI Prediction Logs
    `CREATE TABLE IF NOT EXISTS ai_prediction_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      historical_claim_id INT NOT NULL,
      tenant_id VARCHAR(64) NOT NULL,
      prediction_type ENUM('cost_estimate','fraud_detection','document_classification','damage_assessment','repair_vs_replace','total_loss_determination','physics_validation') NOT NULL,
      model_name VARCHAR(100) NOT NULL,
      model_version VARCHAR(50),
      input_summary TEXT,
      input_tokens INT,
      predicted_value DECIMAL(12,2),
      predicted_label VARCHAR(100),
      confidence_score DECIMAL(5,4),
      prediction_json JSON,
      actual_value DECIMAL(12,2),
      actual_label VARCHAR(100),
      variance_amount DECIMAL(12,2),
      variance_percent DECIMAL(8,2),
      is_accurate TINYINT,
      processing_time_ms INT,
      output_tokens INT,
      total_cost DECIMAL(10,6),
      error_occurred TINYINT DEFAULT 0,
      error_message TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,

    // 5. Final Approval Records (Ground Truth)
    `CREATE TABLE IF NOT EXISTS final_approval_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      historical_claim_id INT NOT NULL UNIQUE,
      tenant_id VARCHAR(64) NOT NULL,
      final_decision ENUM('approved_repair','approved_total_loss','cash_settlement','rejected','withdrawn') NOT NULL,
      final_approved_amount DECIMAL(12,2) NOT NULL,
      final_labor_cost DECIMAL(12,2),
      final_parts_cost DECIMAL(12,2),
      final_paint_cost DECIMAL(12,2),
      final_sublet_cost DECIMAL(12,2),
      final_betterment DECIMAL(12,2),
      approved_by_name VARCHAR(255),
      approved_by_role VARCHAR(100),
      approval_date DATE,
      assessor_name VARCHAR(255),
      assessor_license_number VARCHAR(100),
      assessor_estimate DECIMAL(12,2),
      repair_shop_name VARCHAR(255),
      actual_repair_duration INT,
      customer_satisfaction INT,
      approval_notes TEXT,
      conditions_text TEXT,
      data_source ENUM('extracted_from_document','manual_entry','system_import') NOT NULL,
      captured_by_user_id INT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,

    // 6. Variance Datasets
    `CREATE TABLE IF NOT EXISTS variance_datasets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      historical_claim_id INT NOT NULL,
      tenant_id VARCHAR(64) NOT NULL,
      comparison_type ENUM('quote_vs_final','ai_vs_final','assessor_vs_final','quote_vs_assessor','ai_vs_assessor','quote_vs_ai') NOT NULL,
      source_a_label VARCHAR(100) NOT NULL,
      source_a_amount DECIMAL(12,2) NOT NULL,
      source_b_label VARCHAR(100) NOT NULL,
      source_b_amount DECIMAL(12,2) NOT NULL,
      variance_amount DECIMAL(12,2) NOT NULL,
      variance_percent DECIMAL(8,2) NOT NULL,
      absolute_variance_percent DECIMAL(8,2) NOT NULL,
      labor_variance DECIMAL(12,2),
      parts_variance DECIMAL(12,2),
      paint_variance DECIMAL(12,2),
      variance_category ENUM('within_threshold','minor_variance','significant_variance','major_variance','extreme_variance') NOT NULL,
      vehicle_make VARCHAR(100),
      vehicle_model VARCHAR(100),
      vehicle_year INT,
      accident_type VARCHAR(100),
      assessor_name VARCHAR(255),
      assessor_license_number VARCHAR(100),
      is_fraud_suspected TINYINT DEFAULT 0,
      is_outlier TINYINT DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  ];

  for (const sql of tables) {
    try {
      await connection.execute(sql);
      const match = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
      const tableName = match ? match[1] : 'unknown';
      console.log('Created/verified table: ' + tableName);
    } catch (error) {
      console.error('Error creating table: ' + error.message);
    }
  }

  // Add indexes for performance
  const indexes = [
    'CREATE INDEX idx_hc_tenant ON historical_claims(tenant_id)',
    'CREATE INDEX idx_hc_batch ON historical_claims(batch_id)',
    'CREATE INDEX idx_hc_status ON historical_claims(pipeline_status)',
    'CREATE INDEX idx_eri_claim ON extracted_repair_items(historical_claim_id)',
    'CREATE INDEX idx_cc_claim ON cost_components(historical_claim_id)',
    'CREATE INDEX idx_apl_claim ON ai_prediction_logs(historical_claim_id)',
    'CREATE INDEX idx_apl_tenant ON ai_prediction_logs(tenant_id)',
    'CREATE INDEX idx_vd_claim ON variance_datasets(historical_claim_id)',
    'CREATE INDEX idx_vd_tenant ON variance_datasets(tenant_id)',
    'CREATE INDEX idx_vd_type ON variance_datasets(comparison_type)',
  ];

  for (const sql of indexes) {
    try {
      await connection.execute(sql);
    } catch (error) {
      // Ignore duplicate index errors
      if (!error.message.includes('Duplicate')) {
        console.error('Index note: ' + error.message);
      }
    }
  }
  console.log('Indexes created/verified');

  await connection.end();
  console.log('Migration complete!');
}

migrate().catch(console.error);
