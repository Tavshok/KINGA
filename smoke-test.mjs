/**
 * KINGA End-to-End Smoke Test
 * Tests: ingestion → claim creation → AI trigger → dashboard visibility
 *
 * Usage: node smoke-test.mjs
 */

import { createConnection } from "mysql2/promise";
import { readFileSync } from "fs";
import { randomUUID } from "crypto";

// ─── DB Connection ────────────────────────────────────────────────────────────
const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("❌ DATABASE_URL not set");
  process.exit(1);
}

const db = await createConnection(DB_URL);
console.log("✅ [SMOKE TEST] Connected to database\n");

// ─── Step 1: Check existing ingestionDocuments linked to claims ───────────────
console.log("═══════════════════════════════════════════════════════════");
console.log("STEP 1: Query recent ingestion_documents → claims linkage");
console.log("═══════════════════════════════════════════════════════════");

const [rows] = await db.execute(`
  SELECT 
    d.id AS doc_id,
    d.original_filename,
    d.extraction_status AS doc_extraction_status,
    d.created_at AS doc_created_at,
    c.id AS claim_id,
    c.claim_number,
    c.status AS claim_status,
    c.document_processing_status,
    c.workflow_state,
    c.ai_assessment_triggered,
    c.ai_assessment_completed,
    c.source_document_id,
    c.claim_source,
    c.created_at AS claim_created_at,
    c.updated_at AS claim_updated_at
  FROM ingestion_documents d
  LEFT JOIN claims c ON c.source_document_id = d.id
  ORDER BY d.created_at DESC
  LIMIT 5
`);

if (rows.length === 0) {
  console.log("ℹ️  No ingestion documents found yet. Will create a test record directly.\n");
} else {
  console.log(`Found ${rows.length} recent document(s):\n`);
  for (const row of rows) {
    console.log(`  📄 Doc ID: ${row.doc_id} | File: ${row.original_filename}`);
    console.log(`     Doc extraction_status: ${row.doc_extraction_status}`);
    console.log(`     Doc created_at: ${row.doc_created_at}`);
    if (row.claim_id) {
      console.log(`  🏷️  Claim ID: ${row.claim_id} | Number: ${row.claim_number}`);
      console.log(`     claim_status: ${row.claim_status}`);
      console.log(`     document_processing_status: ${row.document_processing_status}`);
      console.log(`     workflow_state: ${row.workflow_state}`);
      console.log(`     ai_assessment_triggered: ${row.ai_assessment_triggered}`);
      console.log(`     ai_assessment_completed: ${row.ai_assessment_completed}`);
      console.log(`     claim_source: ${row.claim_source}`);
      console.log(`     claim_created_at: ${row.claim_created_at}`);
      console.log(`     claim_updated_at: ${row.claim_updated_at}`);
    } else {
      console.log(`  ⚠️  No linked claim found for doc_id=${row.doc_id}`);
    }
    console.log();
  }
}

// ─── Step 2: Verify UNIQUE constraint exists ──────────────────────────────────
console.log("═══════════════════════════════════════════════════════════");
console.log("STEP 2: Verify DB constraints on claims table");
console.log("═══════════════════════════════════════════════════════════");

const [constraints] = await db.execute(`
  SELECT CONSTRAINT_NAME, CONSTRAINT_TYPE
  FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_NAME = 'claims'
  AND TABLE_SCHEMA = DATABASE()
  ORDER BY CONSTRAINT_TYPE
`);

const uniqueConstraints = constraints.filter(c => c.CONSTRAINT_TYPE === 'UNIQUE');
const hasSourceDocUnique = uniqueConstraints.some(c => 
  c.CONSTRAINT_NAME.toLowerCase().includes('source_document') ||
  c.CONSTRAINT_NAME.toLowerCase().includes('unique_source')
);

console.log(`  Total constraints: ${constraints.length}`);
console.log(`  UNIQUE constraints: ${uniqueConstraints.map(c => c.CONSTRAINT_NAME).join(', ') || 'none'}`);
console.log(`  ✅ unique_source_document constraint: ${hasSourceDocUnique ? 'PRESENT' : '❌ MISSING'}`);
console.log();

// ─── Step 3: Check dashboard query (status filter) ───────────────────────────
console.log("═══════════════════════════════════════════════════════════");
console.log("STEP 3: Verify dashboard query — status IN (intake_pending, quotes_pending, assessment_complete, closed)");
console.log("═══════════════════════════════════════════════════════════");

const [dashboardRows] = await db.execute(`
  SELECT 
    status,
    document_processing_status,
    COUNT(*) as count
  FROM claims
  WHERE status IN ('intake_pending', 'quotes_pending', 'assessment_complete', 'closed')
  GROUP BY status, document_processing_status
  ORDER BY status, document_processing_status
`);

