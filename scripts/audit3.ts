// @ts-nocheck
import { getDb } from '../server/db';
import { sql } from 'drizzle-orm';

async function run() {
  const db = await getDb();
  
  // Check what quote-related tables exist
  const tables = (await db.execute(sql`SHOW TABLES LIKE '%quote%'`))[0] as any[];
  console.log('QUOTE TABLES:', tables.map((t:any) => Object.values(t)[0]).join(', '));
  
  // Also check repairer tables
  const tables2 = (await db.execute(sql`SHOW TABLES LIKE '%repairer%'`))[0] as any[];
  console.log('REPAIRER TABLES:', tables2.map((t:any) => Object.values(t)[0]).join(', '));
  
  // Check all tables with 'cost' in name
  const tables3 = (await db.execute(sql`SHOW TABLES LIKE '%cost%'`))[0] as any[];
  console.log('COST TABLES:', tables3.map((t:any) => Object.values(t)[0]).join(', '));
  
  // Pipeline stages
  const rows = (await db.execute(sql`SELECT pipeline_run_summary FROM ai_assessments WHERE claim_id = 6150002 ORDER BY id DESC LIMIT 1`))[0] as any[];
  const ai = rows[0];
  if (ai?.pipeline_run_summary) {
    const prs = JSON.parse(ai.pipeline_run_summary);
    console.log('\nPIPELINE STAGES:');
    Object.entries(prs.stages || {}).forEach(([k, v]: [string, any]) => {
      const err = v.error ? ` ERR:${String(v.error).substring(0, 80)}` : '';
      console.log(`  ${k}: ${v.status} ${v.durationMs}ms${err}`);
    });
    console.log('\nPIPELINE META:', JSON.stringify({
      totalDurationMs: prs.totalDurationMs,
      stagesCompleted: prs.stagesCompleted,
      stagesFailed: prs.stagesFailed,
    }));
  }
  
  // Cost intelligence structure
  const rows2 = (await db.execute(sql`SELECT cost_intelligence_json FROM ai_assessments WHERE claim_id = 6150002 ORDER BY id DESC LIMIT 1`))[0] as any[];
  const ai2 = rows2[0];
  if (ai2?.cost_intelligence_json) {
    const ci = JSON.parse(ai2.cost_intelligence_json);
    console.log('\nCOST INTELLIGENCE TOP KEYS:', Object.keys(ci).join(', '));
    // Look for NFS / optimised values at all levels
    const ciStr = JSON.stringify(ci);
    const nfsMatch = ciStr.match(/"(nfs|netFairSettlement|net_fair_settlement|optimisedTotal|totalOptimised)":\s*([^,}]+)/g);
    console.log('NFS/OPTIMISED FIELDS:', nfsMatch?.slice(0, 5).join(' | ') ?? 'NONE FOUND');
  }
  
  process.exit(0);
}
run().catch(e => { console.error('ERR:', e.message); process.exit(1); });
