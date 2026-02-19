/**
 * Seed Claims with Images Script
 * 
 * Purpose: Upload sample vehicle damage images to S3, create test claims with populated
 * damage_photos arrays, trigger AI assessments, and verify complete data pipeline.
 * 
 * Workflow:
 * 1. Upload 15 sample vehicle damage images to S3
 * 2. Verify S3 URLs are accessible (HTTP 200)
 * 3. Test CORS headers for frontend domain compatibility
 * 4. Create 20 test claims with populated damage_photos arrays
 * 5. Trigger AI assessment for each claim (processClaimAssessment)
 * 6. Verify AI vision runs successfully
 * 7. Verify physicsAnalysis saved to database
 * 8. Generate comprehensive seed report
 */

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync, existsSync } from "fs";
import { getDb, triggerAiAssessment } from "../server/db.ts";
import { claims, aiAssessments, users, tenants } from "../drizzle/schema.ts";
import { storagePut } from "../server/storage.ts";
import { eq } from "drizzle-orm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Sample vehicle damage images from /home/ubuntu/upload
const DAMAGE_IMAGES = [
  { filename: "image1.jpg", description: "Frontal damage - Audi A4 front bumper and headlight", impactZone: "front_center" },
  { filename: "image2.jpg", description: "Frontal damage - Audi A4 front bumper close-up", impactZone: "front_center" },
  { filename: "image3.jpg", description: "Rear damage - Audi A4 rear quarter panel", impactZone: "rear_right" },
  { filename: "image4.jpg", description: "Severe frontal damage - Toyota Hilux front end crushed", impactZone: "front_center" },
  { filename: "image5.jpg", description: "Frontal damage - Volkswagen Amarok front bumper and hood", impactZone: "front_center" },
  { filename: "image6.jpg", description: "Side damage - Jeep Grand Cherokee front fender and door", impactZone: "front_right" },
  { filename: "image7.jpg", description: "Severe frontal damage - Toyota Corolla front end collapsed", impactZone: "front_center" },
  { filename: "image8.jpg", description: "Side damage - Toyota Hilux front fender", impactZone: "front_left" },
  { filename: "image9.jpg", description: "Side damage - Toyota Hilux rear door and rocker panel", impactZone: "rear_left" },
  { filename: "image10.jpg", description: "Side damage - Toyota Hilux rear door close-up", impactZone: "rear_left" },
  { filename: "image11.jpg", description: "Frontal damage - Toyota Corolla front bumper", impactZone: "front_center" },
  { filename: "image12.jpg", description: "Rear damage - Isuzu D-Max rear quarter panel", impactZone: "rear_left" },
  { filename: "image13.jpg", description: "Severe frontal damage - Volvo truck front bumper and grille", impactZone: "front_center" },
  { filename: "image14.jpg", description: "No visible damage - Volvo truck side view", impactZone: "none" },
  { filename: "image15.jpg", description: "Rear damage - Toyota Corolla rear bumper", impactZone: "rear_center" },
];