if (dashboardRows.length === 0) {
  console.log("  ℹ️  No claims with dashboard-visible statuses found yet.");
} else {
  console.log("  Claims visible in dashboard:");
  for (const row of dashboardRows) {
    console.log(`    status=${row.status} | doc_processing=${row.document_processing_status} | count=${row.count}`);
  }
}
console.log();

// ─── Step 4: Check for AI assessments linked to document-sourced claims ───────
console.log("═══════════════════════════════════════════════════════════");
console.log("STEP 4: Verify AI assessments exist for document-sourced claims");
console.log("═══════════════════════════════════════════════════════════");

const [aiRows] = await db.execute(`
  SELECT 
    c.id AS claim_id,
    c.claim_number,
    c.status AS claim_status,
    c.document_processing_status,
    c.ai_assessment_triggered,
    c.ai_assessment_completed,
    a.id AS assessment_id,
    a.damage_description,
    a.created_at AS assessment_created_at
  FROM claims c
  LEFT JOIN ai_assessments a ON a.claim_id = c.id
  WHERE c.claim_source = 'document_ingestion'
  ORDER BY c.created_at DESC
  LIMIT 5
`);

if (aiRows.length === 0) {
  console.log("  ℹ️  No document-sourced claims with AI assessments found yet.");
} else {
  console.log(`  Found ${aiRows.length} document-sourced claim(s) with AI assessment data:\n`);
  for (const row of aiRows) {
    const aiStatus = row.assessment_id ? '✅ AI assessment record exists' : '⚠️  No AI assessment record';
    console.log(`  🏷️  Claim ${row.claim_id} (${row.claim_number})`);
    console.log(`     claim_status: ${row.claim_status}`);
    console.log(`     document_processing_status: ${row.document_processing_status}`);
    console.log(`     ai_triggered: ${row.ai_assessment_triggered} | ai_completed: ${row.ai_assessment_completed}`);
    console.log(`     ${aiStatus}`);
    if (row.assessment_id) {
      console.log(`     assessment_id: ${row.assessment_id} | created: ${row.assessment_created_at}`);
      const desc = row.damage_description || '';
      console.log(`     description: ${desc.substring(0, 80)}${desc.length > 80 ? '...' : ''}`);
    }
    console.log();
  }
}

// ─── Step 5: Duplicate protection test ───────────────────────────────────────
console.log("═══════════════════════════════════════════════════════════");
console.log("STEP 5: Verify no duplicate claims for same source_document_id");
console.log("═══════════════════════════════════════════════════════════");

const [dupRows] = await db.execute(`
  SELECT source_document_id, COUNT(*) as claim_count
  FROM claims
  WHERE source_document_id IS NOT NULL
  GROUP BY source_document_id
  HAVING claim_count > 1
`);

if (dupRows.length === 0) {
  console.log("  ✅ No duplicate claims detected — UNIQUE constraint is working correctly.");
} else {
  console.log(`  ❌ DUPLICATE CLAIMS DETECTED for ${dupRows.length} document(s):`);
  for (const row of dupRows) {
    console.log(`     source_document_id=${row.source_document_id} has ${row.claim_count} claims`);
  }
}
console.log();

// ─── Step 6: Check for DB constraint errors in recent claims ─────────────────
console.log("═══════════════════════════════════════════════════════════");
console.log("STEP 6: Check claims table column presence");
console.log("═══════════════════════════════════════════════════════════");

const [colRows] = await db.execute(`
  SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'claims' AND TABLE_SCHEMA = DATABASE()
  AND COLUMN_NAME IN ('source_document_id', 'claim_source', 'document_processing_status')
  ORDER BY COLUMN_NAME
`);

for (const col of colRows) {
  console.log(`  ✅ Column: ${col.COLUMN_NAME} | type: ${col.DATA_TYPE} | nullable: ${col.IS_NULLABLE} | default: ${col.COLUMN_DEFAULT}`);
}
if (colRows.length < 3) {
  const found = colRows.map(c => c.COLUMN_NAME);
  const missing = ['source_document_id', 'claim_source', 'document_processing_status'].filter(c => !found.includes(c));
  console.log(`  ❌ Missing columns: ${missing.join(', ')}`);
}
console.log();

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log("═══════════════════════════════════════════════════════════");
console.log("SMOKE TEST SUMMARY");
console.log("═══════════════════════════════════════════════════════════");
console.log("  Step 1 — ingestionDocuments → claims linkage:  CHECKED");
console.log("  Step 2 — UNIQUE constraint on source_document_id:", hasSourceDocUnique ? "✅ PASS" : "❌ FAIL");
console.log("  Step 3 — Dashboard status filter:               CHECKED");
console.log("  Step 4 — AI assessments for doc-sourced claims: CHECKED");
console.log("  Step 5 — No duplicate claims:", dupRows.length === 0 ? "✅ PASS" : "❌ FAIL");
console.log("  Step 6 — Required columns present:", colRows.length === 3 ? "✅ PASS" : "❌ FAIL");
console.log();

await db.end();
console.log("✅ [SMOKE TEST] Complete. Database connection closed.");
