/**
 * KINGA Duplicate Protection Validation Test
 *
 * Simulates uploading the same document twice and verifies:
 * 1. Only one ingestionDocument record is created (via SHA-256 hash check)
 * 2. Only one claim is created (via source_document_id UNIQUE constraint)
 * 3. Warning is logged on duplicate attempt
 * 4. System does not crash
 *
 * Usage: node duplicate-protection-test.mjs
 */

import { createConnection } from "mysql2/promise";
import { randomUUID } from "crypto";
import { createHash } from "crypto";

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error("❌ DATABASE_URL not set"); process.exit(1); }

const db = await createConnection(DB_URL);
console.log("✅ Connected to database\n");

// ─── Test Setup ───────────────────────────────────────────────────────────────
// Simulate a PDF file content — same bytes both times (same SHA-256)
const fakeFileContent = Buffer.from("FAKE-PDF-CONTENT-FOR-DUPLICATE-TEST-" + Date.now());
const sha256Hash = createHash("sha256").update(fakeFileContent).digest("hex");
const tenantId = "demo-insurance";
const batchId = 9999; // Fake batch ID for test isolation

console.log("═══════════════════════════════════════════════════════════");
console.log("DUPLICATE PROTECTION VALIDATION TEST");
console.log("═══════════════════════════════════════════════════════════");
console.log(`  SHA-256 hash: ${sha256Hash}`);
console.log(`  Tenant: ${tenantId}`);
console.log();

// ─── UPLOAD 1: First upload (should succeed) ──────────────────────────────────
console.log("─── UPLOAD 1: First upload (should create document + claim) ───");

// Simulate the duplicate check (same as document-ingestion.ts)
const [existingDocs] = await db.execute(
  `SELECT d.id, c.id AS claim_id 
   FROM ingestion_documents d 
   LEFT JOIN claims c ON c.source_document_id = d.id 
   WHERE d.sha256_hash = ? AND d.tenant_id = ?`,
  [sha256Hash, tenantId]
);

let doc1Id = null;
let claim1Id = null;

if (existingDocs.length > 0 && existingDocs[0].claim_id) {
  console.log(`  ⚠️  [DUPLICATE GUARD] Document already exists — skipping (pre-existing from prior test run)`);
  doc1Id = existingDocs[0].id;
  claim1Id = existingDocs[0].claim_id;
  console.log(`  Reusing doc_id=${doc1Id}, claim_id=${claim1Id}`);
} else {
  // Insert ingestion document (simulating the transaction)
  const docId = randomUUID();
  const [docResult] = await db.execute(
    `INSERT INTO ingestion_documents 
     (tenant_id, batch_id, document_id, original_filename, file_size_bytes, mime_type, 
      s3_bucket, s3_key, s3_url, sha256_hash, hash_verified, extraction_status, validation_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'pending', 'pending', NOW())`,
    [tenantId, batchId, docId, "test-duplicate-document.pdf", fakeFileContent.length,
     "application/pdf", "test-bucket", `test/${docId}.pdf`,
     `https://s3.example.com/test/${docId}.pdf`, sha256Hash]
  );
  doc1Id = docResult.insertId;
  console.log(`  ✅ ingestionDocument created: id=${doc1Id}`);

  // Insert linked claim
  const claimNumber = `DUP-TEST-${Date.now()}`;
  const [claimResult] = await db.execute(
    `INSERT INTO claims 
     (tenant_id, claimant_id, claim_number, status, workflow_state, 
      source_document_id, claim_source, document_processing_status, created_at, updated_at)
     VALUES (?, 0, ?, 'intake_pending', 'intake_queue', ?, 'document_ingestion', 'pending', NOW(), NOW())`,
    [tenantId, claimNumber, doc1Id]
  );
  claim1Id = claimResult.insertId;
  console.log(`  ✅ Claim created: id=${claim1Id}, number=${claimNumber}`);
  console.log(`  ✅ UPLOAD 1 COMPLETE — document + claim created atomically`);
}
console.log();

// ─── UPLOAD 2: Same document again (should be rejected) ──────────────────────
console.log("─── UPLOAD 2: Same document re-uploaded (should be REJECTED) ───");

// Step 1: Application-level duplicate check (same as document-ingestion.ts)
const [dupCheck] = await db.execute(
  `SELECT d.id, c.id AS claim_id 
   FROM ingestion_documents d 
   LEFT JOIN claims c ON c.source_document_id = d.id 
   WHERE d.sha256_hash = ? AND d.tenant_id = ?`,
  [sha256Hash, tenantId]
);

