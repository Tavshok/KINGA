/**
 * pipeline-v2/stage-3-structured-extraction.ts
 *
 * STAGE 3 — STRUCTURED DATA EXTRACTION
 *
 * From each document's extracted text, extract structured fields
 * and store them in ExtractedClaimFields objects.
 * Missing fields are marked as NULL — never guessed.
 */

import type {
  PipelineContext,
  StageResult,
  Stage1Output,
  Stage2Output,
  Stage3Output,
  ExtractedClaimFields,
  DamagedComponentExtracted,
  RepairLineItem,
} from "./types";
import { invokeLLM } from "../_core/llm";

function llmCall(params: any): Promise<any> {
  return invokeLLM(params);
}

/**
 * The JSON schema for structured field extraction from a document.
 * This schema is used for both PDF and photo-based extraction.
 */
const EXTRACTION_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "claim_extraction",
    strict: true,
    schema: {
      type: "object",
      properties: {
        claimId: { type: ["string", "null"], description: "Claim reference number" },
        claimantName: { type: ["string", "null"], description: "Name of the claimant/insured" },
        driverName: { type: ["string", "null"], description: "Name of the driver at time of accident" },
        vehicleRegistration: { type: ["string", "null"], description: "Vehicle registration/license plate" },
        vehicleMake: { type: ["string", "null"], description: "Vehicle manufacturer (e.g. Toyota)" },
        vehicleModel: { type: ["string", "null"], description: "Vehicle model (e.g. Corolla)" },
        vehicleYear: { type: ["integer", "null"], description: "Vehicle year of manufacture" },
        vehicleVin: { type: ["string", "null"], description: "Vehicle Identification Number" },
        vehicleColour: { type: ["string", "null"], description: "Vehicle colour" },
        vehicleEngineNumber: { type: ["string", "null"], description: "Engine number" },
        vehicleMileage: { type: ["integer", "null"], description: "Vehicle mileage in km" },
        accidentDate: { type: ["string", "null"], description: "Date of accident (YYYY-MM-DD format)" },
        accidentLocation: { type: ["string", "null"], description: "Location where accident occurred" },
        accidentDescription: { type: ["string", "null"], description: "Description of the accident" },
        incidentType: { type: ["string", "null"], description: "Type of incident: collision, theft, vandalism, flood, fire" },
        accidentType: { type: ["string", "null"], description: "Collision direction: frontal, rear, side_driver, side_passenger, rollover, multi_impact" },
        impactPoint: { type: ["string", "null"], description: "Primary point of impact on the vehicle" },
        estimatedSpeedKmh: { type: ["number", "null"], description: "Estimated speed at impact in km/h" },
        policeReportNumber: { type: ["string", "null"], description: "Police report/case number" },
        policeStation: { type: ["string", "null"], description: "Police station name" },
        assessorName: { type: ["string", "null"], description: "Name of the assessor" },
        panelBeater: { type: ["string", "null"], description: "Name of panel beater/repairer" },
        repairerCompany: { type: ["string", "null"], description: "Repair company name" },
        quoteTotalCents: { type: ["integer", "null"], description: "Total repair quote in cents" },
        labourCostCents: { type: ["integer", "null"], description: "Total labour cost in cents" },
        partsCostCents: { type: ["integer", "null"], description: "Total parts cost in cents" },
        damageDescription: { type: ["string", "null"], description: "Overall damage description" },
        damagedComponents: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Component name" },
              location: { type: "string", description: "Location on vehicle" },
              damageType: { type: "string", description: "Type of damage" },
              severity: { type: "string", description: "minor, moderate, severe, catastrophic" },
              repairAction: { type: "string", description: "repair, replace, refinish" },
            },
            required: ["name", "location", "damageType", "severity", "repairAction"],
            additionalProperties: false,
          },
        },
        structuralDamage: { type: ["boolean", "null"], description: "Whether structural damage is present" },
        airbagDeployment: { type: ["boolean", "null"], description: "Whether airbags deployed" },
        maxCrushDepthM: { type: ["number", "null"], description: "Maximum crush depth in metres" },
        totalDamageAreaM2: { type: ["number", "null"], description: "Total damage area in square metres" },
        thirdPartyVehicle: { type: ["string", "null"], description: "Third party vehicle description" },
        thirdPartyRegistration: { type: ["string", "null"], description: "Third party vehicle registration" },
      },
      required: [
        "claimId", "claimantName", "driverName",
        "vehicleRegistration", "vehicleMake", "vehicleModel", "vehicleYear",
        "vehicleVin", "vehicleColour", "vehicleEngineNumber", "vehicleMileage",
        "accidentDate", "accidentLocation", "accidentDescription",
        "incidentType", "accidentType", "impactPoint", "estimatedSpeedKmh",
        "policeReportNumber", "policeStation",
        "assessorName", "panelBeater", "repairerCompany",
        "quoteTotalCents", "labourCostCents", "partsCostCents",
        "damageDescription", "damagedComponents",
        "structuralDamage", "airbagDeployment", "maxCrushDepthM", "totalDamageAreaM2",
        "thirdPartyVehicle", "thirdPartyRegistration",
      ],
      additionalProperties: false,
    },
  },
};

