import mysql from 'mysql2/promise';
async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const [rows] = await conn.execute(
    `SELECT forensic_analysis FROM ai_assessments WHERE id = 13290001`
  );
  const row = (rows as any[])[0];
  if (row?.forensic_analysis) {
    const f = typeof row.forensic_analysis === 'string' ? JSON.parse(row.forensic_analysis) : row.forensic_analysis;
    // Check all keys for anything with "photo" or "enrich" or "vision" or "crush"
    for (const [k, v] of Object.entries(f)) {
      if (k.toLowerCase().includes('photo') || k.toLowerCase().includes('enrich') ||
          k.toLowerCase().includes('vision') || k.toLowerCase().includes('crush') ||
          k.toLowerCase().includes('image')) {
        console.log(`KEY: ${k} =`, JSON.stringify(v)?.slice(0, 200));
      }
    }
    // Also check pipelineStateMachine for stage-6 output
    if (f.pipelineStateMachine) {
      const psm = f.pipelineStateMachine;
      console.log('\npipelineStateMachine keys:', Object.keys(psm));
    }
  }
  await conn.end();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
