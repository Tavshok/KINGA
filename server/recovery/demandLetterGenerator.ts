// @ts-nocheck
/**
 * KINGA Subrogation — AI Demand Letter Generator
 *
 * Generates a formal, legally-structured subrogation demand letter on the
 * insurer's letterhead. The letter is:
 *   1. Drafted by the LLM using all available claim evidence
 *   2. Rendered as a professional HTML document with the insurer's branding
 *   3. Converted to PDF via Puppeteer
 *   4. Stored in S3 and the URL saved back to the recovery_cases record
 *
 * The output is a DRAFT — it must be reviewed and signed by an authorised
 * officer before being sent to the third party or their insurer.
 */

import { getDb } from "../db";
import { recoveryCases, claims, aiAssessments, insurerTenants, automationPolicies } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";
import { storagePut } from "../storage";
import puppeteer from "puppeteer-core";
import { randomBytes } from "crypto";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DemandLetterContext {
  // Insurer (sender)
  insurerName: string;
  insurerDisplayName: string;
  insurerLogoUrl?: string | null;
  insurerPrimaryColor: string;
  insurerAddress?: string;
  insurerPhone?: string;
  insurerEmail?: string;
  insurerFspNumber?: string;
  insurerRegistrationNumber?: string;
  currencyCode: string;
  currencySymbol: string;

  // Claim
  claimNumber: string;
  kingaRef?: string | null;
  policyNumber?: string | null;
  incidentDate?: string | null;
  incidentLocation?: string | null;
  incidentDescription?: string | null;
  vehicleRegistration?: string | null;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  vehicleYear?: number | null;
  policeReportNumber?: string | null;
  policeStation?: string | null;

  // Insured (our client)
  insuredName?: string | null;
  insuredIdNumber?: string | null;
  insuredPhone?: string | null;
  insuredEmail?: string | null;
  insuredAddress?: string | null;

  // Third party (recipient)
  thirdPartyName?: string | null;
  thirdPartyIdNumber?: string | null;
  thirdPartyAddress?: string | null;
  thirdPartyPhone?: string | null;
  thirdPartyRegistration?: string | null;
  thirdPartyInsurer?: string | null;
  thirdPartyInsurerAddress?: string | null;
  thirdPartyInsurerPhone?: string | null;
  thirdPartyPolicyNumber?: string | null;
  thirdPartyContactDetails?: string | null;
  recoveryTarget?: 'insurer' | 'individual' | 'unknown' | null;

  // Financial
  approvedSettlementAmountCents?: number | null;
  thirdPartyLiabilityPct?: number | null;
  recoveryAmountCents?: number | null;

  // AI causal verdict
  causalVerdictSummary?: string | null;
  wrongedParty?: string | null;

  // Recovery case
  recoveryCaseId: number;
  recoveryDeadline?: string | null;
  responseDays?: number | null;
}

// ─── LLM letter drafting ─────────────────────────────────────────────────────

