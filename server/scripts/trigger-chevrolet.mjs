/**
 * trigger-chevrolet.mjs
 * Finds the Chevrolet Trailblazer ADL8563 claim and triggers a fresh pipeline run.
 * Clears cached damagePhotos so the pipeline re-extracts from PDF.
 *
 * Usage: node --loader tsx/esm server/scripts/trigger-chevrolet.mjs
 */

import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const pool = mysql.createPool({
  uri: DATABASE_URL,
  connectionLimit: 2,
  connectTimeout: 30000,
});

async function run() {
  const conn = await pool.getConnection();
  try {
    // Find the Chevrolet ADL8563 claim
    const [rows] = await conn.execute(
      "SELECT id, claim_number, vehicle_registration, kinga_ref, source_document_id, damage_photos FROM claims WHERE vehicle_registration LIKE '%ADL%' LIMIT 5"
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      console.log('No ADL claims found. Listing recent claims...');
      const [recent] = await conn.execute(
        "SELECT id, claim_number, vehicle_registration, kinga_ref FROM claims ORDER BY created_at DESC LIMIT 10"
      );
      console.log('Recent claims:', JSON.stringify(recent, null, 2));
      return;
    }

    console.log('Found claims:');
    for (const row of rows) {
      const r = row;
      const photos = r.damage_photos ? JSON.parse(r.damage_photos) : [];
      console.log(`  ID=${r.id} | Reg=${r.vehicle_registration} | ClaimNo=${r.claim_number} | KingaRef=${r.kinga_ref} | SourceDocId=${r.source_document_id} | CachedPhotos=${photos.length}`);
    }

    const claim = rows[0];
    const claimId = claim.id;

    // Clear cached damage photos so the pipeline re-extracts from PDF
    await conn.execute(
      "UPDATE claims SET damage_photos = NULL, updated_at = NOW() WHERE id = ?",
      [claimId]
    );
    console.log(`\nCleared cached damagePhotos for claim ID ${claimId}`);

    // Trigger the pipeline via the HTTP API
    const baseUrl = process.env.PIPELINE_BASE_URL || 'http://localhost:3000';
    console.log(`\nTriggering pipeline via API at ${baseUrl}...`);

    // Use the internal trigger endpoint
    const resp = await fetch(`${baseUrl}/api/trpc/claims.triggerAnalysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ json: { claimId } }),
    });

    if (resp.ok) {
      const body = await resp.json().catch(() => ({}));
      console.log('Pipeline triggered successfully:', JSON.stringify(body, null, 2));
    } else {
      console.log(`API response: ${resp.status} ${resp.statusText}`);
      const text = await resp.text().catch(() => '');
      console.log('Body:', text.slice(0, 500));
    }

  } finally {
    conn.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
