// @ts-nocheck
import { invokeLLM } from "./_core/llm";

/**
 * Police Report OCR Service
 * Extracts structured physics parameters from police report PDFs using LLM vision
 */

export interface PoliceReportData {
  reportNumber: string;
  policeStation: string;
  officerName: string;
  reportDate: string;
  reportedSpeed: number | null; // km/h
  weather: string;
  roadCondition: string;
  roadSurface: string; // asphalt, gravel, dirt, etc.
  accidentDescription: string;
  vehicle1Make: string;
  vehicle1Model: string;
  vehicle1Registration: string;
  vehicle1Mass: number | null; // kg (estimated if not available)
  vehicle2Make: string | null;
  vehicle2Model: string | null;
  vehicle2Registration: string | null;
  vehicle2Mass: number | null; // kg
  skidMarkLength: number | null; // meters
  impactSpeed: number | null; // km/h (calculated or estimated)
  roadGradient: number | null; // degrees
  visibilityCondition: string;
  lightingCondition: string;
  trafficCondition: string;
  extractionConfidence: number; // 0-100
  extractionNotes: string;
}

/**
 * Extract structured data from police report PDF using LLM vision
 */
export async function extractPoliceReportData(
  policeReportUrl: string
): Promise<PoliceReportData> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are an expert at extracting structured data from Zimbabwean police accident reports. Extract all relevant physics parameters needed for accident reconstruction and fraud detection. Be thorough and accurate.`,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Extract the following information from this police report PDF. If a field is not available, use null. For vehicle mass, provide reasonable estimates based on vehicle make/model if not explicitly stated.

Required fields:
- reportNumber: Police report reference number
- policeStation: Name of police station
- officerName: Reporting officer's name
- reportDate: Date report was filed (YYYY-MM-DD format)
- reportedSpeed: Speed of vehicle(s) in km/h
- weather: Weather conditions (clear, rain, fog, etc.)
- roadCondition: Road condition (dry, wet, icy, etc.)
- roadSurface: Road surface type (asphalt, gravel, dirt, etc.)
- accidentDescription: Detailed description of accident
- vehicle1Make: First vehicle manufacturer
- vehicle1Model: First vehicle model
- vehicle1Registration: First vehicle registration number
- vehicle1Mass: First vehicle mass in kg (estimate if needed)
- vehicle2Make: Second vehicle manufacturer (if applicable)
- vehicle2Model: Second vehicle model (if applicable)
- vehicle2Registration: Second vehicle registration number (if applicable)
- vehicle2Mass: Second vehicle mass in kg (if applicable)
- skidMarkLength: Length of skid marks in meters (if mentioned)
- impactSpeed: Estimated impact speed in km/h (if mentioned)
- roadGradient: Road gradient in degrees (if mentioned)
- visibilityCondition: Visibility at time of accident
- lightingCondition: Lighting conditions (daylight, dusk, night, street lights, etc.)
- trafficCondition: Traffic conditions (light, moderate, heavy)
- extractionConfidence: Your confidence in extraction accuracy (0-100)
- extractionNotes: Any important notes or uncertainties

Return ONLY valid JSON matching this structure. Do not include any explanatory text.`,
          },
          {
            type: "file_url",
            file_url: {
              url: policeReportUrl,
              mime_type: "application/pdf",
            },
          },
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "police_report_data",
        strict: true,
        schema: {
          type: "object",
          properties: {
            reportNumber: { type: "string" },
            policeStation: { type: "string" },
            officerName: { type: "string" },
            reportDate: { type: "string" },
            reportedSpeed: { type: ["number", "null"] },
            weather: { type: "string" },
            roadCondition: { type: "string" },
            roadSurface: { type: "string" },
            accidentDescription: { type: "string" },
            vehicle1Make: { type: "string" },
            vehicle1Model: { type: "string" },
            vehicle1Registration: { type: "string" },
            vehicle1Mass: { type: ["number", "null"] },
            vehicle2Make: { type: ["string", "null"] },
            vehicle2Model: { type: ["string", "null"] },
            vehicle2Registration: { type: ["string", "null"] },
            vehicle2Mass: { type: ["number", "null"] },
            skidMarkLength: { type: ["number", "null"] },
            impactSpeed: { type: ["number", "null"] },
            roadGradient: { type: ["number", "null"] },
            visibilityCondition: { type: "string" },
            lightingCondition: { type: "string" },
            trafficCondition: { type: "string" },
            extractionConfidence: { type: "number" },
            extractionNotes: { type: "string" },
          },
          required: [
            "reportNumber",
            "policeStation",
            "officerName",
            "reportDate",
            "reportedSpeed",
            "weather",
            "roadCondition",
            "roadSurface",
            "accidentDescription",
            "vehicle1Make",
            "vehicle1Model",
            "vehicle1Registration",
            "vehicle1Mass",
            "vehicle2Make",
            "vehicle2Model",
            "vehicle2Registration",
            "vehicle2Mass",
            "skidMarkLength",
            "impactSpeed",
            "roadGradient",
            "visibilityCondition",
            "lightingCondition",
            "trafficCondition",
            "extractionConfidence",
            "extractionNotes",
          ],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices[0].message.content;
  if (!content || typeof content !== 'string') {
    throw new Error("No valid content in LLM response");
  }

  const data = JSON.parse(content) as PoliceReportData;
  return data;
}

