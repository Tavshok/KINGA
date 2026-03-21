/**
 * pipeline-v2/stage-3-structured-extraction.ts
 *
 * STAGE 3 — STRUCTURED DATA EXTRACTION (Self-Healing)
 *
 * From each document's extracted text, extract structured fields.
 * Missing fields are marked as NULL at this stage.
 * If a document extraction fails, continues with remaining documents.
 * NEVER halts — produces empty extraction if all documents fail.
 */

import type {
  PipelineContext,
  StageResult,
  Stage1Output,
  Stage2Output,
  Stage3Output,
  ExtractedClaimFields,
  Assumption,
  RecoveryAction,
  InputRecoveryOutput,
  InputRecoveryFailureFlag,
  RecoveredQuote,
  DamageHints,
} from "./types";
import { invokeLLM } from "../_core/llm";

function llmCall(params: any): Promise<any> {
  return invokeLLM(params);
}

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

async function extractFieldsFromPdf(
  pdfUrl: string,
  rawText: string,
  ctx: PipelineContext
): Promise<ExtractedClaimFields> {
  const response = await llmCall({
    messages: [
      {
        role: "system",
        content: `You are a structured insurance document extraction engine.

Your task is to extract ONLY factual information from a claim document.

Rules:
- Do NOT infer missing information
- Do NOT guess unclear values
- If a field is not explicitly present, return null
- Preserve original meaning of the text
- Be precise and conservative
- For monetary values, convert to cents (multiply by 100)
- For dates, use YYYY-MM-DD format
- For damaged components, list each component separately with its damage type and severity
- Severity must be one of: minor, moderate, severe, catastrophic
- Repair action must be one of: repair, replace, refinish

Return data in strict JSON format.`,
      },
      {
        role: "user",
        content: [
          {
            type: "text" as const,
            text: `INPUT DOCUMENT TEXT (first 4000 chars):
${rawText.substring(0, 4000)}

TASK: Extract ALL fields from the schema above.

CRITICAL COST EXTRACTION RULES:
- quoteTotalCents: use the LOWEST or AGREED/ADJUSTED cost figure (in cents). If an assessor negotiated a lower amount, use that. If only one figure exists, use it.
- labourCostCents / partsCostCents: extract from any itemised breakdown.
- Convert all monetary values to cents (multiply USD/ZWL figure by 100).

CRITICAL IMAGE DETECTION RULES:
- If the document contains embedded photographs, damage images, or references to attached photos, note this in damageDescription.
- Extract damagedComponents from any itemised repair list, even if no photos are present.

CRITICAL DESCRIPTION RULES:
- accidentDescription: extract the FULL narrative of how the accident occurred, verbatim if possible.
- damageDescription: extract the complete list of damaged parts and repair actions.

Return JSON only.`,
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

async function extractFieldsFromPhotos(
  photoUrls: string[],
  ctx: PipelineContext
): Promise<ExtractedClaimFields> {
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
  return mapToExtractedFields(parsed, -1);
}

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

/** Create an empty extraction with all fields null */
function emptyExtraction(): ExtractedClaimFields {
  return mapToExtractedFields({}, -1);
}

// ============================================================================
// 5-STEP INPUT RECOVERY (runs after LLM extraction, before stage output)
// Recovers missing structured inputs from raw OCR text and document metadata.
// Does NOT modify original extraction — produces a parallel recovery object.
// ============================================================================

const DAMAGE_ZONE_KEYWORDS: Record<string, string> = {
  front: "front", rear: "rear", back: "rear", side: "side",
  left: "left", right: "right", roof: "roof", undercarriage: "undercarriage",
  bonnet: "front", hood: "front", boot: "rear", trunk: "rear",
  door: "side", fender: "side", quarter: "side",
};

const DAMAGE_COMPONENT_KEYWORDS = [
  "bumper", "grille", "bonnet", "hood", "fender", "door", "panel",
  "headlight", "taillight", "windscreen", "windshield", "glass",
  "mirror", "wheel", "tyre", "rim", "suspension", "chassis",
  "radiator", "engine", "gearbox", "transmission", "axle",
  "boot", "trunk", "roof", "pillar", "sill", "quarter panel",
  "fog light", "indicator", "wiper", "spoiler", "diffuser",
];

/**
 * STEP 2 — Quote recovery: scan raw text for currency values and repair totals.
 * Prioritises agreed/adjusted cost over original quote.
 */
function recoverQuoteFromText(rawText: string): RecoveredQuote | null {
  if (!rawText || rawText.trim().length < 20) return null;

  // Patterns for monetary values: USD 1,234.56 / $1234.56 / 1 234.56 / 1,234.56
  const currencyPattern = /(?:USD|\$|ZWL|ZWD)?\s*([0-9]{1,3}(?:[,\s][0-9]{3})*(?:\.[0-9]{1,2})?)/gi;

  // Priority 1: agreed / adjusted / net cost (assessor negotiated)
  const agreedPatterns = [
    /(?:agreed|adjusted|net|accepted|approved|authorised|authorized)\s+(?:cost|amount|total|value)[:\s]+(?:USD|\$)?\s*([0-9][0-9,\s.]+)/gi,
    /(?:cost\s+agreed|amount\s+agreed|total\s+agreed)[:\s]+(?:USD|\$)?\s*([0-9][0-9,\s.]+)/gi,
    /(?:repair\s+cost|repair\s+total)[:\s]+(?:USD|\$)?\s*([0-9][0-9,\s.]+)/gi,
  ];

  // Priority 2: original quote total
  const quotePatterns = [
    /(?:total|grand\s+total|quote\s+total|total\s+cost)[:\s]+(?:USD|\$)?\s*([0-9][0-9,\s.]+)/gi,
    /(?:amount|sum)[:\s]+(?:USD|\$)?\s*([0-9][0-9,\s.]+)/gi,
  ];

  // Labour and parts
  const labourPattern = /(?:labour|labor)[:\s]+(?:USD|\$)?\s*([0-9][0-9,\s.]+)/gi;
  const partsPattern = /(?:parts|spares|materials)[:\s]+(?:USD|\$)?\s*([0-9][0-9,\s.]+)/gi;

  function extractFirst(patterns: RegExp[], text: string): number | null {
    for (const pat of patterns) {
      pat.lastIndex = 0;
      const m = pat.exec(text);
      if (m) {
        const val = parseFloat(m[1].replace(/[,\s]/g, ""));
        if (!isNaN(val) && val > 0) return val;
      }
    }
    return null;
  }

  const agreedTotal = extractFirst(agreedPatterns, rawText);
  const quoteTotal = extractFirst(quotePatterns, rawText);
  const labour = extractFirst([labourPattern], rawText);
  const parts = extractFirst([partsPattern], rawText);

  const total = agreedTotal ?? quoteTotal;
  if (!total) return null;

  return {
    total,
    parts: parts ?? null,
    labour: labour ?? null,
    confidence: agreedTotal ? "high" : quoteTotal ? "medium" : "low",
    source: agreedTotal ? "agreed_cost" : "original_quote",
  };
}

/**
 * STEP 4 — Damage hint extraction: extract zone and component keywords from text.
 */
function extractDamageHints(rawText: string): DamageHints {
  const lower = rawText.toLowerCase();
  const zones = new Set<string>();
  const components = new Set<string>();

  for (const [keyword, zone] of Object.entries(DAMAGE_ZONE_KEYWORDS)) {
    if (lower.includes(keyword)) zones.add(zone);
  }
  for (const component of DAMAGE_COMPONENT_KEYWORDS) {
    if (lower.includes(component)) components.add(component);
  }

  return {
    zones: Array.from(zones),
    components: Array.from(components),
  };
}

/**
 * Run the full 5-step input recovery pass against all extracted texts and document metadata.
 * Returns a structured InputRecoveryOutput without modifying original extraction data.
 */
function runInputRecovery(
  stage1: Stage1Output,
  stage2: Stage2Output,
  perDocumentExtractions: ExtractedClaimFields[]
): InputRecoveryOutput {
  const allText = stage2.extractedTexts.map(t => t.rawText).join("\n");
  const flags: InputRecoveryFailureFlag[] = [];

  // STEP 1 — Accident description recovery
  const hasDescription = perDocumentExtractions.some(e => e.accidentDescription && e.accidentDescription.trim().length > 10);
  let accident_description: string | null = null;
  if (!hasDescription) {
    // Attempt regex recovery from raw text
    const descPatterns = [
      /(?:circumstances|description of accident|how did the accident occur|incident description|narrative)[:\s]+([^\n]{20,500})/gi,
      /(?:the insured|the driver|the vehicle)[^.]{0,20}(?:collided|struck|hit|ran into|was involved)[^.]{10,300}\./gi,
    ];
    for (const pat of descPatterns) {
      const m = pat.exec(allText);
      if (m) {
        accident_description = m[0].trim().substring(0, 500);
        break;
      }
    }
    if (!accident_description) flags.push("description_not_mapped");
  } else {
    accident_description = perDocumentExtractions.find(e => e.accidentDescription)?.accidentDescription ?? null;
  }

  // STEP 2 — Quote recovery
  const hasQuote = perDocumentExtractions.some(e => e.quoteTotalCents && e.quoteTotalCents > 0);
  const recovered_quote = recoverQuoteFromText(allText);
  if (!hasQuote && !recovered_quote) flags.push("quote_not_mapped");

  // STEP 3 — Image presence detection
  const images_present =
    stage1.documents.some(d => d.containsImages || d.imageUrls.length > 0) ||
    perDocumentExtractions.some(e => e.uploadedImageUrls.length > 0) ||
    /(?:photo|image|picture|photograph|fig\.|figure)/i.test(allText);

  if (!images_present) {
    // images truly absent — no flag needed, absence is valid
  } else if (stage1.documents.every(d => d.imageUrls.length === 0)) {
    // images present in document but not extracted into imageUrls pipeline
    flags.push("images_not_processed");
  }

  // STEP 4 — Damage hint extraction
  const damage_hints = extractDamageHints(allText);

  // STEP 5 — OCR failure detection
  const totalTextLength = allText.replace(/\s/g, "").length;
  if (totalTextLength < 100 && stage1.documents.length > 0) {
    flags.push("ocr_failure");
  }

  return {
    accident_description,
    recovered_quote,
    images_present,
    damage_hints,
    failure_flags: flags,
    recovered_at: new Date().toISOString(),
  };
}

export async function runStructuredExtractionStage(
  ctx: PipelineContext,
  stage1: Stage1Output,
  stage2: Stage2Output
): Promise<StageResult<Stage3Output>> {
  const start = Date.now();
  ctx.log("Stage 3", "Structured data extraction starting");

  const assumptions: Assumption[] = [];
  const recoveryActions: RecoveryAction[] = [];
  let isDegraded = false;

  try {
    const perDocumentExtractions: ExtractedClaimFields[] = [];

    if (stage1.documents.length === 0) {
      // Self-healing: no documents — produce empty extraction from DB fields
      isDegraded = true;
      assumptions.push({
        field: "perDocumentExtractions",
        assumedValue: "empty",
        reason: "No documents available for structured extraction. Will rely on claim database fields at assembly stage.",
        strategy: "partial_data",
        confidence: 20,
        stage: "Stage 3",
      });
      ctx.log("Stage 3", "DEGRADED: No documents to extract from");
    }

    // Extract from PDF documents
    const pdfDocs = stage1.documents.filter(d => d.mimeType === "application/pdf");
    for (const pdfDoc of pdfDocs) {
      try {
        const extractedText = stage2.extractedTexts.find(t => t.documentIndex === pdfDoc.documentIndex);
        const rawText = extractedText?.rawText || "";

        ctx.log("Stage 3", `Extracting structured fields from PDF: ${pdfDoc.fileName}`);
        const fields = await extractFieldsFromPdf(pdfDoc.sourceUrl, rawText, ctx);
        fields.sourceDocumentIndex = pdfDoc.documentIndex;
        perDocumentExtractions.push(fields);

        ctx.log("Stage 3", `PDF extraction complete. Vehicle: ${fields.vehicleMake || 'unknown'} ${fields.vehicleModel || 'unknown'}, Components: ${fields.damagedComponents.length}`);
      } catch (docErr) {
        // Self-healing: individual PDF extraction failed — continue
        isDegraded = true;
        ctx.log("Stage 3", `Failed to extract from PDF ${pdfDoc.fileName}: ${String(docErr)} — skipping`);
        recoveryActions.push({
          target: `pdf_extraction_${pdfDoc.documentIndex}`,
          strategy: "partial_data",
          success: true,
          description: `PDF extraction failed for ${pdfDoc.fileName}: ${String(docErr)}. Continuing with other documents.`,
        });
      }
    }

    // Extract from damage photos
    const photoDocs = stage1.documents.filter(d => d.documentType === "vehicle_photos");
    if (photoDocs.length > 0) {
      const photoUrls = photoDocs.map(d => d.sourceUrl).filter(Boolean) as string[];
      if (photoUrls.length > 0) {
        try {
          ctx.log("Stage 3", `Extracting structured fields from ${photoUrls.length} damage photo(s)`);
          const photoFields = await extractFieldsFromPhotos(photoUrls, ctx);
          photoFields.uploadedImageUrls = photoUrls;
          perDocumentExtractions.push(photoFields);
          ctx.log("Stage 3", `Photo extraction complete. Components: ${photoFields.damagedComponents.length}`);
        } catch (photoErr) {
          isDegraded = true;
          ctx.log("Stage 3", `Failed to extract from photos: ${String(photoErr)} — skipping`);
          recoveryActions.push({
            target: "photo_extraction",
            strategy: "partial_data",
            success: true,
            description: `Photo extraction failed: ${String(photoErr)}. Damage assessment will rely on text descriptions.`,
          });
        }
      }
    }

    if (perDocumentExtractions.length === 0 && stage1.documents.length > 0) {
      isDegraded = true;
      assumptions.push({
        field: "perDocumentExtractions",
        assumedValue: "all_failed",
        reason: "All document extractions failed. Will rely on claim database fields at assembly stage.",
        strategy: "partial_data",
        confidence: 15,
        stage: "Stage 3",
      });
    }

    // Run 5-step input recovery pass
    let inputRecovery;
    try {
      inputRecovery = runInputRecovery(stage1, stage2, perDocumentExtractions);
      ctx.log("Stage 3", `Input recovery complete. Quote recovered: ${inputRecovery.recovered_quote ? `USD ${inputRecovery.recovered_quote.total} (${inputRecovery.recovered_quote.confidence})` : 'none'}. Images present: ${inputRecovery.images_present}. Flags: ${inputRecovery.failure_flags.join(", ") || "none"}.`);
      if (inputRecovery.failure_flags.length > 0) {
        isDegraded = true;
        recoveryActions.push({
          target: "input_recovery",
          strategy: "partial_data",
          success: true,
          description: `Input recovery flagged: ${inputRecovery.failure_flags.join(", ")}. Downstream stages should use recovered values where available.`,
        });
      }
    } catch (recErr) {
      ctx.log("Stage 3", `Input recovery failed: ${String(recErr)} — skipping`);
    }

    const output: Stage3Output = {
      perDocumentExtractions,
      inputRecovery,
    };

    ctx.log("Stage 3", `Structured extraction complete. ${perDocumentExtractions.length} extraction(s) produced.`);

    return {
      status: isDegraded ? "degraded" : "success",
      data: output,
      durationMs: Date.now() - start,
      savedToDb: false,
      assumptions,
      recoveryActions,
      degraded: isDegraded,
    };
  } catch (err) {
    ctx.log("Stage 3", `Structured extraction failed completely: ${String(err)} — producing empty output`);

    return {
      status: "degraded",
      data: { perDocumentExtractions: [] },
      error: String(err),
      durationMs: Date.now() - start,
      savedToDb: false,
      assumptions: [{
        field: "perDocumentExtractions",
        assumedValue: "empty",
        reason: `Complete extraction failure: ${String(err)}. Pipeline will rely on claim database fields.`,
        strategy: "default_value",
        confidence: 10,
        stage: "Stage 3",
      }],
      recoveryActions: [{
        target: "extraction_error_recovery",
        strategy: "default_value",
        success: true,
        description: `Extraction error caught. Producing empty extraction to allow pipeline to continue.`,
      }],
      degraded: true,
    };
  }
}
