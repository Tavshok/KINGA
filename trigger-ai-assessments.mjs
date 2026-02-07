#!/usr/bin/env node
/**
 * Trigger AI assessments for claims with real photos
 */

import mysql from 'mysql2/promise';
import { triggerAiAssessment } from './server/db.ts';

const vehicleRegs = ['AFX3048', 'ACX8237', 'AEW2816'];

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  try {
    console.log('Triggering AI assessments for claims with photos...\n');
    
    for (const vehicleReg of vehicleRegs) {
      console.log(`Processing ${vehicleReg}...`);
      
      // Find the claim
      const [claims] = await conn.execute(
        'SELECT id, claim_number FROM claims WHERE vehicle_registration = ?',
        [vehicleReg]
      );
      
      if (claims.length === 0) {
        console.log(`  ⚠️  No claim found`);
        continue;
      }
      
      const claim = claims[0];
      console.log(`  Found claim: ${claim.claim_number}`);
      
      try {
        // Trigger AI assessment
        await triggerAiAssessment(claim.id);
        console.log(`  ✓ AI assessment triggered successfully`);
      } catch (error) {
        console.log(`  ❌ Failed to trigger AI assessment: ${error.message}`);
      }
    }
    
    console.log('\n✅ AI assessment triggering complete!');
    
  } finally {
    await conn.end();
  }
}

main().catch(console.error);
