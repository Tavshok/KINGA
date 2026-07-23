import { getRawPool } from './server/db';

async function main() {
  const pool = await getRawPool();
  if (!pool) { console.error('No pool'); process.exit(1); }

  const conn = await pool.getConnection();
  try {
    // Total rows and how many have components_json populated
    const [r1] = await conn.execute(`SELECT COUNT(*) as total, SUM(CASE WHEN components_json IS NOT NULL AND CAST(components_json AS CHAR) NOT IN ('null','[]','{}','') THEN 1 ELSE 0 END) as has_components FROM panel_beater_quotes`);
    console.log('Totals:', JSON.stringify((r1 as any)[0]));

    // Sample rows with non-null components_json
    const [r2] = await conn.execute(`SELECT id, claim_id, panel_beater_name, total_amount_cents FROM panel_beater_quotes LIMIT 10`);
    console.log('Sample rows:', JSON.stringify(r2));

    // Check components_json column type
    const [r3] = await conn.execute(`DESCRIBE panel_beater_quotes`);
    console.log('Schema:', JSON.stringify((r3 as any).map((r: any) => ({ field: r.Field, type: r.Type }))));

    // Check a specific row's components_json raw value
    const [r4] = await conn.execute(`SELECT id, CAST(components_json AS CHAR) as comp_raw FROM panel_beater_quotes WHERE claim_id = 8880001 LIMIT 3`);
    for (const row of (r4 as any)) {
      const raw = row.comp_raw;
      console.log(`Quote ${row.id}: components_json raw = ${raw === null ? 'NULL' : raw === '' ? 'EMPTY STRING' : raw.substring(0, 200)}`);
    }
  } finally {
    conn.release();
    pool.end();
  }
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
