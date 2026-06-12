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
import { runFieldRecovery } from "./fieldRecoveryEngine";
import { invokeLLM } from "../_core/llm";
import { preprocessDocument } from "./documentPreprocessor";
import { scoreExtraction } from "./extractionQualityScorer";

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
        claimId: { type: ["string", "null"], description: "Claim reference number. Look for patterns like 'CI-024...', 'CLM-...', 'REF:', 'Claim No.', 'Claim Number', 'Reference'. This is the insurer's internal claim identifier." },
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
        accidentDate: { type: ["string", "null"], description: "Date of accident in YYYY-MM-DD format. IMPORTANT: For dates in DD/MM/YYYY format (common in Zimbabwe, South Africa, UK), convert correctly — e.g. '02/09/2024' means 2 September 2024 = '2024-09-02'. Do NOT interpret as month/day." },
        accidentLocation: { type: ["string", "null"], description: "Location where accident occurred" },
        accidentDescription: { type: ["string", "null"], description: "The claimant's first-person account of the physical circumstances of the accident ONLY. Include: what happened, how the collision occurred, road/weather conditions, who was involved, direction of travel, what was struck. STRICTLY EXCLUDE: any assessor commentary, cost opinions, repair recommendations, quote assessments, damage consistency verdicts, authorisation requests, or any sentence about the claim being valid/genuine. Do NOT include all-caps assessor verdict lines such as 'DAMAGE CONSISTENT WITH ACCIDENT DESCRIPTION' or 'THE ADJUSTED QUOTE APPEARS TO BE FAIR AND REASONABLE'." },
        incidentType: { type: ["string", "null"], description: "Type of incident. MUST be one of: animal_strike, collision, theft, vandalism, flood, fire, hail, rollover, mechanical_failure. CRITICAL: Use 'animal_strike' when the vehicle hit or was hit by ANY animal (cow, dog, buck, goat, livestock, wildlife, game). Do NOT classify animal impacts as 'collision'. 'collision' is reserved for vehicle-to-vehicle or vehicle-to-object impacts only." },
        accidentType: { type: ["string", "null"], description: "Collision direction: frontal, rear, side_driver, side_passenger, rollover, multi_impact" },
        impactPoint: { type: ["string", "null"], description: "Primary point of impact on the vehicle" },
        estimatedSpeedKmh: { type: ["number", "null"], description: "Speed at impact in km/h. SEARCH THE ENTIRE DOCUMENT for any of these patterns: (1) A form field labelled 'Speed', 'Speed at time of accident', 'What was your speed?', 'Speed of vehicle', 'Approximate speed' — the value may appear immediately after the label with no keyword prefix, e.g. 'Speed: 90KM/HRS' or just '90KM/HRS' after the label. (2) Any speed mentioned in the accident narrative or circumstances section, e.g. 'travelling at 90 KM/HRS', 'doing 60 km/h', 'speed of 80'. (3) Any speed in a police report or assessor notes. IMPORTANT: Extract the NUMERIC VALUE ONLY — strip ALL unit suffixes (KM/HRS, KM/H, KPH, MPH, km/h, kph, kmh). Examples: '90KM/HRS' → 90, '90 km/h' → 90, '120kph' → 120, '60' → 60. Return null ONLY if no speed value appears anywhere in the document." },
        policeReportNumber: { type: ["string", "null"], description: "Police report/case number. MUST be an alphanumeric code containing at least one digit — NOT a plain English word. Look for: (1) 'Case No.', 'Report No.', 'CR No.', 'RB No.', 'CID No.', 'AR No.', 'Docket No.' followed by an alphanumeric code like 'RB 123/2024', 'CR/2024/001', 'CID/123', 'AR 456'. (2) A standalone alphanumeric code on a police report page (e.g. 'P123/2024'). (3) In Zimbabwe: look for 'RB' (Recorded Book) numbers like 'RB 45/2024'. DO NOT return plain words like 'reported', 'yes', 'no', 'none', 'N/A'. Return null if no alphanumeric case number is found." },
        policeStation: { type: ["string", "null"], description: "Police station name. Look for 'Station:', 'Police Station:', 'Reported at:' anywhere in the document." },
        policeOfficerName: { type: ["string", "null"], description: "Name of the attending police or traffic officer. Look for 'Officer:', 'Constable:', 'Sgt.', 'Traffic Officer:', 'Officer Name:', or any officer/constable name on a traffic report or police report page." },
        policeChargeNumber: { type: ["string", "null"], description: "TAB number or traffic charge number issued at the scene. Look for 'TAB No.', 'TAB Number', 'Charge No.', 'Traffic Charge', 'Infringement No.', 'Ticket No.' anywhere in the document." },
        policeFineAmountCents: { type: ["integer", "null"], description: "Traffic fine amount in cents. Look for 'Fine:', 'Fine Amount:', 'Penalty:', 'Traffic Fine' on a traffic report page. Convert to cents (multiply by 100)." },
        policeReportDate: { type: ["string", "null"], description: "Date the police or traffic report was issued. Look for a date on the traffic report or police report page, separate from the accident date. Format as YYYY-MM-DD." },
        policeChargedParty: { type: ["string", "null"], description: "Who was charged or issued a traffic charge/TAB at the scene. Look for the name on the TAB number, charge sheet, or any statement like 'charged the driver of [vehicle]', 'issued to [name]', 'claimant was charged', 'third party was charged', 'other driver was charged'. If the charge number is present but no name is linked to it, return 'unknown'. Return null only if no charge was issued at all." },
        policeInvestigationStatus: { type: ["string", "null"], description: "Status of the police investigation. Look for phrases like 'under investigation', 'case docket opened', 'inquest', 'no case opened', 'matter closed', 'case withdrawn', 'docket number'. Return one of: CHARGED, UNDER_INVESTIGATION, NO_CHARGE, CASE_WITHDRAWN, UNKNOWN. Return null if no police report is present in the document." },
        policeOfficerFindings: { type: ["string", "null"], description: "The attending police or traffic officer's factual findings or observations. Look for any section of the police or traffic report that describes what the officer found at the scene: road markings, skid marks, point of impact, vehicle positions, witness statements recorded by the officer, or the officer's own account of what happened. Extract the full text of these findings verbatim. Return null if no officer findings are present." },
        thirdPartyAccountSummary: { type: ["string", "null"], description: "The third party's own account or version of events, if present in the claim documents. Look for a separate statement, a section labelled 'Third Party Statement', 'Other Driver Statement', 'TP Account', or any text that explicitly represents what the third party said happened. This is DIFFERENT from what the claimant says about the third party. Return null if no third-party statement is present." },
        assessorName: { type: ["string", "null"], description: "Name of the assessor" },
        panelBeater: { type: ["string", "null"], description: "Name of panel beater/repairer" },
        repairerCompany: { type: ["string", "null"], description: "Repair company name" },
        quoteTotalCents: { type: ["integer", "null"], description: "Total repair quote in cents. SEARCH ALL PAGES — the quotation is almost always on the LAST pages. Look for: (1) A row labelled 'Total (Incl)', 'Total (Incl. VAT)', 'Grand Total', 'Total Incl Tax', 'Invoice Total' — the amount is in the rightmost column, e.g. 'Total (Incl)  591.33'. (2) A row labelled 'Total' at the bottom of a parts/labour table. (3) Any line ending with a dollar/USD amount after a list of repair items. The panel beater name (e.g. 'Skinners') usually appears at the top of the quote page. IMPORTANT: Use the FINAL total after any discounts. Convert to cents (multiply by 100). Example: 591.33 → 59133." },
        agreedCostCents: { type: ["integer", "null"], description: "The agreed/settled/negotiated repair cost in cents. Look for: (1) Handwritten annotations like 'Agreed USD 462.33', 'Cost Agreed Less', 'Agreed amount', 'Authorised amount'. (2) A typed note from the assessor showing a reduced/negotiated total. (3) Any amount labelled 'Agreed' or 'Authorised' that is LESS than the original quote total. Convert to cents (multiply by 100). This is often LESS than quoteTotalCents." },
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
        thirdPartyVehicle: { type: ["string", "null"], description: "Third party vehicle description (make, model, colour)." },
        thirdPartyRegistration: { type: ["string", "null"], description: "Third party vehicle registration number." },
        thirdPartyName: { type: ["string", "null"], description: "Name of the third-party driver or owner. Look for 'Third Party Name:', 'Other Driver:', 'Other Party:', 'TP Name:' in the claim form or police report." },
        thirdPartyIdNumber: { type: ["string", "null"], description: "Third party's national ID number or passport number. Police reports in Zimbabwe and South Africa typically contain the ID numbers of all parties involved. Look for 'Third Party ID:', 'TP ID No.', 'ID Number:', 'National ID:', 'Passport No:' next to the third party's name." },
        thirdPartyAddress: { type: ["string", "null"], description: "Third party's residential or postal address. Police reports contain the addresses of all parties. Look for 'Third Party Address:', 'TP Address:', 'Other Driver Address:', 'Address:' next to the third party's name in the police report or claim form." },
        thirdPartyPhone: { type: ["string", "null"], description: "Third party's phone or mobile number. Police reports often contain contact numbers for all parties. Look for 'Third Party Tel:', 'TP Phone:', 'Other Party Contact:', 'Cell:', 'Mobile:', 'Tel:' next to the third party's name." },
        thirdPartyInsurerName: { type: ["string", "null"], description: "Third party's insurance company name. Look for 'Third Party Insurer:', 'Other Party Insurance:', 'TP Insurer:'." },
        thirdPartyInsurerAddress: { type: ["string", "null"], description: "Address of the third party's insurance company. This is the address to which subrogation demand letters should be sent. Look for the insurer's registered office address in the claim form, policy schedule, or police report." },
        thirdPartyInsurerPhone: { type: ["string", "null"], description: "Phone number of the third party's insurance company. Look for the insurer's contact number in the claim form or police report." },
        thirdPartyPolicyNumber: { type: ["string", "null"], description: "Third party's insurance policy number. Look for 'Third Party Policy No.', 'TP Policy:', 'Other Party Policy Number:'." },
        // Insurance / Policy
        insurerName: { type: ["string", "null"], description: "Insurance company name (e.g. 'Cell Insurance Company', 'Old Mutual', 'Zimnat'). Look for 'Insurer:', 'Insurance Company:', 'Underwriter:', or the company name at the top of the claim form." },
        policyNumber: { type: ["string", "null"], description: "Insurance policy number. Look for 'Policy No.', 'Policy Number', 'Policy #'. IMPORTANT: If the value in the policy number field looks like a product type or coverage type (e.g. 'EXCESS', 'COMPREHENSIVE', 'THIRD PARTY', 'FIRE AND THEFT', 'MOTOR') rather than an alphanumeric policy number, set this to null and set productType instead. A valid policy number typically contains letters and numbers (e.g. 'POL-2024-001', 'CI-024NATPHARM', 'ZIM/2024/001')." },
        productType: { type: ["string", "null"], description: "Insurance product or coverage type. Set this when the policy number field contains a coverage type rather than a policy number (e.g. 'EXCESS', 'COMPREHENSIVE', 'THIRD PARTY', 'MOTOR COMPREHENSIVE'). Leave null if a real policy number was found." },
        claimReference: { type: ["string", "null"], description: "Insurer's claim reference number (e.g. 'CI-024NATPHARM', 'CLM-2024-001'). Look for 'Claim Ref', 'Claim Reference', 'Claim No.', 'Reference No.'." },
        // Incident context
        incidentTime: { type: ["string", "null"], description: "Time of accident in HH:MM format. Look for 'Time:', 'Time of accident:', 'Time of incident:'. Convert to 24-hour HH:MM format." },
        animalType: { type: ["string", "null"], description: "Type of animal involved if this is an animal strike (e.g. 'cow', 'kudu', 'donkey', 'goat'). Extract from accident description or any field mentioning the animal." },
        weatherConditions: { type: ["string", "null"], description: "Weather conditions at time of accident. Look for 'Weather:', 'Weather conditions:', 'Conditions:', 'Weather at time of accident:'. Common values: clear, cloudy, rain, fog, night." },
        visibilityConditions: { type: ["string", "null"], description: "Visibility at time of accident. Look for a field labelled 'Visibility:', 'Visibility at time of accident:'. Common values: DARK, DUSK, DAWN, DAYLIGHT, NIGHT. This is SEPARATE from weather — a night with clear weather has DARK visibility. Extract the exact value from the form." },
        roadSurface: { type: ["string", "null"], description: "Road surface conditions. Look for 'Road surface:', 'Road conditions:', 'Surface:'. Common values: dry, wet, gravel, tarred, dirt." },
        // Financial extras
        marketValueCents: { type: ["integer", "null"], description: "Vehicle market/retail value in cents. Look for 'Market Value', 'Retail Value', 'Vehicle Value', 'Sum Insured'. Convert to cents (multiply by 100). Example: 20000 → 2000000." },
        excessAmountCents: { type: ["integer", "null"], description: "Insurance excess/deductible amount in cents. This is the amount the INSURED must pay out of pocket before the insurer pays. Look for a field explicitly labelled 'Excess', 'Deductible', 'Excess Amount', 'Policy Excess'. CRITICAL: Do NOT confuse this with the repair quote total, agreed repair cost, or any amount from the repair quotation. If the only dollar amount you can find is the repair cost, set this to null. A typical excess is a small fixed amount (e.g. $50, $100, $200, $500) — if the value matches the repair cost exactly, it is NOT the excess." },
        bettermentCents: { type: ["integer", "null"], description: "Betterment/depreciation amount in cents. Look for 'Betterment', 'Depreciation', 'Age Deduction'. Convert to cents." },
        // Driver
        driverLicenseNumber: { type: ["string", "null"], description: "Driver's license number. Look for 'Licence No.', 'License Number', 'DL No.', 'Driver Licence'." },
        // Cross-border fields
        repairCountry: { type: ["string", "null"], description: "Country where the vehicle is being repaired. Look for the panel beater or repairer address. If the address contains 'South Africa', 'SA', 'RSA', 'Johannesburg', 'Cape Town', 'Durban', 'Pretoria', 'Sandton', 'Randburg', 'Boksburg', 'Germiston', 'Roodepoort', 'Centurion', 'Midrand', 'Kempton Park', 'Springs', 'Benoni', 'Alberton', 'Edenvale', 'Bedfordview', 'Fourways', 'Soweto', 'Tembisa', 'Katlehong', 'Thokoza', 'Vosloorus', 'Daveyton', 'Brakpan', 'Nigel', 'Heidelberg', 'Vereeniging', 'Vanderbijlpark', 'Sasolburg', 'Klerksdorp', 'Potchefstroom', 'Rustenburg', 'Polokwane', 'Nelspruit', 'Witbank', 'Middelburg', 'Secunda', 'Ermelo', 'Standerton', 'Bethal', 'Kriel', 'Hendrina', 'Delmas', 'Bronkhorstspruit', 'Cullinan', 'Bela-Bela', 'Modimolle', 'Mokopane', 'Lephalale', 'Thabazimbi', 'Northam', 'Brits', 'Hartbeespoort', 'Atteridgeville', 'Soshanguve', 'Mabopane', 'Ga-Rankuwa', 'Temba', 'Hammanskraal', 'Bapsfontein', 'Tarlton', 'Krugersdorp', 'Randfontein', 'Westonaria', 'Carletonville', 'Fochville', 'Stilfontein', 'Orkney', 'Wolmaransstad', 'Schweizer-Reneke', 'Vryburg', 'Taung', 'Lichtenburg', 'Delareyville', 'Sannieshof', 'Groot Marico', 'Zeerust', 'Mafikeng', 'Mmabatho', 'Lomanyaneng', 'Mahikeng', 'Ratlou', 'Tswaing', 'Ditsobotla', 'Ramotshere Moiloa', 'Ngaka Modiri Molema', 'Dr Ruth Segomotsi Mompati', 'Bojanala', 'Dr Kenneth Kaunda', 'JHB', 'GP', 'WC', 'EC', 'KZN', 'LP', 'MP', 'NC', 'NW', 'FS' etc., set to 'ZA'. If in Zimbabwe, set to 'ZW'. Use ISO 3166-1 alpha-2 codes. Return null if not determinable." },
        quoteCurrency: { type: ["string", "null"], description: "Currency used in the repair quotation. Look for currency symbols or codes in the repair quote: 'R ' prefix or 'ZAR' → 'ZAR'; 'USD', '$', 'US$', 'USD ' prefix → 'USD'; 'ZWL', 'ZWD', 'RTGS', 'ZiG' → 'ZWL'. If the quote amounts are preceded by 'R' (e.g. 'R 591.33', 'R591.33') set to 'ZAR'. Return null if not determinable." },
        policyExclusions: { type: ["string", "null"], description: "Any policy exclusions, limitations, or items explicitly NOT covered mentioned anywhere in the document. Look for: 'not covered', 'excluded', 'exclusion', 'specifically mentioned in the policy wording', 'policy does not cover', 'not included in cover', 'excluded from policy'. Extract the FULL text of the exclusion statement verbatim. Multiple exclusions should be separated by ' | '. Example: 'Suspension is not covered since it is specifically mentioned in the policy wording | Tyres excluded'. Return null if no exclusions mentioned." },
        assessorInspectionDate: { type: ["string", "null"], description: "Date the assessor inspected the vehicle, in YYYY-MM-DD format. Look for 'Date Inspected:', 'Inspection Date:', 'Date of Inspection:', 'Assessed on:', 'Date of Assessment:'. This is the date the loss adjuster or assessor physically viewed the vehicle — NOT the accident date and NOT the report date. For DD/MM/YYYY format, convert correctly (e.g. '03/06/2025' = 3 June 2025 = '2025-06-03')." },
      },
      required: [
        "claimId", "claimantName", "driverName",
        "vehicleRegistration", "vehicleMake", "vehicleModel", "vehicleYear",
        "vehicleVin", "vehicleColour", "vehicleEngineNumber", "vehicleMileage",
        "accidentDate", "accidentLocation", "accidentDescription",
        "incidentType", "accidentType", "impactPoint", "estimatedSpeedKmh",
        "policeReportNumber", "policeStation",
        "assessorName", "panelBeater", "repairerCompany",
        "quoteTotalCents", "agreedCostCents", "labourCostCents", "partsCostCents",
        "damageDescription", "damagedComponents",
        "structuralDamage", "airbagDeployment", "maxCrushDepthM", "totalDamageAreaM2",
        "thirdPartyVehicle", "thirdPartyRegistration",
        "thirdPartyName", "thirdPartyIdNumber", "thirdPartyAddress", "thirdPartyPhone",
        "thirdPartyInsurerName", "thirdPartyInsurerAddress", "thirdPartyInsurerPhone", "thirdPartyPolicyNumber",
        "policeOfficerName", "policeChargeNumber", "policeFineAmountCents", "policeReportDate",
        "policeChargedParty", "policeInvestigationStatus", "policeOfficerFindings", "thirdPartyAccountSummary",
        "insurerName", "policyNumber", "claimReference",
        "incidentTime", "animalType", "weatherConditions", "visibilityConditions", "roadSurface",
        "marketValueCents", "excessAmountCents", "bettermentCents",
        "driverLicenseNumber",
        "repairCountry",
        "quoteCurrency",
        "policyExclusions",
        "assessorInspectionDate",
      ],
      additionalProperties: false,
    },
  },
};

