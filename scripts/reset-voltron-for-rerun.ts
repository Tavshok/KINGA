/**
 * Reset VOLTRON claim for re-run using correct status value
 */
import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  
  // Check status enum
  const [cols] = await conn.execute("SHOW COLUMNS FROM claims WHERE Field = 'status'") as any[];
  console.log('Status column:', JSON.stringify(cols[0]?.Type));
  
  // Check workflow_state enum too
  const [wfCols] = await conn.execute("SHOW COLUMNS FROM claims WHERE Field = 'workflow_state'") as any[];
  console.log('Workflow state column:', JSON.stringify(wfCols[0]?.Type));
  
  // Get current VOLTRON claim state
  const [claim] = await conn.execute(
    `SELECT id, claim_number, status, workflow_state, ai_assessment_completed, ai_assessment_triggered FROM claims WHERE id = 8880001`
  ) as any[];
  console.log('Current VOLTRON state:', JSON.stringify(claim[0], null, 2));
  
  // Reset using the correct status value from the enum
  // Based on drizzle schema, 'submitted' is the initial state that triggers AI assessment
  await conn.execute(
    `UPDATE claims SET 
      status = 'submitted',
      ai_assessment_completed = 0,
      ai_assessment_triggered = 0
    WHERE id = 8880001`
  );
  console.log('\nReset VOLTRON claim 8880001 to submitted/pending AI assessment');
  
  await conn.end();
}

main().catch(console.error);
