/**
 * Trigger a VOLTRON re-run via the internal pipeline API
 * Claim: 8880001 (VOLTRON MINING, AFU 7783 ISUZU MUX 2020)
 */
import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const DB_URL = process.env.DATABASE_URL!;

async function main() {
  const conn = await mysql.createConnection(DB_URL);
  
  // Find the VOLTRON claim
  const [claims] = await conn.execute(
    `SELECT id, claim_number, status, ai_assessment_completed FROM claims WHERE claim_number = '8880001' LIMIT 1`
  ) as any[];
  
  if (!claims.length) {
    console.log('VOLTRON claim 8880001 not found');
    await conn.end();
    return;
  }
  
  const claim = claims[0];
  console.log(`Found claim: id=${claim.id}, status=${claim.status}, ai_assessment_completed=${claim.ai_assessment_completed}`);
  
  // Reset the claim for re-processing
  await conn.execute(
    `UPDATE claims SET 
      status = 'pending',
      ai_assessment_completed = 0,
      document_processing_status = 'pending'
    WHERE id = ?`,
    [claim.id]
  );
  
  console.log(`Reset claim ${claim.id} to pending status for re-run`);
  console.log('The pipeline will pick this up automatically via the stuck-recovery or claim processor');
  console.log('Monitor with: SELECT id, status, ai_assessment_completed FROM claims WHERE claim_number = "8880001"');
  
  await conn.end();
}

main().catch(console.error);
