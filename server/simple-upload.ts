/**
 * SIMPLIFIED PDF UPLOAD ENDPOINT - COMPLETE REBUILD
 * This is a clean, working implementation without legacy code
 */

import { Router, Request, Response } from "express";
import multer from "multer";
import { processExternalAssessment } from "./assessment-processor";

// Configure multer for file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files allowed"));
    }
  },
});

export const simpleUploadRouter = Router();

simpleUploadRouter.post(
  "/simple-upload",
  upload.single("file"),
  async (req: Request & { user?: { id: string } }, res: Response) => {
    console.log("\n========== SIMPLE UPLOAD ENDPOINT ==========");
    
    try {
      // Check authentication
      if (!req.user) {
        console.log("❌ No user session");
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Check file
      if (!req.file) {
        console.log("❌ No file uploaded");
        return res.status(400).json({ error: "No file uploaded" });
      }

      console.log(`✅ File received: ${req.file.originalname}`);
      console.log(`📦 File size: ${req.file.size} bytes`);
      console.log(`👤 User: ${req.user.id}`);

      // Process the PDF
      console.log("🔄 Starting PDF processing...");
      const result = await processExternalAssessment(
        req.file.originalname,
        req.file.buffer
      );

      console.log("✅ Processing complete!");
      console.log("📊 Extracted data:");
      console.log(`   - Make: ${result.vehicleMake}`);
      console.log(`   - Model: ${result.vehicleModel}`);
      console.log(`   - Year: ${result.vehicleYear}`);
      console.log(`   - Registration: ${result.vehicleRegistration}`);
      console.log(`   - Claimant: ${result.claimantName}`);
      console.log(`   - Cost: $${result.estimatedCost}`);
      console.log("==========================================\n");

      // Return the result
      return res.json({
        success: true,
        data: result
      });

    } catch (error: any) {
      console.error("❌ Error:", error.message);
      console.log("==========================================\n");
      return res.status(500).json({
        success: false,
        error: error.message || "Processing failed"
      });
    }
  }
);