/**
 * Estimate vehicle mass based on make and model
 * Uses typical vehicle weights for common Zimbabwean vehicles
 */
export function estimateVehicleMass(make: string, model: string): number {
  const vehicleWeights: Record<string, Record<string, number>> = {
    Toyota: {
      Hilux: 2100,
      "Hilux GD6": 2100,
      Quantum: 2200,
      Corolla: 1300,
      Camry: 1500,
      "Land Cruiser": 2500,
      Fortuner: 2100,
      Allion: 1250,
    },
    Honda: {
      Fit: 1100,
      Civic: 1300,
      Accord: 1500,
      CRV: 1600,
    },
    Nissan: {
      NP300: 1900,
      "X-Trail": 1600,
      Advan: 1300,
      Hardbody: 1800,
    },
    Mercedes: {
      "C-Class": 1600,
      "E-Class": 1800,
      "C180": 1550,
    },
    BMW: {
      "318i": 1500,
      "320i": 1550,
      "X5": 2200,
    },
    Ford: {
      Ranger: 2100,
      Fiesta: 1100,
      Focus: 1300,
    },
    Mazda: {
      Demio: 1050,
      "3": 1300,
      CX5: 1600,
    },
    Isuzu: {
      KB300: 1900,
      "D-Max": 1950,
    },
    Volvo: {
      FH13: 8000, // Truck
    },
    Howo: {
      truck: 10000, // Heavy truck
    },
  };

  const makeLower = make.toLowerCase();
  const modelLower = model.toLowerCase();

  // Try exact match first
  for (const [makeKey, models] of Object.entries(vehicleWeights)) {
    if (makeKey.toLowerCase() === makeLower) {
      for (const [modelKey, weight] of Object.entries(models)) {
        if (modelKey.toLowerCase().includes(modelLower) || modelLower.includes(modelKey.toLowerCase())) {
          return weight;
        }
      }
    }
  }

  // Default estimates by vehicle type
  if (makeLower.includes("truck") || modelLower.includes("truck")) {
    return 8000;
  }
  if (makeLower.includes("suv") || modelLower.includes("suv")) {
    return 1900;
  }
  if (makeLower.includes("sedan") || modelLower.includes("sedan")) {
    return 1400;
  }
  if (makeLower.includes("hatchback") || modelLower.includes("hatchback")) {
    return 1200;
  }

  // Default to average sedan weight
  return 1400;
}

/**
 * Extract physics data from police report (wrapper for router)
 * Returns simplified physics parameters for database storage
 */
export async function extractPhysicsDataFromPoliceReport(reportUrl: string) {
  const data = await extractPoliceReportData(reportUrl);
  
  return {
    roadSurface: data.roadSurface,
    vehicle1Mass: data.vehicle1Mass || estimateVehicleMass(data.vehicle1Make, data.vehicle1Model),
    vehicle2Mass: data.vehicle2Mass || (data.vehicle2Make && data.vehicle2Model ? estimateVehicleMass(data.vehicle2Make, data.vehicle2Model) : null),
    skidMarkLength: data.skidMarkLength,
    impactSpeed: data.impactSpeed || data.reportedSpeed,
    roadGradient: data.roadGradient,
    lightingCondition: data.lightingCondition,
    trafficCondition: data.trafficCondition,
    confidence: data.extractionConfidence,
    notes: data.extractionNotes,
  };
}
