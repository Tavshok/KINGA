// @ts-nocheck
import { getDb } from "../server/db";
import { aiAssessments, claims } from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";

async function main() {
  const db = await getDb();
  
  // Get the latest assessment (Voltron re-run)
  const [latest] = await db
    .select()
    .from(aiAssessments)
    .orderBy(desc(aiAssessments.id))
    .limit(1);
  
  if (!latest) {
    console.log("No assessments found");
    process.exit(1);
  }
  
  console.log("=== LATEST ASSESSMENT QUALITY AUDIT ===");
  console.log(`Assessment ID: ${latest.id}`);
  console.log(`Claim ID: ${latest.claimId}`);
  console.log(`Created: ${latest.createdAt}`);
  console.log("");
  
  // Check all critical fields
  const fields = {
    // Core
    "fraudScore": latest.fraudScore,
    "fraudRiskLevel": latest.fraudRiskLevel,
    "confidence": latest.confidence,
    "recommendation": latest.recommendation,
    
    // Cost
    "totalClaimAmount": latest.totalClaimAmount,
    "currency": latest.currency,
    "compositeOptimisation": latest.compositeOptimisation ? "SET (JSON)" : null,
    "costDecision": latest.costDecision ? "SET (JSON)" : null,
    
    // Physics
    "physicsAnalysis": latest.physicsAnalysis ? "SET (JSON)" : null,
    "physicsDeviationScore": latest.physicsDeviationScore,
    
    // Fraud
    "fraudAnalysis": latest.fraudAnalysis ? "SET (JSON)" : null,
    "fraudPatternJson": latest.fraudPatternJson ? "SET (JSON)" : null,
    
    // NEW FIELDS (wired today)
    "coherenceResultJson": latest.coherenceResultJson ? "SET (JSON)" : null,
    "costRealismJson": latest.costRealismJson ? "SET (JSON)" : null,
    "consistencyCheckJson": latest.consistencyCheckJson ? "SET (JSON)" : null,
    "contradictionGateJson": latest.contradictionGateJson ? "SET (JSON)" : null,
    
    // Forensic
    "forensicAnalysis": latest.forensicAnalysis ? "SET (JSON)" : null,
    "vehicleAnalysis": latest.vehicleAnalysis ? "SET (JSON)" : null,
    "damageAnalysis": latest.damageAnalysis ? "SET (JSON)" : null,
    "claimSummary": latest.claimSummary ? "SET (text)" : null,
    "executiveSummary": latest.executiveSummary ? "SET (text)" : null,
    "narrativeReport": latest.narrativeReport ? "SET (text)" : null,
    
    // Workflow
    "workflowAuditTrail": latest.workflowAuditTrail ? "SET (JSON)" : null,
  };
  
  let populated = 0;
  let missing = 0;
  const missingFields: string[] = [];
  
  for (const [name, value] of Object.entries(fields)) {
    const status = value !== null && value !== undefined ? "✅" : "❌";
    if (value !== null && value !== undefined) {
      populated++;
    } else {
      missing++;
      missingFields.push(name);
    }
    console.log(`  ${status} ${name}: ${value ?? "NULL"}`);
  }
  
  console.log("");
  console.log(`=== SUMMARY: ${populated}/${populated + missing} fields populated ===`);
  if (missingFields.length > 0) {
    console.log(`Missing: ${missingFields.join(", ")}`);
  }
  
  // Check compositeOptimisation detail
  if (latest.compositeOptimisation) {
    const co = typeof latest.compositeOptimisation === 'string' 
      ? JSON.parse(latest.compositeOptimisation) 
      : latest.compositeOptimisation;
    console.log("\n=== COMPOSITE OPTIMISATION DETAIL ===");
    console.log(`  NFS: ${co.nfs ?? 'N/A'}`);
    console.log(`  Total Quoted: ${co.totalQuoted ?? 'N/A'}`);
    console.log(`  KINGA Optimised: ${co.kingaOptimised ?? co.totalOptimised ?? 'N/A'}`);
    console.log(`  Savings: ${co.totalSavings ?? co.savings ?? 'N/A'}`);
    console.log(`  Components: ${co.components?.length ?? co.lineItems?.length ?? 'N/A'}`);
  }
  
  // Check costDecision detail
  if (latest.costDecision) {
    const cd = typeof latest.costDecision === 'string' 
      ? JSON.parse(latest.costDecision) 
      : latest.costDecision;
    console.log("\n=== COST DECISION DETAIL ===");
    console.log(`  L1 (ML): ${JSON.stringify(cd.l1 ?? cd.L1 ?? 'N/A').slice(0, 100)}`);
    console.log(`  L2 (Market): ${JSON.stringify(cd.l2 ?? cd.L2 ?? 'N/A').slice(0, 100)}`);
    console.log(`  L3 (Benchmark): ${JSON.stringify(cd.l3 ?? cd.L3 ?? 'N/A').slice(0, 100)}`);
  }
  
  // Check physics detail
  if (latest.physicsAnalysis) {
    const pa = typeof latest.physicsAnalysis === 'string' 
      ? JSON.parse(latest.physicsAnalysis) 
      : latest.physicsAnalysis;
    console.log("\n=== PHYSICS ANALYSIS DETAIL ===");
    console.log(`  Plausible: ${pa.isPhysicallyPlausible ?? pa.plausible ?? 'N/A'}`);
    console.log(`  Confidence: ${pa.confidence ?? 'N/A'}`);
    console.log(`  Impact zones: ${pa.impactZones?.length ?? pa.zones?.length ?? 'N/A'}`);
  }
  
  // Check fraud detail
  if (latest.fraudAnalysis) {
    const fa = typeof latest.fraudAnalysis === 'string' 
      ? JSON.parse(latest.fraudAnalysis) 
      : latest.fraudAnalysis;
    console.log("\n=== FRAUD ANALYSIS DETAIL ===");
    console.log(`  Score: ${fa.score ?? fa.fraudScore ?? 'N/A'}`);
    console.log(`  Risk: ${fa.riskLevel ?? fa.risk ?? 'N/A'}`);
    console.log(`  Indicators: ${fa.indicators?.length ?? fa.redFlags?.length ?? 'N/A'}`);
  }
  
  // Check coherence detail
  if (latest.coherenceResultJson) {
    const cr = typeof latest.coherenceResultJson === 'string' 
      ? JSON.parse(latest.coherenceResultJson) 
      : latest.coherenceResultJson;
    console.log("\n=== COHERENCE RESULT DETAIL ===");
    console.log(`  ${JSON.stringify(cr).slice(0, 300)}`);
  }
  
  // Check consistency detail
  if (latest.consistencyCheckJson) {
    const cc = typeof latest.consistencyCheckJson === 'string' 
      ? JSON.parse(latest.consistencyCheckJson) 
      : latest.consistencyCheckJson;
    console.log("\n=== CONSISTENCY CHECK DETAIL ===");
    console.log(`  ${JSON.stringify(cc).slice(0, 300)}`);
  }
  
  // Check contradiction detail
  if (latest.contradictionGateJson) {
    const cg = typeof latest.contradictionGateJson === 'string' 
      ? JSON.parse(latest.contradictionGateJson) 
      : latest.contradictionGateJson;
    console.log("\n=== CONTRADICTION GATE DETAIL ===");
    console.log(`  ${JSON.stringify(cg).slice(0, 300)}`);
  }
  
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
