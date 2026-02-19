// @ts-nocheck
import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { processExternalAssessment } from "./assessment-processor";
import { sdk } from "./_core/sdk";

// Configure multer for memory storage (files stored in memory as Buffer)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
});

// Authentication middleware for Express routes
async function authMiddleware(req: Request & { user?: any }, res: Response, next: NextFunction) {
  try {
    const user = await sdk.authenticateRequest(req);
    req.user = user;
    next();
  } catch (error) {
    console.error("❌ [Auth Middleware] Authentication failed:", error);
    return res.status(401).json({ message: "Unauthorized - please log in" });
  }
}

export const uploadAssessmentRouter = Router();

uploadAssessmentRouter.post(
  "/upload-assessment",
  authMiddleware,
  upload.single("file"),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      console.log("📥 [Upload Endpoint] Received file upload request");
      console.log(`👤 [Upload Endpoint] User: ${req.user?.name || req.user?.openId || 'unknown'}`);

      // Check if file was uploaded
      if (!req.file) {
        console.error("❌ [Upload Endpoint] No file uploaded");
        return res.status(400).json({ message: "No file uploaded" });
      }

      console.log(`✅ [Upload Endpoint] File received: ${req.file.originalname} (${req.file.size} bytes)`);

      // Process the assessment using the REAL processor with LLM extraction
      console.log("🔄 [Upload Endpoint] Starting assessment processing with LLM extraction...");
      const result = await processExternalAssessment(
        req.file.originalname,
        req.file.buffer
      );

      console.log("✅ [Upload Endpoint] Assessment processed successfully");
      console.log(`📊 [Upload Endpoint] Extracted: ${result.vehicleMake} ${result.vehicleModel} ${result.vehicleYear}`);
      console.log(`📊 [Upload Endpoint] Registration: ${result.vehicleRegistration}`);
      console.log(`📊 [Upload Endpoint] Claimant: ${result.claimantName}`);
      console.log(`📊 [Upload Endpoint] Cost: $${result.estimatedCost}`);
      console.log(`📊 [Upload Endpoint] Data Completeness: ${result.dataCompleteness}%`);
      
      // Return the processed data
      res.json(result);
    } catch (error: any) {
      console.error("❌ [Upload Endpoint] Error processing assessment:", error);
      res.status(500).json({
        message: error.message || "Failed to process assessment",
      });
    }
  }
);
