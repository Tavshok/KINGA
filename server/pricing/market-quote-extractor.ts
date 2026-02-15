/**
 * Market Quote Extraction Engine
 * 
 * Extracts structured parts pricing data from supplier quotes in various formats:
 * - PDF supplier quotes (header + table format)
 * - Excel spreadsheets (columns: part name, part number, price, etc.)
 * - Image quotes (OCR + LLM vision extraction)
 * 
 * Supports international suppliers (SA, Zimbabwe, Japan, UAE, Thailand, etc.)
 * for ex-Japanese vehicle parts sourcing.
 */

import { invokeLLM } from "../_core/llm";
import type { Message } from "../_core/llm";

export interface ExtractedQuoteData {
  // Supplier information
  supplierName: string;
  supplierCountry: string;
  supplierContact?: string;
  
  // Quote metadata
  quoteDate: string; // ISO date string
  quoteNumber?: string;
  quoteValidUntil?: string; // ISO date string
  
  // Line items
  lineItems: ExtractedLineItem[];
  
  // Extraction metadata
  extractionConfidence: number; // 0.0 - 1.0
  extractionNotes: string[]; // Warnings, issues, assumptions
}

export interface ExtractedLineItem {
  partName: string;
  partNumber?: string;
  partDescription?: string;
  partCategory?: string;
  
  // Vehicle fitment (if specified)
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYearFrom?: number;
  vehicleYearTo?: number;
  
  // Pricing
  price: number;
  currency: string; // e.g., "ZAR", "USD", "ZWL", "JPY", "AED", "THB"
  
  // Import costs (for international suppliers)
  shippingCost?: number;
  customsDuty?: number;
  clearingFees?: number;
  forexCharges?: number;
  leadTimeDays?: number;
  
  // Part type/quality
  partType?: "OEM" | "OEM_Equivalent" | "Aftermarket" | "Used" | "Unknown";
  
  // Quantity
  quantity?: number;
  
  // Line metadata
  lineNumber?: number;
}

/**
 * Extract parts pricing data from PDF supplier quote
 */
