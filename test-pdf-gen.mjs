import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { writeFileSync } from 'fs';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Get the latest assessment
const [rows] = await conn.query(`
  SELECT 
    a.forensic_analysis,
    a.pipeline_run_summary,
    a.claim_id,
    c.claim_number,
    c.vehicle_make,
    c.vehicle_model,
    c.vehicle_year,
    c.vehicle_registration,
    c.lodger_name as insured_name
  FROM ai_assessments a
  LEFT JOIN claims c ON a.claim_id = c.id
  ORDER BY a.id DESC LIMIT 1
`);

const row = rows[0];
const forensicAnalysis = JSON.parse(row.forensic_analysis || '{}');
const pipelineRunSummary = JSON.parse(row.pipeline_run_summary || '{}');

console.log('Claim:', row.claim_number, '| Vehicle:', row.vehicle_make, row.vehicle_model);
console.log('FA keys:', Object.keys(forensicAnalysis).slice(0, 15));
console.log('decisionAuthority:', JSON.stringify(forensicAnalysis.decisionAuthority, null, 2)?.substring(0, 200));

// Dynamically import the PDF generator (TypeScript)
const { generateForensicPdf } = await import('./server/pdfReportGenerator.ts');

const pdfBuffer = await generateForensicPdf({
  claimId: String(row.claim_id),
  claimNumber: row.claim_number ?? String(row.claim_id),
  vehicleMake: row.vehicle_make ?? '',
  vehicleModel: row.vehicle_model ?? '',
  vehicleYear: row.vehicle_year ?? '',
  vehicleRegistration: row.vehicle_registration ?? '',
  insuredName: row.insured_name ?? '',
  generatedAt: new Date().toISOString(),
  forensicAnalysis,
  pipelineRunSummary,
});

writeFileSync('/home/ubuntu/test-forensic-report.pdf', pdfBuffer);
console.log(`\nPDF generated: ${pdfBuffer.length} bytes → /home/ubuntu/test-forensic-report.pdf`);

await conn.end();
