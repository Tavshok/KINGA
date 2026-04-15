/**
 * Create BMW 318i claim from PDF and run the full pipeline
 * Run with: npx tsx scripts/create-and-run-bmw.ts
 */
import fs from "fs";
import crypto from "crypto";
import { createClaim, triggerAiAssessment, getDb } from "../server/db";
import { storagePut } from "../server/storage";
import { ingestionDocuments, claims } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const PDF_PATH = "/home/ubuntu/upload/DIEFTRACKMARKETINGBMW318iADP6423-audit-signed.pdf";

// S3 URL from previous upload (already uploaded successfully)
const EXISTING_S3_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310419663031527958/YbS42LwGroxbVepAMjk4bS/claims/bmw318i-adp6423-1744731977543.pdf";
const EXISTING_S3_KEY = "claims/bmw318i-adp6423-1744731977543.pdf";

async function main() {
  console.log("=== BMW 318i Claim Creation + Pipeline Run ===\n");

  const pdfBuffer = fs.readFileSync(PDF_PATH);
  const pdfHash = crypto.createHash("sha256").update(pdfBuffer).digest("hex");

  // Use already-uploaded S3 URL
  const s3Url = EXISTING_S3_URL;
  const fileKey = EXISTING_S3_KEY;
  console.log("Step 1: Using existing S3 upload:", s3Url.slice(0, 80) + "...");

  // 2. Create ingestion_document record
  console.log("\nStep 2: Creating ingestion_document record...");
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  
  const docUuid = crypto.randomUUID();
  const docResult = await db.insert(ingestionDocuments).values({
    tenantId: "kinga-default",
    documentId: docUuid,
    originalFilename: "DIEFTRACKMARKETINGBMW318iADP6423-audit-signed.pdf",
    fileSizeBytes: pdfBuffer.length,
    mimeType: "application/pdf",
    s3Key: fileKey,
    s3Url: s3Url,
    sha256Hash: pdfHash,
    hashVerified: 1,
    documentType: "claim_form",
    classificationConfidence: "0.9500",
    classificationMethod: "ai_model",
    extractionStatus: "completed",
    validationStatus: "approved",
    pageCount: 14,
    languageDetected: "en",
  } as any);
  const docId = (docResult as any)[0]?.insertId ?? null;
  console.log("  ✓ Created ingestion_document id:", docId);

  // 3. Create claim record
  console.log("\nStep 3: Creating claim record...");
  const claimNumber = `CLM-BMW318I-${Date.now()}`;
  
  const incidentDescription = [
    "DRIVER WAS DRIVING DOWNHILL AT GHIDAMBA AREA TOWARDS MAZOE AND FAILED TO NOTICE THAT HIS VEHICLE WAS BRAKING TO AVOID POTHOLES AND RAMMED INTO THE BACK OF THAT BMW VEHICLE.",
    "MATTER WAS REPORTED TO THE POLICE AND THE DRIVER WAS CHARGED.",
    "The BMW sustained damages on the rear section including the boot and bumper, the rear screen was also damaged.",
    "Insured vehicle hit the BMW from the back as it had braked to avoid a pothole.",
    "The damages are consistent with the raised circumstances on the claim form.",
    "Cost verified and agreed with repairer.",
    "Third party vehicle: BMW 318i registration ADP6423 was hit from the back (rear).",
    "Third party driver: RUNJARADZO NYAGOPE, 8995 Glen Norah C, Harare.",
    "Police report filed at Mazowe. Driver SYDNEY DUNG charged for driving without due care and attention.",
  ].join(" ");

  await createClaim({
    tenantId: "kinga-default",
    claimNumber,
    vehicleMake: "BMW",
    vehicleModel: "318i",
    vehicleYear: 2004,
    vehicleRegistration: "ADP6423",
    vehicleColor: "SILVER",
    vehicleVin: "WBAAN92040NTO5535",
    incidentDate: "2024-10-18",
    incidentDescription,
    incidentLocation: "25KM PEG - HARARE-MUKUMBURA ROAD",
    incidentType: "collision",
    incidentTime: "05:40",
    policyNumber: "NO",           // Intentionally "NO" to test domain corrector
    policeReportNumber: "MAZOWE-2024-001",
    policeStation: "MAZOWE",
    thirdPartyName: "RUNJARADZO NYAGOPE",
    thirdPartyRegistration: "ADP6423",
    thirdPartyVehicle: "BMW 318i",
    lodgerName: "DIEFTRACK MARKETING",
    lodgerPhone: "0772676296",
    lodgerCompany: "DIEFTRACK MARKETING",
    status: "intake_pending",
    workflowState: "intake_pending",
    aiAssessmentTriggered: 0,
    aiAssessmentCompleted: 0,
    sourceDocumentId: docId,
    claimSource: "pdf_upload",
    documentProcessingStatus: "completed",
    currencyCode: "USD",
    currency: "USD",
    estimatedClaimValue: 192280,
    vehicleMileage: 251388,
    vehicleEngineCapacity: 1800,
    vehicleFuelType: "petrol",
  } as any);

  // Get the new claim ID
  const [newClaim] = await db.select().from(claims).where(eq(claims.claimNumber, claimNumber)).limit(1);
  if (!newClaim) throw new Error("Failed to retrieve newly created claim");
  
  console.log(`  ✓ Created claim: ${claimNumber} (id: ${newClaim.id})`);
  console.log(`    Make: ${newClaim.vehicleMake}, Model: ${newClaim.vehicleModel}, Year: ${newClaim.vehicleYear}`);
  console.log(`    Registration: ${newClaim.vehicleRegistration}`);
  console.log(`    Policy: "${newClaim.policyNumber}" (domain corrector should flag this as invalid)`);
  console.log(`    Source doc id: ${docId}`);
  console.log(`    S3 URL: ${s3Url.slice(0, 80)}...`);

  // 4. Run pipeline
  console.log(`\nStep 4: Running AI pipeline for claim ${newClaim.id}...`);
  console.log("  (This takes 2-5 minutes — watch for Stage 2.5 domain correction output)\n");
  
  await triggerAiAssessment(newClaim.id);
  
  console.log(`\n✅ Pipeline complete! Claim ID: ${newClaim.id} (${claimNumber})`);
  
  // 5. Check final assessment
  const [latestAssessment] = await db
    .select()
    .from(ingestionDocuments)
    .where(eq(ingestionDocuments.id, docId!))
    .limit(1);

  // Get the AI assessment
  const mysql = await import("mysql2/promise");
  const dbUrl = process.env.DATABASE_URL!;
  const u = new URL(dbUrl);
  const conn = await mysql.default.createConnection({
    host: u.hostname, port: parseInt(u.port || "4000"),
    user: u.username, password: decodeURIComponent(u.password),
    database: u.pathname.slice(1), ssl: { rejectUnauthorized: false },
  });
  
  const [aiRows] = await conn.execute(
    "SELECT id, confidence_score, fraud_risk_level, fraud_score, recommendation, assumption_registry_json, pipeline_run_summary FROM ai_assessments WHERE claim_id = ? ORDER BY id DESC LIMIT 1",
    [newClaim.id]
  ) as any;
  
  if (aiRows.length > 0) {
    const ai = aiRows[0];
    console.log("\n=== PIPELINE RESULTS ===");
    console.log(`Confidence: ${ai.confidence_score}`);
    console.log(`Fraud risk: ${ai.fraud_risk_level} (score: ${ai.fraud_score})`);
    console.log(`Recommendation: ${ai.recommendation}`);
    
    if (ai.assumption_registry_json) {
      const registry = JSON.parse(ai.assumption_registry_json);
      console.log(`\nAssumption Registry: ${registry.totalCount} total`);
      const domainCorrs = registry.assumptions?.filter((a: any) => a.strategy === "domain_correction") ?? [];
      if (domainCorrs.length > 0) {
        console.log(`\n✓ Domain corrections applied (${domainCorrs.length}):`);
        domainCorrs.forEach((a: any) => {
          console.log(`  - ${a.field}: "${a.assumedValue}" | ${a.reason?.slice(0, 100)}`);
        });
      } else {
        console.log("\n⚠ No domain corrections in registry (vehicle data was already correct)");
      }
    } else {
      console.log("\n⚠ No assumption registry (pipeline may have run before domain corrector was wired)");
    }
    
    // Show stage 2.5 from pipeline summary
    if (ai.pipeline_run_summary) {
      const summary = JSON.parse(ai.pipeline_run_summary);
      console.log("\n=== STAGE SUMMARY ===");
      Object.entries(summary.stages ?? {}).forEach(([k, v]: [string, any]) => {
        if (v.assumptionCount > 0) {
          console.log(`  ${k}: ${v.assumptionCount} assumptions, status: ${v.status}`);
        }
      });
    }
  }
  
  await conn.end();
  console.log(`\nView full report at: /claims/${newClaim.id}/report`);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  console.error(err.stack);
  process.exit(1);
});
