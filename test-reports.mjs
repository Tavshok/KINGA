/**
 * Test script: run both report generators against the LIVE-RUN-VOLTRON-001 claim (ID 8880001)
 * Usage: node test-reports.mjs
 */
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Register ts-node so we can import TypeScript files
const require = createRequire(import.meta.url);

// Use tsx to run this
const { generateClaimsIntelligenceReport } = await import('./server/reporting/claimsIntelligenceReport.ts');
const { generateForensicDecisionReport } = await import('./server/reporting/forensicDecisionReport.ts');

const CLAIM_ID = 8880001;
const TENANT_ID = undefined; // no tenant filter for test

console.log(`\n🔵 Generating Claims Intelligence Report for claim ${CLAIM_ID}...`);
try {
  const cirHtml = await generateClaimsIntelligenceReport(CLAIM_ID, TENANT_ID);
  const cirPath = resolve(__dirname, '../kinga_test_cir_voltron.html');
  writeFileSync(cirPath, cirHtml, 'utf-8');
  console.log(`✅ Claims Intelligence Report saved: ${cirPath} (${Math.round(cirHtml.length / 1024)}KB)`);
} catch (err) {
  console.error(`❌ Claims Intelligence Report FAILED:`, err.message);
  console.error(err.stack);
}

console.log(`\n🔵 Generating Forensic Claim Decision Report for claim ${CLAIM_ID}...`);
try {
  const fdrHtml = await generateForensicDecisionReport(CLAIM_ID, TENANT_ID);
  const fdrPath = resolve(__dirname, '../kinga_test_fdr_voltron.html');
  writeFileSync(fdrPath, fdrHtml, 'utf-8');
  console.log(`✅ Forensic Claim Decision Report saved: ${fdrPath} (${Math.round(fdrHtml.length / 1024)}KB)`);
} catch (err) {
  console.error(`❌ Forensic Claim Decision Report FAILED:`, err.message);
  console.error(err.stack);
}

console.log('\nDone.');
process.exit(0);
