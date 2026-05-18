/**
 * Run Voltron Mining / Isuzu MU-X claim (2.4MB reduced version) through the full pipeline
 * Run with: npx tsx scripts/run_voltron_v2.ts 2>&1 | tee /tmp/voltron-v2.log
 */
import fs from "fs";
import crypto from "crypto";
import { createClaim, triggerAiAssessment, getDb } from "../server/db";
import { ingestionDocuments, claims } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const PDF_PATH = "/home/ubuntu/kinga-replit/scripts/VOLTRONMINECOR6002812_v2.pdf";
const S3_URL = "https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/CyuguwJyqzqWAqWZ.pdf";
const S3_KEY = "user_upload_by_module/session_file/310419663031527958/CyuguwJyqzqWAqWZ.pdf";

async function main() {
  console.log("=== Voltron Mining / Isuzu MU-X (2.4MB) — Full Pipeline Test ===\n");

  const pdfBuffer = fs.readFileSync(PDF_PATH);
  const pdfHash = crypto.createHash("sha256").update(pdfBuffer).digest("hex");
  console.log(`File: ${PDF_PATH}`);
  console.log(`Size: ${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB`);
  console.log(`SHA256: ${pdfHash}\n`);

  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // 1. Create ingestion_document record
  console.log("Step 1: Creating ingestion_document record...");
  const docUuid = crypto.randomUUID();
  const docResult = await db.insert(ingestionDocuments).values({
    tenantId: "kinga-default",
    batchId: 0,
    documentId: docUuid,
    originalFilename: "VOLTRONMINECOR6002812_v2.pdf",
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
  const claimNumber = `COR-6002812-V2-${Date.now()}`;
  await db.insert(claims).values({
    tenantId: "kinga-default",
    claimNumber,
    vehicleMake: "Isuzu",
    vehicleModel: "MU-X",
    vehicleYear: 2022,
    vehicleRegistration: "AFU7783",
    vehicleVin: "",
    vehicleColor: "",
    vehicleBodyType: "SUV",
    incidentDate: new Date("2026-04-15"),
    incidentLocation: "Mvuma to Kwekwe road, 25km peg",
    incidentDescription: [
      "Insured vehicle (Isuzu MU-X, AFU7783) hit a depression whilst travelling along the Mvuma to Kwekwe road at the 25km peg.",
      "This heavy impact resulted in damages on the front part of the vehicle and airbags deployed.",
      "Damage includes: front bumper, windscreen, both headlamps, both front airbags, knee airbag, airbag module, both front seat belt pretensioners, radiator, air conditioning radiator, front lower control arms, cab mountings, cross member bracket, camber bolts, right front fender, radiator support, bumper frame, engine bottom cover, sump cover.",
      "Grand Auto Premier was the lowest repairer. Spares prices were verified with Sarjazz and adjusted accordingly.",
    ].join(" "),
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
    estimatedClaimValue: 2110526,
    vehicleMileage: 0,
    vehicleEngineCapacity: 1900,
    vehicleFuelType: "diesel",
  } as any);

  const [newClaim] = await db.select().from(claims).where(eq(claims.claimNumber, claimNumber)).limit(1);
  if (!newClaim) throw new Error("Failed to retrieve newly created claim");
  console.log(`  ✓ Created claim: ${claimNumber} (id: ${newClaim.id})`);

  // 3. Run pipeline
  console.log(`\nStep 3: Running AI pipeline for claim ${newClaim.id}...`);
  console.log("  (Monitoring all 10 stages — watch for [KINGA] log lines)\n");
  const startTime = Date.now();
  await triggerAiAssessment(newClaim.id);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ Pipeline complete in ${elapsed}s! Claim ID: ${newClaim.id}`);

  // 4. Show results
  const mysql = await import("mysql2/promise");
  const dbUrl = process.env.DATABASE_URL!;
  const u = new URL(dbUrl);
  const conn = await mysql.default.createConnection({
    host: u.hostname, port: parseInt(u.port || "4000"),
    user: u.username, password: decodeURIComponent(u.password),
    database: u.pathname.slice(1), ssl: { rejectUnauthorized: false },
  });
  const [aiRows] = await conn.execute(
    `SELECT id, confidence_score, fraud_risk_level, fraud_score, recommendation, 
     overall_risk_score, pipeline_run_summary
     FROM ai_assessments WHERE claim_id = ? ORDER BY id DESC LIMIT 1`,
    [newClaim.id]
  ) as any;
  if (aiRows.length > 0) {
    const ai = aiRows[0];
    console.log("\n=== PIPELINE RESULTS ===");
    console.log(`Assessment ID: ${ai.id}`);
    console.log(`Confidence: ${ai.confidence_score}`);
    console.log(`Fraud risk: ${ai.fraud_risk_level} (score: ${ai.fraud_score})`);
    console.log(`Overall risk: ${ai.overall_risk_score}`);
    console.log(`Recommendation: ${ai.recommendation}`);
    if (ai.pipeline_run_summary) {
      try {
        const summary = JSON.parse(ai.pipeline_run_summary);
        console.log(`\nPipeline stages completed: ${JSON.stringify(summary, null, 2)}`);
      } catch {}
    }
  }

  // Check line items
  const [liRows] = await conn.execute(
    `SELECT COUNT(*) as total, SUM(CASE WHEN line_total > 0 THEN 1 ELSE 0 END) as priced,
     SUM(line_total) as total_amount
     FROM quote_line_items WHERE claim_id = ?`,
    [newClaim.id]
  ) as any;
  if (liRows.length > 0) {
    const li = liRows[0];
    console.log(`\nLine items: ${li.priced}/${li.total} priced, total = USD ${(li.total_amount/100).toFixed(2)}`);
  }

  await conn.end();
  console.log(`\nCLAIM_ID=${newClaim.id}`);
  console.log(`CLAIM_NUMBER=${claimNumber}`);
  console.log(`\nView report at: /claims/${newClaim.id}/report`);
}

main().then(() => {
  process.exit(0);
}).catch(err => {
  console.error("\n❌ Fatal:", err.message);
  console.error(err.stack);
  process.exit(1);
});
