// Runner for claim 4410001 (Mercedes/Toyota Hilux AFX3048)
import { triggerAiAssessment } from './server/db.ts';

const CLAIM_ID = 4410001;

console.log(`[Runner] Starting pipeline for claim ${CLAIM_ID}...`);
const start = Date.now();

try {
  const result = await triggerAiAssessment(CLAIM_ID, 'system', 'claims_processor');
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[Runner] Pipeline completed in ${elapsed}s`);
  console.log(`[Runner] Recommendation: ${result?.recommendation}`);
  console.log(`[Runner] Fraud score: ${result?.fraudScore}`);
  console.log(`[Runner] Decision: ${result?.decisionAuthority?.recommendation}`);
  console.log(`[Runner] Report Readiness: ${result?.reportReadiness?.status}`);
  console.log(`[Runner] Photos: ${result?.imageAnalysisSuccessCount}/${result?.imageAnalysisTotalCount}`);
  console.log(`[Runner] OCR text length: ${result?.stage2RawOcrText?.length ?? 0}`);
  console.log(`[Runner] Claim record vehicle: ${result?.claimRecord?.vehicle?.make} ${result?.claimRecord?.vehicle?.model}`);
} catch (err) {
  console.error('[Runner] FAILED:', err.message);
  console.error(err.stack?.slice(0, 500));
}

process.exit(0);
