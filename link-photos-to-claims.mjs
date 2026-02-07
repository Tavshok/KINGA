#!/usr/bin/env node
/**
 * Link uploaded damage photos to corresponding claims in database
 */

import mysql from 'mysql2/promise';

const photoMappings = [
  {
    registration: 'AEW2816',
    photos: [
      'https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/SjUkQXqCIdGidqMi.jpg',
      'https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/WoxujSsHCGRHwdsB.jpg',
      'https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/JVPevhHSUymfOTxT.jpg'
    ]
  },
  {
    registration: 'ACX8237',
    photos: [
      'https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/lANRIeaiyJQFVldb.jpg',
      'https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/rbtTkmWbfFmsNFdr.jpg',
      'https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/HjvJgphQNjzMoGMy.jpg'
    ]
  },
  {
    registration: 'AFX3048',
    photos: [
      'https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/wFGGUCLRGewPKzDR.jpg',
      'https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/wOahyQuiUXlzEZKD.jpg',
      'https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/DXoHXQdMfPsGXNZW.jpg'
    ]
  }
];

async function main() {
  console.log('🔗 Linking damage photos to claims...\n');

  const connection = await mysql.createConnection(process.env.DATABASE_URL);

  let linked = 0;

  for (const mapping of photoMappings) {
    try {
      // Find claim by registration
      const [claims] = await connection.query(
        'SELECT id, vehicle_registration FROM claims WHERE vehicle_registration = ?',
        [mapping.registration]
      );

      if (claims.length === 0) {
        console.log(`⚠️  No claim found for registration ${mapping.registration}`);
        continue;
      }

      const claim = claims[0];
      const photosJson = JSON.stringify(mapping.photos);

      // Update claim with damage photos
      await connection.query(
        'UPDATE claims SET damage_photos = ? WHERE id = ?',
        [photosJson, claim.id]
      );

      console.log(`✓ Linked ${mapping.photos.length} photos to claim ${claim.id} (${mapping.registration})`);
      linked++;
    } catch (error) {
      console.error(`❌ Error linking photos for ${mapping.registration}:`, error.message);
    }
  }

  await connection.end();

  console.log(`\n=== Photo Linking Complete ===`);
  console.log(`✓ Successfully linked photos to ${linked} claims`);
  console.log(`\n🎉 Damage photos are now accessible in the system!`);
}

main().catch(console.error);
