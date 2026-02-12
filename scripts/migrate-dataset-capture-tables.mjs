#!/usr/bin/env node

/**
 * Migration script for Phase 2: Claim Intelligence Dataset Capture tables
 * Creates: claim_intelligence_dataset, claim_events, model_training_queue
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
    console.log("Starting Phase 2 dataset capture tables migration...\n");
    
    // 1. Create claim_intelligence_dataset table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS claim_intelligence_dataset (
        id INT AUTO_INCREMENT PRIMARY KEY,
        claim_id INT NOT NULL,
        tenant_id VARCHAR(255),
        schema_version INT NOT NULL DEFAULT 1,
        
        vehicle_make VARCHAR(100),
        vehicle_model VARCHAR(100),
        vehicle_year INT,
        vehicle_mass INT,
        accident_type VARCHAR(50),
        impact_direction VARCHAR(50),
        accident_description_text TEXT,
        police_report_presence TINYINT DEFAULT 0,
        
        detected_damage_components JSON,
        damage_severity_scores JSON,
        llm_damage_reasoning TEXT,
        physics_plausibility_score INT,
        
        ai_estimated_cost INT,
        assessor_adjusted_cost INT,
        insurer_approved_cost INT,
        cost_variance_ai_vs_assessor INT,
        cost_variance_assessor_vs_final INT,
        cost_variance_ai_vs_final INT,
        
        ai_fraud_score INT,
        fraud_explanation TEXT,
        final_fraud_outcome VARCHAR(50),
        
        assessor_id INT,
        assessor_tier VARCHAR(50),
        assessment_turnaround_hours DECIMAL(10, 2),
        reassignment_count INT DEFAULT 0,
        approval_timeline_hours DECIMAL(10, 2),
        
        captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    console.log("✓ Created/verified table: claim_intelligence_dataset");
    
    // 2. Create claim_events table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS claim_events (
        id INT AUTO_INCREMENT PRIMARY KEY,
        claim_id INT NOT NULL,
        event_type VARCHAR(100) NOT NULL,
        event_payload JSON,
        user_id INT,
        user_role VARCHAR(50),
        tenant_id VARCHAR(255),
        emitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    console.log("✓ Created/verified table: claim_events");
    
    // 3. Create model_training_queue table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS model_training_queue (
        id INT AUTO_INCREMENT PRIMARY KEY,
        claim_id INT NOT NULL,
        dataset_record_id INT NOT NULL,
        training_priority VARCHAR(50) DEFAULT 'normal',
        processed TINYINT DEFAULT 0,
        processed_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    console.log("✓ Created/verified table: model_training_queue");
    
    // 4. Create indexes for claim_intelligence_dataset
    const datasetIndexes = [
      { name: "idx_cid_claim_id", column: "claim_id" },
      { name: "idx_cid_tenant_id", column: "tenant_id" },
      { name: "idx_cid_captured_at", column: "captured_at" },
      { name: "idx_cid_schema_version", column: "schema_version" },
    ];
    
    for (const idx of datasetIndexes) {
      try {
        await connection.execute(
          `CREATE INDEX ${idx.name} ON claim_intelligence_dataset(${idx.column})`
        );
        console.log(`✓ Created index: ${idx.name}`);
      } catch (error) {
        if (error.code === "ER_DUP_KEYNAME") {
          console.log(`  Index already exists: ${idx.name}`);
        } else {
          throw error;
        }
      }
    }
    
    // 5. Create indexes for claim_events
    const eventIndexes = [
      { name: "idx_ce_claim_id", column: "claim_id" },
      { name: "idx_ce_event_type", column: "event_type" },
      { name: "idx_ce_emitted_at", column: "emitted_at" },
    ];
    
    for (const idx of eventIndexes) {
      try {
        await connection.execute(
          `CREATE INDEX ${idx.name} ON claim_events(${idx.column})`
        );
        console.log(`✓ Created index: ${idx.name}`);
      } catch (error) {
        if (error.code === "ER_DUP_KEYNAME") {
          console.log(`  Index already exists: ${idx.name}`);
        } else {
          throw error;
        }
      }
    }
    
    // 6. Create indexes for model_training_queue
    const queueIndexes = [
      { name: "idx_mtq_processed", column: "processed" },
      { name: "idx_mtq_training_priority", column: "training_priority" },
      { name: "idx_mtq_created_at", column: "created_at" },
    ];
    
    for (const idx of queueIndexes) {
      try {
        await connection.execute(
          `CREATE INDEX ${idx.name} ON model_training_queue(${idx.column})`
        );
        console.log(`✓ Created index: ${idx.name}`);
      } catch (error) {
        if (error.code === "ER_DUP_KEYNAME") {
          console.log(`  Index already exists: ${idx.name}`);
        } else {
          throw error;
        }
      }
    }
    
    console.log("\n✅ Phase 2 migration complete!");
    console.log("Tables created: claim_intelligence_dataset, claim_events, model_training_queue");
    
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

migrate();
