import mysql from 'mysql2/promise';
async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const [rows] = await conn.execute(
    `SELECT forensic_execution_ledger_json FROM ai_assessments WHERE id = 13290001`
  );
  const row = (rows as any[])[0];
  if (row?.forensic_execution_ledger_json) {
    const fel = typeof row.forensic_execution_ledger_json === 'string'
      ? JSON.parse(row.forensic_execution_ledger_json)
      : row.forensic_execution_ledger_json;
    const stages = Array.isArray(fel) ? fel : (fel.stages ?? []);
    console.log(`FEL stages: ${stages.length}`);
    for (const s of stages) {
      const name = s.stage ?? s.name ?? s.stageId ?? '?';
      const status = s.status ?? s.result ?? '?';
      console.log(`  [${name}] status=${status}`);
      // Look for stage-6 or stage-7 with crush depth info
      if (name.includes('6') || name.includes('damage') || name.includes('7') || name.includes('physics')) {
        const output = s.output ?? s.data ?? s.result_data;
        if (output) {
          const str = JSON.stringify(output);
          if (str.includes('crush') || str.includes('Crush') || str.includes('10')) {
            console.log(`    OUTPUT EXCERPT: ${str.slice(0, 500)}`);
          }
        }
      }
    }
  } else {
    console.log('NO FEL data');
  }
  await conn.end();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
