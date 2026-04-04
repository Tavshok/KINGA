import { createConnection } from 'mysql2/promise';
const conn = await createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute(
  'SELECT id, pipeline_run_summary FROM ai_assessments WHERE id = 2400001 LIMIT 1'
);
const ps = JSON.parse(rows[0].pipeline_run_summary);
const stage5 = ps.stages?.['5_assembly'];
console.log('stage5 keys:', stage5 ? Object.keys(stage5).join(', ') : 'NOT FOUND');
if (stage5?.claimRecord) {
  console.log('claimRecord keys:', Object.keys(stage5.claimRecord).join(', '));
  console.log('repairQuote:', JSON.stringify(stage5.claimRecord.repairQuote));
}
if (stage5?.validatedFields) {
  console.log('validatedFields.quoteTotalCents:', stage5.validatedFields?.quoteTotalCents);
  console.log('validatedFields.agreedCostCents:', stage5.validatedFields?.agreedCostCents);
}
await conn.end();
