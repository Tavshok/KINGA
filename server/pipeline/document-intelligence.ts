/**
 * KINGA Document Intelligence Pipeline
 * 
 * Production-grade system for processing historical claim documents:
 * 1. OCR Extraction — Extract printed and handwritten content
 * 2. Document Classification — Detect document type (quote, police report, claim form, etc.)
 * 3. Structured Data Extraction — Extract vehicle details, repair items, costs, labour hours
 * 4. Ground Truth Capture — Mark final approved cost and assessor decisions
 * 5. Variance Dataset Generation — Compare quotes vs final, AI vs final, assessor vs AI
 * 
 * All processing is LLM-first with structured JSON output schemas.
 * Supports async processing for bulk ingestion of thousands of claims.
 */

import { invokeLLM } from '../_core/llm';
import { storagePut } from '../storage';
import { getDb } from '../db';
import {
  historicalClaims,
  extractedRepairItems,
  costComponents,
  aiPredictionLogs,
  finalApprovalRecords,
  varianceDatasets,
  ingestionDocuments,
} from '../../drizzle/schema';
import { eq, and } from 'drizzle-orm';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export interface DocumentClassification {
  documentType: 'panel_beater_quote' | 'police_report' | 'claim_form' | 'assessor_report' | 'supporting_evidence' | 'damage_image' | 'unknown';
  confidence: number;
  reasoning: string;
  isHandwritten: boolean;
  language: string;
  pageCount?: number;
}

export interface ExtractedVehicleDetails {
  make: string | null;
  model: string | null;
  year: number | null;
  registration: string | null;
  vin: string | null;
  color: string | null;
  mileage: number | null;
}

export interface ExtractedRepairItem {
  itemNumber: number;
  description: string;
  partNumber: string | null;
  category: 'parts' | 'labor' | 'paint' | 'diagnostic' | 'sundries' | 'sublet' | 'other';
  damageLocation: string | null;
  repairAction: 'repair' | 'replace' | 'refinish' | 'blend' | 'remove_refit' | null;
  quantity: number;
  unitPrice: number | null;
  lineTotal: number | null;
  laborHours: number | null;
  laborRate: number | null;
  partsQuality: 'oem' | 'genuine' | 'aftermarket' | 'used' | 'reconditioned' | null;
  bettermentPercent: number | null;
  extractionConfidence: number;
  isHandwritten: boolean;
}

export interface ExtractedCostBreakdown {
  laborCost: number;
  partsCost: number;
  paintCost: number;
  materialsCost: number;
  subletCost: number;
  sundries: number;
  vatAmount: number;
  totalExclVat: number;
  totalInclVat: number;
  totalLaborHours: number | null;
  averageLaborRate: number | null;
  totalPartsCount: number;
  oemPartsCount: number;
  aftermarketPartsCount: number;
  repairVsReplaceRatio: number | null;
  totalBetterment: number;
}

export interface ExtractedAccidentDetails {
  incidentDate: string | null;
  incidentLocation: string | null;
  incidentDescription: string | null;
  accidentType: string | null;
  estimatedSpeed: number | null;
}

export interface ExtractedClaimantDetails {
  claimantName: string | null;
  claimantIdNumber: string | null;
  claimantContact: string | null;
}

export interface DocumentExtractionResult {
  classification: DocumentClassification;
  vehicle: ExtractedVehicleDetails;
  accident: ExtractedAccidentDetails;
  claimant: ExtractedClaimantDetails;
  repairItems: ExtractedRepairItem[];
  costBreakdown: ExtractedCostBreakdown;
  claimReference: string | null;
  policyNumber: string | null;
  assessorName: string | null;
  assessorLicenseNumber: string | null;
  panelBeaterName: string | null;
  rawText: string;
  dataQualityScore: number;
  fieldsExtracted: number;
  fieldsMissing: number;
}

export interface PipelineProcessingResult {
  historicalClaimId: number;
  documentsProcessed: number;
  documentsFailed: number;
  extractionResults: DocumentExtractionResult[];
  pipelineStatus: string;
  errors: string[];
}

// ============================================================
// STEP 1: OCR + TEXT EXTRACTION
// ============================================================

/**
 * Extract text content from a document using LLM vision.
 * Handles printed text, handwritten content, tables, and itemised costs.
 * The LLM receives the document URL directly and extracts all readable content.
 */
