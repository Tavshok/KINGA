#!/usr/bin/env node
/**
 * Import real Zimbabwean assessment report data into KINGA database
 */

import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('🚀 Starting real claims import...\n');

  // Read extracted claims data
  const claimsData = JSON.parse(
    await fs.readFile('/home/ubuntu/extracted-claims.json', 'utf-8')
  );

  console.log(`Found ${claimsData.length} claims to import\n`);

  // Connect to database
  const connection = await mysql.createConnection(process.env.DATABASE_URL);

  // Get test users
  const [users] = await connection.query('SELECT * FROM users');
  const claimant = users.find(u => u.role === 'claimant');
  const insurer = users.find(u => u.role === 'insurer');
  const assessor = users.find(u => u.role === 'assessor');

  if (!claimant || !insurer || !assessor) {
    console.error('❌ Required test users not found. Please run seed-test-data.mjs first.');
    process.exit(1);
  }

  console.log(`✓ Found test users: claimant=${claimant.id}, insurer=${insurer.id}, assessor=${assessor.id}\n`);

  let imported = 0;
  let skipped = 0;

  for (const claimData of claimsData) {
    // Skip if missing essential data
    if (!claimData.vehicle_make || !claimData.registration) {
      console.log(`⚠️  Skipping ${claimData.source_file} - missing vehicle data`);
      skipped++;
      continue;
    }

    try {
      // Parse accident date
      let accidentDate = new Date();
      if (claimData.accident_date) {
        const [day, month, year] = claimData.accident_date.split('/');
        const fullYear = year.length === 2 ? `20${year}` : year;
        accidentDate = new Date(`${fullYear}-${month}-${day}`);
      }

      // Generate unique claim number
      const claimNumber = `ZW${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
      
      // Create claim
      const [result] = await connection.query(
        `INSERT INTO claims (claimant_id, claim_number, vehicle_make, vehicle_model, vehicle_year, vehicle_registration, 
         incident_date, incident_location, incident_description, status, created_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          claimant.id,
          claimNumber,
          claimData.vehicle_make,
          claimData.vehicle_model || 'Unknown',
          claimData.vehicle_year ? parseInt(claimData.vehicle_year) : 2010,
          claimData.registration,
          accidentDate,
          'Zimbabwe',
          claimData.damage_description || `${claimData.accident_type} collision`,
          'triage',
          new Date()
        ]
      );
      const claimId = result.insertId;

      console.log(`✓ Created claim: ${claimData.vehicle_make} ${claimData.vehicle_model} ${claimData.registration} (ID: ${claimId})`);

      // Create AI assessment with extracted data
      const fraudRiskLevel = claimData.fraud_indicators.length > 2 ? 'high' : 
                             claimData.fraud_indicators.length > 0 ? 'medium' : 'low';
      
      await connection.query(
        `INSERT INTO ai_assessments (claim_id, damage_description, detected_damage_types, estimated_cost, 
         confidence_score, fraud_indicators, fraud_risk_level, created_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          claimId,
          claimData.damage_description || `${claimData.accident_type} collision damage with ${claimData.damaged_components.join(', ')}`,
          JSON.stringify(claimData.damaged_components),
          claimData.repair_cost_usd || 0,
          85,
          JSON.stringify(claimData.fraud_indicators),
          fraudRiskLevel,
          new Date()
        ]
      );

      console.log(`  ✓ Created AI assessment`);
      console.log(`    - Damaged components: ${claimData.damaged_components.length}`);
      console.log(`    - Structural damage: ${claimData.structural_damage ? 'YES' : 'NO'}`);
      console.log(`    - Fraud indicators: ${claimData.fraud_indicators.length}`);
      console.log(`    - Recommendation: ${claimData.assessor_recommendation || 'repair'}`);
      console.log('');

      imported++;
    } catch (error) {
      console.error(`❌ Error importing ${claimData.source_file}:`, error.message);
      skipped++;
    }
  }

  await connection.end();

  console.log('\n=== Import Complete ===');
  console.log(`✓ Successfully imported: ${imported} claims`);
  console.log(`⚠️  Skipped: ${skipped} claims`);
  console.log(`\n🎉 Real Zimbabwean claims data is now in the system!`);
  console.log(`\nNext steps:`);
  console.log(`1. Log in as insurer to view claims triage`);
  console.log(`2. Test AI damage detection with real data`);
  console.log(`3. Validate physics engine with structural damage cases`);
  console.log(`4. Review fraud indicators on high-risk claims`);
}

main().catch(console.error);