async function extractFieldsFromPdf(
  pdfUrl: string,
  rawText: string,
  ctx: PipelineContext,
  pageImageUrls: string[] = []
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
            text: `TASK: Extract ALL fields from the schema from the attached PDF document.

IMPORTANT: Read the ENTIRE document — do not stop at any particular page. Key fields such as the police report number, repair quotation totals, and component lists often appear on later pages.

CRITICAL POLICE REPORT EXTRACTION RULES:
- policeReportNumber: Look for any of these patterns throughout the ENTIRE document:
  * "Police Report No.", "Report Number", "Case No.", "RB No.", "Ref:", "CR No."
  * Alphanumeric codes like "RB 123/2024", "CR/2024/001", "CID/123"
  * Numbers adjacent to "police", "station", "report" anywhere in the document
- policeStation: Extract the name of the police station if mentioned anywhere.
- policeOfficerName: Look for the name of the attending officer on any traffic report or police report page. Often appears as 'Officer: [Name]', 'Constable [Name]', 'Sgt [Name]', or just a name next to a badge/rank designation.
- policeChargeNumber: Look for 'TAB No.', 'TAB Number', 'Charge No.', 'Traffic Charge No.', 'Infringement No.' on any traffic report page.
- policeFineAmountCents: Look for 'Fine:', 'Fine Amount:', 'Penalty:' on a traffic report page. Convert to cents.
- policeReportDate: The date the police/traffic report was issued — often different from the accident date. Look on the traffic report page for a date stamp or 'Date:' field.

CRITICAL SPEED EXTRACTION RULES:
- estimatedSpeedKmh: Extract the numeric value ONLY. Strip any unit suffix (KM/HRS, KM/H, KPH, MPH, km/h, kph).
  Example: '90KM/HRS' → 90, '90 km/h' → 90, '120kph' → 120.
  Look for a field labelled 'Speed', 'What was your speed?', 'Speed at time of accident', or similar near the accident circumstances section.
  Also check the accident narrative for phrases like 'travelling at 90 KM/HRS', 'doing 60 km/h', 'speed of 80'.
  IMPORTANT: This field is often HANDWRITTEN on the form. Look carefully at handwritten text next to speed labels.
  If you see a handwritten number like '90' near a speed field, extract it.

CRITICAL HANDWRITTEN FIELD EXTRACTION RULES:
- Many claim forms have handwritten entries. Pay special attention to:
  * Weather conditions: often handwritten next to 'Weather:', 'Weather conditions:' labels. Common values: CLEAR, CLOUDY, RAIN, FOG, NIGHT.
  * Visibility: often handwritten next to 'Visibility:' label. Common values: DARK, DUSK, DAWN, DAYLIGHT, GOOD, POOR.
  * Road surface: often handwritten next to 'Road surface:', 'Road conditions:' labels. Common values: DRY, WET, GRAVEL, TARRED, DIRT.
  * Speed: often handwritten next to 'Speed:' label. Extract numeric value only.
  * Location: often handwritten. Preserve the full location text as written.
- For handwritten text: read carefully, consider context, and extract the most likely value.
- Do NOT return null for these fields if there is ANY handwritten text near the corresponding label.

CRITICAL COST EXTRACTION RULES:
- quoteTotalCents: The repair quotation is typically on the LAST pages of the document — read ALL pages. Use the FINAL 'Total (Incl)' or 'Grand Total' figure (in cents).
- agreedCostCents: Look for handwritten or typed annotations like 'Agreed USD X.XX', 'Cost Agreed Less', 'Agreed amount', 'Authorised amount', 'Settled at', or assessor-negotiated totals. This is often LESS than the original quote total. Convert to cents.
- labourCostCents / partsCostCents: extract from any itemised breakdown, repair schedule, or quotation table.
- Convert all monetary values to cents (multiply USD/ZWL figure by 100).
- Look for repair quotes, parts schedules, and labour breakdowns on ALL pages.

CRITICAL COMPONENT EXTRACTION RULES:
- damagedComponents: Extract ONLY physically damaged vehicle components — parts that are dented, cracked, broken, or otherwise damaged.
  SOURCE: Use damage photographs, assessor inspection reports, damage descriptions, or the assessor's damage schedule.
  DO NOT include repair quote line items (labour charges, paint, trim, fitting fees, sundries) as damaged components.
  DO NOT treat the repair quotation as the source for damagedComponents — the quote is for COST extraction only.
  INCLUDE: Physical vehicle parts with damage (e.g. 'Front Bumper', 'LH Headlamp', 'Bonnet', 'Windscreen', 'LH Wing').
  EXCLUDE: Labour lines, paint lines, fitting charges, sundry items, sub-totals, totals, or any non-physical-part line.
  If the ONLY document is a repair quote (no damage photos, no assessor report), extract component names from the quote's itemised parts list ONLY — not labour or paint lines.
- Do NOT stop extracting components after the first few — capture all of them.

CRITICAL IMAGE DETECTION RULES:
- If the document contains embedded photographs, damage images, or references to attached photos, note this in damageDescription.

CRITICAL DESCRIPTION RULES:
- accidentDescription: This field MUST contain ONLY the claimant's first-person account of the physical circumstances of the accident.
  DEFINITION: The incident narrative is the claimant's description of WHAT HAPPENED — the sequence of events leading to and including the collision or incident.
  INCLUDE ONLY:
    * Where the accident happened (road, location, intersection)
    * When it happened (time, date, conditions)
    * How the collision occurred (direction of travel, what was struck, angle of impact)
    * Who was involved (other vehicles, pedestrians, animals)
    * Road/weather/visibility conditions at the time
    * Speed if the claimant stated it
    * Any evasive action taken by the claimant
  STRICTLY EXCLUDE — these are assessor commentary, NOT incident narrative:
    * Any sentence about whether the quote is fair, reasonable, or market-related
    * Any sentence about repair costs, labour rates, parts prices, or cost adjustments
    * Any sentence recommending approval, authorisation, or settlement
    * Any sentence stating damage is 'consistent with the accident description'
    * Any sentence about the vehicle being repairable or a write-off
    * Any sentence about the claim being valid, genuine, or legitimate
    * Any sentence about parts being sourced, verified, or available locally
    * Any sentence about images or photos being attached or included
    * Any sentence identifying the assessor, surveyor, or loss adjuster
    * Any sentence about the repair process, stripping, inspection findings, or omitted damages
    * All-caps verdict lines such as: 'DAMAGE CONSISTENT WITH ACCIDENT DESCRIPTION', 'THE ADJUSTED QUOTE APPEARS TO BE FAIR AND REASONABLE', 'KINDLY AUTHORISE REPAIRS', 'RECOMMEND APPROVAL'
  IMPORTANT: In ZW/SA assessor reports, the assessor often appends their conclusions directly after the claimant's narrative in the same text block. You MUST separate these — extract ONLY the claimant's account and discard the assessor's appended conclusions.
  Example of what to INCLUDE: "I was travelling along Borrowdale Road when a vehicle pulled out from a side street and collided with the right front of my vehicle."
  Example of what to EXCLUDE: "The vehicle was stripped in order to identify omitted damages", "After final inspection we noted that...", "The repairer omitted seatbelts", "DAMAGE CONSISTENT WITH ACCIDENT DESCRIPTION.", "THE ADJUSTED QUOTE APPEARS TO BE FAIR AND REASONABLE.", "Kindly authorise repairs to the above vehicle.", "Costs agreed are within prevailing market rates.", "Circumstances of loss are genuine.", "Claim is valid."
- damageDescription: extract the complete list of damaged parts and repair actions.
- For damagedComponents damageType: use ONLY standard automotive damage terms (dent, scratch, crack, shatter, bend, tear, puncture, corrosion, deformation, misalignment, breakage). NEVER invent terms.
- For damagedComponents name: PRESERVE the EXACT component name as written in the document. Do NOT normalise South African automotive terminology to US English.
  Examples: Keep 'bonnet' (not 'hood'), 'boot' (not 'trunk'), 'wing' (not 'fender'), 'windscreen' (not 'windshield'), 'number plate' (not 'license plate'), 'indicator' (not 'turn signal'), 'diff connector' (not 'differential connector').
  Use the exact spelling and terminology from the claim form or quotation.

Additional OCR text for reference (may be partial):
${rawText.substring(0, 8000)}

Return JSON only.`,
          },
          {
            type: "file_url" as const,
            file_url: {
              url: pdfUrl,
              mime_type: "application/pdf" as const,
            },
          },
          // WI-2: Include rendered page images for vision analysis
          // Pass up to 10 page images so the LLM can see embedded photographs
          // (damage photos, assessor signatures, handwritten annotations)
          ...pageImageUrls.slice(0, 10).map(imgUrl => ({
            type: "image_url" as const,
            image_url: { url: imgUrl, detail: "high" as const },
          })),
        ],
      },
    ],
    response_format: EXTRACTION_SCHEMA,
    timeoutMs: 90_000, // 90s per attempt — large PDF + up to 10 page images; stage budget is 180s
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
    timeoutMs: 90_000, // 90s per attempt — photos-only extraction path
  });

  const content = response.choices?.[0]?.message?.content || "{}";
  const parsed = JSON.parse(content);
  return mapToExtractedFields(parsed, -1);
}

