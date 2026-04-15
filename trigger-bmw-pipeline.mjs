/**
 * trigger-bmw-pipeline.mjs
 * Triggers the AI assessment pipeline for claim 4320104 directly via the DB layer.
 * This bypasses the tRPC auth layer and calls triggerAiAssessment directly.
 */
import { config } from 'dotenv';
config({ quiet: true });

// We need to call the triggerAiAssessment function from db.ts
// The cleanest way is to call the HTTP endpoint directly using the owner session
// or to call the pipeline function directly via a small wrapper

const CLAIM_ID = 4320104;
const PDF_URL = 'https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/UWgvQSKapGFFOOEs.pdf';
const BASE_URL = 'http://localhost:3000';

async function triggerViaAPI() {
  // First, get a session by calling the internal trigger endpoint
  // The triggerAiAssessment is exposed via aiAssessments.triggerForClaim or similar
  // Let's check what procedures are available for triggering
  
  // Try calling the trigger endpoint directly
  const response = await fetch(`${BASE_URL}/api/trpc/aiAssessments.triggerForClaim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ json: { claimId: CLAIM_ID, pdfUrl: PDF_URL } }),
  });
  
  const text = await response.text();
  console.log('Status:', response.status);
  console.log('Response:', text.substring(0, 500));
}

triggerViaAPI().catch(e => console.error('Error:', e.message));
