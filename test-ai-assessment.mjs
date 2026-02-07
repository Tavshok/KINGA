import { triggerAiAssessment } from './server/db.ts';

const claims = [
  { id: 60012, name: 'Honda Fit AEW2816' },
  { id: 60015, name: 'Toyota Hilux AFX3048' },
  { id: 60013, name: 'Nissan NP300 ACX8237' }
];

console.log('Triggering AI assessments for all 3 claims with photos...\n');

for (const claim of claims) {
  try {
    console.log(`\n--- Processing ${claim.name} (ID: ${claim.id}) ---`);
    await triggerAiAssessment(claim.id);
    console.log(`✅ Assessment completed for ${claim.name}`);
  } catch (error) {
    console.error(`❌ Error for ${claim.name}:`, error.message);
  }
}

console.log('\n✅ All assessments completed!\n');
process.exit(0);
