/**
 * KINGA Relational Integrity Audit
 * ingestionDocuments ↔ claims
 *
 * Checks:
 * 1. Total ingestionDocuments count
 * 2. Total claims WHERE claim_source = 'document_ingestion'
 * 3. 1:1 relationship verification
 * 4. Orphaned ingestionDocuments (no linked claim)
 * 5. Orphaned claims (claim_source='document_ingestion' but no source_document_id)
 * 6. Claims with source_document_id pointing to non-existent document
 * 7. Duplicate claims per source_document_id
 *
 * Usage: node integrity-audit.mjs
 */

import { createConnection } from "mysql2/promise";

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error("❌ DATABASE_URL not set"); process.exit(1); }

const db = await createConnection(DB_URL);
console.log("✅ Connected to database\n");

console.log("═══════════════════════════════════════════════════════════");
console.log("RELATIONAL INTEGRITY AUDIT: ingestionDocuments ↔ claims");
console.log(`Audit timestamp: ${new Date().toISOString()}`);
console.log("═══════════════════════════════════════════════════════════\n");

// ─── CHECK 1: Total counts ────────────────────────────────────────────────────
console.log("CHECK 1: Total record counts");
console.log("───────────────────────────────────────────────────────────");

const [[{ total_docs }]] = await db.execute(
  `SELECT COUNT(*) AS total_docs FROM ingestion_documents`
);
const [[{ total_doc_claims }]] = await db.execute(
  `SELECT COUNT(*) AS total_doc_claims FROM claims WHERE claim_source = 'document_ingestion'`
);
const [[{ total_claims_all }]] = await db.execute(
  `SELECT COUNT(*) AS total_claims_all FROM claims`
);

console.log(`  Total ingestion_documents:              ${total_docs}`);
console.log(`  Total claims (document_ingestion):      ${total_doc_claims}`);
console.log(`  Total claims (all sources):             ${total_claims_all}`);
console.log(`  Expected 1:1 ratio:                     ${total_docs === total_doc_claims ? "✅ MATCH" : `⚠️  MISMATCH (docs=${total_docs}, doc-claims=${total_doc_claims})`}`);
console.log();

// ─── CHECK 2: Orphaned ingestionDocuments (no linked claim) ───────────────────
console.log("CHECK 2: Orphaned ingestionDocuments (no linked claim)");
console.log("───────────────────────────────────────────────────────────");

const [orphanedDocs] = await db.execute(`
  SELECT 
    d.id AS doc_id,
    d.original_filename,
    d.tenant_id,
    d.extraction_status,
    d.created_at
  FROM ingestion_documents d
  LEFT JOIN claims c ON c.source_document_id = d.id
  WHERE c.id IS NULL
  ORDER BY d.created_at DESC
`);

if (orphanedDocs.length === 0) {
  console.log("  ✅ No orphaned ingestionDocuments found.");
} else {
  console.log(`  ⚠️  Found ${orphanedDocs.length} orphaned ingestionDocument(s):`);
  for (const doc of orphanedDocs) {
    console.log(`    doc_id=${doc.doc_id} | file="${doc.original_filename}" | tenant=${doc.tenant_id} | status=${doc.extraction_status} | created=${doc.created_at}`);
  }
}
console.log();

// ─── CHECK 3: Orphaned claims (document_ingestion source, no source_document_id) ─
console.log("CHECK 3: Claims with claim_source='document_ingestion' but NULL source_document_id");
console.log("───────────────────────────────────────────────────────────");

const [orphanedClaims] = await db.execute(`
  SELECT 
    c.id AS claim_id,
    c.claim_number,
    c.status,
    c.document_processing_status,
    c.created_at
  FROM claims c
  WHERE c.claim_source = 'document_ingestion'
    AND c.source_document_id IS NULL
  ORDER BY c.created_at DESC
`);

if (orphanedClaims.length === 0) {
  console.log("  ✅ No claims with missing source_document_id found.");
} else {
  console.log(`  ⚠️  Found ${orphanedClaims.length} claim(s) with NULL source_document_id:`);
  for (const claim of orphanedClaims) {
    console.log(`    claim_id=${claim.claim_id} | number=${claim.claim_number} | status=${claim.status} | created=${claim.created_at}`);
  }
}
console.log();

// ─── CHECK 4: Claims with source_document_id pointing to non-existent document ─
console.log("CHECK 4: Claims with source_document_id pointing to non-existent ingestionDocument");
console.log("───────────────────────────────────────────────────────────");

const [danglingClaims] = await db.execute(`
  SELECT 
    c.id AS claim_id,
    c.claim_number,
    c.source_document_id,
    c.status,
    c.created_at
  FROM claims c
  WHERE c.source_document_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM ingestion_documents d WHERE d.id = c.source_document_id
    )
  ORDER BY c.created_at DESC
`);

