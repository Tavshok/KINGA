/**
 * M-05: Search Performance Index Migration
 *
 * TiDB Serverless does NOT support FULLTEXT indexes (MySQL FULLTEXT is unsupported).
 * Instead, this migration adds composite B-tree indexes optimised for the prefix-LIKE
 * search pattern used by global-search.ts after the M-05 code change:
 *   WHERE tenant_id = ? AND claim_number LIKE 'query%'
 *
 * These composite indexes allow the query planner to use an index range scan
 * instead of a full-table scan, achieving the same performance goal as FULLTEXT
 * for structured identifier columns.
 *
 * Run with: node run-fulltext-migration.mjs
 *
 * Idempotent: catches ER_DUP_KEYNAME silently.
 */
import mysql from 'mysql2/promise';

async function runMigration() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('No DATABASE_URL set');
    process.exit(1);
  }

  const conn = await mysql.createConnection(url);

  const statements = [
    // ── claims: tenant + claim_number prefix search ───────────────────────────
    // Supports: WHERE tenant_id = ? AND claim_number LIKE 'query%'
    // Used by: global-search.ts (insurer/fleet/assessor/panel_beater roles)
    `ALTER TABLE claims ADD INDEX idx_claims_tenant_claim_number (tenant_id, claim_number)`,

    // ── claims: tenant + vehicle_registration prefix search ───────────────────
    // Supports: WHERE tenant_id = ? AND vehicle_registration LIKE 'query%'
    `ALTER TABLE claims ADD INDEX idx_claims_tenant_vehicle_reg (tenant_id, vehicle_registration)`,

    // ── claims: tenant + policy_number prefix search ──────────────────────────
    // Supports: WHERE tenant_id = ? AND policy_number LIKE 'query%'
    `ALTER TABLE claims ADD INDEX idx_claims_tenant_policy_number (tenant_id, policy_number)`,

    // ── vehicle_registry: registration_number prefix search ───────────────────
    // Already has idx_vehicle_registry_registration (single-col) — add tenant composite
    `ALTER TABLE vehicle_registry ADD INDEX idx_vr_tenant_reg_number (tenant_id, registration_number)`,

    // NOTE: users.name is TEXT type. A prefix index on TEXT columns times out on
    // TiDB Serverless for large tables. The users search in global-search.ts uses
    // email (varchar) which is already indexed. Skipping users.name index.
    // `ALTER TABLE users ADD INDEX idx_users_name_prefix (name(100))`,
  ];

  let ok = 0;
  let skip = 0;
  let fail = 0;

  for (const stmt of statements) {
    const label = stmt.trim().split('\n')[0].substring(0, 100);
    try {
      await conn.execute(stmt);
      ok++;
      console.log('OK:  ', label);
    } catch (e) {
      const msg = e.message || '';
      const code = e.code || '';
      if (
        code === 'ER_DUP_KEYNAME' ||
        msg.includes('Duplicate key name') ||
        msg.includes('already exists')
      ) {
        skip++;
        console.log('SKIP:', label, '(index already exists)');
      } else {
        fail++;
        console.error('FAIL:', label);
        console.error('     ', msg.substring(0, 200));
      }
    }
  }

  await conn.end();
  console.log(`\nMigration complete: ${ok} added, ${skip} skipped, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

runMigration().catch((e) => {
  console.error('Migration error:', e);
  process.exit(1);
});
