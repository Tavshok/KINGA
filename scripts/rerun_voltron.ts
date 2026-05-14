// @ts-nocheck
import { triggerAiAssessment } from '../server/db';

console.log('Re-running pipeline for Voltron claim 6150002...');
const result = await triggerAiAssessment(6150002);
console.log('Pipeline complete!');
console.log('Assessment ID:', result?.assessmentId ?? result?.id ?? 'unknown');
console.log('Fraud score:', result?.fraudScore ?? result?.fraudRiskScore ?? 'N/A');
console.log('Confidence:', result?.confidence ?? 'N/A');
console.log('Recommendation:', result?.recommendation ?? 'N/A');
process.exit(0);
