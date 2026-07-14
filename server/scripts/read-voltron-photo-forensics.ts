import 'dotenv/config';
import { getDb } from '../db';
import { sql } from 'drizzle-orm';

async function main() {
  const db = (await getDb())!;
  const rows = await db.execute(sql`
    SELECT fraud_score_breakdown_json
    FROM ai_assessments WHERE claim_id = 8880001
    ORDER BY id DESC LIMIT 1
  `);
  const list = Array.isArray((rows as any)[0]) ? (rows as any)[0] : rows;
  const r = list[0] as any;
  const data = JSON.parse(r.fraud_score_breakdown_json || 'null');
  const photos = data?.photoForensics?.photos ?? [];
  // Show a vehicle photo
  const vehiclePhoto = photos.find((p: any) => p.analysisResult?.is_non_vehicle === false);
  console.log('Vehicle photo sample:', JSON.stringify(vehiclePhoto, null, 2));
  console.log('\nAll photo is_non_vehicle flags:');
  photos.forEach((p: any, i: number) => {
    const ar = p.analysisResult;
    console.log(`  Photo ${i+1}: is_non_vehicle=${ar?.is_non_vehicle} manipulation_score=${ar?.manipulation_indicators?.manipulation_score} flags=${JSON.stringify(ar?.flags?.slice(0,2))}`);
  });
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
