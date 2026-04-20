import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  
  // Get the latest assessment for both claims
  for (const claimId of [4500005, 4500006]) {
    console.log('\n=== Claim ID:', claimId, '===');
    const [rows] = await conn.execute(
      'SELECT id, created_at, damage_photos_json, pipeline_run_summary FROM ai_assessments WHERE claim_id = ? ORDER BY created_at DESC LIMIT 1',
      [claimId]
    ) as any[];
    
    if (!(rows as any[]).length) { console.log('No assessment'); continue; }
    const a = (rows as any[])[0];
    console.log('Assessment ID:', a.id, 'created:', a.created_at);
    console.log('damage_photos_json:', a.damage_photos_json);
    
    if (a.pipeline_run_summary) {
      let summary: any;
      try { summary = JSON.parse(a.pipeline_run_summary); } catch { summary = a.pipeline_run_summary; }
      
      if (summary && typeof summary === 'object') {
        for (const [stage, data] of Object.entries(summary)) {
          const s = data as any;
          const status = s?.status ?? 'unknown';
          const dur = s?.durationMs ? `${s.durationMs}ms` : '';
          const err = s?.error ? `ERROR: ${String(s.error).substring(0, 100)}` : '';
          const deg = s?.degraded ? 'DEGRADED' : '';
          console.log(`  ${stage}: ${status} ${dur} ${deg} ${err}`);
        }
      } else {
        console.log('pipeline_run_summary:', String(a.pipeline_run_summary).substring(0, 500));
      }
    } else {
      console.log('pipeline_run_summary: NULL');
    }
  }
  
  await conn.end();
}

main().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
