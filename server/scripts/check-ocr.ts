import "dotenv/config";
import { getDb } from '../db';
import { sql } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  const rows = await db.execute(sql`
    SELECT 
      LEFT(stage2_raw_ocr_text, 4000) AS ocr_start,
      LENGTH(stage2_raw_ocr_text) AS ocr_length,
      id,
      created_at
    FROM ai_assessments 
    WHERE claim_id = 10719902 
    ORDER BY created_at DESC 
    LIMIT 1
  `);
  const row = rows[0] as any;
  console.log('Assessment ID:', row.id);
  console.log('Created at:', row.created_at);
  console.log('OCR length:', row.ocr_length);
  console.log('\n=== OCR TEXT START ===\n');
  console.log(row.ocr_start);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
