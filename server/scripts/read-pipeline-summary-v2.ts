import 'dotenv/config';
import { getDb } from '../db';
import { aiAssessments } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.log('DB NULL'); process.exit(1); }

  const rows = await db.select({
    id: aiAssessments.id,
    pipelineRunSummary: aiAssessments.pipelineRunSummary,
    damageDescription: aiAssessments.damageDescription,
  }).from(aiAssessments)
    .where(eq(aiAssessments.id, 8160001))
    .limit(1);

  if (!rows.length) { console.log('Assessment 8160001 not found'); process.exit(0); }

  const asm = rows[0];
  console.log('Damage description (first 200 chars):', String(asm.damageDescription || '').substring(0, 200));

  if (asm.pipelineRunSummary) {
    try {
      const summary = JSON.parse(String(asm.pipelineRunSummary));
      console.log('\nFULL PIPELINE SUMMARY:');
      console.log(JSON.stringify(summary, null, 2));
    } catch(e) {
      console.log('Raw pipeline summary:', String(asm.pipelineRunSummary).substring(0, 2000));
    }
  } else {
    console.log('No pipeline summary');
  }

  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