// ============================================================================
// POST-EXTRACTION SANITISATION
// ============================================================================

/** Strip inspection/stripping/repair-process sentences from accident description */
function sanitiseAccidentDescription(desc: string | null): string | null {
  if (!desc) return null;
  // Patterns that indicate inspection/repair process, NOT the accident itself
  const INSPECTION_PATTERNS = [
    /the vehicle was stripped[^.]*\./gi,
    /we inspected it[^.]*\./gi,
    /after final inspection[^.]*\./gi,
    /we noted that[^.]*\./gi,
    /the repairer omitted[^.]*\./gi,
    /omitted initially[^.]*\./gi,
    /hence all costs[^.]*\./gi,
    /hence the repairer[^.]*\./gi,
    /extras quotation[^.]*\./gi,
    /additional pictures[^.]*\./gi,
    /after the vehicles? repairs? were completed[^.]*\./gi,
    /submitted extras[^.]*\./gi,
    /in order to identify omitted damages[^.]*\./gi,
    /by verifying all stated damages[^.]*\./gi,
    /reprogramming are included[^.]*\./gi,
    /seatbelt[s]? (?:and|were|was)[^.]*\./gi,
    /for seatbelt[^.]*\./gi,
  ];
  let cleaned = desc;
  for (const pat of INSPECTION_PATTERNS) {
    cleaned = cleaned.replace(pat, "");
  }
  // Clean up whitespace
  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
  // If we stripped everything, return the original (better than nothing)
  return cleaned.length > 10 ? cleaned : desc;
}