/**
 * Extract structured fields from a PDF document using LLM.
 */
async function extractFieldsFromPdf(
  pdfUrl: string,
  rawText: string,
  ctx: PipelineContext
): Promise<ExtractedClaimFields> {
  const response = await llmCall({
    messages: [
      {
        role: "system",
        content: `You are a structured data extraction system for insurance claims.

RULES:
- Extract ONLY information that is explicitly present in the document.
- If a field is not present, return null — NEVER guess or infer.
- For monetary values, convert to cents (multiply by 100). If the currency is ZAR, USD, or other, still convert to cents.
- For dates, use YYYY-MM-DD format.
- For damaged components, list each component separately with its damage type and severity.
- Severity must be one of: minor, moderate, severe, catastrophic.
- Repair action must be one of: repair, replace, refinish.

The document may be a claim form, police report, repair quote, or assessment report.
Extract all available structured fields.`,
      },
      {
        role: "user",
        content: [
          {
            type: "text" as const,
            text: `Extract structured claim data from this document.\n\nPre-extracted text for reference:\n${rawText.substring(0, 3000)}`,
          },
          {
            type: "file_url" as const,
            file_url: {
              url: pdfUrl,
              mime_type: "application/pdf" as const,
            },
          },
        ],
      },
    ],
    response_format: EXTRACTION_SCHEMA,
  });

  const content = response.choices?.[0]?.message?.content || "{}";
  const parsed = JSON.parse(content);
  return mapToExtractedFields(parsed, 0);
}

/**
 * Extract structured fields from damage photos using LLM vision.
 */
async function extractFieldsFromPhotos(
  photoUrls: string[],
  ctx: PipelineContext
): Promise<ExtractedClaimFields> {
  // Build image content array for LLM
  const imageContent: any[] = photoUrls.slice(0, 5).map(url => ({
    type: "image_url",
    image_url: { url, detail: "high" },
  }));

  const response = await llmCall({
    messages: [
      {
        role: "system",
        content: `You are a vehicle damage analysis system.

RULES:
- Analyse the vehicle damage photos and extract structured data.
- Identify damaged components, their locations, damage types, and severity.
- If you can identify the vehicle make/model/colour from the photos, include it.
- If a field cannot be determined from the photos, return null.
- NEVER guess information that is not visible in the photos.
- Severity must be one of: minor, moderate, severe, catastrophic.
- Repair action must be one of: repair, replace, refinish.`,
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Analyse these vehicle damage photos and extract structured data." },
          ...imageContent,
        ],
      },
    ],
    response_format: EXTRACTION_SCHEMA,
  });

  const content = response.choices?.[0]?.message?.content || "{}";
  const parsed = JSON.parse(content);
  return mapToExtractedFields(parsed, -1); // -1 for photo-based extraction
}

/**
 * Map raw LLM output to typed ExtractedClaimFields.
 */
