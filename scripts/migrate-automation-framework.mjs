import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is not set');
  process.exit(1);
}

const connection = await mysql.createConnection(DATABASE_URL);
const db = drizzle(connection);

console.log('Creating Confidence-Governed Automation Framework tables...');

try {
  // 1. automation_policies table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS automation_policies (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id VARCHAR(255) NOT NULL,
      policy_name VARCHAR(255) NOT NULL,
      
      -- Confidence Thresholds
      min_automation_confidence INT NOT NULL DEFAULT 85,
      min_hybrid_confidence INT NOT NULL DEFAULT 60,
      
      -- Claim Type Eligibility
      eligible_claim_types JSON NOT NULL,
      excluded_claim_types JSON NOT NULL,
      
      -- Financial Limits
      max_ai_only_approval_amount BIGINT NOT NULL DEFAULT 5000000,
      max_hybrid_approval_amount BIGINT NOT NULL DEFAULT 20000000,
      
      -- Fraud Risk Cutoff
      max_fraud_score_for_automation INT NOT NULL DEFAULT 30,
      
      -- Vehicle Category Rules
      eligible_vehicle_categories JSON NOT NULL,
      excluded_vehicle_makes JSON NOT NULL,
      min_vehicle_year INT NOT NULL DEFAULT 2010,
      max_vehicle_age INT NOT NULL DEFAULT 15,
      
      -- Override Controls
      require_manager_approval_above BIGINT NOT NULL DEFAULT 10000000,
      allow_policy_override BOOLEAN NOT NULL DEFAULT TRUE,
      
      -- Metadata
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      created_by_user_id INT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      
      INDEX idx_tenant_active (tenant_id, is_active),
      INDEX idx_policy_name (policy_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('✓ automation_policies table created');

  // 2. claim_confidence_scores table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS claim_confidence_scores (
      id INT AUTO_INCREMENT PRIMARY KEY,
      claim_id INT NOT NULL,
      tenant_id VARCHAR(255) NOT NULL,
      
      -- Component Scores (0-100)
      damage_certainty DECIMAL(5,2) NOT NULL,
      physics_strength DECIMAL(5,2) NOT NULL,
      fraud_confidence DECIMAL(5,2) NOT NULL,
      historical_accuracy DECIMAL(5,2) NOT NULL,
      data_completeness DECIMAL(5,2) NOT NULL,
      vehicle_risk_intelligence DECIMAL(5,2) NOT NULL,
      
      -- Composite Score
      composite_confidence_score DECIMAL(5,2) NOT NULL,
      
      -- Scoring Metadata
      scoring_version VARCHAR(50) NOT NULL DEFAULT 'v1.0',
      scoring_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      
      -- Component Score Details (JSON)
      damage_certainty_breakdown JSON,
      physics_validation_details JSON,
      fraud_analysis_details JSON,
      historical_accuracy_details JSON,
      data_completeness_details JSON,
      vehicle_risk_details JSON,
      
      INDEX idx_claim_id (claim_id),
      INDEX idx_tenant_id (tenant_id),
      INDEX idx_composite_score (composite_confidence_score),
      INDEX idx_scoring_timestamp (scoring_timestamp)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('✓ claim_confidence_scores table created');

  // 3. claim_routing_decisions table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS claim_routing_decisions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      claim_id INT NOT NULL,
      tenant_id VARCHAR(255) NOT NULL,
      confidence_score_id INT NOT NULL,
      automation_policy_id INT NOT NULL,
      
      -- Routing Decision
      routed_workflow ENUM('ai_only', 'hybrid', 'manual') NOT NULL,
      routing_reason TEXT NOT NULL,
      
      -- Policy Application Snapshot
      policy_thresholds_applied JSON NOT NULL,
      
      -- Decision Metadata
      decision_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      decision_made_by_system BOOLEAN NOT NULL DEFAULT TRUE,
      decision_made_by_user_id INT,
      
      -- Override Tracking
      was_overridden BOOLEAN NOT NULL DEFAULT FALSE,
      override_reason TEXT,
      overridden_by_user_id INT,
      overridden_at TIMESTAMP NULL,
      
      INDEX idx_claim_id (claim_id),
      INDEX idx_tenant_id (tenant_id),
      INDEX idx_routed_workflow (routed_workflow),
      INDEX idx_decision_timestamp (decision_timestamp),
      FOREIGN KEY (confidence_score_id) REFERENCES claim_confidence_scores(id),
      FOREIGN KEY (automation_policy_id) REFERENCES automation_policies(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('✓ claim_routing_decisions table created');

  // 4. automation_audit_log table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS automation_audit_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      claim_id INT NOT NULL,
      tenant_id VARCHAR(255) NOT NULL,
      
      -- Confidence Score Reference
      confidence_score_id INT NOT NULL,
      composite_confidence_score DECIMAL(5,2) NOT NULL,
      
      -- Routing Decision Reference
      routing_decision_id INT NOT NULL,
      routed_workflow ENUM('ai_only', 'hybrid', 'manual') NOT NULL,
      routing_reason TEXT NOT NULL,
      
      -- Policy Application
      automation_policy_id INT NOT NULL,
      policy_snapshot JSON NOT NULL,
      
      -- Cost Tracking
      ai_estimated_cost BIGINT NOT NULL,
      assessor_adjusted_cost BIGINT,
      final_approved_cost BIGINT,
      cost_variance_ai_vs_final DECIMAL(5,2),
      
      -- Timestamps
      decision_made_at TIMESTAMP NOT NULL,
      claim_approved_at TIMESTAMP,
      claim_rejected_at TIMESTAMP,
      
      -- Override Tracking
      was_overridden BOOLEAN NOT NULL DEFAULT FALSE,
      override_reason TEXT,
      overridden_by_user_id INT,
      
      -- Audit Metadata
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      
      INDEX idx_claim_id (claim_id),
      INDEX idx_tenant_id (tenant_id),
      INDEX idx_routed_workflow (routed_workflow),
      INDEX idx_composite_score (composite_confidence_score),
      INDEX idx_decision_made_at (decision_made_at),
      INDEX idx_was_overridden (was_overridden),
      FOREIGN KEY (confidence_score_id) REFERENCES claim_confidence_scores(id),
      FOREIGN KEY (routing_decision_id) REFERENCES claim_routing_decisions(id),
      FOREIGN KEY (automation_policy_id) REFERENCES automation_policies(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('✓ automation_audit_log table created');

  console.log('\\n✅ All Confidence-Governed Automation Framework tables created successfully');
  console.log('\\nTables created:');
  console.log('  1. automation_policies (insurer configuration)');
  console.log('  2. claim_confidence_scores (per-claim confidence breakdown)');
  console.log('  3. claim_routing_decisions (routing audit trail)');
  console.log('  4. automation_audit_log (full automation event log)');
  
} catch (error) {
  console.error('Error creating tables:', error);
  process.exit(1);
} finally {
  await connection.end();
}