export async function extractFromPDF(documentUrl: string): Promise<ExtractedQuoteData> {
  const prompt = `You are a parts pricing data extraction specialist. Extract structured data from this supplier quote PDF.

Extract the following information:

**Supplier Information:**
- Supplier name (company name)
- Supplier country (South Africa, Zimbabwe, Japan, UAE, Thailand, Singapore, etc.)
- Supplier contact (phone, email if visible)

**Quote Metadata:**
- Quote date (convert to YYYY-MM-DD format)
- Quote number (if visible)
- Quote valid until date (if specified)

**Line Items:**
For each part listed in the quote, extract:
- Part name (e.g., "Front Bumper", "Headlight Assembly Left")
- Part number (manufacturer part number if visible)
- Part description (additional details)
- Part category (e.g., "Body Parts", "Lighting", "Engine Components")
- Vehicle fitment (make, model, year range if specified)
- Price (numeric value only)
- Currency (ZAR, USD, ZWL, JPY, AED, THB, etc.)
- Import costs if mentioned (shipping, customs duty, clearing fees, forex charges)
- Lead time in days if mentioned
- Part type (OEM, OEM Equivalent, Aftermarket, Used, or Unknown)
- Quantity (default to 1 if not specified)
- Line number (position in quote)

**Important:**
- If supplier country is not explicitly stated, infer from currency, phone code, or address
- For Japanese suppliers, look for JPY currency or +81 phone code
- For UAE suppliers, look for AED currency or +971 phone code
- For Thai suppliers, look for THB currency or +66 phone code
- If part type is not specified, mark as "Unknown"
- If vehicle fitment is not specified, leave those fields empty
- Extract ALL line items, even if some fields are missing

Return the data as JSON matching this structure:
{
  "supplierName": "string",
  "supplierCountry": "string",
  "supplierContact": "string or null",
  "quoteDate": "YYYY-MM-DD",
  "quoteNumber": "string or null",
  "quoteValidUntil": "YYYY-MM-DD or null",
  "lineItems": [
    {
      "partName": "string",
      "partNumber": "string or null",
      "partDescription": "string or null",
      "partCategory": "string or null",
      "vehicleMake": "string or null",
      "vehicleModel": "string or null",
      "vehicleYearFrom": number or null,
      "vehicleYearTo": number or null,
      "price": number,
      "currency": "string",
      "shippingCost": number or null,
      "customsDuty": number or null,
      "clearingFees": number or null,
      "forexCharges": number or null,
      "leadTimeDays": number or null,
      "partType": "OEM" | "OEM_Equivalent" | "Aftermarket" | "Used" | "Unknown",
      "quantity": number,
      "lineNumber": number
    }
  ],
  "extractionNotes": ["string array of warnings or assumptions"]
}`;

  const messages: Message[] = [
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "file_url", file_url: { url: documentUrl, mime_type: "application/pdf" } }
      ]
    }
  ];

  const response = await invokeLLM({
    messages,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "supplier_quote_extraction",
        strict: true,
        schema: {
          type: "object",
          properties: {
            supplierName: { type: "string" },
            supplierCountry: { type: "string" },
            supplierContact: { type: ["string", "null"] },
            quoteDate: { type: "string" },
            quoteNumber: { type: ["string", "null"] },
            quoteValidUntil: { type: ["string", "null"] },
            lineItems: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  partName: { type: "string" },
                  partNumber: { type: ["string", "null"] },
                  partDescription: { type: ["string", "null"] },
                  partCategory: { type: ["string", "null"] },
                  vehicleMake: { type: ["string", "null"] },
                  vehicleModel: { type: ["string", "null"] },
                  vehicleYearFrom: { type: ["number", "null"] },
                  vehicleYearTo: { type: ["number", "null"] },
                  price: { type: "number" },
                  currency: { type: "string" },
                  shippingCost: { type: ["number", "null"] },
                  customsDuty: { type: ["number", "null"] },
                  clearingFees: { type: ["number", "null"] },
                  forexCharges: { type: ["number", "null"] },
                  leadTimeDays: { type: ["number", "null"] },
                  partType: { type: "string", enum: ["OEM", "OEM_Equivalent", "Aftermarket", "Used", "Unknown"] },
                  quantity: { type: "number" },
                  lineNumber: { type: "number" }
                },
                required: ["partName", "price", "currency", "partType", "quantity", "lineNumber"],
                additionalProperties: false
              }
            },
            extractionNotes: {
              type: "array",
              items: { type: "string" }
            }
          },
          required: ["supplierName", "supplierCountry", "quoteDate", "lineItems", "extractionNotes"],
          additionalProperties: false
        }
      }
    }
  });

  const content = response.choices[0].message.content;
  if (!content) {
    throw new Error("No content in LLM response");
  }

  const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
  const extracted = JSON.parse(contentStr);
  
  // Calculate extraction confidence based on completeness
  const totalFields = extracted.lineItems.length * 10; // 10 key fields per line item
  let filledFields = 0;
  
  extracted.lineItems.forEach((item: ExtractedLineItem) => {
    if (item.partName) filledFields++;
    if (item.partNumber) filledFields++;
    if (item.partDescription) filledFields++;
    if (item.partCategory) filledFields++;
    if (item.vehicleMake) filledFields++;
    if (item.vehicleModel) filledFields++;
    if (item.price) filledFields++;
    if (item.currency) filledFields++;
    if (item.partType && item.partType !== "Unknown") filledFields++;
    if (item.quantity) filledFields++;
  });
  
  const confidence = totalFields > 0 ? filledFields / totalFields : 0;
  
  return {
    ...extracted,
    extractionConfidence: Math.round(confidence * 100) / 100
  };
}

/**
 * Extract parts pricing data from Excel supplier quote
 */
