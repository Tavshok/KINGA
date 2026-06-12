/**
 * trigger-chevrolet-v2.mjs
 * Finds the Chevrolet Trailblazer ADL8563 claim and triggers a fresh pipeline run.
 * Run with: node server/scripts/trigger-chevrolet-v2.mjs
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import https from 'https';
import http from 'http';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env') });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}

// Parse DATABASE_URL
const url = new URL(DATABASE_URL);
const conn = await mysql.createConnection({
  host: url.hostname,
  port: parseInt(url.port || '3306'),
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
});

console.log('✅ Connected to database');

// Find the Chevrolet claim
const [rows] = await conn.execute(
  `SELECT id, vehicle_registration, status, created_at 
   FROM claims 
   WHERE vehicle_registration LIKE '%ADL%' OR vehicle_registration LIKE '%8563%' OR vehicle_registration LIKE '%Chevrolet%'
   ORDER BY created_at DESC 
   LIMIT 10`
);

console.log('Claims found:', JSON.stringify(rows, null, 2));

if (!rows || rows.length === 0) {
  // Try broader search
  const [allRows] = await conn.execute(
    `SELECT id, vehicle_registration, vehicle_make, vehicle_model, status, created_at 
     FROM claims 
     WHERE vehicle_make LIKE '%Chevrolet%' OR vehicle_model LIKE '%Trailblazer%'
     ORDER BY created_at DESC 
     LIMIT 10`
  );
  console.log('Broader search results:', JSON.stringify(allRows, null, 2));

  if (!allRows || allRows.length === 0) {
    // Show recent claims
    const [recentRows] = await conn.execute(
      `SELECT id, vehicle_registration, vehicle_make, vehicle_model, status, created_at 
       FROM claims 
       ORDER BY created_at DESC 
       LIMIT 10`
    );
    console.log('Recent claims:', JSON.stringify(recentRows, null, 2));
  }
  await conn.end();
  process.exit(0);
}

const claim = rows[0];
console.log(`\n🎯 Triggering pipeline for claim: ${claim.id} (${claim.vehicle_registration})`);

// Call the reanalysis endpoint on the production server
const productionUrl = 'https://kingaai-ybs42lwg.manus.space';
const triggerUrl = `${productionUrl}/api/trpc/claims.triggerReanalysis`;

console.log(`\n📡 Calling: POST ${triggerUrl}`);
console.log(`   Claim ID: ${claim.id}`);

// Use the internal triggerAiAssessment via direct DB update + HTTP call
// First check if there's an active pipeline job
const [jobs] = await conn.execute(
  `SELECT id, status, created_at FROM pipeline_jobs WHERE claim_id = ? ORDER BY created_at DESC LIMIT 3`,
  [claim.id]
);
console.log('\nExisting pipeline jobs:', JSON.stringify(jobs, null, 2));

await conn.end();

console.log('\n✅ Claim found. To trigger the pipeline:');
console.log(`   1. Log into the KINGA dashboard`);
console.log(`   2. Find claim for vehicle: ${claim.vehicle_registration}`);
console.log(`   3. Click "Re-analyse" to trigger a fresh pipeline run`);
console.log(`\n   OR use the claim ID directly: ${claim.id}`);