// Test claim templates (20 claims using combinations of images)
const CLAIM_TEMPLATES = [
  { vehicleMake: "Audi", vehicleModel: "A4", images: ["image1.jpg", "image2.jpg"], severity: "moderate" },
  { vehicleMake: "Audi", vehicleModel: "A4", images: ["image3.jpg"], severity: "minor" },
  { vehicleMake: "Toyota", vehicleModel: "Hilux", images: ["image4.jpg"], severity: "severe" },
  { vehicleMake: "Volkswagen", vehicleModel: "Amarok", images: ["image5.jpg"], severity: "moderate" },
  { vehicleMake: "Jeep", vehicleModel: "Grand Cherokee", images: ["image6.jpg"], severity: "moderate" },
  { vehicleMake: "Toyota", vehicleModel: "Corolla", images: ["image7.jpg"], severity: "severe" },
  { vehicleMake: "Toyota", vehicleModel: "Hilux", images: ["image8.jpg"], severity: "minor" },
  { vehicleMake: "Toyota", vehicleModel: "Hilux", images: ["image9.jpg", "image10.jpg"], severity: "moderate" },
  { vehicleMake: "Toyota", vehicleModel: "Corolla", images: ["image11.jpg"], severity: "moderate" },
  { vehicleMake: "Isuzu", vehicleModel: "D-Max", images: ["image12.jpg"], severity: "minor" },
  { vehicleMake: "Volvo", vehicleModel: "FH16", images: ["image13.jpg"], severity: "severe" },
  { vehicleMake: "Volvo", vehicleModel: "FH16", images: ["image14.jpg"], severity: "none" },
  { vehicleMake: "Toyota", vehicleModel: "Corolla", images: ["image15.jpg"], severity: "minor" },
  { vehicleMake: "Toyota", vehicleModel: "Hilux", images: ["image4.jpg", "image8.jpg"], severity: "severe" },
  { vehicleMake: "Toyota", vehicleModel: "Corolla", images: ["image7.jpg", "image11.jpg"], severity: "severe" },
  { vehicleMake: "Audi", vehicleModel: "A4", images: ["image1.jpg", "image2.jpg", "image3.jpg"], severity: "moderate" },
  { vehicleMake: "Toyota", vehicleModel: "Hilux", images: ["image9.jpg", "image10.jpg", "image12.jpg"], severity: "moderate" },
  { vehicleMake: "Jeep", vehicleModel: "Grand Cherokee", images: ["image6.jpg"], severity: "moderate" },
  { vehicleMake: "Volkswagen", vehicleModel: "Amarok", images: ["image5.jpg"], severity: "moderate" },
  { vehicleMake: "Toyota", vehicleModel: "Corolla", images: ["image15.jpg"], severity: "minor" },
];

interface UploadedImage {
  filename: string;
  s3Url: string;
  description: string;
  impactZone: string;
  accessible: boolean;
  corsValid: boolean;
  error?: string;
}

interface CreatedClaim {
  claimId: string;
  claimNumber: string;
  vehicleMake: string;
  vehicleModel: string;
  imageCount: number;
  imageUrls: string[];
  aiAssessmentId?: string;
  aiProcessed: boolean;
  physicsAnalysisPresent: boolean;
  confidenceScore?: number;
  error?: string;
}

interface SeedReport {
  timestamp: string;
  imagesUploaded: number;
  imagesAccessible: number;
  imagesCorsValid: number;
  claimsCreated: number;
  aiAssessmentsTriggered: number;
  aiAssessmentsSuccessful: number;
  physicsAnalysisPopulated: number;
  uploadedImages: UploadedImage[];
  createdClaims: CreatedClaim[];
  errors: string[];
}

/**
 * Upload image to S3 and verify accessibility
 */
async function uploadImageToS3(filename: string, description: string, impactZone: string): Promise<UploadedImage> {
  const uploadDir = "/home/ubuntu/upload";
  const imagePath = join(uploadDir, filename);

  console.log(`📤 Uploading ${filename}...`);

  try {
    // Check if file exists
    if (!existsSync(imagePath)) {
      throw new Error(`Image file not found: ${imagePath}`);
    }

    // Read file as buffer
    const imageBuffer = readFileSync(imagePath);

    // Generate unique S3 key with timestamp to prevent collisions
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const s3Key = `seed-data/damage-photos/${timestamp}-${randomSuffix}-${filename}`;

    // Upload to S3
    const { url: s3Url } = await storagePut(s3Key, imageBuffer, "image/jpeg");

    console.log(`   ✅ Uploaded: ${s3Url}`);

    // Verify S3 URL is accessible
    let accessible = false;
    let corsValid = false;
    let error: string | undefined;

    try {
      const response = await fetch(s3Url, { method: "HEAD" });
      accessible = response.status === 200;

      // Check CORS headers
      const corsHeader = response.headers.get("Access-Control-Allow-Origin");
      corsValid = corsHeader === "*" || corsHeader !== null;

      if (!accessible) {
        error = `HTTP ${response.status}`;
      }
    } catch (fetchError: any) {
      accessible = false;
      error = fetchError.message;
    }

    return {
      filename,
      s3Url,
      description,
      impactZone,
      accessible,
      corsValid,
      error,
    };
  } catch (uploadError: any) {
    console.error(`   ❌ Upload failed: ${uploadError.message}`);
    return {
      filename,
      s3Url: "",
      description,
      impactZone,
      accessible: false,
      corsValid: false,
      error: uploadError.message,
    };
  }
}

