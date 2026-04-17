/**
 * KINGA AutoVerify AI — Forensic Claim Decision Report Generator
 * Generates a structured multi-page PDF from a forensic analysis JSON.
 * Each section starts on a clean page.
 */
import PDFDocument from "pdfkit";
// ─── Colour palette ────────────────────────────────────────────────────────
const C = {
  black: "#0A0A0A",
  white: "#FFFFFF",
  offWhite: "#F5F5F5",
  grey: "#6B7280",
  lightGrey: "#D1D5DB",
  green: "#16A34A",
  amber: "#D97706",
  red: "#DC2626",
  blue: "#1D4ED8",
  headerBg: "#0A0A0A",
  sectionLine: "#E5E7EB",
};
// ─── Helpers ───────────────────────────────────────────────────────────────
function decisionColour(decision: string): string {
  const d = (decision ?? "").toUpperCase();
  if (d.includes("APPROVE")) return C.green;
  if (d.includes("REJECT")) return C.red;
  return C.amber;
}
function statusColour(status: string): string {
  const s = (status ?? "").toUpperCase();
  if (["PASS", "SUCCESS", "COMPLETE", "HIGH", "APPROVED"].some((k) => s.includes(k))) return C.green;
  if (["FAIL", "FAILED", "CRITICAL", "BLOCKED"].some((k) => s.includes(k))) return C.red;
  return C.amber;
}
function pct(v: number | undefined | null): string {
  if (v == null) return "N/A";
  return `${Math.round(v)}%`;
}
function val(v: unknown, fallback = "Not provided"): string {
  if (v == null || v === "" || v === undefined) return fallback;
  return String(v);
}
/** Extract a string from either a plain string or an object with a text field */
function extractString(item: unknown): string {
  if (item == null) return "";
  if (typeof item === "string") return item;
  if (typeof item === "object") {
    const obj = item as Record<string, unknown>;
    return String(obj.description ?? obj.reason ?? obj.text ?? obj.message ?? JSON.stringify(item));
  }
  return String(item);
}
// ─── Page chrome ──────────────────────────────────────────────────────────
function drawPageHeader(doc: PDFKit.PDFDocument, claimId: string, pageLabel: string) {
  // Black header bar
  doc.rect(0, 0, doc.page.width, 44).fill(C.headerBg);
  doc
    .fillColor(C.white)
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("KINGA AUTOVERIFY AI", 40, 14, { continued: true })
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#9CA3AF")
    .text(`   ·   Forensic Claim Decision Report   ·   ${claimId}`, { continued: true })
    .text(`   ·   ${pageLabel}`, { align: "right" });
  doc.moveDown(0);
}
function drawPageFooter(doc: PDFKit.PDFDocument, pageNum: number) {
  const footerLineY = doc.page.height - 32;
  const footerTextY = doc.page.height - 24;
  const savedY = doc.y;
  // Temporarily remove bottom margin so PDFKit doesn't auto-create a new page
  // when we draw text near the physical bottom of the page
  const savedBottomMargin = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  // Draw footer line
  doc
    .moveTo(40, footerLineY)
    .lineTo(doc.page.width - 40, footerLineY)
    .strokeColor(C.lightGrey)
    .lineWidth(0.5)
    .stroke();
  // Draw footer text at absolute position
  doc
    .fillColor(C.grey)
    .font("Helvetica")
    .fontSize(8)
    .text(
      `KINGA AutoVerify AI  \u00b7  Confidential \u2014 For authorised insurer use only  \u00b7  Page ${pageNum}`,
      40,
      footerTextY,
      { width: doc.page.width - 80, align: "center", lineBreak: false }
    );
  // Restore margin and y position
  doc.page.margins.bottom = savedBottomMargin;
  doc.y = savedY;
}
function sectionHeading(doc: PDFKit.PDFDocument, title: string, subtitle?: string) {
  doc.y = 60; // start below header bar
  doc
    .fillColor(C.black)
    .font("Helvetica-Bold")
    .fontSize(16)
    .text(title, 40, doc.y);
  if (subtitle) {
    doc
      .fillColor(C.grey)
      .font("Helvetica")
      .fontSize(10)
      .text(subtitle, 40, doc.y + 2);
  }
  doc.moveDown(0.6);
  doc
    .moveTo(40, doc.y)
    .lineTo(doc.page.width - 40, doc.y)
    .strokeColor(C.sectionLine)
    .lineWidth(1)
    .stroke();
  doc.moveDown(0.8);
}
function labelValue(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  colour = C.black
) {
  const y = doc.y;
  doc
    .fillColor(C.grey)
    .font("Helvetica")
    .fontSize(8)
    .text(label.toUpperCase(), 40, y, { width: 180 });
  doc
    .fillColor(colour)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(value, 230, y, { width: doc.page.width - 270 });
  doc.moveDown(0.55);
}
function divider(doc: PDFKit.PDFDocument) {
  doc.moveDown(0.3);
  doc
    .moveTo(40, doc.y)
    .lineTo(doc.page.width - 40, doc.y)
    .strokeColor(C.sectionLine)
    .lineWidth(0.5)
    .stroke();
  doc.moveDown(0.5);
}
function subHeading(doc: PDFKit.PDFDocument, text: string) {
  doc
    .fillColor(C.black)
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(text, 40, doc.y);
  doc.moveDown(0.4);
}
function bodyText(doc: PDFKit.PDFDocument, text: string) {
  doc
    .fillColor(C.black)
    .font("Helvetica")
    .fontSize(9)
    .text(text, 40, doc.y, { width: doc.page.width - 80, lineGap: 2 });
  doc.moveDown(0.5);
}
function bulletPoint(doc: PDFKit.PDFDocument, text: string, colour = C.black) {
  doc
    .fillColor(colour)
    .font("Helvetica")
    .fontSize(9)
    .text(`•  ${text}`, 52, doc.y, { width: doc.page.width - 92, lineGap: 2 });
  doc.moveDown(0.3);
}
function scoreRow(
  doc: PDFKit.PDFDocument,
  label: string,
  score: string,
  status: string
) {
  const y = doc.y;
  doc.fillColor(C.grey).font("Helvetica").fontSize(9).text(label, 40, y, { width: 200 });
  const scoreCol = statusColour(status);
  doc.fillColor(scoreCol).font("Helvetica-Bold").fontSize(9).text(score, 250, y, { width: 120 });
  doc.fillColor(scoreCol).font("Helvetica-Bold").fontSize(9).text(status, 380, y, { width: 80, align: "right" });
  doc.moveDown(0.6);
}
function stageRow(
  doc: PDFKit.PDFDocument,
  label: string,
  status: string,
  detail: string
) {
  const y = doc.y;
  const col = statusColour(status);
  doc.fillColor(C.black).font("Helvetica").fontSize(8).text(label, 40, y, { width: 260 });
  doc.fillColor(col).font("Helvetica-Bold").fontSize(8).text(status, 310, y, { width: 80 });
  if (detail) {
    doc.fillColor(C.grey).font("Helvetica").fontSize(7.5).text(detail, 400, y, { width: doc.page.width - 440 });
  }
  doc.moveDown(0.55);
}

