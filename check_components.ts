import { getDb } from './server/db';
import { sql } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.error('No DB'); process.exit(1); }

  // Check if components_json is ever non-null across all claims
  const r1 = await db.execute(sql`SELECT COUNT(*) as total, SUM(CASE WHEN components_json IS NOT NULL AND components_json != 'null' AND components_json != '[]' THEN 1 ELSE 0 END) as has_components FROM panel_beater_quotes`);
  console.log('panel_beater_quotes totals:', JSON.stringify((r1 as any).rows?.[0]));

  // Check a sample of rows with non-null components_json
  const r2 = await db.execute(sql`SELECT id, claim_id, panel_beater_name, total_amount_cents, JSON_LENGTH(components_json) as item_count FROM panel_beater_quotes WHERE components_json IS NOT NULL AND components_json != 'null' AND components_json != '[]' LIMIT 5`);
  console.log('Sample rows with components:', JSON.stringify((r2 as any).rows));

  // Check the panel_beater_quotes schema
  const r3 = await db.execute(sql`DESCRIBE panel_beater_quotes`);
  console.log('Schema:', JSON.stringify((r3 as any).rows?.map((r: any) => ({ field: r.Field, type: r.Type }))));

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