// ============================================================================
// UNIVERSAL GARBLED-TEXT GUARD
// Detects and nullifies any string field that contains garbled/unintelligible
// content regardless of which field it appears in. Garbled text is defined as:
//   1. High density of non-Latin scripts (Cyrillic, Arabic, CJK, etc.)
//   2. High ratio of non-printable / replacement characters (OCR garbage)
//   3. Incoherent character sequences (no recognisable word boundaries)
// The guard returns null for fully garbled values and strips garbled segments
// from partially garbled strings, preserving any clean portion.
// ============================================================================

/** Regex matching non-Latin Unicode blocks that indicate garbled OCR output */
const NON_LATIN_BLOCK_RE = /[\u0400-\u04FF\u0500-\u052F\u0370-\u03FF\u0600-\u06FF\u0750-\u077F\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F\u0E00-\u0E7F\u0E80-\u0EFF]/g;

/** Regex matching OCR garbage: replacement chars, control chars, excessive symbols */
const OCR_GARBAGE_RE = /[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

/**
 * Detect whether a string is predominantly garbled.
 * Returns true if the text should be treated as unreadable.
 */
function isGarbledText(text: string): boolean {
  if (!text || text.length < 4) return false;
  const len = text.length;
  // Count non-Latin script characters
  const nonLatinMatches = text.match(NON_LATIN_BLOCK_RE) ?? [];
  const nonLatinRatio = nonLatinMatches.length / len;
  // Count OCR garbage characters
  const garbageMatches = text.match(OCR_GARBAGE_RE) ?? [];
  const garbageRatio = garbageMatches.length / len;
  // Flag as garbled if >15% of characters are non-Latin script
  if (nonLatinRatio > 0.15) return true;
  // Flag as garbled if >10% of characters are OCR garbage
  if (garbageRatio > 0.10) return true;
  // Flag as garbled if the string has no spaces and >20 chars (no word boundaries)
  if (!text.includes(' ') && len > 20 && /[^a-zA-Z0-9\-\/\.]/.test(text)) return true;
  return false;
}

/**
 * Sanitise a string field:
 * - If the entire value is garbled → return null
 * - If only some sentences are garbled → strip those sentences, return clean remainder
 * - Otherwise → return the original value unchanged
 */
function sanitiseTextField(value: string | null | undefined): string | null {
  if (!value) return value ?? null;
  // Fast path: no non-Latin characters at all — skip expensive processing
  if (!NON_LATIN_BLOCK_RE.test(value) && !OCR_GARBAGE_RE.test(value)) {
    // Reset lastIndex after test()
    NON_LATIN_BLOCK_RE.lastIndex = 0;
    OCR_GARBAGE_RE.lastIndex = 0;
    return value;
  }
  NON_LATIN_BLOCK_RE.lastIndex = 0;
  OCR_GARBAGE_RE.lastIndex = 0;
  // If the whole string is garbled, return null
  if (isGarbledText(value)) return null;
  // Otherwise try sentence-level filtering: split on sentence boundaries,
  // keep only clean sentences, rejoin.
  const sentences = value.split(/(?<=[.!?])\s+/);
  const cleanSentences = sentences.filter(s => !isGarbledText(s));
  if (cleanSentences.length === 0) return null;
  const rejoined = cleanSentences.join(' ').trim();
  return rejoined.length >= 4 ? rejoined : null;
}

/** Replace hallucinated/non-domain damage type terms with standard automotive terms */
function sanitiseDamageType(damageType: string): string {
  const INVALID_TERMS: Record<string, string> = {
    reconchika: "repair component",
    reconchica: "repair component",
    recondika: "repair component",
    recondition: "replacement",
  };
  const lower = damageType.toLowerCase().trim();
  if (INVALID_TERMS[lower]) return INVALID_TERMS[lower];
  // Check partial match
  for (const [term, replacement] of Object.entries(INVALID_TERMS)) {
    if (lower.includes(term)) return replacement;
  }
  return damageType;
}

function mapToExtractedFields(raw: any, sourceDocumentIndex: number): ExtractedClaimFields {
  return {
    claimId: raw.claimId || null,
    claimantName: raw.claimantName || null,
    // Strip OCR artefacts from driver name (trailing slash, comma, period from signature line)
    driverName: raw.driverName ? String(raw.driverName).replace(/[\/,\.\s]+$/, "").trim() || null : null,
    vehicleRegistration: raw.vehicleRegistration || null,
    vehicleMake: raw.vehicleMake || null,
    vehicleModel: raw.vehicleModel || null,
    vehicleYear: raw.vehicleYear || null,
    vehicleVin: raw.vehicleVin || null,
    vehicleColour: raw.vehicleColour || null,
    vehicleEngineNumber: raw.vehicleEngineNumber || null,
    vehicleMileage: raw.vehicleMileage || null,
    accidentDate: raw.accidentDate || null,
    accidentLocation: sanitiseTextField(raw.accidentLocation || null),
    accidentDescription: sanitiseTextField(sanitiseAccidentDescription(raw.accidentDescription || null)),
    incidentType: raw.incidentType || null,
    accidentType: raw.accidentType || null,
    impactPoint: sanitiseTextField(raw.impactPoint || null),
    estimatedSpeedKmh: raw.estimatedSpeedKmh || null,
    policeReportNumber: (() => {
      const v = raw.policeReportNumber ? String(raw.policeReportNumber).trim() : null;
      if (!v) return null;
      // Reject values that are common English words, not actual case/report numbers.
      // A valid police report number MUST contain at least one digit.
      if (!/\d/.test(v)) return null;
      // Reject bare 1-3 digit numbers (e.g. "3", "12") — these are page numbers or
      // confidence scores extracted by mistake. A real ZW/SA police case number is at
      // least 4 characters long (e.g. "RB 45", "CR/2024", "P123", "AR 456").
      if (/^\d{1,3}$/.test(v)) return null;
      // Reject single-word values that look like dictionary words (no digits)
      const INVALID_WORDS = /^(reported|yes|no|none|na|n\/a|not|unknown|nil|provided|available|present|incident|case|report|police|station|officer|number|ref|reference|accident|claim|form|document|submitted|attached|enclosed|included|see|above|below|page|section|details|information|data|record|file|docket|charge|tab|traffic|fine|penalty|infringement|ticket|issued|given|assigned|registered|lodged|opened|closed|withdrawn|completed|processed|pending|under|investigation|charged|uncharged)$/i;
      if (INVALID_WORDS.test(v)) return null;
      return v;
    })(),
    policeStation: sanitiseTextField(raw.policeStation || null),
    policeOfficerName: sanitiseTextField(raw.policeOfficerName || null),
    policeChargeNumber: raw.policeChargeNumber || null,
    policeFineAmountCents: raw.policeFineAmountCents ?? null,
    policeReportDate: raw.policeReportDate || null,
    policeChargedParty: sanitiseTextField(raw.policeChargedParty || null),
    policeInvestigationStatus: raw.policeInvestigationStatus || null,
    policeOfficerFindings: sanitiseTextField(raw.policeOfficerFindings || null),
    thirdPartyAccountSummary: sanitiseTextField(raw.thirdPartyAccountSummary || null),
    assessorName: sanitiseTextField(raw.assessorName || null),
    panelBeater: sanitiseTextField(raw.panelBeater || null),
    repairerCompany: sanitiseTextField(raw.repairerCompany || null),
    quoteTotalCents: raw.quoteTotalCents || raw.agreedCostCents || null,
    agreedCostCents: raw.agreedCostCents || null,
    labourCostCents: raw.labourCostCents || null,
    partsCostCents: raw.partsCostCents || null,
    damageDescription: sanitiseTextField(raw.damageDescription || null),
    damagedComponents: (raw.damagedComponents || []).map((c: any) => ({
      name: c.name || "",
      location: c.location || "",
      damageType: sanitiseDamageType(c.damageType || ""),
      severity: c.severity || "moderate",
      repairAction: c.repairAction || "repair",
    })),
    structuralDamage: raw.structuralDamage ?? null,
    airbagDeployment: raw.airbagDeployment ?? null,
    maxCrushDepthM: raw.maxCrushDepthM ?? null,
    totalDamageAreaM2: raw.totalDamageAreaM2 ?? null,
    thirdPartyVehicle: sanitiseTextField(raw.thirdPartyVehicle || null),
    thirdPartyRegistration: raw.thirdPartyRegistration || null,
    thirdPartyName: sanitiseTextField(raw.thirdPartyName || null),
    thirdPartyIdNumber: raw.thirdPartyIdNumber || null,
    thirdPartyAddress: sanitiseTextField(raw.thirdPartyAddress || null),
    thirdPartyPhone: raw.thirdPartyPhone || null,
    thirdPartyInsurerName: sanitiseTextField(raw.thirdPartyInsurerName || null),
    thirdPartyInsurerAddress: sanitiseTextField(raw.thirdPartyInsurerAddress || null),
    thirdPartyInsurerPhone: raw.thirdPartyInsurerPhone || null,
    thirdPartyPolicyNumber: raw.thirdPartyPolicyNumber || null,
    // Insurance / Policy
    insurerName: raw.insurerName || null,
    policyNumber: raw.policyNumber || null,
    productType: raw.productType || null,
    claimReference: raw.claimReference || null,
    // Incident context
    incidentTime: raw.incidentTime || null,
    animalType: raw.animalType || null,
    weatherConditions: sanitiseTextField(raw.weatherConditions || null),
    visibilityConditions: sanitiseTextField(raw.visibilityConditions || null),
    roadSurface: sanitiseTextField(raw.roadSurface || null),
    // Financial extras
    marketValueCents: raw.marketValueCents ?? null,
    excessAmountCents: raw.excessAmountCents ?? null,
    bettermentCents: raw.bettermentCents ?? null,
    // Driver
    driverLicenseNumber: raw.driverLicenseNumber || null,
    // Cross-border
    repairCountry: raw.repairCountry || null,
    quoteCurrency: raw.quoteCurrency || null,
    // Policy & assessor
    policyExclusions: raw.policyExclusions || null,
    assessorInspectionDate: raw.assessorInspectionDate || null,
    uploadedImageUrls: [],
    sourceDocumentIndex,
  };
}

/** Create an empty extraction with all fields null */
function emptyExtraction(): ExtractedClaimFields {
  return mapToExtractedFields({}, -1);
}

/** Merge multiple per-document extractions into a single best-of record */
function mergeExtractions(extractions: ExtractedClaimFields[]): ExtractedClaimFields {
  if (extractions.length === 0) return emptyExtraction();
  if (extractions.length === 1) return { ...extractions[0] };
  const merged: ExtractedClaimFields = { ...extractions[0] };
  for (let i = 1; i < extractions.length; i++) {
    const ext = extractions[i];
    for (const key of Object.keys(ext) as Array<keyof ExtractedClaimFields>) {
      if (key === "damagedComponents" || key === "uploadedImageUrls" || key === "sourceDocumentIndex") continue;
      const currentVal = merged[key];
      const newVal = ext[key];
      if ((currentVal === null || currentVal === undefined) && newVal !== null && newVal !== undefined) {
        (merged as any)[key] = newVal;
      }
    }
  }
  // Merge components deduped
  const seen = new Set<string>();
  const allComponents: any[] = [];
  for (const ext of extractions) {
    for (const comp of ext.damagedComponents) {
      const k = `${(comp.name || "").toLowerCase()}|${(comp.location || "").toLowerCase()}`;
      if (!seen.has(k)) { seen.add(k); allComponents.push(comp); }
    }
  }
  merged.damagedComponents = allComponents;
  const allImages = new Set<string>();
  for (const ext of extractions) for (const url of ext.uploadedImageUrls) allImages.add(url);
  merged.uploadedImageUrls = Array.from(allImages);
  return merged;
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
async function runInputRecovery(
  stage1: Stage1Output,
  stage2: Stage2Output,
  perDocumentExtractions: ExtractedClaimFields[],
  tenantCountry?: string | null
): Promise<InputRecoveryOutput> {
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

  // STEP 2 — Quote recovery (regex fallback)
  const hasQuote = perDocumentExtractions.some(e => e.quoteTotalCents && e.quoteTotalCents > 0);
  const recovered_quote = recoverQuoteFromText(allText);

  // STEP 2b — LLM-based structured quote extraction
  // Runs when the regex fallback found a quote OR when there is sufficient text to attempt extraction.
  // The LLM engine handles multi-quote documents, component lists, and labour/parts disaggregation.
  let extracted_quotes: import('./quoteExtractionEngine').ExtractedQuote[] | undefined;
  try {
    const { extractMultipleQuotes, extractMultipleQuotesFromPageImages, extractQuoteFromPdfVision } = await import('./quoteExtractionEngine');
    // Collect PDF documents once — used both in the text-based path and the
    // OCR-failure vision-direct path below.
    const allPdfDocs = (stage1.documents ?? []).filter(d => d.mimeType === 'application/pdf');

    // Collect page images — used unconditionally for the primary vision path.
    // CRITICAL: This check must come BEFORE the allText length gate.
    // allText may be very short (< 50 chars) precisely when the PDF is scanned
    // and OCR failed — which is exactly when vision is most needed.
    const pdfPageImages = (stage1.documents ?? [])
      .filter(d => d.mimeType === 'application/pdf')
      .flatMap(d => d.imageUrls ?? []);

    // Get the primary PDF URL for PDF-native extraction (Cloud Run fallback)
    const primaryPdfUrl = allPdfDocs[0]?.sourceUrl ?? null;

    if (pdfPageImages.length > 0 || allText.trim().length > 50 || primaryPdfUrl) {
      // ── PRIMARY PATH: Per-page vision extraction ──────────────────────────────────────────────────────────────────────────────────────
      // pdfPageImages is collected above (before the allText length gate) so this path
      // runs even when allText is very short (e.g. scanned PDFs with < 50 chars of OCR).
      if (pdfPageImages.length > 0) {
        console.log(`[Stage3] Using per-page vision extraction on ${pdfPageImages.length} page image(s) (allText=${allText.length} chars)`);
        extracted_quotes = await extractMultipleQuotesFromPageImages(pdfPageImages, allText, tenantCountry, primaryPdfUrl);
      } else if (primaryPdfUrl) {
        // No page images (pdftoppm unavailable in Cloud Run) — use PDF-native extraction
        console.log(`[Stage3] No page images — using PDF-native extraction via file_url (allText=${allText.length} chars)`);
        const { extractMultipleQuotesFromPdfUrl } = await import('./quoteExtractionEngine');
        extracted_quotes = await extractMultipleQuotesFromPdfUrl(primaryPdfUrl, allText, tenantCountry);
      } else {
        // No page images and no PDF URL — fall back to text-based extraction
        console.log(`[Stage3] No page images and no PDF URL — using text-based extraction (allText=${allText.length} chars)`);
        extracted_quotes = await extractMultipleQuotes(allText, 'insurance claim document', tenantCountry);
      }

      // VISION FALLBACK: If any quote has a non-zero total but all line items are $0,
      // the OCR missed the price column. Re-extract using the PDF directly via vision.
      // We try ALL PDF documents on the claim — a claim form may contain multiple
      // separate quote documents, and the quote with missing prices may be in a
      // different document than the first one.
      if (allPdfDocs.length > 0 && extracted_quotes) {
        const repaired: typeof extracted_quotes = [];
        for (const q of extracted_quotes) {
          const hasTotal = q.total_cost !== null && q.total_cost > 0;
          const allZeroPrices = q.line_items.length > 0 && q.line_items.every(li => (li.line_total ?? 0) === 0 && (li.unit_cost ?? 0) === 0);
          const noLineItems = q.line_items.length === 0 && hasTotal;
          if (hasTotal && (allZeroPrices || noLineItems)) {
            console.log(`[Stage3] Vision fallback triggered for quote from "${q.panel_beater}" (total=${q.total_cost}, line_items=${q.line_items.length}, all_zero=${allZeroPrices}). Will try ${allPdfDocs.length} PDF document(s).`);
            let visionSucceeded = false;
            // Try each PDF document in order until we get priced line items
            for (const pdfDoc of allPdfDocs) {
              try {
                console.log(`[Stage3] Trying vision extraction on: ${pdfDoc.fileName}`);
                const visionResult = await extractQuoteFromPdfVision(pdfDoc.sourceUrl, q.panel_beater, q.total_cost, tenantCountry);
                const visionHasPrices = visionResult.line_items.some(li => (li.line_total ?? 0) > 0 || (li.unit_cost ?? 0) > 0);
                if (visionHasPrices) {
                  console.log(`[Stage3] Vision extraction succeeded on ${pdfDoc.fileName}: ${visionResult.line_items.length} priced line items extracted`);
                  repaired.push(visionResult);
                  visionSucceeded = true;
                  break; // Found prices — no need to try remaining documents
                } else {
                  console.log(`[Stage3] Vision extraction on ${pdfDoc.fileName} returned no prices — trying next document`);
                }
              } catch (visionErr) {
                console.error(`[Stage3] Vision fallback failed on ${pdfDoc.fileName}:`, visionErr);
              }
            }
            if (!visionSucceeded) {
              console.log(`[Stage3] All ${allPdfDocs.length} PDF document(s) exhausted without extracting prices — keeping original quote`);
              repaired.push(q);
            }
          } else {
            repaired.push(q);
          }
        }
        extracted_quotes = repaired;
      }

      // SPARSE-TEXT VISION SCAN: For each PDF document whose extracted text is very short
      // (< 120 chars), the OCR likely failed to read it — run a vision-direct extraction
      // to catch scanned/image-based documents that the text path missed entirely.
      // Threshold is 120 chars (lowered from 200) to catch handwritten quotations like
      // Rowan Motors where OCR may extract a header line but miss the line-item table.
      // This is the primary fix for cases where a repairer's PDF was scanned and not
      // detected by the text-based extractMultipleQuotes call above.
      if (allPdfDocs.length > 0) {
        const extractedNames = new Set(
          (extracted_quotes ?? []).map(q => (q.panel_beater ?? '').toLowerCase().trim())
        );
        for (const pdfDoc of allPdfDocs) {
          const docText = stage2.extractedTexts.find(t => t.documentIndex === pdfDoc.documentIndex)?.rawText ?? '';
          if (docText.trim().length < 120) {
            // Very little text — likely a scanned document. Run vision extraction.
            console.log(`[Stage3] Sparse-text vision scan triggered for ${pdfDoc.fileName} (${docText.trim().length} chars extracted by OCR)`);
            try {
              const visionResult = await extractQuoteFromPdfVision(pdfDoc.sourceUrl, null, null, tenantCountry);
              const visionHasPrices = visionResult.line_items.some(li => (li.line_total ?? 0) > 0 || (li.unit_cost ?? 0) > 0);
              const visionHasTotal = visionResult.total_cost !== null && visionResult.total_cost > 0;
              const visionName = (visionResult.panel_beater ?? '').toLowerCase().trim();
              // Only add if this repairer wasn't already extracted from text
              const alreadyExtracted = visionName && extractedNames.has(visionName);
              if ((visionHasPrices || visionHasTotal) && !alreadyExtracted) {
                console.log(`[Stage3] Sparse-text vision scan found new quote from "${visionResult.panel_beater}" in ${pdfDoc.fileName}: ${visionResult.line_items.length} line items, total=${visionResult.total_cost}`);
                if (!extracted_quotes) extracted_quotes = [];
                extracted_quotes.push(visionResult);
                if (visionName) extractedNames.add(visionName);
              } else if (alreadyExtracted) {
                console.log(`[Stage3] Sparse-text vision scan: "${visionResult.panel_beater}" already extracted — skipping duplicate`);
              } else {
                console.log(`[Stage3] Sparse-text vision scan on ${pdfDoc.fileName} returned no usable quote`);
              }
            } catch (sparseErr) {
              console.error(`[Stage3] Sparse-text vision scan failed on ${pdfDoc.fileName}:`, sparseErr);
            }
          }
        }
      }

      // MISSING-REPAIRER SCANNER: After all text-based and sparse-text vision extractions,
      // scan the raw OCR text for known repairer names that were NOT extracted as quotes.
      // This catches cases where a repairer's section was present in the OCR text but the
      // LLM detection pass missed it (e.g. name appears only once, or text is fragmented).
      // For each missing repairer found in the text, trigger a targeted vision pass.
      if (allPdfDocs.length > 0 && extracted_quotes && extracted_quotes.length > 0) {
        const extractedNamesNorm = new Set(
          extracted_quotes.map(q => (q.panel_beater ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').trim())
        );
        // Known repairer patterns to scan for — normalised to lowercase.
        // Covers common Zimbabwean and South African panel beaters / spray painters.
        const KNOWN_REPAIRER_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
          // Zimbabwe
          { pattern: /rowan\s*motors?/i, label: 'Rowan Motors' },
          { pattern: /emilio[\u2019's]*\s*spray/i, label: "Emilio's Spray Painters" },
          { pattern: /swiss\s*motors?/i, label: 'Swiss Motors' },
          { pattern: /grand\s*auto/i, label: 'Grand Auto Premier' },
          { pattern: /cedric\s*jonker/i, label: 'Cedric Jonker' },
          { pattern: /kingfisher/i, label: 'Kingfisher Auto Motors' },
          { pattern: /autocraft/i, label: 'Autocraft' },
          { pattern: /motor\s*city/i, label: 'Motor City' },
          { pattern: /harare\s*panel/i, label: 'Harare Panel Beaters' },
          { pattern: /bulawayo\s*panel/i, label: 'Bulawayo Panel Beaters' },
          { pattern: /masvingo\s*panel/i, label: 'Masvingo Panel Beaters' },
          { pattern: /mutare\s*panel/i, label: 'Mutare Panel Beaters' },
          { pattern: /gweru\s*panel/i, label: 'Gweru Panel Beaters' },
          { pattern: /kwekwe\s*panel/i, label: 'Kwekwe Panel Beaters' },
          { pattern: /chinhoyi\s*panel/i, label: 'Chinhoyi Panel Beaters' },
          { pattern: /marondera\s*panel/i, label: 'Marondera Panel Beaters' },
          { pattern: /bindura\s*panel/i, label: 'Bindura Panel Beaters' },
          // South Africa
          { pattern: /midas\s*auto/i, label: 'Midas Auto' },
          { pattern: /wesbank\s*panel/i, label: 'Wesbank Panel Beaters' },
          { pattern: /auto\s*body\s*craft/i, label: 'Auto Body Craft' },
          { pattern: /panel\s*magic/i, label: 'Panel Magic' },
          { pattern: /smash\s*palace/i, label: 'Smash Palace' },
          { pattern: /car\s*craft/i, label: 'Car Craft' },
          { pattern: /speedy\s*panel/i, label: 'Speedy Panel Beaters' },
        ];

        // GENERIC PASS: Scan OCR text for any company-style name followed by panel-beater
        // keywords that was NOT already extracted. This catches previously unseen repairers.
        const genericRepairerRegex = /([A-Z][A-Za-z'&.]+(?:\s+[A-Z][A-Za-z'&.]+){0,4})\s*(?:\(PVT\)\s*LTD|\(PTY\)\s*LTD|LTD|CC|INC)?\s*(?:MOTORS?|PANEL\s*BEATERS?|SPRAY\s*PAINT(?:ERS?)?|AUTO\s*BODY|BODY\s*REPAIRS?|PANEL\s*WORKS?|AUTOBODY|SMASH\s*REPAIRS?)/gi;
        let genericMatch: RegExpExecArray | null;
        const extractedNamesNormForGeneric = new Set(
          extracted_quotes.map(q => (q.panel_beater ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').trim())
        );
        while ((genericMatch = genericRepairerRegex.exec(allText)) !== null) {
          const fullName = genericMatch[0].trim();
          const normFull = fullName.toLowerCase().replace(/[^a-z0-9]/g, '');
          const alreadyInList = KNOWN_REPAIRER_PATTERNS.some(p =>
            p.label && p.label.toLowerCase().replace(/[^a-z0-9]/g, '').includes(normFull.slice(0, 6))
          );
          const alreadyExtracted = [...extractedNamesNormForGeneric].some(n =>
            n.includes(normFull.slice(0, 6)) || normFull.includes(n.slice(0, 6))
          );
          if (!alreadyInList && !alreadyExtracted && fullName.length >= 4) {
            console.log(`[Stage3] Generic repairer scan found: "${fullName}" — adding to missing-repairer check list`);
            KNOWN_REPAIRER_PATTERNS.push({
              pattern: new RegExp(fullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
              label: fullName,
            });
          }
        }

        const missingRepairers: string[] = [];
        for (const { pattern, label } of KNOWN_REPAIRER_PATTERNS) {
          if (!label) continue; // skip empty-label entries
          const normLabel = label.toLowerCase().replace(/[^a-z0-9]/g, '');
          const alreadyExtracted = [...extractedNamesNorm].some(n =>
            n.includes(normLabel.slice(0, 6)) || normLabel.includes(n.slice(0, 6))
          );
          if (!alreadyExtracted && pattern.test(allText)) {
            console.log(`[Stage3] Missing-repairer scanner: "${label}" found in OCR text but not in extracted quotes — triggering targeted vision pass`);
            missingRepairers.push(label);
          }
        }
        if (missingRepairers.length > 0) {
          for (const missingName of missingRepairers) {
            for (const pdfDoc of allPdfDocs) {
              try {
                const visionResult = await extractQuoteFromPdfVision(pdfDoc.sourceUrl, missingName, null, tenantCountry);
                const visionHasPrices = visionResult.line_items.some(li => (li.line_total ?? 0) > 0 || (li.unit_cost ?? 0) > 0);
                const visionHasTotal = visionResult.total_cost !== null && visionResult.total_cost > 0;
                const visionName = (visionResult.panel_beater ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
                const normMissing = missingName.toLowerCase().replace(/[^a-z0-9]/g, '');
                const nameMatches = visionName.includes(normMissing.slice(0, 6)) || normMissing.includes(visionName.slice(0, 6));
                if ((visionHasPrices || visionHasTotal) && nameMatches) {
                  console.log(`[Stage3] Missing-repairer vision pass found "${visionResult.panel_beater}" in ${pdfDoc.fileName}: total=${visionResult.total_cost}, ${visionResult.line_items.length} line items`);
                  extracted_quotes.push(visionResult);
                  extractedNamesNorm.add(visionName);
                  break; // Found this repairer — move to next missing repairer
                } else {
                  console.log(`[Stage3] Missing-repairer vision pass on ${pdfDoc.fileName} for "${missingName}": no match (name=${visionResult.panel_beater}, total=${visionResult.total_cost})`);
                }
              } catch (missingErr) {
                console.error(`[Stage3] Missing-repairer vision pass failed for "${missingName}" on ${pdfDoc.fileName}:`, missingErr);
              }
            }
          }
        }
      }

      // If LLM found a quote but regex did not, remove the quote_not_mapped flag
      const llmFoundQuote = (extracted_quotes ?? []).some(q => q.total_cost !== null && q.confidence !== 'low');
      if (!hasQuote && !recovered_quote && llmFoundQuote) {
        // LLM recovered the quote — do not push quote_not_mapped
      } else if (!hasQuote && !recovered_quote && !llmFoundQuote) {
        flags.push('quote_not_mapped');
      }
    } else if (allPdfDocs.length > 0) {
      // OCR-FAILURE VISION-DIRECT PATH
      // Stage 2 OCR timed out or returned no text (common with large scanned PDFs).
      // We still have the PDF URL — send it directly to the vision LLM to extract
      // the quote line items. This is the same vision fallback used above, but
      // triggered proactively when there is no text at all.
      console.log(`[Stage3] OCR-failure vision-direct: allText empty, trying ${allPdfDocs.length} PDF document(s) for quote extraction`);
      // We need a total_cost hint from the claim record (already extracted by Stage 3's
      // PDF extraction path above). Use the first non-null quoteTotalCents from
      // perDocumentExtractions.
      const hintTotalCents = perDocumentExtractions
        .map(e => e.quoteTotalCents)
        .find(v => v != null && v > 0) ?? null;
      const hintTotal = hintTotalCents ? hintTotalCents / 100 : null;
      const hintPanelBeater = perDocumentExtractions
        .map(e => e.panelBeater)
        .find(v => v != null) ?? null;
      for (const pdfDoc of allPdfDocs) {
        try {
          console.log(`[Stage3] OCR-failure vision-direct: trying ${pdfDoc.fileName} (total hint: ${hintTotal})`);
          const visionResult = await extractQuoteFromPdfVision(pdfDoc.sourceUrl, hintPanelBeater, hintTotal, tenantCountry);
          const visionHasPrices = visionResult.line_items.some(li => (li.line_total ?? 0) > 0 || (li.unit_cost ?? 0) > 0);
          const visionHasTotal = visionResult.total_cost !== null && visionResult.total_cost > 0;
          if (visionHasPrices || visionHasTotal) {
            console.log(`[Stage3] OCR-failure vision-direct succeeded on ${pdfDoc.fileName}: ${visionResult.line_items.length} line items, total=${visionResult.total_cost}`);
            extracted_quotes = [visionResult];
            break;
          } else {
            console.log(`[Stage3] OCR-failure vision-direct on ${pdfDoc.fileName} returned no prices`);
          }
        } catch (visionErr) {
          console.error(`[Stage3] OCR-failure vision-direct failed on ${pdfDoc.fileName}:`, visionErr);
        }
      }
      if (!extracted_quotes && !hasQuote && !recovered_quote) flags.push('quote_not_mapped');
    } else {
      if (!hasQuote && !recovered_quote) flags.push('quote_not_mapped');
    }
  } catch {
    if (!hasQuote && !recovered_quote) flags.push('quote_not_mapped');
  }

  // ── FINAL DEDUPLICATION: collapse same-repairer quotes ─────────────────────
  // A single repairer quotation may be extracted multiple times when:
  //   (a) The document has both a printed total and a handwritten revised amount
  //       (e.g. original $2,130 crossed out, agreed $1,950 written beside it)
  //   (b) Text-based extraction and vision extraction both find the same repairer
  //   (c) The sparse-text vision guard runs on a document already extracted by OCR
  // Strategy: group by normalised repairer name, keep the entry with the LOWEST
  // total_cost (the agreed/negotiated price, not the original inflated amount).
  // If two entries have the same total, keep the one with more line items.
  if (extracted_quotes && extracted_quotes.length > 1) {
    const dedupMap = new Map<string, typeof extracted_quotes[0]>();
    for (const q of extracted_quotes) {
      const normName = (q.panel_beater ?? 'unknown').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
      const existing = dedupMap.get(normName);
      if (!existing) {
        dedupMap.set(normName, q);
      } else {
        // Both have a total — keep the lower (agreed/negotiated) amount
        const existingTotal = existing.total_cost ?? Infinity;
        const newTotal = q.total_cost ?? Infinity;
        if (newTotal < existingTotal) {
          console.log(`[Stage3] Dedup: "${q.panel_beater}" — keeping lower total ${newTotal} over ${existingTotal}`);
          dedupMap.set(normName, q);
        } else if (newTotal === existingTotal) {
          // Same total — keep the one with more line items (richer data)
          const existingItems = existing.line_items?.length ?? 0;
          const newItems = q.line_items?.length ?? 0;
          if (newItems > existingItems) {
            console.log(`[Stage3] Dedup: "${q.panel_beater}" — same total, keeping entry with ${newItems} line items over ${existingItems}`);
            dedupMap.set(normName, q);
          }
        } else {
          console.log(`[Stage3] Dedup: "${q.panel_beater}" — discarding higher total ${newTotal} (keeping ${existingTotal})`);
        }
      }
    }
    const before = extracted_quotes.length;
    extracted_quotes = Array.from(dedupMap.values());
    if (extracted_quotes.length < before) {
      console.log(`[Stage3] Dedup: collapsed ${before} → ${extracted_quotes.length} quote(s) after same-repairer deduplication`);
    }
  }

  // STEP 3 — Image presence detection
  // IMPORTANT: We deliberately do NOT use text-keyword matching ("photo", "image",
  // "photograph", etc.) to infer image presence. Claim forms routinely contain
  // instructions like "Attach photographs of damage" or "Please provide photos"
  // which would trigger false positives, incorrectly marking the claim as having
  // photos that failed to ingest (SYSTEM_FAILURE) when no photos were submitted.
  // We only trust structural signals from the PDF parser itself.
  const images_present =
    stage1.documents.some(d => d.containsImages || d.imageUrls.length > 0) ||
    perDocumentExtractions.some(e => e.uploadedImageUrls.length > 0);

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
    extracted_quotes,
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

    // ─── PARALLEL EXTRACTION TIER ────────────────────────────────────────────
    // PDF extraction, photo extraction, and input recovery (quote extraction)
    // are all independent — they read from stage1/stage2 inputs and do not
    // depend on each other's output. Fire them all concurrently.
    const pdfDocs = stage1.documents.filter(d => d.mimeType === "application/pdf");
    const photoDocs = stage1.documents.filter(d => d.documentType === "vehicle_photos");
    const photoUrls = photoDocs.map(d => d.sourceUrl).filter(Boolean) as string[];

    // ── PDF extraction task ──────────────────────────────────────────────────
    const pdfExtractionTask = async (): Promise<ExtractedClaimFields[]> => {
      const results: ExtractedClaimFields[] = [];
      for (const pdfDoc of pdfDocs) {
        try {
          const extractedText = stage2.extractedTexts.find(t => t.documentIndex === pdfDoc.documentIndex);
          const rawText = extractedText?.rawText || "";
          const preprocessed = preprocessDocument(rawText);
          ctx.log("Stage 3", `Preprocessor: ${preprocessed.totalChunks} chunks, quoteText=${preprocessed.repairQuoteText.length}chars, claimFormText=${preprocessed.claimFormText.length}chars, multiDoc=${preprocessed.hasMultipleDocuments}`);
          const enrichedRawText = preprocessed.repairQuoteText.length > 100
            ? `[REPAIR QUOTE SECTION — read this first for cost data]\n${preprocessed.repairQuoteText}\n\n[CLAIM FORM SECTION — read this for incident and vehicle data]\n${preprocessed.claimFormText}\n\n[FULL DOCUMENT]\n${rawText.substring(0, 5000)}`
            : rawText.substring(0, 8000);
          ctx.log("Stage 3", `Extracting structured fields from PDF: ${pdfDoc.fileName} (${pdfDoc.imageUrls.length} page images available)`);
          const fields = await extractFieldsFromPdf(pdfDoc.sourceUrl, enrichedRawText, ctx, pdfDoc.imageUrls);
          if (pdfDoc.imageUrls.length > 0) fields.uploadedImageUrls = [...pdfDoc.imageUrls];
          fields.sourceDocumentIndex = pdfDoc.documentIndex;
          const qualityScore = scoreExtraction(fields);
          ctx.log("Stage 3", `PDF extraction complete. Vehicle: ${fields.vehicleMake || 'unknown'} ${fields.vehicleModel || 'unknown'}, Components: ${fields.damagedComponents.length}, QuoteTotal: ${fields.quoteTotalCents}. Quality: ${qualityScore.score}/100 (${qualityScore.tier}). Missing: ${qualityScore.missingFields.join(", ") || "none"}.`);
          if (qualityScore.tier === "LOW") {
            isDegraded = true;
            recoveryActions.push({ target: `pdf_extraction_quality_${pdfDoc.documentIndex}`, strategy: "partial_data", success: false, description: `Extraction quality LOW (${qualityScore.score}/100). Missing critical fields: ${qualityScore.missingFields.join(", ")}. Notes: ${qualityScore.notes.join("; ")}.` });
          }
          results.push(fields);
        } catch (docErr) {
          isDegraded = true;
          ctx.log("Stage 3", `Failed to extract from PDF ${pdfDoc.fileName}: ${String(docErr)} — skipping`);
          recoveryActions.push({ target: `pdf_extraction_${pdfDoc.documentIndex}`, strategy: "partial_data", success: true, description: `PDF extraction failed for ${pdfDoc.fileName}: ${String(docErr)}. Continuing with other documents.` });
        }
      }
      return results;
    };

    // ── Photo extraction task ────────────────────────────────────────────────
    const photoExtractionTask = async (): Promise<ExtractedClaimFields | null> => {
      if (photoUrls.length === 0) return null;
      try {
        ctx.log("Stage 3", `Extracting structured fields from ${photoUrls.length} damage photo(s)`);
        const photoFields = await extractFieldsFromPhotos(photoUrls, ctx);
        photoFields.uploadedImageUrls = photoUrls;
        ctx.log("Stage 3", `Photo extraction complete. Components: ${photoFields.damagedComponents.length}`);
        return photoFields;
      } catch (photoErr) {
        isDegraded = true;
        ctx.log("Stage 3", `Failed to extract from photos: ${String(photoErr)} — skipping`);
        recoveryActions.push({ target: "photo_extraction", strategy: "partial_data", success: true, description: `Photo extraction failed: ${String(photoErr)}. Damage assessment will rely on text descriptions.` });
        return null;
      }
    };

    // ── Input recovery task (quote extraction) ───────────────────────────────
    // runInputRecovery reads stage1/stage2 and any already-available extractions.
    // Since it only needs the raw text (not the LLM extraction results), it can
    // run concurrently with PDF and photo extraction.
    const inputRecoveryTask = async () => {
      try {
        const result = await runInputRecovery(stage1, stage2, [], ctx.tenantCountry);
        return result;
      } catch (recErr) {
        ctx.log("Stage 3", `Input recovery failed: ${String(recErr)} — skipping`);
        return undefined;
      }
    };

    // Fire all three tasks concurrently
    ctx.log("Stage 3", "Firing PDF extraction, photo extraction, and input recovery in parallel");
    const [pdfResults, photoResult, inputRecoveryResult] = await Promise.all([
      pdfExtractionTask(),
      photoExtractionTask(),
      inputRecoveryTask(),
    ]);

    // Merge results
    perDocumentExtractions.push(...pdfResults);
    if (photoResult) perDocumentExtractions.push(photoResult);
    let inputRecovery = inputRecoveryResult;

    if (inputRecovery) {
      const llmQuoteCount = inputRecovery.extracted_quotes?.filter(q => q.total_cost !== null).length ?? 0;
      ctx.log("Stage 3", `Input recovery complete. Quote recovered: ${inputRecovery.recovered_quote ? `USD ${inputRecovery.recovered_quote.total} (${inputRecovery.recovered_quote.confidence})` : 'none'}. LLM quotes extracted: ${llmQuoteCount}. Images present: ${inputRecovery.images_present}. Flags: ${inputRecovery.failure_flags.join(", ") || "none"}.`);
      const criticalRecoveryFlags = (inputRecovery.failure_flags as string[]).filter(
        (f: string) => f !== "images_not_processed" && f !== "no_photos"
      );
      if (criticalRecoveryFlags.length > 0) {
        isDegraded = true;
        recoveryActions.push({ target: "input_recovery", strategy: "partial_data", success: true, description: `Input recovery flagged (critical): ${criticalRecoveryFlags.join(", ")}. Downstream stages should use recovered values where available.` });
      } else if (inputRecovery.failure_flags.length > 0) {
        recoveryActions.push({ target: "input_recovery", strategy: "partial_data", success: true, description: `Input recovery benign flags (non-critical, no degradation): ${(inputRecovery.failure_flags as string[]).join(", ")}.` });
      }
    }

    if (perDocumentExtractions.length === 0 && stage1.documents.length > 0) {
      isDegraded = true;
      assumptions.push({ field: "perDocumentExtractions", assumedValue: "all_failed", reason: "All document extractions failed. Will rely on claim database fields at assembly stage.", strategy: "partial_data", confidence: 15, stage: "Stage 3" });
    }

    // ── TARGETED FIELD RECOVERY ───────────────────────────────────────────────
    // After all extraction passes, run targeted recovery for any null critical
    // fields. This is the final safety net — fires focused LLM prompts for
    // high-value fields that are still missing.
    if (perDocumentExtractions.length > 0) {
      try {
        // Gather the best raw text from all PDF documents
        const allRawText = stage2.extractedTexts.map(t => t.rawText).join("\n\n");
        // Use the first PDF URL for visual re-extraction (handwriting, stamps)
        const firstPdfUrl = stage1.documents.find(d => d.mimeType === "application/pdf")?.sourceUrl ?? null;

        // Merge all per-document extractions into a single best-of record
        const merged = mergeExtractions(perDocumentExtractions);

        const { patchedFields, report } = await runFieldRecovery(
          merged,
          allRawText,
          firstPdfUrl,
          (msg) => ctx.log("Stage 3", msg)
        );

        // Replace the first extraction with the patched merged result
        perDocumentExtractions[0] = patchedFields;

        if (report.fieldsRecovered > 0) {
          recoveryActions.push({
            target: "targeted_field_recovery",
            strategy: "partial_data",
            success: true,
            description: `Targeted field recovery: ${report.fieldsRecovered}/${report.totalAttempted} fields recovered. Still missing: ${report.fieldsStillMissing.join(", ") || "none"}.`,
          });
        }
        if (report.fieldsStillMissing.length > 0) {
          ctx.log("Stage 3", `Fields not recoverable from documents: ${report.fieldsStillMissing.join(", ")}`);
        }
      } catch (frErr) {
        ctx.log("Stage 3", `Targeted field recovery failed: ${String(frErr)} — skipping`);
      }
    }

    // ── OCR SPELL-CORRECTION PASS ─────────────────────────────────────────────
    // After all extraction and recovery, run a lightweight LLM pass to fix
    // general OCR spelling errors in all narrative text fields.
    // This is a single batched call — cheap, fast, and covers ALL text fields
    // regardless of domain (automotive, legal, general English).
    // NEVER alters meaning, never adds/removes information — spelling only.
    if (perDocumentExtractions.length > 0) {
      try {
        const merged = perDocumentExtractions[0];
        // Collect all non-null narrative text fields that are worth correcting
        const TEXT_FIELDS: Array<keyof ExtractedClaimFields> = [
          'accidentDescription', 'accidentLocation', 'damageDescription',
          'policeOfficerFindings', 'thirdPartyAccountSummary', 'impactPoint',
          'policeStation', 'policeOfficerName', 'policeChargedParty',
          'assessorName', 'panelBeater', 'repairerCompany',
          'thirdPartyVehicle', 'thirdPartyName', 'thirdPartyInsurerName',
          'weatherConditions', 'visibilityConditions', 'roadSurface',
          'claimantName', 'driverName', 'animalType',
        ];
        const fieldMap: Record<string, string> = {};
        for (const f of TEXT_FIELDS) {
          const v = merged[f];
          if (typeof v === 'string' && v.trim().length > 3) {
            fieldMap[f as string] = v;
          }
        }
        if (Object.keys(fieldMap).length > 0) {
          // Race the LLM call against a 30-second timeout.
          // Spell-correction is non-fatal: if the LLM is slow or unresponsive,
          // we skip it rather than blocking the entire pipeline.
          const SPELL_TIMEOUT_MS = 30_000;
          const spellTimeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('OCR spell-correction timed out after 30s')), SPELL_TIMEOUT_MS)
          );
          const spellLlmPromise = llmCall({
            messages: [
              {
                role: 'system',
                content: `You are an OCR post-processor. Your ONLY task is to fix OCR-induced spelling errors in the provided text fields.
RULES:
- Fix spelling errors caused by OCR misreads (e.g. "windscren" → "windscreen", "Isuuzu" → "Isuzu", "teh" → "the", "vehicel" → "vehicle", "Gweru Cty" → "Gweru City", "Motornet pannel beaters" → "Motornet panel beaters").
- Preserve ALL proper nouns, names, place names, and reference numbers exactly as given — do NOT "correct" them unless they are clearly an OCR error of a known word.
- Do NOT add, remove, or rephrase any information. Do NOT change meaning.
- Do NOT change numbers, dates, currency values, or codes.
- Return ONLY a JSON object with the same keys as the input, with corrected values.
- If a field has no spelling errors, return it unchanged.
- If you are uncertain whether something is a spelling error or a proper noun, leave it unchanged.`,
              },
              {
                role: 'user',
                content: `Fix OCR spelling errors in these extracted claim fields:\n${JSON.stringify(fieldMap, null, 2)}`,
              },
            ],
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'spell_corrected_fields',
                strict: false,
                schema: {
                  type: 'object',
                  additionalProperties: { type: 'string' },
                },
              },
            },
          });
          const spellResponse = await Promise.race([spellTimeoutPromise, spellLlmPromise]);
          const corrected = JSON.parse(spellResponse.choices?.[0]?.message?.content || '{}');
          let spellFixCount = 0;
          for (const [field, correctedValue] of Object.entries(corrected)) {
            if (typeof correctedValue === 'string' && correctedValue !== fieldMap[field]) {
              (merged as any)[field] = correctedValue;
              spellFixCount++;
              ctx.log('Stage 3', `Spell-corrected '${field}': "${fieldMap[field]}" → "${correctedValue}"`);
            }
          }
          if (spellFixCount > 0) {
            ctx.log('Stage 3', `OCR spell-correction: ${spellFixCount} field(s) corrected`);
            recoveryActions.push({
              target: 'ocr_spell_correction',
              strategy: 'partial_data',
              success: true,
              description: `OCR spell-correction fixed ${spellFixCount} field(s).`,
            });
          } else {
            ctx.log('Stage 3', 'OCR spell-correction: no corrections needed');
          }
          perDocumentExtractions[0] = merged;
        }
      } catch (spellErr) {
        ctx.log('Stage 3', `OCR spell-correction failed (non-fatal): ${String(spellErr)}`);
      }
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