export async function extractDocumentContent(
  documentUrl: string,
  mimeType: string,
  filename: string
): Promise<{ rawText: string; isHandwritten: boolean; language: string; confidence: number }> {
  const startTime = Date.now();
  
  try {
    const isPdf = mimeType === 'application/pdf';
    const isImage = mimeType.startsWith('image/');
    
    const contentParts: any[] = [
      {
        type: 'text',
        text: `You are an insurance document OCR specialist. Extract ALL text content from this document.

DOCUMENT: ${filename}

Instructions:
1. Extract ALL printed and handwritten text, preserving structure
2. Extract ALL tables, maintaining column alignment
3. Extract ALL itemised costs, repair items, and line items
4. Preserve monetary amounts exactly as written (Rand amounts with R prefix)
5. Note any handwritten sections separately
6. Identify the language of the document

Return a JSON object with:
{
  "rawText": "Complete extracted text with structure preserved",
  "isHandwritten": true/false (whether document contains handwritten content),
  "language": "en" or "af" or other ISO code,
  "confidence": 0.0-1.0 (overall OCR confidence),
  "tables": [{"headers": [...], "rows": [[...]]}],
  "handwrittenSections": ["text of handwritten parts"]
}`
      }
    ];
    
    if (isPdf) {
      contentParts.push({
        type: 'file_url',
        file_url: {
          url: documentUrl,
          mime_type: 'application/pdf'
        }
      });
    } else if (isImage) {
      contentParts.push({
        type: 'image_url',
        image_url: {
          url: documentUrl,
          detail: 'high'
        }
      });
    }
    
    const response = await invokeLLM({
      messages: [
        {
          role: 'user',
          content: contentParts
        }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'ocr_extraction',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              rawText: { type: 'string', description: 'Complete extracted text' },
              isHandwritten: { type: 'boolean', description: 'Contains handwritten content' },
              language: { type: 'string', description: 'ISO language code' },
              confidence: { type: 'number', description: 'OCR confidence 0-1' },
              tables: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    headers: { type: 'array', items: { type: 'string' } },
                    rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } }
                  },
                  required: ['headers', 'rows'],
                  additionalProperties: false
                }
              },
              handwrittenSections: { type: 'array', items: { type: 'string' } }
            },
            required: ['rawText', 'isHandwritten', 'language', 'confidence', 'tables', 'handwrittenSections'],
            additionalProperties: false
          }
        }
      }
    });
    
    const content = response.choices[0]?.message?.content;
    const parsed = JSON.parse(typeof content === 'string' ? content : '{}');
    
    return {
      rawText: parsed.rawText || '',
      isHandwritten: parsed.isHandwritten || false,
      language: parsed.language || 'en',
      confidence: parsed.confidence || 0.5
    };
  } catch (error) {
    console.error('[Pipeline] OCR extraction failed:', error);
    return {
      rawText: '',
      isHandwritten: false,
      language: 'en',
      confidence: 0
    };
  }
}

// ============================================================
// STEP 2: DOCUMENT CLASSIFICATION
// ============================================================

/**
 * Classify a document based on its content and visual appearance.
 * Uses LLM to determine document type with confidence scoring.
 */
export async function classifyDocument(
  documentUrl: string,
  mimeType: string,
  rawText: string,
  filename: string
): Promise<DocumentClassification> {
  try {
    const contentParts: any[] = [
      {
        type: 'text',
        text: `You are an insurance document classifier. Classify this document.

FILENAME: ${filename}
EXTRACTED TEXT (first 3000 chars):
${rawText.substring(0, 3000)}

Classify this document into one of these categories:
- panel_beater_quote: A repair quotation from a panel beater / body shop
- police_report: A police accident report or traffic incident report
- claim_form: An insurance claim form
- assessor_report: A motor assessor's report or evaluation
- supporting_evidence: Photos, witness statements, or other evidence
- damage_image: A photograph of vehicle damage
- unknown: Cannot determine document type

Return JSON with:
{
  "documentType": "one of the categories above",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of classification decision",
  "isHandwritten": true/false,
  "language": "en or af",
  "pageCount": number or null
}`
      }
    ];
    
    const isPdf = mimeType === 'application/pdf';
    const isImage = mimeType.startsWith('image/');
    
    if (isPdf) {
      contentParts.push({
        type: 'file_url',
        file_url: { url: documentUrl, mime_type: 'application/pdf' }
      });
    } else if (isImage) {
      contentParts.push({
        type: 'image_url',
        image_url: { url: documentUrl, detail: 'high' }
      });
    }
    
    const response = await invokeLLM({
      messages: [{ role: 'user', content: contentParts }],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'document_classification',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              documentType: {
                type: 'string',
                enum: ['panel_beater_quote', 'police_report', 'claim_form', 'assessor_report', 'supporting_evidence', 'damage_image', 'unknown']
              },
              confidence: { type: 'number' },
              reasoning: { type: 'string' },
              isHandwritten: { type: 'boolean' },
              language: { type: 'string' },
              pageCount: { type: ['integer', 'null'] }
            },
            required: ['documentType', 'confidence', 'reasoning', 'isHandwritten', 'language', 'pageCount'],
            additionalProperties: false
          }
        }
      }
    });
    
    const content = response.choices[0]?.message?.content;
    return JSON.parse(typeof content === 'string' ? content : '{}');
  } catch (error) {
    console.error('[Pipeline] Classification failed:', error);
    return {
      documentType: 'unknown',
      confidence: 0,
      reasoning: 'Classification failed: ' + (error instanceof Error ? error.message : 'Unknown error'),
      isHandwritten: false,
      language: 'en',
      pageCount: undefined
    };
  }
}

