/**
 * read-claim-narratives.ts
 * Retrieves the full narratives for the 5 real claims used in verification.
 * Run: npx tsx server/scripts/read-claim-narratives.ts
 */
import { getDb } from "../db";
import { claims, aiAssessments } from "../../drizzle/schema";
import { inArray, eq } from "drizzle-orm";

const TARGET_CLAIM_NUMBERS = [
  "CLM-TEST-1778242665172-001",
  "DOC-20260509-9177FFFB",
  "CLM-TEST-1778408728391-001",
  "CLM-TEST-1778412587461-001",
  "CLM-TEST-1778423160746-001",
];

async function main() {
  const db = await getDb();
  if (!db) { console.error("No DB"); process.exit(1); }

  const rows = await db
    .select({
      id: claims.id,
      claimNumber: claims.claimNumber,
      status: claims.status,
      workflowState: claims.workflowState,
      incidentDescription: claims.incidentDescription,
      vehicleMake: claims.vehicleMake,
      vehicleModel: claims.vehicleModel,
      vehicleYear: claims.vehicleYear,
      vehicleRegistration: claims.vehicleRegistration,
      documentProcessingStatus: claims.documentProcessingStatus,
    })
    .from(claims)
    .where(inArray(claims.claimNumber, TARGET_CLAIM_NUMBERS));

  for (const row of rows) {
    console.log("\n" + "=".repeat(80));
    console.log(`CLAIM: ${row.claimNumber} (id=${row.id})`);
    console.log(`Status: ${row.status} | WorkflowState: ${row.workflowState}`);
    console.log(`Vehicle: ${row.vehicleMake} ${row.vehicleModel} ${row.vehicleYear ?? ""} | Reg: ${row.vehicleRegistration ?? "—"}`);
    console.log(`DPS: ${row.documentProcessingStatus}`);
    
    // Raw incident description from the claims table
    console.log("\n--- incidentDescription (claims table) ---");
    console.log(row.incidentDescription ?? "(null)");

    // Fetch the latest ai_assessment for this claim
    const assessments = await db
      .select({
        claimRecordJson: aiAssessments.claimRecordJson,
        physicsTruthJson: aiAssessments.physicsAnalysis, // physicsTruth is stored in physicsAnalysis column
        narrativeAnalysisJson: aiAssessments.narrativeAnalysisJson,
        stage2RawOcrText: aiAssessments.stage2RawOcrText,
      })
      .from(aiAssessments)
      .where(eq(aiAssessments.claimId, row.id))
      .limit(1);

    const assessment = assessments[0];
    if (!assessment) {
      console.log("\n(No ai_assessment record found for this claim)");
    } else {
      // Try to extract narrative from claimRecordJson
      if (assessment.claimRecordJson) {
        try {
          const cr = JSON.parse(assessment.claimRecordJson as string);
          const narrative = cr?.accidentDetails?.description 
            || cr?.accidentDetails?.narrativeAnalysis
            || cr?.driver?.claimantStatement
            || null;
          if (narrative) {
            console.log("\n--- Narrative (claimRecordJson.accidentDetails.description) ---");
            console.log(narrative);
          }
          const scenario = cr?.accidentDetails?.collisionScenario;
          const causation = cr?.accidentDetails?.impactCausation;
          const contradiction = cr?.accidentDetails?.reversingNarrativeContradiction;
          const speedCeiling = cr?.accidentDetails?.causationSpeedCeilingKmh;
          const speed = cr?.accidentDetails?.speedKmh ?? cr?.accidentDetails?.consensusSpeedKmh;
          console.log(`\n--- Stage 5 Classification (from claimRecordJson) ---`);
          console.log(`  collisionScenario: ${scenario ?? "(null)"}`);
          console.log(`  impactCausation: ${causation ?? "(null — new field, may not exist on old claims)"}`);
          console.log(`  reversingNarrativeContradiction: ${contradiction ?? "(null)"}`);
          console.log(`  causationSpeedCeilingKmh: ${speedCeiling ?? "(null)"}`);
          console.log(`  speedKmh: ${speed ?? "(null)"}`);
          // Also dump vehicle mass
          const vMass = cr?.vehicle?.massKg;
          const vMassTier = cr?.vehicle?.massTier;
          console.log(`  vehicle.massKg: ${vMass ?? "(null)"} (tier: ${vMassTier ?? "(null)"})`);
        } catch {
          console.log("(claimRecordJson parse failed)");
        }
      }

      // Check physicsAnalysis for physicsTruth fields
      if (assessment.physicsTruthJson) {
        try {
          const pt = JSON.parse(assessment.physicsTruthJson as string);
          console.log("\n--- PhysicsTruth (from physicsAnalysis column) ---");
          console.log(`  consensusSpeed: ${JSON.stringify(pt.consensusSpeed)}`);
          console.log(`  kineticEnergyJ: ${JSON.stringify(pt.kineticEnergyJ)}`);
          console.log(`  vehicleMassKg: ${pt.vehicleMassKg ?? "(null)"}`);
          console.log(`  brakingDistanceM: ${pt.brakingDistanceM ?? "(null — new field)"}`);
          console.log(`  impactCausation: ${pt.impactCausation ?? "(null — new field)"}`);
          console.log(`  causationSpeedExceedsCeiling: ${pt.causationSpeedExceedsCeiling ?? "(null)"}`);
          console.log(`  reversingNarrativeContradiction: ${pt.reversingNarrativeContradiction ?? "(null)"}`);
        } catch {
          // physicsAnalysis may be free text not JSON
          console.log(`  (physicsAnalysis is not JSON — first 200 chars: ${String(assessment.physicsTruthJson).substring(0, 200)})`);
        }
      }

      // Show first 300 chars of raw OCR to help human-read the narrative
      if (assessment.stage2RawOcrText) {
        const ocr = String(assessment.stage2RawOcrText);
        console.log(`\n--- Stage 2 Raw OCR (first 500 chars) ---`);
        console.log(ocr.substring(0, 500));
      }
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log(`\nTotal claims retrieved: ${rows.length} of ${TARGET_CLAIM_NUMBERS.length} requested`);
  const missing = TARGET_CLAIM_NUMBERS.filter(cn => !rows.find(r => r.claimNumber === cn));
  if (missing.length) console.log(`Missing: ${missing.join(", ")}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
