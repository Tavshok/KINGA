import { triggerAiAssessment, getClaimById } from './server/db.ts';

const registrations = ['AEW2816', 'AFX3048', 'ACX8237'];

console.log('Re-triggering AI assessments for claims with photos...\n');

for (const reg of registrations) {
  try {
    // Get claim by registration
    const { getDb } = await import('./server/db.ts');
    const { claims } = await import('./drizzle/schema.ts');
    const { eq } = await import('drizzle-orm');
    const db = await getDb();
    
    const [claim] = await db.select().from(claims).where(eq(claims.vehicleRegistration, reg)).limit(1);
    
    if (!claim) {
      console.log(`❌ Claim not found for registration: ${reg}`);
      continue;
    }
    
    console.log(`Processing ${claim.vehicleMake} ${claim.vehicleModel} (${reg})...`);
    console.log(`  Claim ID: ${claim.id}`);
    console.log(`  Claim Number: ${claim.claimNumber}`);
    
    // Trigger AI assessment
    await triggerAiAssessment(claim.id);
    
    console.log(`  ✅ AI assessment completed\n`);
    
  } catch (error) {
    console.error(`❌ Error processing ${reg}:`, error.message);
  }
}

console.log('✅ All assessments re-triggered!');
process.exit(0);