// ============================================================
// STEP 3: STRUCTURED DATA EXTRACTION
// ============================================================

/**
 * Extract structured claim data from document content.
 * Handles vehicle details, accident info, repair items, costs, and claimant details.
 * Specially handles handwritten panel beater quotes by converting them to typed format.
 */
export async function extractStructuredData(
  documentUrl: string,
  mimeType: string,
  rawText: string,
  classification: DocumentClassification,
  filename: string
): Promise<Omit<DocumentExtractionResult, 'classification' | 'rawText' | 'dataQualityScore' | 'fieldsExtracted' | 'fieldsMissing'>> {
  try {
    const handwrittenNote = classification.isHandwritten
      ? `\n\nIMPORTANT: This document contains HANDWRITTEN content. Pay extra attention to:
- Handwritten monetary amounts (convert to numeric values)
- Handwritten part descriptions (transcribe accurately)
- Handwritten labour hours and rates
- Any handwritten notes or annotations
Convert ALL handwritten content into typed, structured format.`
      : '';

    const contentParts: any[] = [
      {
        type: 'text',
        text: `You are a motor insurance data extraction specialist. Extract ALL structured data from this ${classification.documentType} document.${handwrittenNote}

DOCUMENT: ${filename}
TYPE: ${classification.documentType}
EXTRACTED TEXT:
${rawText.substring(0, 8000)}

Extract the following data. Use null for fields that cannot be determined.
All monetary values should be extracted as numbers without currency symbols. Detect the currency from the document context (e.g., USD, ZIG, ZAR, BWP).

Return a JSON object with these sections:
1. vehicle: { make, model, year, registration, vin, color, mileage }
2. accident: { incidentDate (YYYY-MM-DD), incidentLocation, incidentDescription, accidentType, estimatedSpeed }
3. claimant: { claimantName, claimantIdNumber, claimantContact }
4. repairItems: Array of line items with { itemNumber, description, partNumber, category, damageLocation, repairAction, quantity, unitPrice, lineTotal, laborHours, laborRate, partsQuality, bettermentPercent, extractionConfidence, isHandwritten }
5. costBreakdown: { laborCost, partsCost, paintCost, materialsCost, subletCost, sundries, vatAmount, totalExclVat, totalInclVat, totalLaborHours, averageLaborRate, totalPartsCount, oemPartsCount, aftermarketPartsCount, repairVsReplaceRatio, totalBetterment }
6. claimReference, policyNumber, assessorName, assessorLicenseNumber, panelBeaterName`
      }
    ];
    
    const isPdf = mimeType === 'application/pdf';
    const isImage = mimeType.startsWith('image/');
    
    if (isPdf) {
      contentParts.push({
        type: 'file_url',
        file_url: { url: documentUrl, mime_type: 'application/pdf' }
      });
    } else if (isImage) {
      contentParts.push({
        type: 'image_url',
        image_url: { url: documentUrl, detail: 'high' }
      });
    }
    
    const response = await invokeLLM({
      messages: [{ role: 'user', content: contentParts }],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'structured_extraction',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              vehicle: {
                type: 'object',
                properties: {
                  make: { type: ['string', 'null'] },
                  model: { type: ['string', 'null'] },
                  year: { type: ['integer', 'null'] },
                  registration: { type: ['string', 'null'] },
                  vin: { type: ['string', 'null'] },
                  color: { type: ['string', 'null'] },
                  mileage: { type: ['integer', 'null'] }
                },
                required: ['make', 'model', 'year', 'registration', 'vin', 'color', 'mileage'],
                additionalProperties: false
              },
              accident: {
                type: 'object',
                properties: {
                  incidentDate: { type: ['string', 'null'] },
                  incidentLocation: { type: ['string', 'null'] },
                  incidentDescription: { type: ['string', 'null'] },
                  accidentType: { type: ['string', 'null'] },
                  estimatedSpeed: { type: ['integer', 'null'] }
                },
                required: ['incidentDate', 'incidentLocation', 'incidentDescription', 'accidentType', 'estimatedSpeed'],
                additionalProperties: false
              },
              claimant: {
                type: 'object',
                properties: {
                  claimantName: { type: ['string', 'null'] },
                  claimantIdNumber: { type: ['string', 'null'] },
                  claimantContact: { type: ['string', 'null'] }
                },
                required: ['claimantName', 'claimantIdNumber', 'claimantContact'],
                additionalProperties: false
              },
              repairItems: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    itemNumber: { type: 'integer' },
                    description: { type: 'string' },
                    partNumber: { type: ['string', 'null'] },
                    category: { type: 'string', enum: ['parts', 'labor', 'paint', 'diagnostic', 'sundries', 'sublet', 'other'] },
                    damageLocation: { type: ['string', 'null'] },
                    repairAction: { type: ['string', 'null'] },
                    quantity: { type: 'number' },
                    unitPrice: { type: ['number', 'null'] },
                    lineTotal: { type: ['number', 'null'] },
                    laborHours: { type: ['number', 'null'] },
                    laborRate: { type: ['number', 'null'] },
                    partsQuality: { type: ['string', 'null'] },
                    bettermentPercent: { type: ['number', 'null'] },
                    extractionConfidence: { type: 'number' },
                    isHandwritten: { type: 'boolean' }
                  },
                  required: ['itemNumber', 'description', 'partNumber', 'category', 'damageLocation', 'repairAction', 'quantity', 'unitPrice', 'lineTotal', 'laborHours', 'laborRate', 'partsQuality', 'bettermentPercent', 'extractionConfidence', 'isHandwritten'],
                  additionalProperties: false
                }
              },
              costBreakdown: {
                type: 'object',
                properties: {
                  laborCost: { type: 'number' },
                  partsCost: { type: 'number' },
                  paintCost: { type: 'number' },
                  materialsCost: { type: 'number' },
                  subletCost: { type: 'number' },
                  sundries: { type: 'number' },
                  vatAmount: { type: 'number' },
                  totalExclVat: { type: 'number' },
                  totalInclVat: { type: 'number' },
                  totalLaborHours: { type: ['number', 'null'] },
                  averageLaborRate: { type: ['number', 'null'] },
                  totalPartsCount: { type: 'integer' },
                  oemPartsCount: { type: 'integer' },
                  aftermarketPartsCount: { type: 'integer' },
                  repairVsReplaceRatio: { type: ['number', 'null'] },
                  totalBetterment: { type: 'number' }
                },
                required: ['laborCost', 'partsCost', 'paintCost', 'materialsCost', 'subletCost', 'sundries', 'vatAmount', 'totalExclVat', 'totalInclVat', 'totalLaborHours', 'averageLaborRate', 'totalPartsCount', 'oemPartsCount', 'aftermarketPartsCount', 'repairVsReplaceRatio', 'totalBetterment'],
                additionalProperties: false
              },
              claimReference: { type: ['string', 'null'] },
              policyNumber: { type: ['string', 'null'] },
              assessorName: { type: ['string', 'null'] },
              assessorLicenseNumber: { type: ['string', 'null'] },
              panelBeaterName: { type: ['string', 'null'] }
            },
            required: ['vehicle', 'accident', 'claimant', 'repairItems', 'costBreakdown', 'claimReference', 'policyNumber', 'assessorName', 'assessorLicenseNumber', 'panelBeaterName'],
            additionalProperties: false
          }
        }
      }
    });
    
    const content = response.choices[0]?.message?.content;
    const parsed = JSON.parse(typeof content === 'string' ? content : '{}');
    
    return {
      vehicle: parsed.vehicle || { make: null, model: null, year: null, registration: null, vin: null, color: null, mileage: null },
      accident: parsed.accident || { incidentDate: null, incidentLocation: null, incidentDescription: null, accidentType: null, estimatedSpeed: null },
      claimant: parsed.claimant || { claimantName: null, claimantIdNumber: null, claimantContact: null },
      repairItems: parsed.repairItems || [],
      costBreakdown: parsed.costBreakdown || {
        laborCost: 0, partsCost: 0, paintCost: 0, materialsCost: 0,
        subletCost: 0, sundries: 0, vatAmount: 0, totalExclVat: 0, totalInclVat: 0,
        totalLaborHours: null, averageLaborRate: null, totalPartsCount: 0,
        oemPartsCount: 0, aftermarketPartsCount: 0, repairVsReplaceRatio: null, totalBetterment: 0
      },
      claimReference: parsed.claimReference || null,
      policyNumber: parsed.policyNumber || null,
      assessorName: parsed.assessorName || null,
      assessorLicenseNumber: parsed.assessorLicenseNumber || null,
      panelBeaterName: parsed.panelBeaterName || null
    };
  } catch (error) {
    console.error('[Pipeline] Structured extraction failed:', error);
    return {
      vehicle: { make: null, model: null, year: null, registration: null, vin: null, color: null, mileage: null },
      accident: { incidentDate: null, incidentLocation: null, incidentDescription: null, accidentType: null, estimatedSpeed: null },
      claimant: { claimantName: null, claimantIdNumber: null, claimantContact: null },
      repairItems: [],
      costBreakdown: {
        laborCost: 0, partsCost: 0, paintCost: 0, materialsCost: 0,
        subletCost: 0, sundries: 0, vatAmount: 0, totalExclVat: 0, totalInclVat: 0,
        totalLaborHours: null, averageLaborRate: null, totalPartsCount: 0,
        oemPartsCount: 0, aftermarketPartsCount: 0, repairVsReplaceRatio: null, totalBetterment: 0
      },
      claimReference: null,
      policyNumber: null,
      assessorName: null,
      assessorLicenseNumber: null,
      panelBeaterName: null
    };
  }
}

