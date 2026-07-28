import "dotenv/config";
import { getDb } from '../db';
import { aiAssessments, claims } from '../../drizzle/schema';
import { eq, desc } from 'drizzle-orm';

async function main() {
  const db = await getDb();

  // Check claim 8400001 (correct Voltron claim linked to source_document_id 4140001)
  const [claim] = await db.select({
    id: claims.id,
    claimReference: claims.claimReference,
    sourceDocumentId: claims.sourceDocumentId,
    estimatedSpeedKmh: claims.estimatedSpeedKmh,
    createdAt: claims.createdAt,
  }).from(claims).where(eq(claims.id, 8400001));
  
  console.log('\n=== CLAIM 8400001 ===');
  console.log(claim);

  // Check its assessments
  const assessments = await db.select({
    id: aiAssessments.id,
    status: aiAssessments.status,
    overallRiskScore: aiAssessments.overallRiskScore,
    fraudRiskLevel: aiAssessments.fraudRiskLevel,
    createdAt: aiAssessments.createdAt,
  }).from(aiAssessments)
    .where(eq(aiAssessments.claimId, 8400001))
    .orderBy(desc(aiAssessments.createdAt))
    .limit(3);
  
  console.log('\n=== ASSESSMENTS FOR CLAIM 8400001 ===');
  console.log(JSON.stringify(assessments, null, 2));

  if (assessments.length > 0) {
    // Check the OCR text of the latest assessment
    const [latest] = await db.select({
      id: aiAssessments.id,
      ocrStart: aiAssessments.stage2RawOcrText,
    }).from(aiAssessments)
      .where(eq(aiAssessments.id, assessments[0].id));
    
    const ocrText = (latest as any).ocrStart;
    console.log('\n=== OCR TEXT START (first 1000 chars) ===');
    console.log(typeof ocrText === 'string' ? ocrText.substring(0, 1000) : 'No OCR text');
  }

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
