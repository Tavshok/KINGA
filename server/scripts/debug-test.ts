// @ts-nocheck
import { Router } from "express";

export const debugTestRouter = Router();

// Test endpoint that returns mock extracted data
debugTestRouter.get("/debug/test-extraction", (req, res) => {
  const mockData = {
    pdfUrl: "https://example.com/test.pdf",
    vehicleMake: "FORD",
    vehicleModel: "RANGER",
    vehicleYear: 2020,
    vehicleRegistration: "AFU6364",
    claimantName: "ZIMPLATS",
    accidentDate: "28/10/2024",
    estimatedCost: 5411.33,
    damagePhotos: [],
    accidentType: "side_impact",
    damagedComponents: ["front_bumper", "headlight"],
    physicsAnalysis: {},
    fraudAnalysis: {},
    missingData: [],
    dataQuality: {},
    dataCompleteness: 100
  };
  
  console.log("🧪 [Debug Test] Returning mock data:", mockData);
  res.json(mockData);
});