// ============================================================
// DATA QUALITY SCORING
// ============================================================

/**
 * Calculate data quality score based on completeness of extracted fields.
 */
export function calculateDataQuality(result: DocumentExtractionResult): { score: number; extracted: number; missing: number } {
  const fields = [
    result.vehicle.make, result.vehicle.model, result.vehicle.year,
    result.vehicle.registration, result.vehicle.vin, result.vehicle.color,
    result.accident.incidentDate, result.accident.incidentLocation,
    result.accident.incidentDescription, result.accident.accidentType,
    result.claimant.claimantName, result.claimant.claimantIdNumber,
    result.claimReference, result.policyNumber,
    result.costBreakdown.totalInclVat > 0 ? 'has_total' : null,
    result.repairItems.length > 0 ? 'has_items' : null,
  ];
  
  const extracted = fields.filter(f => f !== null && f !== undefined).length;
  const total = fields.length;
  const missing = total - extracted;
  const score = Math.round((extracted / total) * 100);
  
  return { score, extracted, missing };
}

// ============================================================
// FULL DOCUMENT PROCESSING PIPELINE
// ============================================================

/**
 * Process a single document through the complete intelligence pipeline.
 * Steps: OCR → Classification → Structured Extraction → Quality Scoring
 */
export async function processDocument(
  documentUrl: string,
  mimeType: string,
  filename: string
): Promise<DocumentExtractionResult> {
  console.log(`[Pipeline] Processing document: ${filename}`);
  
  // Step 1: OCR Extraction
  const ocrResult = await extractDocumentContent(documentUrl, mimeType, filename);
  console.log(`[Pipeline] OCR complete: ${ocrResult.rawText.length} chars, handwritten: ${ocrResult.isHandwritten}`);
  
  // Step 2: Classification
  const classification = await classifyDocument(documentUrl, mimeType, ocrResult.rawText, filename);
  console.log(`[Pipeline] Classified as: ${classification.documentType} (confidence: ${classification.confidence})`);
  
  // Step 3: Structured Data Extraction
  const extracted = await extractStructuredData(documentUrl, mimeType, ocrResult.rawText, classification, filename);
  console.log(`[Pipeline] Extracted ${extracted.repairItems.length} repair items`);
  
  // Combine into full result
  const fullResult: DocumentExtractionResult = {
    classification,
    rawText: ocrResult.rawText,
    ...extracted,
    dataQualityScore: 0,
    fieldsExtracted: 0,
    fieldsMissing: 0
  };
  
  // Step 4: Quality Scoring
  const quality = calculateDataQuality(fullResult);
  fullResult.dataQualityScore = quality.score;
  fullResult.fieldsExtracted = quality.extracted;
  fullResult.fieldsMissing = quality.missing;
  
  console.log(`[Pipeline] Quality score: ${quality.score}/100 (${quality.extracted} extracted, ${quality.missing} missing)`);
  
  return fullResult;
}

