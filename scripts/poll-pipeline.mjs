import { createConnection } from 'mysql2/promise';

async function poll() {
  for (let i = 0; i < 15; i++) {
    const db = await createConnection(process.env.DATABASE_URL);
    const [c] = await db.execute("SELECT status, ai_assessment_completed FROM claims WHERE id = 6930001");
    const [a] = await db.execute("SELECT id, estimated_cost, confidence_score, pipeline_run_summary FROM ai_assessments WHERE claim_id = 6930001 ORDER BY id DESC LIMIT 1");
    const [q] = await db.execute("SELECT COUNT(*) as cnt FROM panel_beater_quotes WHERE claim_id = 6930001");
    const summary = a[0] && a[0].pipeline_run_summary ? JSON.parse(a[0].pipeline_run_summary) : null;
    const stages = summary && summary.stages
      ? Object.entries(summary.stages).map(function(e) { return e[0] + ':' + e[1].status; }).join(' | ')
      : 'no summary';
    console.log(
      new Date().toISOString().slice(11,19),
      '| status:', c[0] ? c[0].status : '-',
      '| cost:', a[0] ? a[0].estimated_cost : '-',
      '| conf:', a[0] ? a[0].confidence_score : '-',
      '| quotes:', q[0].cnt
    );
    console.log('  stages:', stages.slice(0, 200));
    await db.end();
    const cost = a[0] ? Number(a[0].estimated_cost) : 0;
    const quotes = Number(q[0].cnt);
    if (cost > 0 && quotes > 0) {
      console.log('✅ Pipeline fully complete with quotes and cost!');
      break;
    }
    if (stages.includes('quota exhausted') || stages.includes('LLM quota')) {
      console.log('⚠️  Quota exhausted — pipeline halted cleanly, existing data preserved.');
      break;
    }
    await new Promise(function(r) { setTimeout(r, 20000); });
  }
}
poll().catch(function(e) { console.error(e.message); });
