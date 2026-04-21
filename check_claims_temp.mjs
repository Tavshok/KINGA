import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';

// Load env
const envFile = readFileSync('.env', 'utf8');
const dbUrl = envFile.split('\n').find(l => l.startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim();

const conn = await mysql.createConnection(dbUrl || process.env.DATABASE_URL);

const [rows] = await conn.execute(
  `SELECT c.id, c.claim_number, c.status, c.vehicle_make, c.vehicle_model,
          a.id as assessment_id, a.estimated_cost, a.fraud_score,
          LEFT(a.cost_intelligence_json, 400) as ci_preview
   FROM claims c 
   LEFT JOIN ai_assessments a ON a.claim_id = c.id
   WHERE a.id IS NOT NULL
   ORDER BY c.created_at DESC
   LIMIT 5`
);
console.log(JSON.stringify(rows, null, 2));
await conn.end();
