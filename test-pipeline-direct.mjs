/**
 * Direct pipeline test — runs triggerAiAssessment on a real claim and captures all output.
 * Run with: node --loader tsx/esm test-pipeline-direct.mjs
 */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// Load env
import { config } from 'dotenv';
config();

// Patch console to add timestamps
const origLog = console.log.bind(console);
const origError = console.error.bind(console);
const origWarn = console.warn.bind(console);
const ts = () => new Date().toISOString().slice(11, 23);
console.log = (...a) => origLog(`[${ts()}]`, ...a);
console.error = (...a) => origError(`[${ts()}] ERROR`, ...a);
console.warn = (...a) => origWarn(`[${ts()}] WARN`, ...a);

console.log('=== PIPELINE DIRECT TEST ===');
console.log('Loading db module...');

// Use tsx to run this
const { triggerAiAssessment } = await import('./server/db.ts');

// Use the BMW claim (DOC-20260422-B6229FB7, id=4560003)
const CLAIM_ID = 4560003;

console.log(`Starting pipeline for claim ${CLAIM_ID}...`);
const startMs = Date.now();

try {
  await triggerAiAssessment(CLAIM_ID);
  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
  console.log(`\n=== PIPELINE COMPLETED in ${elapsed}s ===`);
} catch (err) {
  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
  console.error(`\n=== PIPELINE FAILED after ${elapsed}s ===`);
  console.error('Error:', err.message);
  console.error('Stack:', err.stack?.slice(0, 1000));
}

process.exit(0);
