// @ts-nocheck
import { getDb } from '../server/db';
import { sql } from 'drizzle-orm';

async function run() {
  const db = await getDb();
  
  const t = (await db.execute(sql`SHOW TABLES LIKE '%line%'`))[0] as any[];
  console.log('LINE TABLES:', t.map((x:any) => Object.values(x)[0]).join(', '));
  
  const t2 = (await db.execute(sql`SHOW TABLES LIKE '%panel%'`))[0] as any[];
  console.log('PANEL TABLES:', t2.map((x:any) => Object.values(x)[0]).join(', '));
  
  const cols = (await db.execute(sql`SHOW COLUMNS FROM panel_beater_quotes`))[0] as any[];
  console.log('PBQ COLS:', cols.map((c:any) => c.Field).join(', '));
  
  const quotes = (await db.execute(sql`SELECT * FROM panel_beater_quotes WHERE claim_id = 6150002 LIMIT 3`))[0] as any[];
  console.log('QUOTES FOR 6150002:', quotes.length);
  if (quotes.length > 0) {
    console.log('QUOTE SAMPLE:', JSON.stringify(quotes[0]).substring(0, 400));
  }
  
  // Check stuck-assessment TS errors - look at lines 428-435, 486-492
  // These are Date assignment errors in stuck-assessment-recovery-job.ts
  
  process.exit(0);
}
run().catch(e => { console.error('ERR:', e.message); process.exit(1); });