async function draftLetterContent(ctx: DemandLetterContext): Promise<{
  recipientBlock: string;
  subject: string;
  openingParagraph: string;
  incidentNarrative: string;
  liabilitySection: string;
  quantumSection: string;
  demandSection: string;
  closingParagraph: string;
  letterDate: string;
}> {
  const today = new Date();
  const letterDate = today.toLocaleDateString("en-ZA", { day: "2-digit", month: "long", year: "numeric" });
  const responseDeadline = new Date(today.getTime() + (ctx.responseDays ?? 21) * 24 * 60 * 60 * 1000)
    .toLocaleDateString("en-ZA", { day: "2-digit", month: "long", year: "numeric" });

  const approvedAmount = ctx.approvedSettlementAmountCents
    ? `${ctx.currencyCode} ${(ctx.approvedSettlementAmountCents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`
    : "[AMOUNT TO BE CONFIRMED]";

  const recoveryAmount = ctx.recoveryAmountCents
    ? `${ctx.currencyCode} ${(ctx.recoveryAmountCents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`
    : ctx.thirdPartyLiabilityPct && ctx.approvedSettlementAmountCents
    ? `${ctx.currencyCode} ${((ctx.approvedSettlementAmountCents * ctx.thirdPartyLiabilityPct) / 10000).toLocaleString("en-ZA", { minimumFractionDigits: 2 })} (${ctx.thirdPartyLiabilityPct}% of ${approvedAmount})`
    : approvedAmount;

  const systemPrompt = `You are a senior legal drafting specialist at ${ctx.insurerDisplayName}, a licensed short-term insurer.
Your task is to draft the body sections of a formal subrogation demand letter.
The letter must be:
- Written in formal, professional legal English suitable for submission to another insurer or third party
- Factual, measured, and objective — never aggressive or accusatory
- Structured to clearly establish: (1) the incident facts, (2) liability, (3) quantum, and (4) the demand
- Compliant with standard insurance subrogation practice
- Free of fabricated facts — use only what is provided; use "[INFORMATION REQUIRED]" for missing details
- Approximately 600–900 words total across all sections

Return a JSON object with these exact keys:
{
  "recipientBlock": "Full recipient address block (name, company, address) — use available data, mark missing fields as [REQUIRED]",
  "subject": "RE: Subrogation Demand — [Claim/Reference details]",
  "openingParagraph": "Opening paragraph establishing who we are and the purpose of the letter",
  "incidentNarrative": "2–3 paragraphs describing the incident, vehicles involved, and circumstances",
  "liabilitySection": "1–2 paragraphs establishing third-party liability based on the causal verdict and evidence",
  "quantumSection": "1 paragraph detailing the quantum (approved settlement amount) and basis for recovery",
  "demandSection": "Formal demand paragraph stating the amount claimed, payment deadline (${responseDeadline}), and payment instructions placeholder",
  "closingParagraph": "Professional closing noting consequences of non-payment (legal proceedings) and invitation to respond"
}`;

  const userPrompt = `Draft a subrogation demand letter using the following claim data:

INSURER (SENDER): ${ctx.insurerDisplayName}
CLAIM NUMBER: ${ctx.claimNumber}
KINGA REFERENCE: ${ctx.kingaRef ?? "N/A"}
POLICY NUMBER: ${ctx.policyNumber ?? "N/A"}
INCIDENT DATE: ${ctx.incidentDate ?? "N/A"}
INCIDENT LOCATION: ${ctx.incidentLocation ?? "N/A"}
INCIDENT DESCRIPTION: ${ctx.incidentDescription ?? "N/A"}

OUR INSURED:
  Name: ${ctx.insuredName ?? "[REQUIRED]"}
  ID Number: ${ctx.insuredIdNumber ?? "N/A"}
  Vehicle: ${[ctx.vehicleYear, ctx.vehicleMake, ctx.vehicleModel].filter(Boolean).join(" ") || "N/A"}
  Registration: ${ctx.vehicleRegistration ?? "N/A"}

THIRD PARTY:
  Name: ${ctx.thirdPartyName ?? "[REQUIRED]"}
  Vehicle Registration: ${ctx.thirdPartyRegistration ?? "N/A"}
  Insurer: ${ctx.thirdPartyInsurer ?? "[REQUIRED]"}
  Policy Number: ${ctx.thirdPartyPolicyNumber ?? "N/A"}
  Contact: ${ctx.thirdPartyContactDetails ?? "N/A"}

POLICE REPORT: ${ctx.policeReportNumber ?? "N/A"} — ${ctx.policeStation ?? "N/A"}

AI CAUSAL VERDICT SUMMARY:
${ctx.causalVerdictSummary ?? "Causal analysis indicates third-party liability. Full forensic report available on request."}

WRONGED PARTY: ${ctx.wrongedParty === "insured" ? `Our insured (${ctx.insuredName ?? "the insured"})` : ctx.wrongedParty === "shared" ? "Shared liability" : "Third party at fault"}
THIRD-PARTY LIABILITY: ${ctx.thirdPartyLiabilityPct ?? 100}%

APPROVED SETTLEMENT AMOUNT: ${approvedAmount}
RECOVERY AMOUNT CLAIMED: ${recoveryAmount}

RECOVERY DEADLINE: ${ctx.recoveryDeadline ?? "3 years from incident date"}

Draft the letter sections now. Return only the JSON object.`;

  const response = await invokeLLM({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "demand_letter_sections",
        strict: true,
        schema: {
          type: "object",
          properties: {
            recipientBlock: { type: "string" },
            subject: { type: "string" },
            openingParagraph: { type: "string" },
            incidentNarrative: { type: "string" },
            liabilitySection: { type: "string" },
            quantumSection: { type: "string" },
            demandSection: { type: "string" },
            closingParagraph: { type: "string" },
          },
          required: ["recipientBlock", "subject", "openingParagraph", "incidentNarrative", "liabilitySection", "quantumSection", "demandSection", "closingParagraph"],
          additionalProperties: false,
        },
      },
    },
  });

  const raw = response?.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
  return { ...parsed, letterDate, responseDeadline };
}