export async function extractFromExcel(documentUrl: string): Promise<ExtractedQuoteData> {
  // For Excel files, we'll use LLM vision to read the spreadsheet
  // (LLM can process Excel files directly)
  
  const prompt = `You are a parts pricing data extraction specialist. Extract structured data from this Excel supplier quote.

This is typically a spreadsheet with columns like:
- Part Name / Description
- Part Number / SKU
- Price / Unit Price
- Currency
- Quantity
- Vehicle Make/Model (if specified)
- Part Type (OEM, Aftermarket, etc.)

The header rows may contain supplier information (name, address, contact, quote date).

Extract the following information:

**Supplier Information:**
- Supplier name (from header or company name)
- Supplier country (infer from currency, address, or phone code)
- Supplier contact (phone, email if visible)

**Quote Metadata:**
- Quote date (convert to YYYY-MM-DD format)
- Quote number (if visible)
- Quote valid until date (if specified)

**Line Items:**
For each row in the parts table, extract:
- Part name
- Part number (if column exists)
- Part description (if separate from name)
- Part category (if specified)
- Vehicle fitment (make, model, year range if columns exist)
- Price (numeric value only)
- Currency (ZAR, USD, ZWL, JPY, AED, THB, etc.)
- Import costs if columns exist (shipping, customs, clearing, forex)
- Lead time in days if column exists
- Part type (OEM, OEM Equivalent, Aftermarket, Used, or Unknown)
- Quantity (from quantity column, default to 1)
- Line number (row number in table)

Return the data as JSON matching the same structure as PDF extraction.`;

  const messages: Message[] = [
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "file_url", file_url: { url: documentUrl } }
      ]
    }
  ];

  const response = await invokeLLM({
    messages,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "supplier_quote_extraction",
        strict: true,
        schema: {
          type: "object",
          properties: {
            supplierName: { type: "string" },
            supplierCountry: { type: "string" },
            supplierContact: { type: ["string", "null"] },
            quoteDate: { type: "string" },
            quoteNumber: { type: ["string", "null"] },
            quoteValidUntil: { type: ["string", "null"] },
            lineItems: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  partName: { type: "string" },
                  partNumber: { type: ["string", "null"] },
                  partDescription: { type: ["string", "null"] },
                  partCategory: { type: ["string", "null"] },
                  vehicleMake: { type: ["string", "null"] },
                  vehicleModel: { type: ["string", "null"] },
                  vehicleYearFrom: { type: ["number", "null"] },
                  vehicleYearTo: { type: ["number", "null"] },
                  price: { type: "number" },
                  currency: { type: "string" },
                  shippingCost: { type: ["number", "null"] },
                  customsDuty: { type: ["number", "null"] },
                  clearingFees: { type: ["number", "null"] },
                  forexCharges: { type: ["number", "null"] },
                  leadTimeDays: { type: ["number", "null"] },
                  partType: { type: "string", enum: ["OEM", "OEM_Equivalent", "Aftermarket", "Used", "Unknown"] },
                  quantity: { type: "number" },
                  lineNumber: { type: "number" }
                },
                required: ["partName", "price", "currency", "partType", "quantity", "lineNumber"],
                additionalProperties: false
              }
            },
            extractionNotes: {
              type: "array",
              items: { type: "string" }
            }
          },
          required: ["supplierName", "supplierCountry", "quoteDate", "lineItems", "extractionNotes"],
          additionalProperties: false
        }
      }
    }
  });

  const content = response.choices[0].message.content;
  if (!content) {
    throw new Error("No content in LLM response");
  }

  const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
  const extracted = JSON.parse(contentStr);
  
  // Calculate extraction confidence
  const totalFields = extracted.lineItems.length * 10;
  let filledFields = 0;
  
  extracted.lineItems.forEach((item: ExtractedLineItem) => {
    if (item.partName) filledFields++;
    if (item.partNumber) filledFields++;
    if (item.partDescription) filledFields++;
    if (item.partCategory) filledFields++;
    if (item.vehicleMake) filledFields++;
    if (item.vehicleModel) filledFields++;
    if (item.price) filledFields++;
    if (item.currency) filledFields++;
    if (item.partType && item.partType !== "Unknown") filledFields++;
    if (item.quantity) filledFields++;
  });
  
  const confidence = totalFields > 0 ? filledFields / totalFields : 0;
  
  return {
    ...extracted,
    extractionConfidence: Math.round(confidence * 100) / 100
  };
}

/**
 * Extract parts pricing data from image supplier quote (OCR + LLM vision)
 */
