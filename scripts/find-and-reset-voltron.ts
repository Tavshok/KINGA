/**
 * Find the VOLTRON claim via assessment 13290001 and reset it for re-run
 */
import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  
  // Get the claim_id from assessment 13290001
  const [assessments] = await conn.execute(
    `SELECT id, claim_id, created_at FROM ai_assessments WHERE id = 13290001 LIMIT 1`
  ) as any[];
  
  console.log('Assessment 13290001:', JSON.stringify(assessments, null, 2));
  
  if (!assessments.length) {
    // Try the earlier assessment
    const [a2] = await conn.execute(
      `SELECT id, claim_id, created_at FROM ai_assessments WHERE id = 12930001 LIMIT 1`
    ) as any[];
    console.log('Assessment 12930001:', JSON.stringify(a2, null, 2));
    
    if (!a2.length) {
      // Find most recent assessments
      const [recent] = await conn.execute(
        `SELECT id, claim_id, created_at FROM ai_assessments ORDER BY id DESC LIMIT 5`
      ) as any[];
      console.log('Recent assessments:', JSON.stringify(recent, null, 2));
      await conn.end();
      return;
    }
  }
  
  const claimId = assessments[0]?.claim_id;
  if (!claimId) {
    await conn.end();
    return;
  }
  
  // Get claim columns
  const [cols] = await conn.execute(
    `SHOW COLUMNS FROM claims`
  ) as any[];
  console.log('Claims columns:', cols.map((c: any) => c.Field).join(', '));
  
  const [claimRows] = await conn.execute(
    `SELECT id, claim_number, status, ai_assessment_completed FROM claims WHERE id = ?`,
    [claimId]
  ) as any[];
  console.log('Claim:', JSON.stringify(claimRows, null, 2));
  
  if (claimRows.length > 0) {
    await conn.execute(
      `UPDATE claims SET status = 'pending', ai_assessment_completed = 0 WHERE id = ?`,
      [claimId]
    );
    console.log(`\nReset claim ${claimId} (${claimRows[0].claim_number}) to pending for re-run`);
    console.log('Pipeline will pick this up within ~60 seconds via the claim processor');
  }
  
  await conn.end();
}

main().catch(console.error);
