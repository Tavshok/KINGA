#!/usr/bin/env node
/**
 * Foreign Key Constraint Checker
 * Validates all foreign key constraints in the database
 */

const { getDb } = require('../../server/db');

async function checkForeignKeys() {
  const db = getDb();
  
  console.log('[Foreign Key Checker] Starting foreign key validation...');
  
  const violations = [];
  
  // Check claims -> users (claimant_id)
  const claimantViolations = await db.execute(`
    SELECT c.id, c.claimant_id
    FROM claims c
    LEFT JOIN users u ON c.claimant_id = u.id
    WHERE c.claimant_id IS NOT NULL AND u.id IS NULL
  `);
  
  if (claimantViolations.length > 0) {
    violations.push({
      table: 'claims',
      column: 'claimant_id',
      references: 'users.id',
      violation_count: claimantViolations.length,
      sample_ids: claimantViolations.slice(0, 5).map(r => r.id)
    });
  }
  
  // Check claims -> users (assessor_id)
  const assessorViolations = await db.execute(`
    SELECT c.id, c.assessor_id
    FROM claims c
    LEFT JOIN users u ON c.assessor_id = u.id
    WHERE c.assessor_id IS NOT NULL AND u.id IS NULL
  `);
  
  if (assessorViolations.length > 0) {
    violations.push({
      table: 'claims',
      column: 'assessor_id',
      references: 'users.id',
      violation_count: assessorViolations.length,
      sample_ids: assessorViolations.slice(0, 5).map(r => r.id)
    });
  }
  
  // Check panel_beater_quotes -> claims
  const quoteViolations = await db.execute(`
    SELECT q.id, q.claim_id
    FROM panel_beater_quotes q
    LEFT JOIN claims c ON q.claim_id = c.id
    WHERE q.claim_id IS NOT NULL AND c.id IS NULL
  `);
  
  if (quoteViolations.length > 0) {
    violations.push({
      table: 'panel_beater_quotes',
      column: 'claim_id',
      references: 'claims.id',
      violation_count: quoteViolations.length,
      sample_ids: quoteViolations.slice(0, 5).map(r => r.id)
    });
  }
  
  // Check fraud_indicators -> claims
  const fraudViolations = await db.execute(`
    SELECT fi.id, fi.claim_id
    FROM fraud_indicators fi
    LEFT JOIN claims c ON fi.claim_id = c.id
    WHERE fi.claim_id IS NOT NULL AND c.id IS NULL
  `);
  
  if (fraudViolations.length > 0) {
    violations.push({
      table: 'fraud_indicators',
      column: 'claim_id',
      references: 'claims.id',
      violation_count: fraudViolations.length,
      sample_ids: fraudViolations.slice(0, 5).map(r => r.id)
    });
  }
  
  // Check claim_images -> claims
  const imageViolations = await db.execute(`
    SELECT ci.id, ci.claim_id
    FROM claim_images ci
    LEFT JOIN claims c ON ci.claim_id = c.id
    WHERE ci.claim_id IS NOT NULL AND c.id IS NULL
  `);
  
  if (imageViolations.length > 0) {
    violations.push({
      table: 'claim_images',
      column: 'claim_id',
      references: 'claims.id',
      violation_count: imageViolations.length,
      sample_ids: imageViolations.slice(0, 5).map(r => r.id)
    });
  }
  
  const totalViolations = violations.reduce((sum, v) => sum + v.violation_count, 0);
  
  const output = {
    violation_count: totalViolations,
    violations: violations
  };
  
  console.log('[Foreign Key Checker] Results:', JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output));
  
  return output;
}

// Run if called directly
if (require.main === module) {
  checkForeignKeys()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('[Foreign Key Checker] Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { checkForeignKeys };
