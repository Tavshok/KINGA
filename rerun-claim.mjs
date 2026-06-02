/**
 * Re-run the KINGA pipeline for a specific claim.
 * Usage: node rerun-claim.mjs <claimId>
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// We need to load the compiled server code
// First, let's call the API endpoint directly via HTTP since the server is running
const claimId = parseInt(process.argv[2] || '7050001', 10);

// Use the internal API to trigger re-run
const baseUrl = 'http://localhost:3000';

async function main() {
  console.log(`Re-running pipeline for claim ${claimId}...`);
  
  // We need a session cookie to call the protected procedure
  // Instead, let's call triggerAiAssessment directly via the server's internal mechanism
  // by making a direct DB call
  
  try {
    // Import the compiled server module
    const { triggerAiAssessment } = await import('./server/db.ts');
    console.log('Calling triggerAiAssessment...');
    await triggerAiAssessment(claimId);
    console.log('Pipeline re-run triggered successfully');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
