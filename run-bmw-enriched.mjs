import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// Register ts-node for TypeScript support
register('ts-node/esm', pathToFileURL('./'));

const { runClaimPipeline } = await import('./server/pipeline-v2/orchestrator.ts');
const { saveAssessmentResult } = await import('./server/db.ts');
const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  // Get the BMW claim
  const [claims] = await conn.execute('SELECT * FROM claims WHERE id=4380001 LIMIT 1');
  const claim = claims[0];
  console.log('Running pipeline for claim:', claim.id, claim.claim_number);
  
  // Get the documents
  const [docs] = await conn.execute('SELECT * FROM claim_documents WHERE claim_id=4380001');
  console.log('Documents:', docs.length);
  
  await conn.end();
  
  // Run the pipeline
  const result = await runClaimPipeline({
    claimId: 4380001,
    claimNumber: claim.claim_number,
    documents: docs,
    tenantId: 'tenant-1771335377063',
  });
  
  console.log('Pipeline complete. Saving to DB...');
  await saveAssessmentResult(result, 4380001);
  console.log('Done. enrichedPhotosJson saved:', result.enrichedPhotosJson ? 'YES (' + JSON.parse(result.enrichedPhotosJson).length + ' photos)' : 'NO');
}

main().catch(err => {
  console.error('Pipeline error:', err.message);
  process.exit(1);
});
