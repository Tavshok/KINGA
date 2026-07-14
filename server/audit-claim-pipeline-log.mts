import { createPool } from 'mysql2/promise';

const pool = createPool({
  uri: process.env.DATABASE_URL!,
  connectionLimit: 2,
});

async function main() {
  // Get the latest assessment for claim 9330001
  const [assessRows] = await pool.execute(
    `SELECT id, pipeline_log, created_at FROM ai_assessments 
     WHERE claim_id = 9330001 ORDER BY created_at DESC LIMIT 1`
  ) as any[];
  
  const latest = (assessRows as any[])[0];
  if (!latest) { console.log('No assessment found'); await pool.end(); return; }
  
  console.log(`Assessment ID: ${latest.id}, created: ${latest.created_at}`);
  
  const log = latest.pipeline_log;
  if (!log) { console.log('No pipeline log'); await pool.end(); return; }
  
  // Parse the log — it's either a JSON array or newline-separated strings
  let entries: string[] = [];
  try {
    const parsed = JSON.parse(log);
    if (Array.isArray(parsed)) {
      entries = parsed.map((e: any) => typeof e === 'string' ? e : JSON.stringify(e));
    } else {
      entries = [JSON.stringify(parsed)];
    }
  } catch {
    entries = log.split('\n').filter(Boolean);
  }
  
  console.log(`\nTotal log entries: ${entries.length}`);
  
  // Show Stage 13 entries and any ERROR entries
  console.log('\n=== STAGE 13 ENTRIES ===');
  const stage13 = entries.filter((e: string) => e.includes('Stage13') || e.includes('Stage 13'));
  stage13.forEach((e: string) => console.log(e));
  
  console.log('\n=== ERROR/WARN ENTRIES ===');
  const errors = entries.filter((e: string) => 
    e.toLowerCase().includes('error') || 
    e.toLowerCase().includes('warn') || 
    e.toLowerCase().includes('fail') ||
    e.toLowerCase().includes('exception')
  );
  errors.slice(0, 20).forEach((e: string) => console.log(e));
  
  console.log('\n=== LAST 20 LOG ENTRIES ===');
  entries.slice(-20).forEach((e: string) => console.log(e));

  await pool.end();
}

main().catch(console.error);
