import { createConnection } from "mysql2/promise";

async function main() {
  const db = await createConnection(process.env.DATABASE_URL!);
  
  const [cols] = await db.execute(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'ai_assessments'
  `);
  const dbCols = new Set((cols as any[]).map(c => c.COLUMN_NAME));
  
  // Columns the code writes (from the insert in db.ts) - camelCase to snake_case
  const codeFields = [
    'claimId', 'tenantId', 'estimatedCost', 'damageDescription', 'detectedDamageTypes',
    'confidenceScore', 'fraudIndicators', 'fraudRiskLevel', 'fraudScore', 'recommendation',
    'fraudScoreBreakdownJson', 'modelVersion', 'processingTime', 'totalLossIndicated',
    'repairToValueRatio', 'structuralDamageSeverity', 'damagedComponentsJson', 'physicsAnalysis',
    'estimatedPartsCost', 'estimatedLaborCost', 'currencyCode', 'inferredHiddenDamagesJson',
    'costIntelligenceJson', 'repairIntelligenceJson', 'partsReconciliationJson', 'damagePhotosJson',
    'pipelineRunSummary', 'causalChainJson', 'evidenceBundleJson', 'realismBundleJson',
    'benchmarkBundleJson', 'consensusResultJson', 'causalVerdictJson', 'validatedOutcomeJson',
    'caseSignatureJson', 'stage2RawOcrText', 'claimRecordJson', 'narrativeAnalysisJson',
    'decisionAuthorityJson', 'reportReadinessJson', 'forensicAnalysis',
    'imageAnalysisTotalCount', 'imageAnalysisSuccessCount', 'imageAnalysisFailedCount',
    'imageAnalysisSuccessRate', 'fcdiScore', 'forensicExecutionLedgerJson', 'assumptionRegistryJson',
    'economicContextJson', 'ifeResultJson', 'doeResultJson', 'felVersionSnapshotJson',
    'claimQualityJson', 'forensicAuditValidationJson', 'enrichedPhotosJson',
  ];
  
  // Convert camelCase to snake_case
  const toSnake = (s: string) => s.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
  
  console.log("=== COLUMNS IN CODE BUT NOT IN DB ===");
  for (const f of codeFields) {
    const snake = toSnake(f);
    if (!dbCols.has(snake)) {
      console.log(`  MISSING: ${f} → ${snake}`);
    }
  }
  
  await db.end();
}
main().catch(console.error);