export interface PdfReportInput {
  claimId: string;
  claimNumber: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: string | number;
  vehicleRegistration: string;
  insuredName: string;
  generatedAt: string;
  forensicAnalysis: Record<string, unknown>;
  pipelineRunSummary: Record<string, unknown>;
}

export function generateForensicPdf(input: PdfReportInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 60, bottom: 50, left: 40, right: 40 },
    autoFirstPage: false,
    info: {
      Title: `KINGA Forensic Report — ${input.claimNumber}`,
      Author: "KINGA AutoVerify AI",
      Subject: "Forensic Claim Decision Report",
      Keywords: "insurance, forensic, claim, AI",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  doc.on("end", () => resolve(Buffer.concat(chunks)));
  doc.on("error", reject);

  const fa = input.forensicAnalysis;
  const ps = input.pipelineRunSummary;
  const stages = (ps as any)?.stages ?? {};

  // ── Derived values ──────────────────────────────────────────────────────
  const decision = val((fa as any)?.decisionAuthority?.recommendation, "REVIEW REQUIRED");
  const confidence = val((fa as any)?.decisionAuthority?.confidence, "LOW");
  const fcdi = (fa as any)?.fcdi ?? {};
  const fcdiScore = fcdi.scorePercent ?? fcdi.score ?? null;
  const fcdiLabel = fcdi.label ?? "N/A";
  const fcdiBreakdown = fcdi.breakdown ?? {};
  const domainPenalties: Array<{ code: string; reason: string; weight: number }> =
    fcdiBreakdown.domainPenalties ?? [];

  const dataQuality = (fa as any)?.dataQuality ?? {};
  const completenessScore = dataQuality.completenessScore ?? null;
  const missingFields: string[] = dataQuality.missingFields ?? [];

  // physicsPlausibility is stored as a number (plausibility score) in forensic_analysis
  const physicsPlausibilityRaw = (fa as any)?.physicsPlausibility;
  const physicsScore: number | null =
    typeof physicsPlausibilityRaw === "number" ? physicsPlausibilityRaw :
    typeof physicsPlausibilityRaw === "object" && physicsPlausibilityRaw !== null
      ? ((physicsPlausibilityRaw as any).consistencyScore ?? (physicsPlausibilityRaw as any).plausibilityScore ?? null)
      : null;
  const physicsVerdict: string =
    typeof physicsPlausibilityRaw === "object" && physicsPlausibilityRaw !== null
      ? ((physicsPlausibilityRaw as any).verdict ?? (physicsPlausibilityRaw as any).plausibilityVerdict ?? "N/A")
      : physicsScore != null
        ? physicsScore >= 70 ? "CONSISTENT" : physicsScore >= 50 ? "PARTIALLY CONSISTENT" : "INCONSISTENT"
        : "N/A";

  const fraudRiskScore = (fa as any)?.fraudRiskScore ?? null;
  const fraudRiskLevel = val((fa as any)?.fraudRiskLevel, "N/A");
  // fraudIndicators may be objects — extract description string
  const fraudIndicatorsRaw: unknown[] = (fa as any)?.fraudIndicators ?? [];
  const fraudIndicators: string[] = fraudIndicatorsRaw.map(extractString).filter(Boolean);

  const costDecision = (fa as any)?.costDecision ?? {};
  const estimatedRepairCost = (fa as any)?.estimatedRepairCost ?? null;
  // costBreakdown may be an object (not array) — normalise to array
  const costBreakdownRaw = (fa as any)?.costBreakdown;
  const costBreakdown: Array<{ description: string; amount: number }> = (() => {
    if (!costBreakdownRaw) return [];
    if (Array.isArray(costBreakdownRaw)) return costBreakdownRaw;
    // It's an object like {partsCostCents, labourCostCents, ...}
    const entries: Array<{ description: string; amount: number }> = [];
    const labelMap: Record<string, string> = {
      partsCostCents: "Parts",
      labourCostCents: "Labour",
      paintCostCents: "Paint & Refinishing",
      hiddenDamageCostCents: "Hidden / Latent Damage",
    };
    for (const [k, v] of Object.entries(costBreakdownRaw as Record<string, unknown>)) {
      if (k === "totalCents") continue;
      const label = labelMap[k] ?? k.replace(/([A-Z])/g, " $1").replace(/cents$/i, "").trim();
      entries.push({ description: label, amount: Math.round(Number(v) / 100) });
    }
    return entries;
  })();

  const accidentDetails = (fa as any)?.accidentDetails ?? {};
  const multiEvent = accidentDetails.multiEventSequence ?? null;

  const evidenceBundle = (fa as any)?.evidenceBundle ?? {};
  const photoIngestionLog = (fa as any)?.photoIngestionLog ?? {};

  // damagedComponents: actual field names are name, severity, damageType (no repairAction)
  const damagedComponentsRaw: Array<Record<string, unknown>> = (fa as any)?.damagedComponents ?? [];
  const damagedComponents = damagedComponentsRaw.map((c) => ({
    component: String(c.name ?? c.component ?? "Unknown"),
    severity: String(c.severity ?? ""),
    repairAction: String(c.damageType ?? c.repairAction ?? c.repair_action ?? ""),
  }));

  // assumptions may be objects — extract reason string
  const assumptionsRaw: unknown[] = (fa as any)?.assumptions ?? [];
  const assumptions: string[] = assumptionsRaw.map((a) => {
    if (typeof a === "string") return a;
    if (typeof a === "object" && a !== null) {
      const obj = a as Record<string, unknown>;
      return String(obj.reason ?? obj.description ?? obj.text ?? JSON.stringify(a));
    }
    return String(a);
  }).filter(Boolean);

  const keyDrivers: string[] = (fa as any)?.decisionAuthority?.key_drivers ?? [];
  const blockingFactors: string[] = (fa as any)?.decisionAuthority?.blocking_factors ?? [];

  const vehicleStr = `${input.vehicleYear} ${input.vehicleMake} ${input.vehicleModel}`.trim();
  const dateStr = new Date(input.generatedAt).toLocaleDateString("en-ZA", {
    day: "2-digit", month: "long", year: "numeric",
  });

  // ── Page management ─────────────────────────────────────────────────────
  // We manage pages entirely manually. Each section starts on a clean page.
  // We never let PDFKit auto-create overflow pages — instead we check available
  // space before every content block and call newPage() ourselves.
  let pageNum = 0;
  let currentSectionLabel = "";

  // Usable bottom boundary (leave room for footer)
  const PAGE_BOTTOM = () => doc.page.height - 70;

  function newPage(label: string) {
    // Draw footer on the current page before moving on (if there is a current page)
    if (pageNum > 0) {
      drawPageFooter(doc, pageNum);
      // Reset y to a safe position so that doc.addPage() doesn't trigger
      // an auto-overflow page due to doc.y being near the bottom
      doc.y = 50;
    }
    currentSectionLabel = label;
    doc.addPage();
    pageNum++;
    drawPageHeader(doc, input.claimNumber, label);
    doc.y = 60;
  }

  /** Ensure at least `neededPx` of vertical space remains; if not, start a new page with the same section label. */
  function ensureSpace(neededPx: number) {
    if (doc.y + neededPx > PAGE_BOTTOM()) {
      newPage(currentSectionLabel);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 1 — EXECUTIVE SUMMARY
  // ══════════════════════════════════════════════════════════════════════════
  newPage("Executive Summary");
  sectionHeading(doc, "Executive Summary");

  // Decision banner
  const decCol = decisionColour(decision);
  doc.rect(40, doc.y, doc.page.width - 80, 48).fill(decCol);
  doc
    .fillColor(C.white)
    .font("Helvetica-Bold")
    .fontSize(18)
    .text(`FINAL DECISION: ${decision.toUpperCase()}`, 52, doc.y - 40, {
      width: doc.page.width - 104,
      align: "center",
    });
  doc
    .fillColor(C.white)
    .font("Helvetica")
    .fontSize(10)
    .text(`System Confidence: ${confidence.toUpperCase()}`, 52, doc.y - 18, {
      width: doc.page.width - 104,
      align: "center",
    });
  doc.moveDown(2.8);

  // Claim metadata
  subHeading(doc, "Claim Information");
  labelValue(doc, "Claim Reference", input.claimNumber);
  labelValue(doc, "Vehicle", vehicleStr);
  labelValue(doc, "Registration", val(input.vehicleRegistration));
  labelValue(doc, "Insured", val(input.insuredName));
  labelValue(doc, "Incident Date", val(accidentDetails.date));
  labelValue(doc, "Incident Location", val(accidentDetails.location));
  labelValue(doc, "Report Generated", dateStr);
  divider(doc);

  // Core metrics
  subHeading(doc, "Core Metrics");
  scoreRow(doc, "Data Completeness (FCDI)", `${pct(fcdiScore)} — ${fcdiLabel}`,
    fcdiScore != null && fcdiScore >= 80 ? "PASS" : fcdiScore != null && fcdiScore >= 60 ? "WARNING" : "FAIL");
  scoreRow(doc, "Data Quality Score", pct(completenessScore),
    completenessScore != null && completenessScore >= 80 ? "PASS" : "WARNING");
  scoreRow(doc, "Physics Consistency", pct(physicsScore),
    physicsVerdict.toUpperCase().includes("INCONSISTENT") && !physicsVerdict.toUpperCase().includes("PARTIALLY")
      ? "FAIL"
      : physicsVerdict.toUpperCase().includes("CONSISTENT") && !physicsVerdict.toUpperCase().includes("PARTIALLY")
        ? "PASS"
        : "WARNING");
  scoreRow(doc, "Fraud Risk Score", fraudRiskScore != null ? `${fraudRiskScore}/100` : "N/A",
    fraudRiskLevel.toUpperCase().includes("LOW") ? "PASS" : fraudRiskLevel.toUpperCase().includes("HIGH") ? "FAIL" : "WARNING");
  divider(doc);

  // Primary drivers
  if (keyDrivers.length > 0 || blockingFactors.length > 0) {
    subHeading(doc, "Primary Decision Drivers");
    for (const d of keyDrivers) bulletPoint(doc, d);
    for (const b of blockingFactors) bulletPoint(doc, `BLOCKING: ${b}`, C.red);
    divider(doc);
  }

  // Domain penalties
  if (domainPenalties.length > 0) {
    subHeading(doc, "Integrity Failures Detected");
    for (const p of domainPenalties) {
      bulletPoint(doc, `[${p.code}] ${p.reason}  (−${Math.round((p.weight ?? 0) * 100)} pts)`, C.red);
    }
    divider(doc);
  }

  // Recommended action
  subHeading(doc, "Recommended Action");
  const reasoning = val((fa as any)?.decisionAuthority?.reasoning, "Manual review required before any approval decision is made.");
  bodyText(doc, reasoning);

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 2 — KEY RISKS
  // ══════════════════════════════════════════════════════════════════════════
  newPage("Key Risks");
  sectionHeading(doc, "Key Risks", "Material risks identified by the KINGA pipeline");

  let riskNum = 1;

  // Data integrity risk
  if (missingFields.length > 0) {
    subHeading(doc, `${riskNum++}. DATA INTEGRITY RISK`);
    bodyText(doc, "The following required fields were absent from the submitted claim documentation:");
    for (const f of missingFields) bulletPoint(doc, f, C.red);
    divider(doc);
  }

  // Image pipeline failure
  const imgFail = domainPenalties.find((p) => p.code === "IMAGE_PIPELINE_FAILURE");
  if (imgFail) {
    subHeading(doc, `${riskNum++}. IMAGE PIPELINE FAILURE`);
    bodyText(doc, imgFail.reason);
    bodyText(doc,
      "Photos were detected in the source document but could not be extracted for visual analysis. " +
      "This prevents damage validation and visual fraud detection. The claim cannot be fully assessed without photographic evidence."
    );
    divider(doc);
  }

  // Physics inconsistency
  const physFail = domainPenalties.find((p) => p.code === "PHYSICS_INCONSISTENCY");
  if (physFail) {
    subHeading(doc, `${riskNum++}. PHYSICS INCONSISTENCY`);
    bodyText(doc, physFail.reason);
    if (accidentDetails.estimatedSpeedKmh) {
      labelValue(doc, "Estimated Speed (Physics)", `${accidentDetails.estimatedSpeedKmh} km/h`);
    }
    divider(doc);
  }

  // Fraud indicators
  if (fraudIndicators.length > 0) {
    subHeading(doc, `${riskNum++}. FRAUD RISK INDICATORS`);
    bodyText(doc, `Fraud Risk Level: ${fraudRiskLevel.toUpperCase()}  ·  Score: ${fraudRiskScore ?? "N/A"}/100`);
    for (const fi of fraudIndicators) bulletPoint(doc, fi, C.amber);
    divider(doc);
  }

  // Multi-event risk
  if (multiEvent?.is_multi_event) {
    subHeading(doc, `${riskNum++}. MULTI-EVENT INCIDENT`);
    const eventCount = multiEvent.events?.length ?? "multiple";
    bodyText(doc,
      `This claim involves a sequence of ${eventCount} distinct events ` +
      `(confidence: ${multiEvent.confidence ?? 0}%). Each event may have independent liability, ` +
      `subrogation, and damage apportionment implications.`
    );
    if (multiEvent.events?.length) {
      for (const ev of multiEvent.events) {
        bulletPoint(doc, `Event ${ev.event_order}: ${ev.event_type} — ${ev.description}`);
      }
    }
    divider(doc);
  }

  // Assumptions
  if (assumptions.length > 0) {
    subHeading(doc, `${riskNum++}. ASSUMPTIONS INTRODUCED`);
    bodyText(doc, "The following assumptions were made due to missing or ambiguous data:");
    for (const a of assumptions) bulletPoint(doc, a, C.amber);
  }

  if (riskNum === 1) {
    bodyText(doc, "No material risks were identified by the pipeline for this claim.");
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 3 — EVIDENCE STATUS
  // ══════════════════════════════════════════════════════════════════════════
  newPage("Evidence Status");
  sectionHeading(doc, "Evidence Status", "Document and photo evidence registry");

  // Photo status — use photoIngestionLog fields
  subHeading(doc, "Photographic Evidence");
  const pilOutcome = String(photoIngestionLog.overallOutcome ?? "").toLowerCase();
  const photosAvailable = pilOutcome === "photos_available" || (photoIngestionLog.finalTotalPhotoCount ?? 0) > 0;
  const totalPhotoCount = photoIngestionLog.finalTotalPhotoCount ?? photoIngestionLog.finalDamagePhotoCount ?? 0;
  const damagePhotoCount = photoIngestionLog.finalDamagePhotoCount ?? 0;

  labelValue(doc, "Photos Detected", photosAvailable ? `YES (${totalPhotoCount} total)` : "NO",
    photosAvailable ? C.green : C.red);
  labelValue(doc, "Damage Photos Extracted", damagePhotoCount > 0 ? `YES (${damagePhotoCount})` : "NO",
    damagePhotoCount > 0 ? C.green : C.red);
  labelValue(doc, "Vision Analysis Status", pilOutcome === "photos_available" ? "PROCESSED" : pilOutcome.toUpperCase() || "NOT PROCESSED",
    pilOutcome === "photos_available" ? C.green : C.amber);
  if (photoIngestionLog.summary) {
    bodyText(doc, String(photoIngestionLog.summary));
  }
  divider(doc);

  // Document checklist — use pipelineRunSummary.documentVerification
  subHeading(doc, "Document Checklist");
  const docVerification = (ps as any)?.documentVerification ?? {};
  const docStatus = docVerification.status ?? "";
  const keyFieldsDetected: string[] = docVerification.keyFieldsDetected ?? [];
  const missingCritical: string[] = docVerification.missingCriticalFields ?? [];

  if (docStatus) {
    labelValue(doc, "Document Verification", docStatus.toUpperCase(), statusColour(docStatus));
    if (docVerification.confidence != null) {
      labelValue(doc, "Confidence", `${docVerification.confidence}%`);
    }
    if (keyFieldsDetected.length > 0) {
      labelValue(doc, "Key Fields Detected", keyFieldsDetected.join(", "));
    }
    if (missingCritical.length > 0) {
      labelValue(doc, "Missing Critical Fields", missingCritical.join(", "), C.red);
    }
    if (docVerification.reason) {
      bodyText(doc, String(docVerification.reason));
    }
  } else {
    const docTypes = [
      { label: "Claim Form", key: "claimForm" },
      { label: "Police Report", key: "policeReport" },
      { label: "Repair Quotation", key: "repairQuote" },
      { label: "Driver's Licence", key: "driversLicence" },
      { label: "Vehicle Registration", key: "vehicleRegistration" },
      { label: "Insurance Policy", key: "insurancePolicy" },
    ];
    for (const dt of docTypes) {
      const present = docVerification[dt.key] ?? false;
      labelValue(doc, dt.label, present ? "SUBMITTED" : "NOT SUBMITTED",
        present ? C.green : C.red);
    }
  }
  divider(doc);

  // Evidence bundle summary — show the composite evidence strength
  if (Object.keys(evidenceBundle).length > 0) {
    subHeading(doc, "Evidence Bundle Summary");
    const bundleFields = ["damage", "physics", "fraud", "cost", "reconstruction", "composite"];
    for (const key of bundleFields) {
      const item = (evidenceBundle as any)[key];
      if (!item) continue;
      const label = key.charAt(0).toUpperCase() + key.slice(1);
      const strength = item.evidence_label ?? "N/A";
      const strengthPct = item.evidence_strength != null ? ` (${Math.round(item.evidence_strength * 100)}%)` : "";
      labelValue(doc, `${label} Evidence`, `${strength}${strengthPct}`, statusColour(strength));
    }
    if ((evidenceBundle as any).generated_at) {
      labelValue(doc, "Generated At", String((evidenceBundle as any).generated_at));
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PAGES 4–5 — TECHNICAL ANALYSIS
  // ══════════════════════════════════════════════════════════════════════════
  newPage("Technical Analysis — Incident & Physics");
  sectionHeading(doc, "Technical Analysis", "Incident reconstruction and physics validation");

  // Incident details
  subHeading(doc, "Incident Details");
  labelValue(doc, "Incident Type", val(accidentDetails.incidentType));
  labelValue(doc, "Incident Sub-type", val(accidentDetails.incidentSubType));
  labelValue(doc, "Collision Direction", val(accidentDetails.collisionDirection));
  labelValue(doc, "Impact Point", val(accidentDetails.impactPoint));
  labelValue(doc, "Weather Conditions", val(accidentDetails.weatherConditions));
  labelValue(doc, "Road Surface", val(accidentDetails.roadSurface));
  labelValue(doc, "Visibility", val(accidentDetails.visibilityConditions));
  labelValue(doc, "Time of Incident", val(accidentDetails.time));
  divider(doc);

  // Physics analysis
  subHeading(doc, "Physics Validation");
  labelValue(doc, "Estimated Speed", accidentDetails.estimatedSpeedKmh != null ? `${accidentDetails.estimatedSpeedKmh} km/h` : "Not calculated");
  labelValue(doc, "Max Crush Depth", accidentDetails.maxCrushDepthM != null ? `${accidentDetails.maxCrushDepthM} m` : "N/A");
  labelValue(doc, "Total Damage Area", accidentDetails.totalDamageAreaM2 != null ? `${accidentDetails.totalDamageAreaM2} m²` : "N/A");
  labelValue(doc, "Structural Damage", val(String(accidentDetails.structuralDamage ?? "Not assessed")));
  labelValue(doc, "Airbag Deployment", accidentDetails.airbagDeployment ? "YES" : "NO");
  labelValue(doc, "Physics Plausibility Score", pct(physicsScore));
  labelValue(doc, "Physics Verdict", physicsVerdict, statusColour(physicsVerdict));
  divider(doc);

  // Multi-event sequence
  if (multiEvent?.is_multi_event && multiEvent.events?.length) {
    subHeading(doc, "Multi-Event Incident Sequence");
    const eventCount = multiEvent.events.length;
    bodyText(doc, `${eventCount} distinct events detected with ${multiEvent.confidence ?? 0}% confidence.`);
    if (multiEvent.sequence_summary) {
      bodyText(doc, String(multiEvent.sequence_summary));
    }
    for (const ev of multiEvent.events) {
      doc
        .fillColor(C.black)
        .font("Helvetica-Bold")
        .fontSize(9)
        .text(`Event ${ev.event_order}: ${(ev.event_type ?? "").replace(/_/g, " ").toUpperCase()}`, 52, doc.y);
      doc
        .fillColor(C.black)
        .font("Helvetica")
        .fontSize(9)
        .text(val(ev.description), 64, doc.y, { width: doc.page.width - 104, lineGap: 2 });
      if (ev.causal_link) {
        // Strip leading punctuation artifacts
        const causalText = String(ev.causal_link).replace(/^[!'"\s]+/, "");
        doc
          .fillColor(C.grey)
          .font("Helvetica")
          .fontSize(8)
          .text(`→ ${causalText}`, 64, doc.y, { width: doc.page.width - 104 });
      }
      doc.moveDown(0.6);
    }
    divider(doc);
  }

  // Damage components — always start on a new page for the table
  if (damagedComponents.length > 0) {
    newPage("Technical Analysis — Damage Mapping");
    sectionHeading(doc, "Technical Analysis", "Damage component mapping");

    // Table header
    const cols = [40, 240, 360, 460];

    const drawDamageTableHeader = () => {
      const headerY = doc.y;
      doc.rect(40, headerY, doc.page.width - 80, 18).fill(C.offWhite);
      doc.fillColor(C.grey).font("Helvetica-Bold").fontSize(8);
      doc.text("COMPONENT", cols[0] + 4, headerY + 4, { width: 190 });
      doc.text("SEVERITY", cols[1] + 4, headerY + 4, { width: 110 });
      doc.text("DAMAGE TYPE", cols[2] + 4, headerY + 4, { width: 90 });
      doc.moveDown(1.4);
    };

    drawDamageTableHeader();

    for (const comp of damagedComponents) {
      // Start a new page if we're near the bottom (leave room for footer)
      ensureSpace(30);
      if (doc.y < 62) {
        // We just added a new page via ensureSpace, redraw section heading and table header
        sectionHeading(doc, "Technical Analysis", "Damage component mapping (continued)");
        drawDamageTableHeader();
      }
      const rowY = doc.y;
      const sevCol = statusColour(comp.severity ?? "");
      doc.fillColor(C.black).font("Helvetica").fontSize(8).text(comp.component, cols[0] + 4, rowY, { width: 190 });
      doc.fillColor(sevCol).font("Helvetica-Bold").fontSize(8).text(comp.severity, cols[1] + 4, rowY, { width: 110 });
      doc.fillColor(C.black).font("Helvetica").fontSize(8).text(comp.repairAction, cols[2] + 4, rowY, { width: 90 });
      doc.moveDown(0.65);
      doc
        .moveTo(40, doc.y - 2)
        .lineTo(doc.page.width - 40, doc.y - 2)
        .strokeColor(C.sectionLine)
        .lineWidth(0.3)
        .stroke();
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE — FINANCIAL ASSESSMENT
  // ══════════════════════════════════════════════════════════════════════════
  newPage("Financial Assessment");
  sectionHeading(doc, "Financial Assessment", "Cost analysis and repair decision logic");

  // Cost decision
  subHeading(doc, "Cost Decision");
  const costDecisionVerdict = val(costDecision.decision ?? costDecision.verdict ?? costDecision.cost_basis, "Pending");
  labelValue(doc, "Decision", costDecisionVerdict, decisionColour(costDecisionVerdict));

  // estimatedRepairCost is in cents — convert to dollars
  const repairCostDisplay = (() => {
    if (estimatedRepairCost == null) return "Not calculated";
    const num = Number(estimatedRepairCost);
    // If value is > 100000 it's likely in cents
    const usd = num > 100000 ? num / 100 : num;
    return `USD ${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  })();
  labelValue(doc, "Estimated Repair Cost", repairCostDisplay);

  // True cost from costDecision
  if (costDecision.true_cost_usd != null) {
    labelValue(doc, "Agreed / True Cost", `USD ${Number(costDecision.true_cost_usd).toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
  }
  if (costDecision.deviation_analysis?.highest_quote_usd != null) {
    labelValue(doc, "Highest Quote", `USD ${Number(costDecision.deviation_analysis.highest_quote_usd).toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
    labelValue(doc, "Quote Deviation", `${costDecision.deviation_analysis.optimised_vs_true_pct?.toFixed(1) ?? "N/A"}%`,
      Math.abs(costDecision.deviation_analysis.optimised_vs_true_pct ?? 0) > 20 ? C.amber : C.black);
  }
  divider(doc);

  // Cost breakdown
  if (costBreakdown.length > 0) {
    subHeading(doc, "Repair Cost Breakdown");
    const cols = [40, 340];
    const headerY = doc.y;
    doc.rect(40, headerY, doc.page.width - 80, 18).fill(C.offWhite);
    doc.fillColor(C.grey).font("Helvetica-Bold").fontSize(8);
    doc.text("DESCRIPTION", cols[0] + 4, headerY + 4, { width: 290 });
    doc.text("AMOUNT (USD)", cols[1] + 4, headerY + 4, { width: 140, align: "right" });
    doc.moveDown(1.4);

    let total = 0;
    for (const item of costBreakdown) {
      const rowY = doc.y;
      doc.fillColor(C.black).font("Helvetica").fontSize(8).text(val(item.description), cols[0] + 4, rowY, { width: 290 });
      const amt = Number(item.amount ?? 0);
      total += amt;
      doc.fillColor(C.black).font("Helvetica").fontSize(8).text(
        amt.toLocaleString("en-US", { minimumFractionDigits: 2 }),
        cols[1] + 4, rowY, { width: 140, align: "right" }
      );
      doc.moveDown(0.65);
      doc.moveTo(40, doc.y - 2).lineTo(doc.page.width - 40, doc.y - 2).strokeColor(C.sectionLine).lineWidth(0.3).stroke();
    }

    // Total row — save Y before rect fills it (rect.fill() doesn't change doc.y)
    const totalRowY = doc.y;
    doc.rect(40, totalRowY, doc.page.width - 80, 20).fill(C.black);
    doc.fillColor(C.white).font("Helvetica-Bold").fontSize(9)
      .text("TOTAL", 44, totalRowY + 5, { width: 290, lineBreak: false });
    doc.fillColor(C.white).font("Helvetica-Bold").fontSize(9).text(
      total.toLocaleString("en-US", { minimumFractionDigits: 2 }),
      cols[1] + 4, totalRowY + 5, { width: 140, align: "right", lineBreak: false }
    );
    doc.y = totalRowY + 24;
    doc.moveDown(0.5);
  }

  // Cost anomalies
  const costAnomalies: unknown[] = costDecision.anomalies ?? [];
  if (costAnomalies.length > 0) {
    divider(doc);
    subHeading(doc, "Cost Anomalies");
    for (const anomaly of costAnomalies) {
      if (typeof anomaly === "object" && anomaly !== null) {
        const a = anomaly as Record<string, unknown>;
        bulletPoint(doc, `[${String(a.category ?? "").toUpperCase()}] ${String(a.description ?? "")}`,
          String(a.severity ?? "").toLowerCase() === "critical" ? C.red : C.amber);
      }
    }
  }

  // Repair quote comparison — format cents values as currency
  const repairQuote = (fa as any)?.repairQuote ?? {};
  const repairQuoteKeys = Object.keys(repairQuote);
  if (repairQuoteKeys.length > 0) {
    divider(doc);
    subHeading(doc, "Repair Quote Analysis");
    const centsFields = new Set(["quoteTotalCents", "agreedCostCents", "totalCents", "partsCostCents", "labourCostCents", "paintCostCents"]);
    const friendlyLabels: Record<string, string> = {
      repairerName: "Repairer Name",
      repairerCompany: "Repairer Company",
      assessorName: "Assessor Name",
      quoteTotalCents: "Quote Total",
      agreedCostCents: "Agreed Cost",
      totalCents: "Total",
      partsCostCents: "Parts Cost",
      labourCostCents: "Labour Cost",
      paintCostCents: "Paint Cost",
    };
    for (const [k, v] of Object.entries(repairQuote)) {
      if (typeof v === "string" || typeof v === "number") {
        const label = friendlyLabels[k] ?? k.replace(/([A-Z])/g, " $1").replace(/cents$/i, "").trim();
        let displayVal = String(v);
        if (centsFields.has(k) && typeof v === "number") {
          displayVal = `USD ${(v / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
        }
        labelValue(doc, label, displayVal);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FINAL PAGE — AUDIT & SIGNATURE
  // ══════════════════════════════════════════════════════════════════════════
  newPage("Audit & Signature");
  sectionHeading(doc, "Audit & Signature", "Pipeline execution ledger and report certification");

  // Pipeline stage audit trail
  subHeading(doc, "Pipeline Execution Audit Trail");

  const stageLabels: Record<string, string> = {
    "1_ingestion": "Stage 1 — Document Ingestion",
    "2_extraction": "Stage 2 — Text & Image Extraction",
    "3_structured_extraction": "Stage 3 — Structured Data Extraction",
    "4_validation": "Stage 4 — Data Validation",
    "5_assembly": "Stage 5 — Evidence Assembly",
    "6_damage_analysis": "Stage 6 — Vision & Damage Analysis",
    "7_unified": "Stage 7 — Physics & Incident Classification",
    "8_fraud": "Stage 8 — Fraud Risk Assessment",
    "9_cost": "Stage 9 — Cost & Financial Analysis",
    "9b_turnaround": "Stage 9b — Turnaround Estimation",
    "10_report": "Stage 10 — Report Generation",
  };

  for (const [key, label] of Object.entries(stageLabels)) {
    const stage = stages[key] ?? {};
    const status = (stage.status ?? "NOT RUN").toUpperCase();
    const detail = stage.degradedReason ?? stage.blockedReason ?? stage.note ?? "";
    stageRow(doc, label, status, detail);
  }
  divider(doc);

  // Forensic execution ledger
  const fel = (fa as any)?.forensicExecutionLedger ?? {};
  if (Object.keys(fel).length > 0) {
    subHeading(doc, "Forensic Execution Ledger");
    for (const [k, v] of Object.entries(fel)) {
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        labelValue(doc, k.replace(/([A-Z])/g, " $1").trim(), String(v));
      }
    }
    divider(doc);
  }

  // Certification block
  subHeading(doc, "Report Certification");
  labelValue(doc, "Generated By", "KINGA AutoVerify AI — Forensic Decision Engine");
  labelValue(doc, "Generated At", dateStr);
  labelValue(doc, "Claim Reference", input.claimNumber);
  labelValue(doc, "FCDI Score", `${pct(fcdiScore)} — ${fcdiLabel}`);
  labelValue(doc, "Final Decision", decision.toUpperCase(), decisionColour(decision));
  labelValue(doc, "Report Status",
    decision.toUpperCase().includes("APPROVE") ? "APPROVED FOR SETTLEMENT" : "REQUIRES HUMAN REVIEW",
    decision.toUpperCase().includes("APPROVE") ? C.green : C.amber
  );

  doc.moveDown(1.5);

  // Signature lines
  const sigY = doc.y;
  const sigWidth = (doc.page.width - 120) / 2;
  doc.moveTo(40, sigY + 30).lineTo(40 + sigWidth, sigY + 30).strokeColor(C.black).lineWidth(0.5).stroke();
  doc.moveTo(doc.page.width - 40 - sigWidth, sigY + 30).lineTo(doc.page.width - 40, sigY + 30).strokeColor(C.black).lineWidth(0.5).stroke();
  doc.fillColor(C.grey).font("Helvetica").fontSize(8)
    .text("Authorised Adjuster Signature", 40, sigY + 34, { width: sigWidth, align: "center" });
  doc.fillColor(C.grey).font("Helvetica").fontSize(8)
    .text("Date", doc.page.width - 40 - sigWidth, sigY + 34, { width: sigWidth, align: "center" });

  doc.moveDown(3);

  // Disclaimer
  doc
    .rect(40, doc.y, doc.page.width - 80, 48)
    .fill(C.offWhite);
  doc
    .fillColor(C.grey)
    .font("Helvetica")
    .fontSize(7.5)
    .text(
      "DISCLAIMER: This report is generated by an AI-assisted forensic analysis system and is intended to support, not replace, " +
      "the judgement of a qualified human adjuster. All decisions must be reviewed and authorised by a licensed insurance professional " +
      "before any settlement, rejection, or payment is made. KINGA AutoVerify AI accepts no liability for decisions made solely on the " +
      "basis of this automated report.",
      44,
      doc.y - 40,
      { width: doc.page.width - 88, lineGap: 2 }
    );

  // ── Finalise ──────────────────────────────────────────────────────────────
  // Draw footer on the last page
  drawPageFooter(doc, pageNum);
  doc.end();
  }); // end Promise
}