if (danglingClaims.length === 0) {
  console.log("  ✅ No dangling foreign key references found.");
} else {
  console.log(`  ⚠️  Found ${danglingClaims.length} claim(s) with dangling source_document_id:`);
  for (const claim of danglingClaims) {
    console.log(`    claim_id=${claim.claim_id} | number=${claim.claim_number} | source_document_id=${claim.source_document_id} | status=${claim.status}`);
  }
}
console.log();

// ─── CHECK 5: Duplicate claims per source_document_id ────────────────────────
console.log("CHECK 5: Duplicate claims per source_document_id (should be 0)");
console.log("───────────────────────────────────────────────────────────");

const [duplicateClaims] = await db.execute(`
  SELECT 
    c.source_document_id,
    COUNT(*) AS claim_count,
    GROUP_CONCAT(c.id ORDER BY c.id) AS claim_ids,
    GROUP_CONCAT(c.claim_number ORDER BY c.id) AS claim_numbers
  FROM claims c
  WHERE c.source_document_id IS NOT NULL
  GROUP BY c.source_document_id
  HAVING COUNT(*) > 1
`);

if (duplicateClaims.length === 0) {
  console.log("  ✅ No duplicate claims per source_document_id found.");
} else {
  console.log(`  ❌ Found ${duplicateClaims.length} source_document_id(s) with multiple claims:`);
  for (const dup of duplicateClaims) {
    console.log(`    source_document_id=${dup.source_document_id} | count=${dup.claim_count} | claim_ids=[${dup.claim_ids}] | numbers=[${dup.claim_numbers}]`);
  }
}
console.log();

// ─── CHECK 6: Full 1:1 mapping table ─────────────────────────────────────────
console.log("CHECK 6: Full 1:1 mapping — all ingestionDocuments with their linked claim");
console.log("───────────────────────────────────────────────────────────");

const [mappingTable] = await db.execute(`
  SELECT 
    d.id AS doc_id,
    d.original_filename,
    d.tenant_id,
    d.extraction_status AS doc_status,
    c.id AS claim_id,
    c.claim_number,
    c.status AS claim_status,
    c.document_processing_status,
    CASE WHEN c.id IS NULL THEN '❌ ORPHANED' ELSE '✅ LINKED' END AS link_status
  FROM ingestion_documents d
  LEFT JOIN claims c ON c.source_document_id = d.id
  ORDER BY d.id ASC
`);

console.log(`  ${"doc_id".padEnd(8)} ${"claim_id".padEnd(10)} ${"claim_number".padEnd(28)} ${"claim_status".padEnd(22)} ${"doc_proc_status".padEnd(18)} link`);
console.log(`  ${"─".repeat(100)}`);
for (const row of mappingTable) {
  const docId = String(row.doc_id).padEnd(8);
  const claimId = (row.claim_id ? String(row.claim_id) : "—").padEnd(10);
  const claimNum = (row.claim_number || "—").padEnd(28);
  const claimStatus = (row.claim_status || "—").padEnd(22);
  const docProc = (row.document_processing_status || "—").padEnd(18);
  console.log(`  ${docId} ${claimId} ${claimNum} ${claimStatus} ${docProc} ${row.link_status}`);
}
console.log();

// ─── SUMMARY ──────────────────────────────────────────────────────────────────
console.log("═══════════════════════════════════════════════════════════");
console.log("AUDIT SUMMARY");
console.log("═══════════════════════════════════════════════════════════");

const ratio1to1 = total_docs === total_doc_claims;
const noOrphanDocs = orphanedDocs.length === 0;
const noOrphanClaims = orphanedClaims.length === 0;
const noDanglingRefs = danglingClaims.length === 0;
const noDuplicates = duplicateClaims.length === 0;
const allClean = ratio1to1 && noOrphanDocs && noOrphanClaims && noDanglingRefs && noDuplicates;

console.log(`  1. 1:1 ratio (docs=${total_docs} == doc-claims=${total_doc_claims}):  ${ratio1to1 ? "✅ PASS" : "❌ FAIL"}`);
console.log(`  2. No orphaned ingestionDocuments:                    ${noOrphanDocs ? "✅ PASS" : `❌ FAIL (${orphanedDocs.length} orphans)`}`);
console.log(`  3. No claims with NULL source_document_id:            ${noOrphanClaims ? "✅ PASS" : `❌ FAIL (${orphanedClaims.length} records)`}`);
console.log(`  4. No dangling foreign key references:                ${noDanglingRefs ? "✅ PASS" : `❌ FAIL (${danglingClaims.length} records)`}`);
console.log(`  5. No duplicate claims per source_document_id:        ${noDuplicates ? "✅ PASS" : `❌ FAIL (${duplicateClaims.length} duplicates)`}`);
console.log();
console.log(allClean
  ? "✅ INTEGRITY AUDIT PASSED — No orphaned records. Relational integrity is intact."
  : "⚠️  INTEGRITY AUDIT FOUND DISCREPANCIES — Review items above.");
console.log();

await db.end();