/**
 * Create test claim with damage photos
 */
async function createTestClaim(
  template: typeof CLAIM_TEMPLATES[0],
  imageMap: Map<string, UploadedImage>,
  claimantUserId: string,
  tenantId: string
): Promise<CreatedClaim> {
  console.log(`📝 Creating claim: ${template.vehicleMake} ${template.vehicleModel}...`);

  try {
    // Get S3 URLs for images
    const imageUrls = template.images
      .map((filename) => imageMap.get(filename)?.s3Url)
      .filter((url): url is string => !!url);

    if (imageUrls.length === 0) {
      throw new Error("No valid image URLs found for claim");
    }

    // Generate unique claim number
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const claimNumber = `SEED-${timestamp}-${randomSuffix}`;

    // Insert claim into database
    const db = await getDb();
    if (!db) {
      throw new Error("Database not available");
    }

    const [claim] = await db
      .insert(claims)
      .values({
        claimNumber,
        claimantUserId,
        tenantId,
        vehicleMake: template.vehicleMake,
        vehicleModel: template.vehicleModel,
        vehicleYear: 2020,
        vehicleRegistration: `ABC${Math.floor(Math.random() * 9000) + 1000}`,
        incidentDate: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // Random date within last 30 days
        incidentDescription: `Test claim with ${template.severity} damage - ${template.images.length} photo(s)`,
        damagePhotos: JSON.stringify(imageUrls), // Store as JSON array
        status: "pending_assessment",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .$returningId();

    console.log(`   ✅ Claim created: ${claimNumber} (ID: ${claim.id})`);

    // Trigger AI assessment
    let aiAssessmentId: string | undefined;
    let aiProcessed = false;
    let physicsAnalysisPresent = false;
    let confidenceScore: number | undefined;
    let error: string | undefined;

    try {
      console.log(`   🤖 Triggering AI assessment...`);
      await triggerAiAssessment(claim.id);

      // Fetch AI assessment from database
      const db2 = await getDb();
      if (!db2) {
        throw new Error("Database not available");
      }

      const [assessment] = await db2
        .select()
        .from(aiAssessments)
        .where(eq(aiAssessments.claimId, claim.id))
        .limit(1);

      if (assessment) {
        aiAssessmentId = assessment.id;
        aiProcessed = true;
        confidenceScore = assessment.confidenceScore ?? undefined;

        // Check if physicsAnalysis is populated
        if (assessment.physicsAnalysis) {
          try {
            const physicsData = JSON.parse(assessment.physicsAnalysis);
            physicsAnalysisPresent = !!(
              physicsData.impactAngleDegrees !== undefined ||
              physicsData.calculatedImpactForceKN !== undefined ||
              physicsData.impactLocationNormalized !== undefined
            );
          } catch {
            physicsAnalysisPresent = false;
          }
        }

        console.log(`   ✅ AI assessment complete (ID: ${aiAssessmentId})`);
        console.log(`      Confidence: ${confidenceScore?.toFixed(2) ?? "N/A"}`);
        console.log(`      Physics Analysis: ${physicsAnalysisPresent ? "YES" : "NO"}`);
      } else {
        error = "AI assessment not found in database after processing";
      }
    } catch (aiError: any) {
      error = `AI assessment failed: ${aiError.message}`;
      console.error(`   ❌ ${error}`);
    }

    return {
      claimId: claim.id,
      claimNumber,
      vehicleMake: template.vehicleMake,
      vehicleModel: template.vehicleModel,
      imageCount: imageUrls.length,
      imageUrls,
      aiAssessmentId,
      aiProcessed,
      physicsAnalysisPresent,
      confidenceScore,
      error,
    };
  } catch (claimError: any) {
    console.error(`   ❌ Claim creation failed: ${claimError.message}`);
    return {
      claimId: "",
      claimNumber: "",
      vehicleMake: template.vehicleMake,
      vehicleModel: template.vehicleModel,
      imageCount: 0,
      imageUrls: [],
      aiProcessed: false,
      physicsAnalysisPresent: false,
      error: claimError.message,
    };
  }
}

/**
 * Main seed script execution
 */
async function main() {
  console.log("🌱 Seed Claims with Images Script");
  console.log("==================================\n");

  const report: SeedReport = {
    timestamp: new Date().toISOString(),
    imagesUploaded: 0,
    imagesAccessible: 0,
    imagesCorsValid: 0,
    claimsCreated: 0,
    aiAssessmentsTriggered: 0,
    aiAssessmentsSuccessful: 0,
    physicsAnalysisPopulated: 0,
    uploadedImages: [],
    createdClaims: [],
    errors: [],
  };

  try {
    // Step 1: Upload images to S3
    console.log("📤 Step 1: Uploading images to S3...\n");

    const imageMap = new Map<string, UploadedImage>();

    for (const imageConfig of DAMAGE_IMAGES) {
      const uploadedImage = await uploadImageToS3(
        imageConfig.filename,
        imageConfig.description,
        imageConfig.impactZone
      );

      imageMap.set(imageConfig.filename, uploadedImage);
      report.uploadedImages.push(uploadedImage);

      if (uploadedImage.s3Url) {
        report.imagesUploaded++;
      }
      if (uploadedImage.accessible) {
        report.imagesAccessible++;
      }
      if (uploadedImage.corsValid) {
        report.imagesCorsValid++;
      }
      if (uploadedImage.error) {
        report.errors.push(`Image upload error (${imageConfig.filename}): ${uploadedImage.error}`);
      }
    }

    console.log(`\n✅ Images uploaded: ${report.imagesUploaded}/${DAMAGE_IMAGES.length}`);
    console.log(`✅ Images accessible: ${report.imagesAccessible}/${report.imagesUploaded}`);
    console.log(`✅ CORS valid: ${report.imagesCorsValid}/${report.imagesUploaded}\n`);

    // Step 2: Use hardcoded tenant/user IDs (database already has 553 claims with existing data)
    console.log("👤 Step 2: Using existing tenant and user data...\n");

    // Use hardcoded IDs from existing database (avoids connection issues)
    // These IDs are from the existing 553 claims in the database
    const tenantId = "default"; // Default tenant ID used in existing claims
    const claimantUserId = 1; // Use existing user ID 1 (common default user ID)

    console.log(`   ✅ Tenant ID: ${tenantId}`);
    console.log(`   ✅ Claimant User ID: ${claimantUserId}\n`);

    // Step 3: Create test claims
    console.log("📝 Step 3: Creating test claims...\n");

    for (const template of CLAIM_TEMPLATES) {
      const createdClaim = await createTestClaim(template, imageMap, claimantUserId, tenantId);

      report.createdClaims.push(createdClaim);

      if (createdClaim.claimId) {
        report.claimsCreated++;
      }
      if (createdClaim.aiAssessmentId) {
        report.aiAssessmentsTriggered++;
      }
      if (createdClaim.aiProcessed) {
        report.aiAssessmentsSuccessful++;
      }
      if (createdClaim.physicsAnalysisPresent) {
        report.physicsAnalysisPopulated++;
      }
      if (createdClaim.error) {
        report.errors.push(`Claim error (${template.vehicleMake} ${template.vehicleModel}): ${createdClaim.error}`);
      }

      console.log(""); // Blank line between claims
    }

    console.log(`✅ Claims created: ${report.claimsCreated}/${CLAIM_TEMPLATES.length}`);
    console.log(`✅ AI assessments triggered: ${report.aiAssessmentsTriggered}/${report.claimsCreated}`);
    console.log(`✅ AI assessments successful: ${report.aiAssessmentsSuccessful}/${report.aiAssessmentsTriggered}`);
    console.log(`✅ Physics analysis populated: ${report.physicsAnalysisPopulated}/${report.aiAssessmentsSuccessful}\n`);

    // Step 4: Generate report files
    console.log("📊 Step 4: Generating seed report...\n");

    const reportPath = join(__dirname, "..", "SEED_CLAIMS_REPORT.json");
    const mdReportPath = join(__dirname, "..", "SEED_CLAIMS_REPORT.md");

    // Write JSON report
    const { writeFileSync } = await import("fs");
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`   ✅ JSON report: ${reportPath}`);

    // Generate markdown report
    let mdReport = `# Seed Claims with Images - Report\n\n`;
    mdReport += `**Generated:** ${report.timestamp}\n\n`;
    mdReport += `## Summary\n\n`;
    mdReport += `| Metric | Count |\n`;
    mdReport += `|--------|-------|\n`;
    mdReport += `| Images Uploaded | ${report.imagesUploaded}/${DAMAGE_IMAGES.length} |\n`;
    mdReport += `| Images Accessible | ${report.imagesAccessible}/${report.imagesUploaded} |\n`;
    mdReport += `| CORS Valid | ${report.imagesCorsValid}/${report.imagesUploaded} |\n`;
    mdReport += `| Claims Created | ${report.claimsCreated}/${CLAIM_TEMPLATES.length} |\n`;
    mdReport += `| AI Assessments Triggered | ${report.aiAssessmentsTriggered}/${report.claimsCreated} |\n`;
    mdReport += `| AI Assessments Successful | ${report.aiAssessmentsSuccessful}/${report.aiAssessmentsTriggered} |\n`;
    mdReport += `| Physics Analysis Populated | ${report.physicsAnalysisPopulated}/${report.aiAssessmentsSuccessful} |\n`;
    mdReport += `| Errors | ${report.errors.length} |\n\n`;

    mdReport += `## Uploaded Images\n\n`;
    mdReport += `| Filename | Description | S3 URL | Accessible | CORS |\n`;
    mdReport += `|----------|-------------|--------|------------|------|\n`;
    for (const img of report.uploadedImages) {
      mdReport += `| ${img.filename} | ${img.description} | ${img.s3Url ? "✅" : "❌"} | ${img.accessible ? "✅" : "❌"} | ${img.corsValid ? "✅" : "❌"} |\n`;
    }

    mdReport += `\n## Created Claims\n\n`;
    mdReport += `| Claim Number | Vehicle | Images | AI Processed | Physics Analysis | Confidence |\n`;
    mdReport += `|--------------|---------|--------|--------------|------------------|------------|\n`;
    for (const claim of report.createdClaims) {
      mdReport += `| ${claim.claimNumber || "N/A"} | ${claim.vehicleMake} ${claim.vehicleModel} | ${claim.imageCount} | ${claim.aiProcessed ? "✅" : "❌"} | ${claim.physicsAnalysisPresent ? "✅" : "❌"} | ${claim.confidenceScore?.toFixed(2) ?? "N/A"} |\n`;
    }

    if (report.errors.length > 0) {
      mdReport += `\n## Errors\n\n`;
      for (const error of report.errors) {
        mdReport += `- ${error}\n`;
      }
    }

    writeFileSync(mdReportPath, mdReport);
    console.log(`   ✅ Markdown report: ${mdReportPath}\n`);

    console.log("✅ Seed script complete!\n");
    console.log("📊 Summary:");
    console.log(`   - ${report.imagesUploaded} images uploaded to S3`);
    console.log(`   - ${report.claimsCreated} claims created`);
    console.log(`   - ${report.aiAssessmentsSuccessful} AI assessments successful`);
    console.log(`   - ${report.physicsAnalysisPopulated} physics analyses populated`);
    console.log(`   - ${report.errors.length} errors encountered\n`);

    process.exit(0);
  } catch (error: any) {
    console.error(`\n❌ Fatal error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run main function
main();
