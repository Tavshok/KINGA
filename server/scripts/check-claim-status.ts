import 'dotenv/config';
import { getDb } from '../db';
import { aiAssessments, claims } from '../../drizzle/schema';
import { eq, desc } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.log('DB NULL - database not available'); process.exit(1); }

  // Find the claim by claim_number
  const claimRows = await db.select({
    id: claims.id,
    claimNumber: claims.claimNumber,
    status: claims.status,
  }).from(claims)
    .where(eq(claims.claimNumber, 'DOC-20260602-0185BC72'))
    .limit(1);

  if (claimRows.length === 0) {
    console.log('Claim DOC-20260602-0185BC72 not found');
    // Also check by ID
    const byId = await db.select({
      id: claims.id,
      claimNumber: claims.claimNumber,
      status: claims.status,
    }).from(claims)
      .where(eq(claims.id, 6990001))
      .limit(1);
    console.log('By ID 6990001:', JSON.stringify(byId, null, 2));
    process.exit(0);
  }

  const claim = claimRows[0];
  console.log('CLAIM:', JSON.stringify(claim, null, 2));

  // Get latest assessments — use raw SQL to avoid Drizzle null-column issue
  const { sql } = await import('drizzle-orm');
  const r = await db.execute(sql`SELECT id, claim_id, status, created_at, updated_at FROM ai_assessments WHERE claim_id = ${claim.id} ORDER BY created_at DESC LIMIT 5`);
  const rows = (r as any)[0] || r;
  console.log('ASSESSMENTS:', JSON.stringify(Array.isArray(rows) ? rows : [rows], null, 2));
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
