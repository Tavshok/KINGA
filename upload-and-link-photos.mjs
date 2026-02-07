#!/usr/bin/env node
/**
 * Upload extracted damage photos to S3 and link them to claims
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import mysql from 'mysql2/promise';

const photoDir = '/home/ubuntu/damage-photos';

// Mapping of photo filenames to vehicle registrations
const photoToVehicle = {
  'CELL-SilverstarMercedesToyotaHiluxAFX3048-MotorAssessmentAmendedReport': 'AFX3048',
  'CITYPARKINGNISSANNP300ACX8237ASSESSMENTREPORT': 'ACX8237',
  'ChidoNyakudyaHondaFitAEW2816Assesementreport(1)': 'AEW2816'
};

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  try {
    console.log('Uploading photos to S3 and linking to claims...\n');
    
    for (const [prefix, vehicleReg] of Object.entries(photoToVehicle)) {
      console.log(`\nProcessing ${vehicleReg}...`);
      
      // Find the claim with this vehicle registration
      const [claims] = await conn.execute(
        'SELECT id, claim_number FROM claims WHERE vehicle_registration = ?',
        [vehicleReg]
      );
      
      if (claims.length === 0) {
        console.log(`  ⚠️  No claim found for vehicle ${vehicleReg}`);
        continue;
      }
      
      const claim = claims[0];
      console.log(`  Found claim: ${claim.claim_number}`);
      
      // Upload photos for this vehicle
      const photoUrls = [];
      for (let i = 1; i <= 3; i++) {
        const photoFile = `${photoDir}/${prefix}_photo_${i}.jpg`;
        try {
          console.log(`  Uploading photo ${i}...`);
          const result = execSync(`manus-upload-file "${photoFile}"`, { encoding: 'utf-8' });
          const url = result.trim();
          photoUrls.push(url);
          console.log(`    ✓ Uploaded: ${url}`);
        } catch (error) {
          console.log(`    ⚠️  Photo ${i} not found or upload failed`);
        }
      }
      
      if (photoUrls.length > 0) {
        // Update claim with photo URLs
        await conn.execute(
          'UPDATE claims SET damage_photos = ? WHERE id = ?',
          [JSON.stringify(photoUrls), claim.id]
        );
        console.log(`  ✓ Updated claim with ${photoUrls.length} photos`);
      }
    }
    
    console.log('\n✅ Photo upload and linking complete!');
    
  } finally {
    await conn.end();
  }
}

main().catch(console.error);
