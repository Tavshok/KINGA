/**
 * Pipeline end-to-end test script
 * Finds a claim with documents in the DB and runs the full pipeline.
 * Usage: node scripts/test-pipeline.mjs [claimId]
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Load env
process.chdir(path.join(__dirname, '..'));

// Use tsx to run the TypeScript pipeline
import { execSync, spawn } from 'child_process';

const claimId = process.argv[2];

if (!claimId) {
  // Find a claim with documents using the DB query script
  console.log('No claimId provided. Finding claims with documents...');
}

// Run the TypeScript test via tsx
const child = spawn('npx', ['tsx', 'scripts/find-and-run-claim.ts', claimId || ''], {
  stdio: 'inherit',
  cwd: path.join(__dirname, '..'),
  env: { ...process.env }
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
