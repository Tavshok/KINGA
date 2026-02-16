/**
 * Migration: Fix tenant_role_configs table to use composite primary key
 * 
 * This migration:
 * 1. Creates a new table with composite primary key (tenant_id, role_key)
 * 2. Copies data from old table
 * 3. Drops old table
 * 4. Renames new table to original name
 */

import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is not set');
  process.exit(1);
}

async function migrate() {
  const connection = await mysql.createConnection(DATABASE_URL);
  
  try {
    console.log('Starting tenant_role_configs migration...');
    
    // Step 1: Create new table with composite primary key
    console.log('1. Creating new table tenant_role_configs_new...');
    await connection.execute(`
      CREATE TABLE tenant_role_configs_new (
        tenant_id VARCHAR(64) NOT NULL,
        role_key ENUM('executive', 'claims_manager', 'claims_processor', 'assessor_internal', 'assessor_external', 'risk_manager', 'insurer_admin') NOT NULL,
        enabled TINYINT NOT NULL DEFAULT 1,
        display_name VARCHAR(100),
        permissions TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (tenant_id, role_key)
      )
    `);
    
    // Step 2: Copy data from old table (excluding id column)
    console.log('2. Copying data from old table...');
    await connection.execute(`
      INSERT INTO tenant_role_configs_new 
        (tenant_id, role_key, enabled, display_name, permissions, created_at, updated_at)
      SELECT 
        tenant_id, role_key, enabled, display_name, permissions, created_at, updated_at
      FROM tenant_role_configs
    `);
    
    // Step 3: Drop old table
    console.log('3. Dropping old table...');
    await connection.execute('DROP TABLE tenant_role_configs');
    
    // Step 4: Rename new table
    console.log('4. Renaming new table...');
    await connection.execute('RENAME TABLE tenant_role_configs_new TO tenant_role_configs');
    
    console.log('✓ Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    
    // Cleanup: try to drop the new table if it was created
    try {
      await connection.execute('DROP TABLE IF EXISTS tenant_role_configs_new');
      console.log('Cleaned up tenant_role_configs_new table');
    } catch (cleanupError) {
      console.error('Cleanup failed:', cleanupError);
    }
    
    process.exit(1);
  } finally {
    await connection.end();
  }
}

migrate();