// ============================================================
// VARIANCE DATASET GENERATION
// ============================================================

/**
 * Categorize variance percentage into severity buckets.
 */
function categorizeVariance(absPercent: number): 'within_threshold' | 'minor_variance' | 'significant_variance' | 'major_variance' | 'extreme_variance' {
  if (absPercent < 5) return 'within_threshold';
  if (absPercent < 15) return 'minor_variance';
  if (absPercent < 30) return 'significant_variance';
  if (absPercent < 50) return 'major_variance';
  return 'extreme_variance';
}

/**
 * Generate variance datasets for a historical claim.
 * Compares: quote vs final, AI vs final, assessor vs final, etc.
 */
export async function generateVarianceDatasets(
  historicalClaimId: number,
  tenantId: string,
  quoteAmount: number | null,
  assessorEstimate: number | null,
  aiEstimate: number | null,
  finalApproved: number | null,
  vehicleInfo: { make: string | null; model: string | null; year: number | null },
  accidentType: string | null,
  assessorInfo: { name: string | null; licenseNumber: string | null },
  costBreakdowns?: {
    quote?: ExtractedCostBreakdown;
    assessor?: ExtractedCostBreakdown;
    ai?: ExtractedCostBreakdown;
    final?: ExtractedCostBreakdown;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  const comparisons: Array<{
    type: 'quote_vs_final' | 'ai_vs_final' | 'assessor_vs_final' | 'quote_vs_assessor' | 'ai_vs_assessor' | 'quote_vs_ai';
    labelA: string;
    amountA: number | null;
    labelB: string;
    amountB: number | null;
    breakdownA?: ExtractedCostBreakdown;
    breakdownB?: ExtractedCostBreakdown;
  }> = [
    { type: 'quote_vs_final', labelA: 'Panel Beater Quote', amountA: quoteAmount, labelB: 'Final Approved', amountB: finalApproved, breakdownA: costBreakdowns?.quote, breakdownB: costBreakdowns?.final },
    { type: 'ai_vs_final', labelA: 'AI Estimate', amountA: aiEstimate, labelB: 'Final Approved', amountB: finalApproved, breakdownA: costBreakdowns?.ai, breakdownB: costBreakdowns?.final },
    { type: 'assessor_vs_final', labelA: 'Assessor Estimate', amountA: assessorEstimate, labelB: 'Final Approved', amountB: finalApproved, breakdownA: costBreakdowns?.assessor, breakdownB: costBreakdowns?.final },
    { type: 'quote_vs_assessor', labelA: 'Panel Beater Quote', amountA: quoteAmount, labelB: 'Assessor Estimate', amountB: assessorEstimate, breakdownA: costBreakdowns?.quote, breakdownB: costBreakdowns?.assessor },
    { type: 'ai_vs_assessor', labelA: 'AI Estimate', amountA: aiEstimate, labelB: 'Assessor Estimate', amountB: assessorEstimate, breakdownA: costBreakdowns?.ai, breakdownB: costBreakdowns?.assessor },
    { type: 'quote_vs_ai', labelA: 'Panel Beater Quote', amountA: quoteAmount, labelB: 'AI Estimate', amountB: aiEstimate, breakdownA: costBreakdowns?.quote, breakdownB: costBreakdowns?.ai },
  ];
  
  for (const comp of comparisons) {
    if (comp.amountA === null || comp.amountB === null || comp.amountB === 0) continue;
    
    const varianceAmount = comp.amountA - comp.amountB;
    const variancePercent = ((comp.amountA - comp.amountB) / comp.amountB) * 100;
    const absoluteVariancePercent = Math.abs(variancePercent);
    
    const laborVariance = (comp.breakdownA?.laborCost && comp.breakdownB?.laborCost)
      ? comp.breakdownA.laborCost - comp.breakdownB.laborCost : null;
    const partsVariance = (comp.breakdownA?.partsCost && comp.breakdownB?.partsCost)
      ? comp.breakdownA.partsCost - comp.breakdownB.partsCost : null;
    const paintVariance = (comp.breakdownA?.paintCost && comp.breakdownB?.paintCost)
      ? comp.breakdownA.paintCost - comp.breakdownB.paintCost : null;
    
    try {
      await db.insert(varianceDatasets).values({
        historicalClaimId,
        tenantId,
        comparisonType: comp.type,
        sourceALabel: comp.labelA,
        sourceAAmount: comp.amountA.toFixed(2),
        sourceBLabel: comp.labelB,
        sourceBAmount: comp.amountB.toFixed(2),
        varianceAmount: varianceAmount.toFixed(2),
        variancePercent: variancePercent.toFixed(2),
        absoluteVariancePercent: absoluteVariancePercent.toFixed(2),
        laborVariance: laborVariance?.toFixed(2) ?? null,
        partsVariance: partsVariance?.toFixed(2) ?? null,
        paintVariance: paintVariance?.toFixed(2) ?? null,
        varianceCategory: categorizeVariance(absoluteVariancePercent),
        vehicleMake: vehicleInfo.make,
        vehicleModel: vehicleInfo.model,
        vehicleYear: vehicleInfo.year,
        accidentType,
        assessorName: assessorInfo.name,
        assessorLicenseNumber: assessorInfo.licenseNumber,
        isFraudSuspected: absoluteVariancePercent > 50 ? 1 : 0,
        isOutlier: absoluteVariancePercent > 75 ? 1 : 0,
      });
    } catch (error) {
      console.error(`[Pipeline] Failed to insert variance dataset (${comp.type}):`, error);
    }
  }
}

// ============================================================
// BATCH PROCESSING
// ============================================================

/**
 * Process a batch of documents for a historical claim.
 * Creates the historical claim record, processes each document,
 * stores extracted data, and generates variance datasets.
 */
export async function processBatchForHistoricalClaim(
  tenantId: string,
  batchId: number,
  documentIds: number[]
): Promise<PipelineProcessingResult> {
  const db = await getDb();
  if (!db) {
    return {
      historicalClaimId: 0,
      documentsProcessed: 0,
      documentsFailed: documentIds.length,
      extractionResults: [],
      pipelineStatus: 'failed',
      errors: ['Database not available']
    };
  }
  
  // Create historical claim record
  const [claimRecord] = await db.insert(historicalClaims).values({
    tenantId,
    batchId,
    pipelineStatus: 'documents_uploaded',
    totalDocuments: documentIds.length,
  });
  
  const historicalClaimId = claimRecord.insertId;
  const results: DocumentExtractionResult[] = [];
  const errors: string[] = [];
  let processed = 0;
  let failed = 0;
  
  // Process each document
  for (const docId of documentIds) {
    try {
      // Get document from DB
      const [doc] = await db.select().from(ingestionDocuments).where(eq(ingestionDocuments.id, docId));
      if (!doc || !doc.s3Url) {
        errors.push(`Document ${docId}: not found or missing S3 URL`);
        failed++;
        continue;
      }
      
      // Update document status
      await db.update(ingestionDocuments)
        .set({ extractionStatus: 'processing' })
        .where(eq(ingestionDocuments.id, docId));
      
      // Process through pipeline
      const result = await processDocument(doc.s3Url, doc.mimeType || 'application/pdf', doc.originalFilename || 'document');
      results.push(result);
      
      // Update document classification
      // Map pipeline types to DB schema types
      const dbDocType = result.classification.documentType === 'panel_beater_quote' ? 'repair_quote' : result.classification.documentType;
      await db.update(ingestionDocuments)
        .set({
          documentType: dbDocType as any,
          classificationConfidence: result.classification.confidence.toString(),
          classificationMethod: 'ai_model',
          extractionStatus: 'completed',
        })
        .where(eq(ingestionDocuments.id, docId));
      
      // Store extracted repair items
      for (const item of result.repairItems) {
        const sourceType = result.classification.documentType === 'panel_beater_quote' ? 'panel_beater_quote'
          : result.classification.documentType === 'assessor_report' ? 'assessor_report'
          : 'ai_estimate';
        
        await db.insert(extractedRepairItems).values({
          historicalClaimId,
          documentId: docId,
          sourceType,
          itemNumber: item.itemNumber,
          description: item.description,
          partNumber: item.partNumber,
          category: item.category,
          damageLocation: item.damageLocation,
          repairAction: item.repairAction as any,
          quantity: item.quantity.toFixed(2),
          unitPrice: item.unitPrice?.toFixed(2) ?? null,
          lineTotal: item.lineTotal?.toFixed(2) ?? null,
          laborHours: item.laborHours?.toFixed(2) ?? null,
          laborRate: item.laborRate?.toFixed(2) ?? null,
          partsQuality: item.partsQuality as any,
          bettermentPercent: item.bettermentPercent?.toFixed(2) ?? null,
          extractionConfidence: item.extractionConfidence.toFixed(4),
          isHandwritten: item.isHandwritten ? 1 : 0,
        });
      }
      
      // Store cost components
      const sourceType = result.classification.documentType === 'panel_beater_quote' ? 'panel_beater_quote'
        : result.classification.documentType === 'assessor_report' ? 'assessor_report'
        : 'ai_estimate';
      
      await db.insert(costComponents).values({
        historicalClaimId,
        sourceType: sourceType as any,
        documentId: docId,
        laborCost: result.costBreakdown.laborCost.toFixed(2),
        partsCost: result.costBreakdown.partsCost.toFixed(2),
        paintCost: result.costBreakdown.paintCost.toFixed(2),
        materialsCost: result.costBreakdown.materialsCost.toFixed(2),
        subletCost: result.costBreakdown.subletCost.toFixed(2),
        sundries: result.costBreakdown.sundries.toFixed(2),
        vatAmount: result.costBreakdown.vatAmount.toFixed(2),
        totalExclVat: result.costBreakdown.totalExclVat.toFixed(2),
        totalInclVat: result.costBreakdown.totalInclVat.toFixed(2),
        totalLaborHours: result.costBreakdown.totalLaborHours?.toFixed(2) ?? null,
        averageLaborRate: result.costBreakdown.averageLaborRate?.toFixed(2) ?? null,
        totalPartsCount: result.costBreakdown.totalPartsCount,
        oemPartsCount: result.costBreakdown.oemPartsCount,
        aftermarketPartsCount: result.costBreakdown.aftermarketPartsCount,
        repairVsReplaceRatio: result.costBreakdown.repairVsReplaceRatio?.toFixed(2) ?? null,
        totalBetterment: result.costBreakdown.totalBetterment.toFixed(2),
        extractionConfidence: result.classification.confidence.toFixed(4),
      });
      
      // Log AI prediction
      await db.insert(aiPredictionLogs).values({
        historicalClaimId,
        tenantId,
        predictionType: 'cost_estimate',
        modelName: 'gemini-2.5-flash',
        inputSummary: `Extracted from ${result.classification.documentType}: ${doc.originalFilename}`,
        predictedValue: result.costBreakdown.totalInclVat.toFixed(2),
        confidenceScore: result.classification.confidence.toFixed(4),
        predictionJson: JSON.stringify(result),
      });
      
      processed++;
    } catch (error) {
      const errorMsg = `Document ${docId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
      errors.push(errorMsg);
      failed++;
      console.error(`[Pipeline] ${errorMsg}`);
      
      // Update document status to failed
      try {
        await db.update(ingestionDocuments)
          .set({ extractionStatus: 'failed' })
          .where(eq(ingestionDocuments.id, docId));
      } catch {}
    }
  }
  
  // Update historical claim with aggregated data from first successful result
  const firstQuote = results.find(r => r.classification.documentType === 'panel_beater_quote');
  const firstAssessor = results.find(r => r.classification.documentType === 'assessor_report');
  const primaryResult = firstQuote || firstAssessor || results[0];
  
  if (primaryResult) {
    const quality = calculateDataQuality(primaryResult);
    
    await db.update(historicalClaims)
      .set({
        claimReference: primaryResult.claimReference,
        policyNumber: primaryResult.policyNumber,
        vehicleMake: primaryResult.vehicle.make,
        vehicleModel: primaryResult.vehicle.model,
        vehicleYear: primaryResult.vehicle.year,
        vehicleRegistration: primaryResult.vehicle.registration,
        vehicleVin: primaryResult.vehicle.vin,
        vehicleColor: primaryResult.vehicle.color,
        incidentDate: primaryResult.accident.incidentDate ? new Date(primaryResult.accident.incidentDate) as any : null,
        incidentLocation: primaryResult.accident.incidentLocation,
        incidentDescription: primaryResult.accident.incidentDescription,
        accidentType: primaryResult.accident.accidentType,
        estimatedSpeed: primaryResult.accident.estimatedSpeed,
        claimantName: primaryResult.claimant.claimantName,
        claimantIdNumber: primaryResult.claimant.claimantIdNumber,
        claimantContact: primaryResult.claimant.claimantContact,
        totalPanelBeaterQuote: firstQuote ? firstQuote.costBreakdown.totalInclVat.toFixed(2) : null,
        totalAssessorEstimate: firstAssessor ? firstAssessor.costBreakdown.totalInclVat.toFixed(2) : null,
        assessorName: primaryResult.assessorName,
        assessorLicenseNumber: primaryResult.assessorLicenseNumber,
        pipelineStatus: 'extraction_complete',
        dataQualityScore: quality.score,
        fieldsExtracted: quality.extracted,
        fieldsMissing: quality.missing,
        extractionLog: JSON.stringify(results.map(r => ({
          type: r.classification.documentType,
          confidence: r.classification.confidence,
          items: r.repairItems.length,
          total: r.costBreakdown.totalInclVat
        }))),
        damagePhotosJson: JSON.stringify([]),
      })
      .where(eq(historicalClaims.id, historicalClaimId));
  }
  
  const pipelineStatus = failed === documentIds.length ? 'failed'
    : processed > 0 ? 'extraction_complete'
    : 'failed';
  
  if (!primaryResult) {
    await db.update(historicalClaims)
      .set({
        pipelineStatus: 'failed',
        lastError: errors.join('; '),
      })
      .where(eq(historicalClaims.id, historicalClaimId));
  }
  
  return {
    historicalClaimId,
    documentsProcessed: processed,
    documentsFailed: failed,
    extractionResults: results,
    pipelineStatus,
    errors
  };
}