// ─── HTML letterhead renderer ─────────────────────────────────────────────────

function renderLetterHTML(ctx: DemandLetterContext, sections: Awaited<ReturnType<typeof draftLetterContent>>): string {
  const primaryColor = ctx.insurerPrimaryColor ?? "#10b981";
  const logoHtml = ctx.insurerLogoUrl
    ? `<img src="${ctx.insurerLogoUrl}" alt="${ctx.insurerDisplayName}" style="max-height:60px;max-width:200px;object-fit:contain;" />`
    : `<div style="font-size:22px;font-weight:700;color:${primaryColor};">${ctx.insurerDisplayName}</div>`;

  const para = (text: string) => text
    .split(/\n+/)
    .filter(l => l.trim())
    .map(l => `<p style="margin:0 0 12px 0;line-height:1.7;">${l.trim()}</p>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Subrogation Demand Letter — ${ctx.claimNumber}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 11pt;
    color: #1a1a1a;
    background: #fff;
    padding: 0;
  }
  .page {
    width: 210mm;
    min-height: 297mm;
    margin: 0 auto;
    padding: 20mm 22mm 20mm 22mm;
    background: #fff;
  }
  /* ── Letterhead ── */
  .letterhead {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 3px solid ${primaryColor};
    padding-bottom: 14px;
    margin-bottom: 20px;
  }
  .letterhead-left { flex: 1; }
  .letterhead-right {
    text-align: right;
    font-size: 9pt;
    color: #555;
    line-height: 1.6;
    max-width: 220px;
  }
  /* ── Draft watermark ── */
  .draft-banner {
    background: #fff8e1;
    border: 1.5px solid #f59e0b;
    border-radius: 4px;
    padding: 8px 14px;
    margin-bottom: 18px;
    font-size: 9pt;
    color: #92400e;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .draft-banner strong { font-size: 10pt; }
  /* ── Reference block ── */
  .ref-block {
    background: #f8fafc;
    border-left: 4px solid ${primaryColor};
    padding: 10px 14px;
    margin-bottom: 20px;
    font-size: 9.5pt;
  }
  .ref-block table { width: 100%; border-collapse: collapse; }
  .ref-block td { padding: 2px 8px 2px 0; vertical-align: top; }
  .ref-block td:first-child { font-weight: 600; width: 160px; color: #444; }
  /* ── Date & recipient ── */
  .letter-date { margin-bottom: 18px; font-size: 10.5pt; }
  .recipient-block {
    margin-bottom: 22px;
    font-size: 10.5pt;
    line-height: 1.6;
    white-space: pre-line;
  }
  /* ── Subject line ── */
  .subject-line {
    font-weight: 700;
    font-size: 11pt;
    margin-bottom: 18px;
    text-decoration: underline;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  /* ── Body ── */
  .body-section { margin-bottom: 18px; }
  .section-heading {
    font-weight: 700;
    font-size: 10.5pt;
    margin-bottom: 8px;
    color: #222;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  p { margin: 0 0 12px 0; line-height: 1.7; }
  /* ── Signature block ── */
  .signature-block {
    margin-top: 32px;
    border-top: 1px solid #ddd;
    padding-top: 18px;
    font-size: 10pt;
  }
  .sig-line {
    border-bottom: 1px solid #333;
    width: 200px;
    margin: 30px 0 6px 0;
  }
  /* ── Footer ── */
  .footer {
    margin-top: 30px;
    border-top: 2px solid ${primaryColor};
    padding-top: 10px;
    font-size: 8pt;
    color: #777;
    text-align: center;
    line-height: 1.5;
  }
  @media print {
    body { padding: 0; }
    .page { padding: 15mm 18mm; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- Letterhead -->
  <div class="letterhead">
    <div class="letterhead-left">
      ${logoHtml}
      ${ctx.insurerFspNumber ? `<div style="font-size:8.5pt;color:#666;margin-top:4px;">FSP No. ${ctx.insurerFspNumber}</div>` : ""}
      ${ctx.insurerRegistrationNumber ? `<div style="font-size:8.5pt;color:#666;">Reg. No. ${ctx.insurerRegistrationNumber}</div>` : ""}
    </div>
    <div class="letterhead-right">
      ${ctx.insurerAddress ? `${ctx.insurerAddress}<br/>` : ""}
      ${ctx.insurerPhone ? `Tel: ${ctx.insurerPhone}<br/>` : ""}
      ${ctx.insurerEmail ? `Email: ${ctx.insurerEmail}` : ""}
    </div>
  </div>

  <!-- Draft watermark -->
  <div class="draft-banner">
    <strong>⚠ DRAFT — FOR REVIEW ONLY</strong>
    &nbsp;This document is an AI-generated draft and must be reviewed, amended if necessary, and signed by an authorised officer before dispatch. It does not constitute legal advice.
  </div>

  <!-- Reference block -->
  <div class="ref-block">
    <table>
      <tr><td>Our Reference:</td><td>${ctx.claimNumber}${ctx.kingaRef ? ` / ${ctx.kingaRef}` : ""}</td></tr>
      ${ctx.policyNumber ? `<tr><td>Policy Number:</td><td>${ctx.policyNumber}</td></tr>` : ""}
      <tr><td>Recovery Case:</td><td>RC-${ctx.recoveryCaseId}</td></tr>
      <tr><td>Date of Loss:</td><td>${ctx.incidentDate ? new Date(ctx.incidentDate).toLocaleDateString("en-ZA", { day: "2-digit", month: "long", year: "numeric" }) : "N/A"}</td></tr>
      ${ctx.policeReportNumber ? `<tr><td>Police Report:</td><td>${ctx.policeReportNumber}</td></tr>` : ""}
    </table>
  </div>

  <!-- Date -->
  <div class="letter-date">${sections.letterDate}</div>

  <!-- Recipient -->
  <div class="recipient-block">${sections.recipientBlock}</div>

  <!-- Subject -->
  <div class="subject-line">${sections.subject}</div>

  <!-- Dear -->
  <p>Dear Sir/Madam,</p>

  <!-- Opening -->
  <div class="body-section">
    ${para(sections.openingParagraph)}
  </div>

  <!-- Incident narrative -->
  <div class="body-section">
    <div class="section-heading">1. Circumstances of the Incident</div>
    ${para(sections.incidentNarrative)}
  </div>

  <!-- Liability -->
  <div class="body-section">
    <div class="section-heading">2. Liability</div>
    ${para(sections.liabilitySection)}
  </div>

  <!-- Quantum -->
  <div class="body-section">
    <div class="section-heading">3. Quantum</div>
    ${para(sections.quantumSection)}
  </div>

  <!-- Demand -->
  <div class="body-section">
    <div class="section-heading">4. Demand</div>
    ${para(sections.demandSection)}
  </div>

  <!-- Closing -->
  <div class="body-section">
    ${para(sections.closingParagraph)}
  </div>

  <!-- Signature block -->
  <div class="signature-block">
    <p>Yours faithfully,</p>
    <div class="sig-line"></div>
    <p><strong>_____________________________</strong></p>
    <p>Authorised Signatory<br/>${ctx.insurerDisplayName}<br/>Recovery &amp; Subrogation Department</p>
    <p style="margin-top:12px;font-size:9pt;color:#666;">
      <em>This letter was prepared with the assistance of KINGA Intelligence (Recovery Case RC-${ctx.recoveryCaseId}).
      It constitutes a draft only and requires review and authorisation before dispatch.</em>
    </p>
  </div>

  <!-- Footer -->
  <div class="footer">
    ${ctx.insurerDisplayName} is an authorised financial services provider.
    ${ctx.insurerFspNumber ? `FSP No. ${ctx.insurerFspNumber}.` : ""}
    ${ctx.insurerRegistrationNumber ? `Reg. No. ${ctx.insurerRegistrationNumber}.` : ""}
    All correspondence is subject to the insurer's standard terms and conditions.
  </div>

</div>
</body>
</html>`;
}

// ─── PDF generation ───────────────────────────────────────────────────────────

async function generatePDF(html: string): Promise<Buffer> {
  let browser: any = null;
  try {
    browser = await puppeteer.launch({
      executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      headless: true,
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    return Buffer.from(pdfBuffer);
  } finally {
    if (browser) await browser.close();
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function generateDemandLetter(recoveryCaseId: number): Promise<{
  downloadUrl: string;
  s3Key: string;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 1. Load recovery case + claim + KINGA assessment + insurer tenant
  const [rcRow] = await db
    .select()
    .from(recoveryCases)
    .where(eq(recoveryCases.id, recoveryCaseId))
    .limit(1);
  if (!rcRow) throw new Error("Recovery case not found");

  const [claimRow] = await db
    .select()
    .from(claims)
    .where(eq(claims.id, rcRow.claimId))
    .limit(1);
  if (!claimRow) throw new Error("Associated claim not found");

  const [assessmentRow] = await db
    .select()
    .from(aiAssessments)
    .where(eq(aiAssessments.claimId, rcRow.claimId))
    .orderBy(aiAssessments.id)
    .limit(1);

  const [tenantRow] = await db
    .select()
    .from(insurerTenants)
    .where(eq(insurerTenants.id, rcRow.tenantId))
    .limit(1);

  // 1b. Load active automation policy for configurable response deadline
  const [policyRow] = await db
    .select({ demandLetterResponseDays: automationPolicies.demandLetterResponseDays })
    .from(automationPolicies)
    .where(and(eq(automationPolicies.tenantId, rcRow.tenantId), eq(automationPolicies.isActive, 1)))
    .orderBy(automationPolicies.id)
    .limit(1);
  const responseDays = policyRow?.demandLetterResponseDays ?? 21;
  // 2. Parse causal verdict for summary
  let causalVerdictSummary: string | null = null;
  if (assessmentRow?.causalVerdictJson) {
    try {
      const cv = JSON.parse(assessmentRow.causalVerdictJson);
      causalVerdictSummary = cv?.summary ?? cv?.narrative ?? cv?.explanation ?? null;
    } catch { /* ignore */ }
  }

  // 3. Build context
  const ctx: DemandLetterContext = {
    insurerName: tenantRow?.name ?? rcRow.tenantId,
    insurerDisplayName: tenantRow?.displayName ?? tenantRow?.name ?? rcRow.tenantId,
    insurerLogoUrl: tenantRow?.logoUrl,
    insurerPrimaryColor: tenantRow?.primaryColor ?? "#10b981",
    currencyCode: rcRow.currencyCode ?? tenantRow?.primaryCurrency ?? "USD",
    currencySymbol: tenantRow?.primaryCurrencySymbol ?? "US$",

    claimNumber: claimRow.claimNumber,
    kingaRef: claimRow.kingaRef,
    policyNumber: claimRow.policyNumber,
    incidentDate: claimRow.incidentDate,
    incidentLocation: claimRow.incidentLocation,
    incidentDescription: claimRow.incidentDescription,
    vehicleRegistration: claimRow.vehicleRegistration,
    vehicleMake: claimRow.vehicleMake,
    vehicleModel: claimRow.vehicleModel,
    vehicleYear: claimRow.vehicleYear,
    policeReportNumber: claimRow.policeReportNumber ?? rcRow.thirdPartyPolicyNumber,
    policeStation: claimRow.policeStation,

    insuredName: claimRow.lodgerName ?? claimRow.vehicleOwnerName,
    insuredIdNumber: claimRow.claimantIdNumber,
    insuredPhone: claimRow.claimantPhone ?? claimRow.lodgerPhone,
    insuredEmail: claimRow.claimantEmail ?? claimRow.lodgerEmail,
    insuredAddress: claimRow.claimantAddress,

    thirdPartyName: rcRow.thirdPartyName ?? claimRow.thirdPartyName,
    thirdPartyIdNumber: (rcRow as any).thirdPartyIdNumber ?? null,
    thirdPartyAddress: (rcRow as any).thirdPartyAddress ?? null,
    thirdPartyPhone: (rcRow as any).thirdPartyPhone ?? null,
    thirdPartyRegistration: rcRow.thirdPartyRegistration ?? claimRow.thirdPartyRegistration,
    thirdPartyInsurer: rcRow.thirdPartyInsurer ?? claimRow.thirdPartyInsurer,
    thirdPartyInsurerAddress: (rcRow as any).thirdPartyInsurerAddress ?? null,
    thirdPartyInsurerPhone: (rcRow as any).thirdPartyInsurerPhone ?? null,
    thirdPartyPolicyNumber: rcRow.thirdPartyPolicyNumber,
    thirdPartyContactDetails: rcRow.thirdPartyContactDetails,
    recoveryTarget: (rcRow as any).recoveryTarget ?? null,

    approvedSettlementAmountCents: rcRow.approvedSettlementAmount,
    thirdPartyLiabilityPct: rcRow.thirdPartyLiabilityPct,
    recoveryAmountCents: rcRow.recoveredAmount,

    causalVerdictSummary,
    wrongedParty: rcRow.wrongedParty,

    recoveryCaseId,
    recoveryDeadline: rcRow.recoveryDeadline,
    responseDays,
  };

  // 4. Draft letter content via LLM
  const sections = await draftLetterContent(ctx);

  // 5. Render HTML
  const html = renderLetterHTML(ctx, sections);

  // 6. Generate PDF
  const pdfBuffer = await generatePDF(html);

  // 7. Upload to S3
  const suffix = randomBytes(6).toString("hex");
  const s3Key = `recovery/${rcRow.tenantId}/demand-letters/RC-${recoveryCaseId}-${suffix}.pdf`;
  const { url } = await storagePut(s3Key, pdfBuffer, "application/pdf");

  // 8. Save URL back to recovery case
  await db.update(recoveryCases)
    .set({
      demandLetterS3Key: s3Key,
      demandLetterUrl: url,
      aiDemandLetterJson: JSON.stringify({ sections, generatedAt: new Date().toISOString() }),
    })
    .where(eq(recoveryCases.id, recoveryCaseId));

  return { downloadUrl: url, s3Key };
}