function mapToExtractedFields(raw: any, sourceDocumentIndex: number): ExtractedClaimFields {
  return {
    claimId: raw.claimId || null,
    claimantName: raw.claimantName || null,
    driverName: raw.driverName || null,
    vehicleRegistration: raw.vehicleRegistration || null,
    vehicleMake: raw.vehicleMake || null,
    vehicleModel: raw.vehicleModel || null,
    vehicleYear: raw.vehicleYear || null,
    vehicleVin: raw.vehicleVin || null,
    vehicleColour: raw.vehicleColour || null,
    vehicleEngineNumber: raw.vehicleEngineNumber || null,
    vehicleMileage: raw.vehicleMileage || null,
    accidentDate: raw.accidentDate || null,
    accidentLocation: raw.accidentLocation || null,
    accidentDescription: raw.accidentDescription || null,
    incidentType: raw.incidentType || null,
    accidentType: raw.accidentType || null,
    impactPoint: raw.impactPoint || null,
    estimatedSpeedKmh: raw.estimatedSpeedKmh || null,
    policeReportNumber: raw.policeReportNumber || null,
    policeStation: raw.policeStation || null,
    assessorName: raw.assessorName || null,
    panelBeater: raw.panelBeater || null,
    repairerCompany: raw.repairerCompany || null,
    quoteTotalCents: raw.quoteTotalCents || null,
    labourCostCents: raw.labourCostCents || null,
    partsCostCents: raw.partsCostCents || null,
    damageDescription: raw.damageDescription || null,
    damagedComponents: (raw.damagedComponents || []).map((c: any) => ({
      name: c.name || "",
      location: c.location || "",
      damageType: c.damageType || "",
      severity: c.severity || "moderate",
      repairAction: c.repairAction || "repair",
    })),
    structuralDamage: raw.structuralDamage ?? null,
    airbagDeployment: raw.airbagDeployment ?? null,
    maxCrushDepthM: raw.maxCrushDepthM ?? null,
    totalDamageAreaM2: raw.totalDamageAreaM2 ?? null,
    thirdPartyVehicle: raw.thirdPartyVehicle || null,
    thirdPartyRegistration: raw.thirdPartyRegistration || null,
    uploadedImageUrls: [],
    sourceDocumentIndex,
  };
}

export async function runStructuredExtractionStage(
  ctx: PipelineContext,
  stage1: Stage1Output,
  stage2: Stage2Output
): Promise<StageResult<Stage3Output>> {
  const start = Date.now();
  ctx.log("Stage 3", "Structured data extraction starting");

  try {
    const perDocumentExtractions: ExtractedClaimFields[] = [];

    // Extract from the primary PDF document
    const pdfDocs = stage1.documents.filter(d => d.mimeType === "application/pdf");
    for (const pdfDoc of pdfDocs) {
      const extractedText = stage2.extractedTexts.find(t => t.documentIndex === pdfDoc.documentIndex);
      const rawText = extractedText?.rawText || "";

      ctx.log("Stage 3", `Extracting structured fields from PDF: ${pdfDoc.fileName}`);
      const fields = await extractFieldsFromPdf(pdfDoc.sourceUrl, rawText, ctx);
      fields.sourceDocumentIndex = pdfDoc.documentIndex;
      perDocumentExtractions.push(fields);

      ctx.log("Stage 3", `PDF extraction complete. Vehicle: ${fields.vehicleMake || 'unknown'} ${fields.vehicleModel || 'unknown'}, Components: ${fields.damagedComponents.length}`);
    }

    // Extract from damage photos (grouped as one extraction)
    const photoDocs = stage1.documents.filter(d => d.documentType === "vehicle_photos");
    if (photoDocs.length > 0) {
      const photoUrls = photoDocs.map(d => d.sourceUrl).filter(Boolean) as string[];
      if (photoUrls.length > 0) {
        ctx.log("Stage 3", `Extracting structured fields from ${photoUrls.length} damage photo(s)`);
        const photoFields = await extractFieldsFromPhotos(photoUrls, ctx);
        photoFields.uploadedImageUrls = photoUrls;
        perDocumentExtractions.push(photoFields);
        ctx.log("Stage 3", `Photo extraction complete. Components: ${photoFields.damagedComponents.length}`);
      }
    }

    const output: Stage3Output = {
      perDocumentExtractions,
    };

    ctx.log("Stage 3", `Structured extraction complete. ${perDocumentExtractions.length} extraction(s) produced.`);

    return {
      status: "success",
      data: output,
      durationMs: Date.now() - start,
      savedToDb: false,
    };
  } catch (err) {
    ctx.log("Stage 3", `Structured extraction failed: ${String(err)}`);
    return {
      status: "failed",
      data: null,
      error: String(err),
      durationMs: Date.now() - start,
      savedToDb: false,
    };
  }
}
