// @ts-nocheck
/**
 * Claim Form Document Extractor
 * 
 * Uses LLM vision to extract claim form details from uploaded documents
 * (PDFs, images of handwritten/printed claim forms). Returns structured
 * data that can auto-populate the claim submission form.
 */

import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";

export interface ExtractedClaimFormData {
  // Vehicle Information
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleYear: number | null;
  vehicleRegistration: string | null;
  vehicleVin: string | null;
  vehicleColor: string | null;
  vehicleMileage: string | null;

  // Vehicle Registration Book Details
  vehicleVinFromRegBook: string | null;
  vehicleEngineNumber: string | null;
  vehicleGvm: string | null; // Gross Vehicle Mass in kg
  vehicleTareWeight: string | null; // Tare/unladen weight in kg
  vehicleEngineCapacity: string | null; // e.g. "1600cc" or "2.0L"
  vehicleFuelType: string | null; // petrol, diesel, hybrid, electric
  vehicleFirstRegistrationDate: string | null;
  vehicleOwnerName: string | null; // Registered owner from reg book
  vehicleLicenceExpiryDate: string | null;

  // Policy Information
  policyNumber: string | null;
  policyHolder: string | null;
  insurerName: string | null;
  brokerName: string | null;

  // Claimant Information
  claimantName: string | null;
  claimantIdNumber: string | null;
  claimantPhone: string | null;
  claimantEmail: string | null;
  claimantAddress: string | null;

  // Incident Details
  incidentDate: string | null;
  incidentTime: string | null;
  incidentLocation: string | null;
  incidentDescription: string | null;
  incidentType: string | null; // collision, theft, hail, fire, etc.

  // Third Party (if applicable)
  thirdPartyName: string | null;
  thirdPartyVehicle: string | null;
  thirdPartyRegistration: string | null;
  thirdPartyInsurer: string | null;

  // Police Report
  policeReportNumber: string | null;
  policeStation: string | null;

  // Damage Description
  damageDescription: string | null;
  damagedAreas: string[];

  // Witnesses
  witnessName: string | null;
  witnessPhone: string | null;

  // Extraction metadata
  confidence: number; // 0-100
  documentType: string; // "claim_form", "accident_report", "police_report", "registration_book", "licence_disc", etc.
  extractionNotes: string[];
  rawDocumentUrl: string;
  uploadedDocumentTypes: string[]; // Track which document types were uploaded
}

/**
 * Extract claim form data from an uploaded document using LLM vision
 */