export async function extractFromImage(documentUrl: string): Promise<ExtractedQuoteData> {
  const prompt = `You are a parts pricing data extraction specialist. Extract structured data from this supplier quote image using OCR and vision analysis.

This may be a photo or scan of a paper quote, a screenshot, or a digital image.

Extract the following information:

**Supplier Information:**
- Supplier name (company name, letterhead)
- Supplier country (infer from currency, address, phone code, or language)
- Supplier contact (phone, email if visible)

**Quote Metadata:**
- Quote date (convert to YYYY-MM-DD format)
- Quote number (if visible)
- Quote valid until date (if specified)

**Line Items:**
For each part listed in the quote, extract:
- Part name
- Part number (if visible)
- Part description
- Part category (if you can infer from part name)
- Vehicle fitment (make, model, year if specified)
- Price (numeric value only)
- Currency (ZAR, USD, ZWL, JPY, AED, THB, etc. - infer from symbol if needed: R=ZAR, $=USD, ¥=JPY, د.إ=AED, ฿=THB)
- Import costs if mentioned (shipping, customs, clearing, forex)
- Lead time in days if mentioned
- Part type (OEM, OEM Equivalent, Aftermarket, Used, or Unknown)
- Quantity (default to 1 if not specified)
- Line number (position in quote)

**Important:**
- Use OCR to read all text carefully
- If handwritten, do your best to interpret the writing
- If image quality is poor, note this in extractionNotes
- If supplier country is not visible, infer from currency symbols or language
- Extract ALL visible line items

Return the data as JSON matching the same structure as PDF extraction.`;

  const messages: Message[] = [
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: documentUrl, detail: "high" } }
      ]
    }
  ];

  const response = await invokeLLM({
    messages,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "supplier_quote_extraction",
        strict: true,
        schema: {
          type: "object",
          properties: {
            supplierName: { type: "string" },
            supplierCountry: { type: "string" },
            supplierContact: { type: ["string", "null"] },
            quoteDate: { type: "string" },
            quoteNumber: { type: ["string", "null"] },
            quoteValidUntil: { type: ["string", "null"] },
            lineItems: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  partName: { type: "string" },
                  partNumber: { type: ["string", "null"] },
                  partDescription: { type: ["string", "null"] },
                  partCategory: { type: ["string", "null"] },
                  vehicleMake: { type: ["string", "null"] },
                  vehicleModel: { type: ["string", "null"] },
                  vehicleYearFrom: { type: ["number", "null"] },
                  vehicleYearTo: { type: ["number", "null"] },
                  price: { type: "number" },
                  currency: { type: "string" },
                  shippingCost: { type: ["number", "null"] },
                  customsDuty: { type: ["number", "null"] },
                  clearingFees: { type: ["number", "null"] },
                  forexCharges: { type: ["number", "null"] },
                  leadTimeDays: { type: ["number", "null"] },
                  partType: { type: "string", enum: ["OEM", "OEM_Equivalent", "Aftermarket", "Used", "Unknown"] },
                  quantity: { type: "number" },
                  lineNumber: { type: "number" }
                },
                required: ["partName", "price", "currency", "partType", "quantity", "lineNumber"],
                additionalProperties: false
              }
            },
            extractionNotes: {
              type: "array",
              items: { type: "string" }
            }
          },
          required: ["supplierName", "supplierCountry", "quoteDate", "lineItems", "extractionNotes"],
          additionalProperties: false
        }
      }
    }
  });

  const content = response.choices[0].message.content;
  if (!content) {
    throw new Error("No content in LLM response");
  }

  const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
  const extracted = JSON.parse(contentStr);
  
  // Calculate extraction confidence (lower for images due to OCR uncertainty)
  const totalFields = extracted.lineItems.length * 10;
  let filledFields = 0;
  
  extracted.lineItems.forEach((item: ExtractedLineItem) => {
    if (item.partName) filledFields++;
    if (item.partNumber) filledFields++;
    if (item.partDescription) filledFields++;
    if (item.partCategory) filledFields++;
    if (item.vehicleMake) filledFields++;
    if (item.vehicleModel) filledFields++;
    if (item.price) filledFields++;
    if (item.currency) filledFields++;
    if (item.partType && item.partType !== "Unknown") filledFields++;
    if (item.quantity) filledFields++;
  });
  
  const confidence = totalFields > 0 ? (filledFields / totalFields) * 0.9 : 0; // Max 0.9 for images
  
  return {
    ...extracted,
    extractionConfidence: Math.round(confidence * 100) / 100
  };
}

/**
 * Main extraction function that routes to appropriate extractor based on document type
 */
export async function extractMarketQuote(
  documentUrl: string,
  documentType: "pdf" | "excel" | "image"
): Promise<ExtractedQuoteData> {
  switch (documentType) {
    case "pdf":
      return extractFromPDF(documentUrl);
    case "excel":
      return extractFromExcel(documentUrl);
    case "image":
      return extractFromImage(documentUrl);
    default:
      throw new Error(`Unsupported document type: ${documentType}`);
  }
}
