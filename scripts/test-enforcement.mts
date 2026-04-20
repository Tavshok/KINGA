import { getAiAssessmentByClaimId } from '../server/db.ts';

const assessment = await getAiAssessmentByClaimId(4500001, undefined);
if (!assessment) {
  console.log('NO ASSESSMENT FOUND for claim 4500001');
  process.exit(1);
}
console.log('Assessment found. ID:', (assessment as any).id);
console.log('forensicAnalysis length:', (assessment as any).forensicAnalysis?.length ?? 'NULL');
console.log('forensicAnalysis type:', typeof (assessment as any).forensicAnalysis);
console.log('forensicAuditValidationJson length:', (assessment as any).forensicAuditValidationJson?.length ?? 'NULL');

// Try parsing forensicAnalysis
try {
  const fa = JSON.parse((assessment as any).forensicAnalysis);
  console.log('forensicAnalysis parsed OK. Keys:', Object.keys(fa).slice(0, 10));
} catch (e) {
  console.log('forensicAnalysis parse ERROR:', e);
}

// Now test the full getEnforcement logic
try {
  const { applyIntelligenceEnforcement } = await import('../server/intelligence-enforcement.ts');
  console.log('applyIntelligenceEnforcement imported OK');
} catch (e) {
  console.log('intelligence-enforcement import ERROR:', e);
}

process.exit(0);
