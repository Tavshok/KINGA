/**
 * Direct pipeline trigger for BMW 318i claim
 * Run with: npx tsx scripts/trigger-bmw-pipeline.ts
 */
import { createClaim, triggerAiAssessment } from "../server/db";
import { storagePut } from "../server/storage";
import fs from "fs";
import crypto from "crypto";
import { getDb } from "../server/_core/db";
import { ingestionDocuments } from "../drizzle/schema";

async function main() {
  console.log("=== BMW 318i Pipeline Test ===\n");

  // 1. Upload PDF to S3
  const pdfPath = "/home/ubuntu/upload/DIEFTRACKMARKETINGBMW318iADP6423-audit-signed.pdf";
  const pdfBuffer = fs.readFileSync(pdfPath);
  const pdfHash = crypto.createHash("sha256").update(pdfBuffer).digest("hex");
  const fileKey = `claims/bmw318i-adp6423-${Date.now()}.pdf`;

  console.log("Uploading PDF to S3...");
  let s3Url: string | null = null;
  let docId: number | null = null;

  try {
    const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");
    s3Url = url;
    console.log("  ✓ Uploaded:", s3Url?.slice(0, 80) + "...");
  } catch (err: any) {
    console.warn("  ✗ S3 upload failed:", err.message);
    console.log("  Proceeding without PDF URL (pipeline will use text-only mode)");
  }

  // 2. Create ingestion_document record
  if (s3Url) {
    const db = await getDb();
    if (db) {
      const docUuid = crypto.randomUUID();
      const [result] = await db.insert(ingestionDocuments).values({
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
      docId = (result as any).insertId;
      console.log("  ✓ Created ingestion_document id:", docId);
    }
  }

  // 3. Create claim
  const claimNumber = `CLM-BMW-${Date.now()}`;
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

  console.log("\nCreating claim record...");
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
    policyNumber: "NO",              // Intentionally "NO" to test domain corrector
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
    documentProcessingStatus: docId ? "completed" : "pending",
    currencyCode: "USD",
    currency: "USD",
    estimatedClaimValue: 192280,     // $1922.80 in cents
    vehicleMileage: 251388,
    vehicleEngineCapacity: 1800,
    vehicleFuelType: "petrol",
  } as any);

  // Get the newly created claim ID
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { claims } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  const [newClaim] = await db.select().from(claims).where(eq(claims.claimNumber, claimNumber)).limit(1);
  
  if (!newClaim) throw new Error("Failed to retrieve newly created claim");
  
  console.log(`  ✓ Created claim: ${claimNumber} (id: ${newClaim.id})`);
  console.log(`    Make: ${newClaim.vehicleMake}, Model: ${newClaim.vehicleModel}, Year: ${newClaim.vehicleYear}`);
  console.log(`    Registration: ${newClaim.vehicleRegistration}`);
  console.log(`    Policy: "${newClaim.policyNumber}" (should be flagged as invalid by domain corrector)`);
  console.log(`    Source doc: ${docId || "none"}`);

  // 4. Trigger pipeline
  console.log(`\nTriggering AI assessment pipeline for claim ${newClaim.id}...`);
  console.log("(This will take 2-5 minutes — watch server logs for progress)\n");
  
  await triggerAiAssessment(newClaim.id);
  
  console.log(`\n✓ Pipeline completed for claim ${newClaim.id} (${claimNumber})`);
  console.log(`\nView results at: https://3000-i35v54ds8yc39oabmnjg6-c3e68f00.us2.manus.computer`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
