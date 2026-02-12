#!/usr/bin/env node

/**
 * Migration script for Hybrid Intelligence Governance Layer
 * Creates: schema extensions + 4 new tables
 */

import { createConnection } from "mysql2/promise";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL environment variable is not set");
  process.exit(1);
}

async function migrate() {
  const connection = await createConnection(DATABASE_URL);
  
  try {
    console.log("Starting Hybrid Intelligence Governance Layer migration...\n");
    
    // 1. Extend claim_intelligence_dataset table
    console.log("Step 1: Extending claim_intelligence_dataset table...");
    
    await connection.execute(`
      ALTER TABLE claim_intelligence_dataset
      ADD COLUMN IF NOT EXISTS data_scope ENUM('tenant_private', 'tenant_feature') DEFAULT 'tenant_private' NOT NULL
        COMMENT 'Data intelligence tier: tenant_private (full-fidelity) or tenant_feature (de-identified)'
    `);
    console.log("  ✓ Added data_scope column");
    
    await connection.execute(`
      ALTER TABLE claim_intelligence_dataset
      ADD COLUMN IF NOT EXISTS global_sharing_enabled TINYINT DEFAULT 0
        COMMENT 'Tenant opt-in for global dataset inclusion (POPIA/GDPR consent)'
    `);
    console.log("  ✓ Added global_sharing_enabled column");
    
    await connection.execute(`
      ALTER TABLE claim_intelligence_dataset
      ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMP NULL
        COMMENT 'When record was anonymized for global dataset'
    `);
    console.log("  ✓ Added anonymized_at column");
    
    // Add indexes
    try {
      await connection.execute(`CREATE INDEX idx_data_scope ON claim_intelligence_dataset(data_scope)`);
      console.log("  ✓ Created index: idx_data_scope");
    } catch (error) {
      if (error.code === "ER_DUP_KEYNAME") {
        console.log("  Index already exists: idx_data_scope");
      } else {
        throw error;
      }
    }
    
    try {
      await connection.execute(`CREATE INDEX idx_global_sharing ON claim_intelligence_dataset(global_sharing_enabled)`);
      console.log("  ✓ Created index: idx_global_sharing");
    } catch (error) {
      if (error.code === "ER_DUP_KEYNAME") {
        console.log("  Index already exists: idx_global_sharing");
      } else {
        throw error;
      }
    }
    
    try {
      await connection.execute(`CREATE INDEX idx_anonymized_at ON claim_intelligence_dataset(anonymized_at)`);
      console.log("  ✓ Created index: idx_anonymized_at");
    } catch (error) {
      if (error.code === "ER_DUP_KEYNAME") {
        console.log("  Index already exists: idx_anonymized_at");
      } else {
        throw error;
      }
    }
    
    // 2. Create global_anonymized_dataset table
    console.log("\nStep 2: Creating global_anonymized_dataset table...");
    
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS global_anonymized_dataset (
        id INT AUTO_INCREMENT PRIMARY KEY,
        anonymous_record_id VARCHAR(36) NOT NULL UNIQUE COMMENT 'UUID to prevent correlation',
        
        capture_month VARCHAR(7) NOT NULL COMMENT 'YYYY-MM format (temporal generalization)',
        
        vehicle_make VARCHAR(100),
        vehicle_model VARCHAR(100),
        vehicle_year_bracket VARCHAR(20) COMMENT '5-year brackets: 2020-2024, 2015-2019, etc.',
        vehicle_mass INT,
        
        accident_type VARCHAR(50),
        province VARCHAR(50) COMMENT 'Generalized from city',
        
        detected_damage_components JSON,
        damage_severity_scores JSON,
        physics_plausibility_score INT,
        
        ai_estimated_cost INT,
        assessor_adjusted_cost INT,
        insurer_approved_cost INT,
        cost_variance_ai_vs_assessor INT,
        cost_variance_assessor_vs_final INT,
        cost_variance_ai_vs_final INT,
        
        ai_fraud_score INT,
        final_fraud_outcome VARCHAR(50),
        
        assessor_tier VARCHAR(50),
        assessment_turnaround_hours DECIMAL(10, 2),
        reassignment_count INT,
        approval_timeline_hours DECIMAL(10, 2),
        
        anonymized_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        schema_version INT NOT NULL DEFAULT 1
      )
    `);
    console.log("  ✓ Created table: global_anonymized_dataset");
    
    // Add indexes for global_anonymized_dataset
    const globalDatasetIndexes = [
      { name: "idx_gad_capture_month", column: "capture_month" },
      { name: "idx_gad_vehicle_make", column: "vehicle_make" },
      { name: "idx_gad_province", column: "province" },
      { name: "idx_gad_accident_type", column: "accident_type" },
      { name: "idx_gad_anonymized_at", column: "anonymized_at" },
    ];
    
    for (const idx of globalDatasetIndexes) {
      try {
        await connection.execute(
          `CREATE INDEX ${idx.name} ON global_anonymized_dataset(${idx.column})`
        );
        console.log(`  ✓ Created index: ${idx.name}`);
      } catch (error) {
        if (error.code === "ER_DUP_KEYNAME") {
          console.log(`  Index already exists: ${idx.name}`);
        } else {
          throw error;
        }
      }
    }
    
    // 3. Create anonymization_audit_log table
    console.log("\nStep 3: Creating anonymization_audit_log table...");
    
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS anonymization_audit_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        source_record_id INT NOT NULL COMMENT 'FK to claim_intelligence_dataset.id',
        anonymous_record_id VARCHAR(36) COMMENT 'UUID in global_anonymized_dataset (NULL if withheld)',
        
        status ENUM(
          'success',
          'withheld_k_anonymity',
          'withheld_pii_detected',
          'withheld_tenant_opt_out'
        ) NOT NULL,
        
        quasi_identifier_hash VARCHAR(64) COMMENT 'SHA256 hash of [make, model, year_bracket, type, province]',
        group_size INT COMMENT 'Number of records sharing same quasi-identifier',
        
        transformations_applied JSON COMMENT 'List of transformations applied',
        
        anonymized_by_user_id INT COMMENT 'System user ID (for manual anonymization)',
        anonymized_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    console.log("  ✓ Created table: anonymization_audit_log");
    
    // Add indexes for anonymization_audit_log
    const auditLogIndexes = [
      { name: "idx_aal_source_record", column: "source_record_id" },
      { name: "idx_aal_status", column: "status" },
      { name: "idx_aal_anonymized_at", column: "anonymized_at" },
    ];
    
    for (const idx of auditLogIndexes) {
      try {
        await connection.execute(
          `CREATE INDEX ${idx.name} ON anonymization_audit_log(${idx.column})`
        );
        console.log(`  ✓ Created index: ${idx.name}`);
      } catch (error) {
        if (error.code === "ER_DUP_KEYNAME") {
          console.log(`  Index already exists: ${idx.name}`);
        } else {
          throw error;
        }
      }
    }
    
    // 4. Create dataset_access_grants table
    console.log("\nStep 4: Creating dataset_access_grants table...");
    
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS dataset_access_grants (
        id INT AUTO_INCREMENT PRIMARY KEY,
        
        tenant_id VARCHAR(255) NOT NULL,
        data_scope ENUM('tenant_private', 'tenant_feature', 'global_anonymized') NOT NULL,
        granted_to_user_id INT COMMENT 'User receiving access (NULL for role-based grants)',
        granted_to_role VARCHAR(50) COMMENT 'Role receiving access',
        granted_to_organization VARCHAR(255) COMMENT 'External organization',
        
        purpose TEXT NOT NULL COMMENT 'Business justification for access',
        expiry_date DATE COMMENT 'Access automatically revoked after this date',
        max_records INT COMMENT 'Maximum number of records that can be queried',
        
        granted_by_user_id INT NOT NULL,
        granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        revoked_at TIMESTAMP NULL,
        revoked_by_user_id INT
      )
    `);
    console.log("  ✓ Created table: dataset_access_grants");
    
    // Add indexes for dataset_access_grants
    const accessGrantsIndexes = [
      { name: "idx_dag_tenant_id", column: "tenant_id" },
      { name: "idx_dag_data_scope", column: "data_scope" },
      { name: "idx_dag_granted_to_user", column: "granted_to_user_id" },
      { name: "idx_dag_expiry_date", column: "expiry_date" },
    ];
    
    for (const idx of accessGrantsIndexes) {
      try {
        await connection.execute(
          `CREATE INDEX ${idx.name} ON dataset_access_grants(${idx.column})`
        );
        console.log(`  ✓ Created index: ${idx.name}`);
      } catch (error) {
        if (error.code === "ER_DUP_KEYNAME") {
          console.log(`  Index already exists: ${idx.name}`);
        } else {
          throw error;
        }
      }
    }
    
    // 5. Create federated_learning_metadata table
    console.log("\nStep 5: Creating federated_learning_metadata table...");
    
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS federated_learning_metadata (
        id INT AUTO_INCREMENT PRIMARY KEY,
        
        round_number INT NOT NULL,
        model_type VARCHAR(100) NOT NULL COMMENT 'fraud_detection, cost_estimation, etc.',
        
        participant_count INT NOT NULL,
        participant_tenant_ids JSON COMMENT 'Array of tenant_ids (encrypted or hashed)',
        
        global_model_version VARCHAR(50) NOT NULL,
        local_model_contributions JSON COMMENT 'Array of {tenant_id_hash, gradient_norm, data_count}',
        aggregation_method VARCHAR(50) DEFAULT 'federated_averaging',
        
        global_model_accuracy DECIMAL(5, 4) COMMENT 'Accuracy on global test set',
        convergence_status ENUM('converging', 'converged', 'diverged') DEFAULT 'converging',
        
        training_started_at TIMESTAMP NOT NULL,
        training_completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    console.log("  ✓ Created table: federated_learning_metadata");
    
    // Add indexes for federated_learning_metadata
    const federatedLearningIndexes = [
      { name: "idx_flm_round_number", column: "round_number" },
      { name: "idx_flm_model_type", column: "model_type" },
      { name: "idx_flm_training_started", column: "training_started_at" },
    ];
    
    for (const idx of federatedLearningIndexes) {
      try {
        await connection.execute(
          `CREATE INDEX ${idx.name} ON federated_learning_metadata(${idx.column})`
        );
        console.log(`  ✓ Created index: ${idx.name}`);
      } catch (error) {
        if (error.code === "ER_DUP_KEYNAME") {
          console.log(`  Index already exists: ${idx.name}`);
        } else {
          throw error;
        }
      }
    }
    
    console.log("\n✅ Hybrid Intelligence Governance Layer migration complete!");
    console.log("Tables created/extended:");
    console.log("  - claim_intelligence_dataset (extended with 3 columns)");
    console.log("  - global_anonymized_dataset (new)");
    console.log("  - anonymization_audit_log (new)");
    console.log("  - dataset_access_grants (new)");
    console.log("  - federated_learning_metadata (new)");
    
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

migrate();
