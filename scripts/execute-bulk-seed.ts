/**
 * Execute Bulk Seed Claims
 * 
 * Directly calls the bulk seed logic using the internal database connection
 * to bypass standalone script connection issues.
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { getDb, triggerAiAssessment } from "../server/db.ts";
import { claims, users, tenants } from "../drizzle/schema.ts";
import { storagePut } from "../server/storage.ts";

const IMAGE_DIR = "/home/ubuntu/upload";
const CLAIM_COUNT = 20;

async function main() {
  console.log("🌱 Bulk Seed Claims - Direct Execution");
  console.log("=======================================\n");

  const db = await getDb();
  if (!db) {
    console.error("❌ Database connection failed");
    process.exit(1);
  }

  // Query for valid user IDs
  console.log("👤 Querying valid users...");
  const validUsers = await db
    .select({ id: users.id, name: users.name, openId: users.openId })
    .from(users)
    .limit(5);

  if (validUsers.length === 0) {
    console.error("❌ No valid users found");
    process.exit(1);
  }

  const validUserIds = validUsers.map(u => u.id);
  console.log(`✅ Found ${validUsers.length} valid users`);
  for (const user of validUsers) {
    console.log(`   - User ID: ${user.id} (${user.name || user.openId})`);
  }

  // Query for tenant
  const validTenants = await db
    .select({ id: tenants.id, name: tenants.name })
    .from(tenants)
    .limit(1);

  if (validTenants.length === 0) {
    console.error("❌ No valid tenants found");
    process.exit(1);
  }

  const tenantId = validTenants[0].id;
  console.log(`✅ Using Tenant ID: ${tenantId} (${validTenants[0].name})\n`);

  // Upload images
  console.log("📤 Uploading images to S3...");
  const imageFiles = readdirSync(IMAGE_DIR)
    .filter((file) => /\.(jpg|jpeg|png)$/i.test(file))
    .slice(0, 15);

  const uploadedImages: { filename: string; s3Url: string }[] = [];

  for (const filename of imageFiles) {
    try {
      const imagePath = join(IMAGE_DIR, filename);
      const imageBuffer = readFileSync(imagePath);

      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const s3Key = `seed-data/damage-photos/${timestamp}-${randomSuffix}-${filename}`;

      const { url: s3Url } = await storagePut(s3Key, imageBuffer, "image/jpeg");
      uploadedImages.push({ filename, s3Url });
      console.log(`   ✅ ${filename}`);
    } catch (error: any) {
      console.error(`   ❌ ${filename}: ${error.message}`);
    }
  }

  console.log(`\n✅ Uploaded ${uploadedImages.length} images\n`);

  // Create claims
  console.log("📝 Creating claims...");
  const vehicleTemplates = [
    { make: "Audi", model: "A4", severity: "moderate" },
    { make: "Toyota", model: "Hilux", severity: "severe" },
    { make: "Volkswagen", model: "Amarok", severity: "moderate" },
    { make: "Jeep", model: "Grand Cherokee", severity: "moderate" },
    { make: "Toyota", model: "Corolla", severity: "minor" },
    { make: "Isuzu", model: "D-Max", severity: "minor" },
    { make: "Volvo", model: "FH16", severity: "severe" },
    { make: "Ford", model: "Ranger", severity: "moderate" },
    { make: "Nissan", model: "Navara", severity: "minor" },
    { make: "Mazda", model: "BT-50", severity: "moderate" },
  ];

  let claimsCreated = 0;
  let aiAssessmentsTriggered = 0;

  for (let i = 0; i < CLAIM_COUNT; i++) {
    try {
      const template = vehicleTemplates[i % vehicleTemplates.length];
      
      // Select 1-3 random images
      const imageCount = Math.floor(Math.random() * 3) + 1;
      const selectedImages = [];
      for (let j = 0; j < imageCount; j++) {
        const randomIndex = Math.floor(Math.random() * uploadedImages.length);
        selectedImages.push(uploadedImages[randomIndex].s3Url);
      }

      // Random user ID
      const randomUserIndex = Math.floor(Math.random() * validUserIds.length);
      const selectedUserId = validUserIds[randomUserIndex];

      // Generate claim number
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
      const claimNumber = `SEED-${timestamp}-${randomSuffix}`;

      // Insert claim
      const [claim] = await db
        .insert(claims)
        .values({
          claimNumber,
          claimantId: selectedUserId,
          tenantId,
          vehicleMake: template.make,
          vehicleModel: template.model,
          vehicleYear: 2020,
          vehicleRegistration: `ABC${Math.floor(Math.random() * 9000) + 1000}`,
          incidentDate: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
          incidentDescription: `Test claim with ${template.severity} damage - ${imageCount} photo(s)`,
          damagePhotos: JSON.stringify(selectedImages),
          status: "assessment_pending",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .$returningId();

      claimsCreated++;
      console.log(`   ✅ ${claimNumber} (${template.make} ${template.model}) - User ${selectedUserId}`);

      // Trigger AI assessment
      try {
        await triggerAiAssessment(claim.id);
        aiAssessmentsTriggered++;
      } catch (aiError: any) {
        console.error(`      ⚠️ AI assessment failed: ${aiError.message}`);
      }
    } catch (error: any) {
      console.error(`   ❌ Claim ${i + 1} failed: ${error.message}`);
    }
  }

  console.log(`\n✅ Bulk Seed Complete!`);
  console.log(`   - Claims created: ${claimsCreated}/${CLAIM_COUNT}`);
  console.log(`   - AI assessments triggered: ${aiAssessmentsTriggered}/${claimsCreated}`);
  console.log(`   - Images uploaded: ${uploadedImages.length}\n`);

  process.exit(0);
}

main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
