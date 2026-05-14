/**
 * Create Voltron Mining / Isuzu MU-X (AFU7783) claim from PDF and run the full pipeline
 * Claim No: COR 6002812
 * Run with: npx tsx scripts/run_voltron_claim.ts
 */
import fs from "fs";
import crypto from "crypto";
import { createClaim, triggerAiAssessment, getDb } from "../server/db";
import { ingestionDocuments, claims } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const PDF_PATH = "/home/ubuntu/upload/VOLTRONMINECOR6002812.pdf";
// Pre-uploaded S3 URL
const S3_URL = "https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/BWtonHEBEihnJzgx.pdf";
const S3_KEY = "user_upload_by_module/session_file/310419663031527958/BWtonHEBEihnJzgx.pdf";

async function main() {
  console.log("=== Voltron Mining / Isuzu MU-X Claim Creation + Pipeline Run ===\n");

  const pdfBuffer = fs.readFileSync(PDF_PATH);
  const pdfHash = crypto.createHash("sha256").update(pdfBuffer).digest("hex");

  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // 1. Create ingestion_document record
  console.log("Step 1: Creating ingestion_document record...");
  const docUuid = crypto.randomUUID();
  const docResult = await db.insert(ingestionDocuments).values({
    tenantId: "kinga-default",
    batchId: 0,
    documentId: docUuid,
    originalFilename: "VOLTRONMINECOR6002812.pdf",
    fileSizeBytes: pdfBuffer.length,
    mimeType: "application/pdf",
    s3Bucket: "files.manuscdn.com",
    s3Key: S3_KEY,
    s3Url: S3_URL,
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

  // 2. Create claim record
  console.log("\nStep 2: Creating claim record...");
  const claimNumber = `COR-6002812-${Date.now()}`;

  const incidentDescription = [
    "Insured vehicle (Isuzu MU-X, AFU7783) hit a depression whilst travelling along the Mvuma to Kwekwe road at the 25km peg.",
    "This heavy impact resulted in damages on the front part of the vehicle and airbags deployed.",
    "Damage includes: front bumper, windscreen, both headlamps, both front airbags, knee airbag, airbag module, both front seat belt pretensioners, radiator, air conditioning radiator, front lower control arms, cab mountings, cross member bracket, camber bolts, right front fender, radiator support, bumper frame, engine bottom cover, sump cover.",
    "Grand Auto Premier was the lowest repairer. Spares prices were verified with Sarjazz and adjusted accordingly.",
    "Suspension is not covered since it is specifically mentioned in the policy wording.",
    "Circumstances of loss are genuine. Damage is consistent with narrated circumstances.",
    "Risk Manager note: passenger seat belt pretensioner was activated by airbag sensors; replacement of both driver and passenger seat belt pretensioners required.",
    "Assessor: NLA (National Loss Adjusters). Date inspected: 03/06/25.",
    "Two quotes received: Cedric Jonker Spraypaints (USD 25,005.60 incl. VAT) and Grand Auto Premier (USD 24,782.31 incl. VAT).",
    "Agreed repair cost: USD 21,105.26 (after adjustments). Cell Insurance invoice: USD 18,994.73. Excess and betterment: USD 2,110.53.",
    "Market value of vehicle: USD 45,000. Policy: Cell Insurance. Claim No: COR 6002812.",
  ].join(" ");

  await createClaim({
    tenantId: "kinga-default",
    claimNumber,
    vehicleMake: "Isuzu",
    vehicleModel: "MU-X",
    vehicleYear: 2020,
    vehicleRegistration: "AFU7783",
    vehicleColor: "White",
    vehicleVin: "",
    incidentDate: "2025-05-25",
    incidentDescription,
    incidentLocation: "25KM PEG - MVUMA TO KWEKWE ROAD",
    incidentType: "collision",
    incidentTime: "",
    policyNumber: "COR 6002812",
    policeReportNumber: "",
    policeStation: "",
    thirdPartyName: "",
    thirdPartyRegistration: "",
    thirdPartyVehicle: "",
    lodgerName: "VOLTRON MINING",
    lodgerPhone: "0781310412",
    lodgerCompany: "VOLTRON MINING",
    status: "intake_pending",
    workflowState: "intake_queue",
    aiAssessmentTriggered: 0,
    aiAssessmentCompleted: 0,
    sourceDocumentId: docId,
    claimSource: "pdf_upload",
    documentProcessingStatus: "completed",
    currencyCode: "USD",
    currency: "USD",
    estimatedClaimValue: 2110526,  // cents: $21,105.26
    vehicleMileage: 0,
    vehicleEngineCapacity: 1900,
    vehicleFuelType: "diesel",
  } as any);

  const [newClaim] = await db.select().from(claims).where(eq(claims.claimNumber, claimNumber)).limit(1);
  if (!newClaim) throw new Error("Failed to retrieve newly created claim");

  console.log(`  ✓ Created claim: ${claimNumber} (id: ${newClaim.id})`);
  console.log(`    Make: ${newClaim.vehicleMake}, Model: ${newClaim.vehicleModel}, Year: ${newClaim.vehicleYear}`);
  console.log(`    Registration: ${newClaim.vehicleRegistration}`);
  console.log(`    Source doc id: ${docId}`);

  // 3. Run pipeline
  console.log(`\nStep 3: Running AI pipeline for claim ${newClaim.id}...`);
  console.log("  (This takes 3-6 minutes — all 11 stages will run)\n");

  await triggerAiAssessment(newClaim.id);

  console.log(`\n✅ Pipeline complete! Claim ID: ${newClaim.id} (${claimNumber})`);
  console.log(`\nView full report at: /claims/${newClaim.id}/report`);

  // 4. Show results summary
  const mysql = await import("mysql2/promise");
  const dbUrl = process.env.DATABASE_URL!;
  const u = new URL(dbUrl);
  const conn = await mysql.default.createConnection({
    host: u.hostname, port: parseInt(u.port || "4000"),
    user: u.username, password: decodeURIComponent(u.password),
    database: u.pathname.slice(1), ssl: { rejectUnauthorized: false },
  });

  const [aiRows] = await conn.execute(
    "SELECT id, confidence_score, fraud_risk_level, fraud_score, recommendation, pipeline_run_summary FROM ai_assessments WHERE claim_id = ? ORDER BY id DESC LIMIT 1",
    [newClaim.id]
  ) as any;

  if (aiRows.length > 0) {
    const ai = aiRows[0];
    console.log("\n=== PIPELINE RESULTS ===");
    console.log(`Assessment ID: ${ai.id}`);
    console.log(`Confidence: ${ai.confidence_score}`);
    console.log(`Fraud risk: ${ai.fraud_risk_level} (score: ${ai.fraud_score})`);
    console.log(`Recommendation: ${ai.recommendation}`);
  }

  await conn.end();

  // Return the claim ID for report export
  console.log(`\nCLAIM_ID=${newClaim.id}`);
  console.log(`CLAIM_NUMBER=${claimNumber}`);
}

main().then(() => {
  process.exit(0);
}).catch(err => {
  console.error("Fatal:", err.message);
  console.error(err.stack);
  process.exit(1);
});
