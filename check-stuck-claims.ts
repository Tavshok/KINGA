import { getRawPool } from './server/db';

async function main() {
  const pool = await getRawPool();
  if (!pool) { console.error('No DB pool'); process.exit(1); }

  const [rows] = await pool.execute(`
    SELECT c.id, c.claim_reference, c.status, c.created_at,
      (SELECT COUNT(*) FROM claim_documents WHERE claim_id = c.id) as doc_count
    FROM claims c
    WHERE c.status = 'pending'
    ORDER BY c.created_at DESC
    LIMIT 20
  `) as any;

  console.log('\nPending claims with doc counts:');
  (rows as any[]).forEach((c: any) => {
    const flag = Number(c.doc_count) === 0 ? '  ⚠️  NO DOCS' : '';
    const date = c.created_at ? new Date(c.created_at).toISOString() : 'unknown';
    console.log(`  ${c.claim_reference} | docs:${c.doc_count} | created:${date}${flag}`);
  });

  const noDocs = (rows as any[]).filter((c: any) => Number(c.doc_count) === 0);
  console.log(`\nClaims with 0 documents: ${noDocs.length}`);
  if (noDocs.length > 0) {
    console.log('Claims needing re-trigger:');
    noDocs.forEach((c: any) => console.log(`  ${c.claim_reference} (id:${c.id})`));
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