export async function extractClaimFormData(
  fileBuffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<ExtractedClaimFormData> {
  // Upload the document to S3 first
  const fileKey = `claim-forms/${nanoid(12)}-${fileName}`;
  const { url: documentUrl } = await storagePut(fileKey, fileBuffer, mimeType);

  // Build the LLM vision request
  const isPdf = mimeType === "application/pdf";
  
  const extractionPrompt = `You are an expert insurance claim form data extractor for the insurance market.

Analyze this document carefully and extract ALL available information. This could be:
- A pre-filled insurance claim form (printed or handwritten)
- An accident report form
- A police report
- A damage assessment form
- Any document containing claim-related information

Extract every field you can find. For handwritten text, do your best to read it accurately.
Extract registration plates, ID numbers, and phone numbers in their local format as found in the document.

This document could be any of the following:
- Insurance claim form (printed or handwritten)
- Vehicle registration book / registration certificate (NaTIS document)
- Licence disc
- National ID document or driver's licence
- Accident report form
- Police report / case number document
- Damage assessment form

For VEHICLE REGISTRATION BOOKS specifically, extract:
- GVM (Gross Vehicle Mass) in kg
- Tare weight (unladen mass) in kg  
- Engine number
- VIN/Chassis number
- Engine capacity (cc or litres)
- Fuel type
- First registration date
- Registered owner name
- Licence expiry date

Return a JSON object with these fields (use null for fields not found in the document):

{
  "vehicleMake": "string or null - Vehicle manufacturer (e.g., Toyota, BMW, VW)",
  "vehicleModel": "string or null - Vehicle model (e.g., Corolla, 320i, Polo)",
  "vehicleYear": "number or null - Year of manufacture",
  "vehicleRegistration": "string or null - Registration/number plate",
  "vehicleVin": "string or null - VIN/chassis number",
  "vehicleColor": "string or null - Vehicle colour",
  "vehicleMileage": "string or null - Odometer reading",
  "vehicleVinFromRegBook": "string or null - VIN from registration book (may differ from claim form)",
  "vehicleEngineNumber": "string or null - Engine number from registration book",
  "vehicleGvm": "string or null - Gross Vehicle Mass in kg (e.g., 1850)",
  "vehicleTareWeight": "string or null - Tare/unladen weight in kg (e.g., 1350)",
  "vehicleEngineCapacity": "string or null - Engine capacity (e.g., 1600cc or 2.0L)",
  "vehicleFuelType": "string or null - Fuel type: petrol, diesel, hybrid, electric",
  "vehicleFirstRegistrationDate": "string or null - First registration date YYYY-MM-DD",
  "vehicleOwnerName": "string or null - Registered owner from registration book",
  "vehicleLicenceExpiryDate": "string or null - Licence disc expiry date YYYY-MM-DD",
  "policyNumber": "string or null - Insurance policy number",
  "policyHolder": "string or null - Name of policy holder",
  "insurerName": "string or null - Insurance company name",
  "brokerName": "string or null - Insurance broker name",
  "claimantName": "string or null - Full name of person making the claim",
  "claimantIdNumber": "string or null - National ID number or passport",
  "claimantPhone": "string or null - Contact phone number",
  "claimantEmail": "string or null - Email address",
  "claimantAddress": "string or null - Physical or postal address",
  "incidentDate": "string or null - Date of incident in YYYY-MM-DD format",
  "incidentTime": "string or null - Time of incident",
  "incidentLocation": "string or null - Where the incident occurred",
  "incidentDescription": "string or null - Full description of what happened",
  "incidentType": "string or null - Type: collision, theft, hail, fire, vandalism, flood, other",
  "thirdPartyName": "string or null - Other party's name",
  "thirdPartyVehicle": "string or null - Other party's vehicle details",
  "thirdPartyRegistration": "string or null - Other party's registration",
  "thirdPartyInsurer": "string or null - Other party's insurer",
  "policeReportNumber": "string or null - Case/report number",
  "policeStation": "string or null - Police station name",
  "damageDescription": "string or null - Description of damage to vehicle",
  "damagedAreas": ["array of strings - List of damaged areas/parts"],
  "witnessName": "string or null - Witness name if available",
  "witnessPhone": "string or null - Witness contact number",
  "confidence": "number 0-100 - Your confidence in the extraction accuracy",
  "documentType": "string - Type of document: claim_form, accident_report, police_report, registration_book, licence_disc, id_document, assessment_form, other",
  "extractionNotes": ["array of strings - Any notes about unclear fields, assumptions made, or issues"]
}

Be thorough. If you can partially read a field, include what you can with a note in extractionNotes.
For dates, convert to YYYY-MM-DD format regardless of the original format.
For phone numbers, normalize to international format with country code if available.`;

  const content: any[] = [
    { type: "text", text: extractionPrompt }
  ];

  if (isPdf) {
    content.push({
      type: "file_url",
      file_url: {
        url: documentUrl,
        mime_type: "application/pdf"
      }
    });
  } else {
    content.push({
      type: "image_url",
      image_url: {
        url: documentUrl,
        detail: "high"
      }
    });
  }

  const response = await invokeLLM({
    messages: [
      {
        role: "user",
        content
      }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "claim_form_extraction",
        strict: true,
        schema: {
          type: "object",
          properties: {
            vehicleMake: { type: ["string", "null"] },
            vehicleModel: { type: ["string", "null"] },
            vehicleYear: { type: ["number", "null"] },
            vehicleRegistration: { type: ["string", "null"] },
            vehicleVin: { type: ["string", "null"] },
            vehicleColor: { type: ["string", "null"] },
            vehicleMileage: { type: ["string", "null"] },
            vehicleVinFromRegBook: { type: ["string", "null"] },
            vehicleEngineNumber: { type: ["string", "null"] },
            vehicleGvm: { type: ["string", "null"] },
            vehicleTareWeight: { type: ["string", "null"] },
            vehicleEngineCapacity: { type: ["string", "null"] },
            vehicleFuelType: { type: ["string", "null"] },
            vehicleFirstRegistrationDate: { type: ["string", "null"] },
            vehicleOwnerName: { type: ["string", "null"] },
            vehicleLicenceExpiryDate: { type: ["string", "null"] },
            policyNumber: { type: ["string", "null"] },
            policyHolder: { type: ["string", "null"] },
            insurerName: { type: ["string", "null"] },
            brokerName: { type: ["string", "null"] },
            claimantName: { type: ["string", "null"] },
            claimantIdNumber: { type: ["string", "null"] },
            claimantPhone: { type: ["string", "null"] },
            claimantEmail: { type: ["string", "null"] },
            claimantAddress: { type: ["string", "null"] },
            incidentDate: { type: ["string", "null"] },
            incidentTime: { type: ["string", "null"] },
            incidentLocation: { type: ["string", "null"] },
            incidentDescription: { type: ["string", "null"] },
            incidentType: { type: ["string", "null"] },
            thirdPartyName: { type: ["string", "null"] },
            thirdPartyVehicle: { type: ["string", "null"] },
            thirdPartyRegistration: { type: ["string", "null"] },
            thirdPartyInsurer: { type: ["string", "null"] },
            policeReportNumber: { type: ["string", "null"] },
            policeStation: { type: ["string", "null"] },
            damageDescription: { type: ["string", "null"] },
            damagedAreas: { type: "array", items: { type: "string" } },
            witnessName: { type: ["string", "null"] },
            witnessPhone: { type: ["string", "null"] },
            confidence: { type: "number" },
            documentType: { type: "string" },
            extractionNotes: { type: "array", items: { type: "string" } },
          },
          required: [
            "vehicleMake", "vehicleModel", "vehicleYear", "vehicleRegistration",
            "vehicleVin", "vehicleColor", "vehicleMileage",
            "vehicleVinFromRegBook", "vehicleEngineNumber", "vehicleGvm",
            "vehicleTareWeight", "vehicleEngineCapacity", "vehicleFuelType",
            "vehicleFirstRegistrationDate", "vehicleOwnerName", "vehicleLicenceExpiryDate",
            "policyNumber","policyHolder", "insurerName", "brokerName",
            "claimantName", "claimantIdNumber", "claimantPhone", "claimantEmail", "claimantAddress",
            "incidentDate", "incidentTime", "incidentLocation", "incidentDescription", "incidentType",
            "thirdPartyName", "thirdPartyVehicle", "thirdPartyRegistration", "thirdPartyInsurer",
            "policeReportNumber", "policeStation",
            "damageDescription", "damagedAreas",
            "witnessName", "witnessPhone",
            "confidence", "documentType", "extractionNotes"
          ],
          additionalProperties: false,
        }
      }
    }
  });

  const messageContent = response.choices?.[0]?.message?.content;
  if (!messageContent) {
    throw new Error("Failed to extract data from document — no response from AI");
  }

  const extracted = JSON.parse(typeof messageContent === "string" ? messageContent : JSON.stringify(messageContent));

  return {
    ...extracted,
    rawDocumentUrl: documentUrl,
  };
}