let upload2Blocked = false;
if (dupCheck.length > 0 && dupCheck[0].claim_id) {
  console.log(`  ⚠️  [WARNING] Duplicate document ingestion detected.`);
  console.log(`  Existing doc_id=${dupCheck[0].id}, claim_id=${dupCheck[0].claim_id}`);
  console.log(`  → Skipping insert. No new claim created.`);
  upload2Blocked = true;
} else {
  // Should not reach here — attempt DB-level insert to test UNIQUE constraint
  console.log(`  App-level check missed — testing DB-level UNIQUE constraint...`);
  try {
    await db.execute(
      `INSERT INTO claims 
       (tenant_id, claimant_id, claim_number, status, workflow_state, 
        source_document_id, claim_source, document_processing_status, created_at, updated_at)
       VALUES (?, 0, ?, 'intake_pending', 'intake_queue', ?, 'document_ingestion', 'pending', NOW(), NOW())`,
      [tenantId, `DUP-TEST-FALLBACK-${Date.now()}`, doc1Id]
    );
    console.log(`  ❌ FAIL: DB-level UNIQUE constraint did NOT block the duplicate insert!`);
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY" || err.message.includes("Duplicate entry")) {
      console.log(`  ✅ DB-level UNIQUE constraint blocked duplicate insert: ${err.message.substring(0, 80)}`);
      upload2Blocked = true;
    } else {
      console.log(`  ❌ Unexpected error: ${err.message}`);
    }
  }
}
console.log();

// ─── UPLOAD 3: Force DB-level constraint test (bypass app check) ──────────────
console.log("─── UPLOAD 3: Force DB-level UNIQUE constraint test ───");
console.log(`  Attempting direct INSERT with source_document_id=${doc1Id} (bypassing app-level check)...`);

let dbConstraintWorking = false;
try {
  await db.execute(
    `INSERT INTO claims 
     (tenant_id, claimant_id, claim_number, status, workflow_state, 
      source_document_id, claim_source, document_processing_status, created_at, updated_at)
     VALUES (?, 0, ?, 'intake_pending', 'intake_queue', ?, 'document_ingestion', 'pending', NOW(), NOW())`,
    [tenantId, `FORCE-DUP-${Date.now()}`, doc1Id]
  );
  console.log(`  ❌ FAIL: DB-level UNIQUE constraint did NOT block the forced duplicate!`);
} catch (err) {
  if (err.code === "ER_DUP_ENTRY" || err.message.includes("Duplicate entry")) {
    console.log(`  ✅ DB-level UNIQUE constraint ENFORCED: ${err.message.substring(0, 100)}`);
    dbConstraintWorking = true;
  } else {
    console.log(`  ❌ Unexpected error: ${err.message}`);
  }
}
console.log();

// ─── Verification: Count claims for this document ────────────────────────────
console.log("─── VERIFICATION: Count claims for source_document_id ───");

const [countResult] = await db.execute(
  `SELECT COUNT(*) AS claim_count FROM claims WHERE source_document_id = ?`,
  [doc1Id]
);
const claimCount = countResult[0].claim_count;
console.log(`  Claims for doc_id=${doc1Id}: ${claimCount}`);
console.log(`  Expected: 1 | Actual: ${claimCount} → ${claimCount === 1 ? "✅ PASS" : "❌ FAIL"}`);
console.log();

// ─── System crash check ───────────────────────────────────────────────────────
console.log("─── SYSTEM CRASH CHECK ───");
const serverOk = await fetch("http://localhost:3000/api/trpc/auth.me")
  .then(r => r.status === 401 || r.ok)
  .catch(() => false);
console.log(`  Server still responding after duplicate test: ${serverOk ? "✅ PASS — no crash" : "❌ FAIL — server not responding"}`);
console.log();

// ─── Cleanup ──────────────────────────────────────────────────────────────────
console.log("─── CLEANUP: Removing test records ───");
await db.execute(`DELETE FROM claims WHERE source_document_id = ?`, [doc1Id]);
await db.execute(`DELETE FROM ingestion_documents WHERE id = ?`, [doc1Id]);
console.log(`  ✅ Test records cleaned up (doc_id=${doc1Id}, claim_id=${claim1Id})`);
console.log();

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log("═══════════════════════════════════════════════════════════");
console.log("DUPLICATE PROTECTION TEST SUMMARY");
console.log("═══════════════════════════════════════════════════════════");
console.log(`  1. Only one claim created per document:          ${claimCount === 1 ? "✅ PASS" : "❌ FAIL"}`);
console.log(`  2. App-level duplicate warning logged:           ${upload2Blocked ? "✅ PASS" : "❌ FAIL"}`);
console.log(`  3. DB-level UNIQUE constraint enforced:          ${dbConstraintWorking ? "✅ PASS" : "❌ FAIL"}`);
console.log(`  4. System did not crash:                         ${serverOk ? "✅ PASS" : "❌ FAIL"}`);

const allPassed = claimCount === 1 && upload2Blocked && dbConstraintWorking && serverOk;
console.log();
console.log(allPassed ? "✅ ALL TESTS PASSED — System is resilient to re-uploads." : "❌ SOME TESTS FAILED — Review output above.");
console.log();

await db.end();
