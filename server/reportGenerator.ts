// @ts-nocheck
/**
 * KINGA AutoVerify AI — PDF Report Generator
 *
 * Design spec:
 *   Cover page  : #0f0e0c dark background, KINGA in electric lime, white subtitle
 *   Body pages  : white (#ffffff) background, near-black text (#0f0e0c)
 *   Typography  : Syne Bold (headings), Georgia Italic (narrative), JetBrains Mono (all numbers/codes)
 *   Colour      : only in charts, gauges, status badges, and the decision banner
 *   Section eyebrow: 2pt lime (#e8f542) rule above each major section title
 *
 * Tier depth:
 *   process  → sections 1–7 + 10 + 12 (Cover, Decision Banner, KPI Strip, Claim Identity,
 *               Damage Analysis, Fraud Score summary, Assessor Checklist, Determination, Footer)
 *   protect  → all process + Cost Assessment + Full Fraud Breakdown + Photo Forensics
 *   prove    → all protect + Physics Reconstruction + Quote Optimisation + IPEC package
 */

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  pdf,
} from "@react-pdf/renderer";

// ── Colour constants ────────────────────────────────────────────────────────
const C = {
  // Cover
  coverBg: "#0f0e0c",
  lime: "#e8f542",
  // Body
  white: "#ffffff",
  bodyBg: "#ffffff",
  cardBg: "#f7f7f7",
  nearBlack: "#0f0e0c",
  textPrimary: "#0f0e0c",
  textSecondary: "#555550",
  textMuted: "#888884",
  border: "#d4d1cc",
  tableHeader: "#1a1a1a",
  tableHeaderText: "#ffffff",
  tableRowAlt: "#f5f5f5",
  // Signal
  teal: "#2dd4a0",
  amber: "#f5a623",
  red: "#f54242",
  blue: "#4287f5",
  // Row tints
  rowFraud: "rgba(245,66,66,0.06)",
  rowCaution: "rgba(245,166,35,0.06)",
  rowClean: "rgba(45,212,160,0.06)",
};

// ── Styles ──────────────────────────────────────────────────────────────────
const cover = StyleSheet.create({
  page: {
    backgroundColor: C.coverBg,
    padding: 0,
    fontFamily: "Helvetica",
  },
  accentStrip: {
    height: 6,
    backgroundColor: C.teal,
    width: "100%",
  },
  body: {
    flex: 1,
    padding: 60,
    justifyContent: "space-between",
  },
  logoArea: {
    marginBottom: 60,
  },
  logoText: {
    fontSize: 52,
    fontFamily: "Helvetica-Bold",
    color: C.lime,
    letterSpacing: -1.5,
  },
  tagline: {
    fontSize: 11,
    color: "#9e9a94",
    letterSpacing: 3,
    marginTop: 4,
    fontFamily: "Helvetica",
  },
  titleArea: {
    flex: 1,
    justifyContent: "center",
  },
  reportType: {
    fontSize: 9,
    color: C.lime,
    letterSpacing: 3,
    fontFamily: "Helvetica",
    marginBottom: 12,
  },
  reportTitle: {
    fontSize: 36,
    fontFamily: "Helvetica-Bold",
    color: "#f0ece4",
    lineHeight: 1.2,
    letterSpacing: -0.5,
  },
  claimRef: {
    fontSize: 14,
    fontFamily: "Helvetica",
    color: "#9e9a94",
    marginTop: 16,
    letterSpacing: 1,
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 24,
    marginTop: 40,
    paddingTop: 24,
    borderTop: `1px solid #252320`,
  },
  metaItem: {
    minWidth: 120,
  },
  metaLabel: {
    fontSize: 8,
    color: "#9e9a94",
    letterSpacing: 2,
    fontFamily: "Helvetica",
    marginBottom: 3,
  },
  metaValue: {
    fontSize: 11,
    color: "#f0ece4",
    fontFamily: "Helvetica",
  },
  footer: {
    borderTop: `1px solid #252320`,
    paddingTop: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  footerLeft: {
    fontSize: 8,
    color: "#555550",
    fontFamily: "Helvetica",
    lineHeight: 1.5,
  },
  tierBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 2,
    backgroundColor: "#1a1916",
    borderWidth: 1,
    borderColor: "#363330",
  },
  tierBadgeText: {
    fontSize: 8,
    color: C.lime,
    letterSpacing: 2,
    fontFamily: "Helvetica",
  },
});

const body = StyleSheet.create({
  page: {
    backgroundColor: C.white,
    paddingTop: 48,
    paddingBottom: 48,
    paddingHorizontal: 48,
    fontFamily: "Helvetica",
  },
  // Header bar on each body page
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
    paddingBottom: 10,
    borderBottom: `1px solid ${C.border}`,
  },
  pageHeaderLeft: {
    fontSize: 8,
    color: C.textMuted,
    fontFamily: "Helvetica",
    letterSpacing: 1,
  },
  pageHeaderRight: {
    fontSize: 8,
    color: C.textMuted,
    fontFamily: "Helvetica",
  },
  // Section eyebrow
  sectionEyebrow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    marginTop: 24,
  },
  eyebrowRule: {
    width: 24,
    height: 2,
    backgroundColor: C.lime,
    marginRight: 8,
  },
  eyebrowText: {
    fontSize: 8,
    color: C.lime,
    letterSpacing: 3,
    fontFamily: "Helvetica",
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: C.nearBlack,
    letterSpacing: -0.3,
    marginBottom: 12,
  },
  // Decision banner
  decisionBanner: {
    backgroundColor: C.nearBlack,
    padding: 24,
    marginBottom: 24,
    borderRadius: 2,
  },
  decisionLabel: {
    fontSize: 8,
    color: "#9e9a94",
    letterSpacing: 3,
    fontFamily: "Helvetica",
    marginBottom: 8,
  },
  decisionVerdict: {
    fontSize: 32,
    fontFamily: "Helvetica-Bold",
    letterSpacing: -0.5,
  },
  decisionAmount: {
    fontSize: 20,
    fontFamily: "Helvetica",
    color: "#f0ece4",
    marginTop: 8,
  },
  decisionNote: {
    fontSize: 10,
    color: "#9e9a94",
    fontFamily: "Helvetica",
    marginTop: 6,
    fontStyle: "italic",
  },
  // KPI strip
  kpiStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 0,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: C.border,
  },
  kpiCard: {
    flex: 1,
    minWidth: 80,
    padding: 12,
    borderRight: `1px solid ${C.border}`,
  },
  kpiLabel: {
    fontSize: 7,
    color: C.textMuted,
    letterSpacing: 2,
    fontFamily: "Helvetica",
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: C.nearBlack,
  },
  kpiSub: {
    fontSize: 8,
    color: C.textSecondary,
    fontFamily: "Helvetica",
    marginTop: 2,
  },
  // Tables
  table: {
    width: "100%",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: C.tableHeader,
    padding: 0,
  },
  tableHeaderCell: {
    flex: 1,
    padding: 6,
    fontSize: 7,
    color: C.tableHeaderText,
    fontFamily: "Helvetica",
    letterSpacing: 1,
  },
  tableRow: {
    flexDirection: "row",
    borderBottom: `1px solid ${C.border}`,
  },
  tableRowAlt: {
    flexDirection: "row",
    borderBottom: `1px solid ${C.border}`,
    backgroundColor: C.tableRowAlt,
  },
  tableCell: {
    flex: 1,
    padding: 6,
    fontSize: 9,
    color: C.textPrimary,
    fontFamily: "Helvetica",
  },
  tableCellMono: {
    flex: 1,
    padding: 6,
    fontSize: 9,
    color: C.textPrimary,
    fontFamily: "Helvetica",
  },
  // Status badges
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 2,
    alignSelf: "flex-start",
  },
  badgeText: {
    fontSize: 7,
    fontFamily: "Helvetica",
    letterSpacing: 1,
  },
  // Narrative blockquote
  blockquote: {
    borderLeft: `3px solid ${C.border}`,
    paddingLeft: 12,
    marginVertical: 12,
    backgroundColor: C.cardBg,
    padding: 12,
  },
  blockquoteText: {
    fontSize: 10,
    color: C.textSecondary,
    fontFamily: "Helvetica-Oblique",
    lineHeight: 1.6,
    fontStyle: "italic",
  },
  // Two-column layout
  twoCol: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 16,
  },
  col: {
    flex: 1,
  },
  // Disclaimer
  disclaimer: {
    marginTop: 24,
    padding: 12,
    backgroundColor: C.cardBg,
    borderWidth: 1,
    borderColor: C.border,
  },
  disclaimerText: {
    fontSize: 8,
    color: C.textMuted,
    fontFamily: "Helvetica-Oblique",
    lineHeight: 1.5,
    fontStyle: "italic",
  },
  // Page footer
  pageFooter: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTop: `1px solid ${C.border}`,
    paddingTop: 8,
  },
  pageFooterText: {
    fontSize: 7,
    color: C.textMuted,
    fontFamily: "Helvetica",
  },
  // Info row
  infoRow: {
    flexDirection: "row",
    marginBottom: 6,
  },
  infoLabel: {
    width: 140,
    fontSize: 9,
    color: C.textMuted,
    fontFamily: "Helvetica",
  },
  infoValue: {
    flex: 1,
    fontSize: 9,
    color: C.textPrimary,
    fontFamily: "Helvetica",
  },
  infoValueMono: {
    flex: 1,
    fontSize: 9,
    color: C.textPrimary,
    fontFamily: "Helvetica",
  },
});

// ── Helpers ─────────────────────────────────────────────────────────────────
function fmt(val: any, fallback = "—"): string {
  if (val === null || val === undefined || val === "") return fallback;
  return String(val);
}

function fmtCurrency(val: any, currency = "USD"): string {
  if (val === null || val === undefined) return "—";
  const num = typeof val === "string" ? parseFloat(val) : Number(val);
  if (isNaN(num)) return "—";
  return `${currency} ${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(val: any): string {
  if (!val) return "—";
  try {
    return new Date(val).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch { return String(val); }
}

function fmtDatetime(val: any): string {
  if (!val) return "—";
  try {
    return new Date(val).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return String(val); }
}

function verdictColour(rec: string | null | undefined): string {
  if (!rec) return "#f0ece4";
  const r = rec.toUpperCase();
  if (r.includes("APPROVE")) return C.teal;
  if (r.includes("REJECT")) return C.red;
  if (r.includes("NEGOTIATE") || r.includes("REVIEW") || r.includes("ESCALATE")) return C.amber;
  return "#f0ece4";
}

function fraudColour(score: number | null | undefined): string {
  if (!score) return C.textMuted;
  if (score <= 35) return C.teal;
  if (score <= 60) return C.amber;
  return C.red;
}

function riskBadgeColour(level: string | null | undefined): string {
  if (!level) return C.textMuted;
  const l = level.toLowerCase();
  if (l === "low") return C.teal;
  if (l === "medium" || l === "moderate") return C.amber;
  if (l === "high" || l === "critical" || l === "elevated") return C.red;
  return C.textMuted;
}

function workflowLabel(state: string | null | undefined): string {
  if (!state) return "—";
  return state.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function tierLabel(tier: string): string {
  if (tier === "process") return "TIER 1 · PROCESS";
  if (tier === "protect") return "TIER 2 · PROTECT";
  if (tier === "prove") return "TIER 3 · PROVE";
  return tier.toUpperCase();
}

function reportTypeLabel(type: string): string {
  const map: Record<string, string> = {
    claims_assessment: "Claims Assessment Report",
    portfolio_summary: "Portfolio Summary Report",
    fraud_intelligence: "Fraud Intelligence Brief",
    executive_summary: "Executive Summary Report",
    risk_portfolio: "Risk Portfolio Analysis",
    processor_performance: "Processor Performance Report",
    assessor_performance: "Assessor Performance Report",
    panel_beater_performance: "Panel Beater Performance Report",
  };
  return map[type] ?? type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ── Shared sub-components ───────────────────────────────────────────────────
function SectionHeader({ number, title }: { number: string; title: string }) {
  return React.createElement(View, null,
    React.createElement(View, { style: body.sectionEyebrow },
      React.createElement(View, { style: body.eyebrowRule }),
      React.createElement(Text, { style: body.eyebrowText }, `${number} — ${title.toUpperCase()}`)
    )
  );
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return React.createElement(View, { style: body.infoRow },
    React.createElement(Text, { style: body.infoLabel }, label),
    React.createElement(Text, { style: mono ? body.infoValueMono : body.infoValue }, value)
  );
}

function StatusBadge({ label, colour }: { label: string; colour: string }) {
  return React.createElement(View, { style: [body.badge, { backgroundColor: colour + "20", borderWidth: 1, borderColor: colour + "60" }] },
    React.createElement(Text, { style: [body.badgeText, { color: colour }] }, label.toUpperCase())
  );
}

function PageFooter({ reportId, tier, page }: { reportId: string; tier: string; page: string }) {
  return React.createElement(View, { style: body.pageFooter },
    React.createElement(Text, { style: body.pageFooterText }, `REPORT ID: ${reportId}  ·  ${tierLabel(tier)}  ·  KINGA AUTOVERIFY AI`),
    React.createElement(Text, { style: body.pageFooterText }, `CONFIDENTIAL — FOR INSURER USE ONLY  ·  PAGE ${page}`)
  );
}

// ── Cover Page ───────────────────────────────────────────────────────────────
function CoverPage({ claim, reportType, tier, reportId, generatedAt }: any) {
  const rec = claim?.aiRecommendation ?? claim?.recommendation;
  return React.createElement(Page, { size: "A4", style: cover.page },
    React.createElement(View, { style: cover.accentStrip }),
    React.createElement(View, { style: cover.body },
      // Logo
      React.createElement(View, { style: cover.logoArea },
        React.createElement(Text, { style: cover.logoText }, "KINGA"),
        React.createElement(Text, { style: cover.tagline }, "AUTOVERIFY AI  ·  MOTOR INSURANCE INTELLIGENCE")
      ),
      // Title
      React.createElement(View, { style: cover.titleArea },
        React.createElement(Text, { style: cover.reportType }, `── ${reportTypeLabel(reportType).toUpperCase()}`),
        React.createElement(Text, { style: cover.reportTitle },
          claim ? `${fmt(claim.claimantName ?? "Claimant")}` : "Portfolio Report"
        ),
        claim && React.createElement(Text, { style: cover.claimRef },
          `CLAIM REF: ${fmt(claim.claimNumber)}  ·  ${fmt(claim.vehicleMake)} ${fmt(claim.vehicleModel)} ${fmt(claim.vehicleYear)}`
        ),
        // Meta grid
        React.createElement(View, { style: cover.metaGrid },
          claim && React.createElement(View, { style: cover.metaItem },
            React.createElement(Text, { style: cover.metaLabel }, "INCIDENT DATE"),
            React.createElement(Text, { style: cover.metaValue }, fmtDate(claim.incidentDate))
          ),
          claim && React.createElement(View, { style: cover.metaItem },
            React.createElement(Text, { style: cover.metaLabel }, "CLAIMED AMOUNT"),
            React.createElement(Text, { style: cover.metaValue }, fmtCurrency(claim.estimatedClaimValue, claim.currencyCode ?? "USD"))
          ),
          claim && React.createElement(View, { style: cover.metaItem },
            React.createElement(Text, { style: cover.metaLabel }, "AI RECOMMENDATION"),
            React.createElement(Text, { style: [cover.metaValue, { color: verdictColour(rec) }] }, fmt(rec, "PENDING"))
          ),
          React.createElement(View, { style: cover.metaItem },
            React.createElement(Text, { style: cover.metaLabel }, "GENERATED"),
            React.createElement(Text, { style: cover.metaValue }, fmtDatetime(generatedAt))
          ),
        )
      ),
      // Footer
      React.createElement(View, { style: cover.footer },
        React.createElement(Text, { style: cover.footerLeft },
          `Report ID: ${reportId}\nKINGA provides decision-support intelligence only.\nThe insurer's designated reviewer validates all determinations.`
        ),
        React.createElement(View, { style: cover.tierBadge },
          React.createElement(Text, { style: cover.tierBadgeText }, tierLabel(tier))
        )
      )
    )
  );
}

// ── Decision Banner Page ─────────────────────────────────────────────────────
function DecisionBannerSection({ claim, assessment }: any) {
  const rec = assessment?.recommendation ?? claim?.aiRecommendation ?? "PENDING";
  const colour = verdictColour(rec);
  const approvedAmt = claim?.finalApprovedAmount;
  const estimatedAmt = claim?.estimatedClaimValue;
  const currency = claim?.currencyCode ?? "USD";
  const saving = (estimatedAmt && approvedAmt)
    ? parseFloat(estimatedAmt) - parseFloat(approvedAmt)
    : null;

  return React.createElement(View, { style: body.decisionBanner },
    React.createElement(Text, { style: body.decisionLabel }, "── AI RECOMMENDATION"),
    React.createElement(Text, { style: [body.decisionVerdict, { color: colour }] }, rec.toUpperCase()),
    approvedAmt && React.createElement(Text, { style: body.decisionAmount },
      `Recommended Settlement: ${fmtCurrency(approvedAmt, currency)}`
    ),
    saving && saving > 0 && React.createElement(Text, { style: body.decisionNote },
      `KINGA identified a saving of ${fmtCurrency(saving, currency)} against the submitted claim value.`
    ),
    React.createElement(Text, { style: [body.decisionNote, { marginTop: 12 }] },
      "KINGA provides decision-support intelligence only. The insurer's designated reviewer validates all determinations. The insurer owns the conclusion."
    )
  );
}

// ── KPI Strip ────────────────────────────────────────────────────────────────
function KpiStrip({ claim, assessment }: any) {
  const kpis = [
    { label: "AI CONFIDENCE", value: assessment?.confidenceScore ? `${assessment.confidenceScore}%` : "—" },
    { label: "FRAUD SCORE", value: assessment?.fraudScore ? String(assessment.fraudScore) : "—", colour: fraudColour(assessment?.fraudScore) },
    { label: "CLAIMED AMOUNT", value: fmtCurrency(claim?.estimatedClaimValue, claim?.currencyCode ?? "USD") },
    { label: "APPROVED AMOUNT", value: fmtCurrency(claim?.finalApprovedAmount, claim?.currencyCode ?? "USD"), colour: C.teal },
    { label: "CYCLE DAYS", value: (claim?.createdAt && claim?.closedAt) ? String(Math.round((new Date(claim.closedAt).getTime() - new Date(claim.createdAt).getTime()) / 86400000)) : "OPEN" },
    { label: "WORKFLOW STATE", value: workflowLabel(claim?.workflowState) },
  ];

  return React.createElement(View, { style: body.kpiStrip },
    ...kpis.map((k, i) =>
      React.createElement(View, { key: i, style: [body.kpiCard, i === kpis.length - 1 ? { borderRight: "none" } : {}] },
        React.createElement(Text, { style: body.kpiLabel }, k.label),
        React.createElement(Text, { style: [body.kpiValue, k.colour ? { color: k.colour } : {}] }, k.value)
      )
    )
  );
}

// ── Claim Identity Section ───────────────────────────────────────────────────
function ClaimIdentitySection({ claim }: any) {
  return React.createElement(View, null,
    React.createElement(SectionHeader, { number: "01", title: "Claim Identity & Policy Details" }),
    React.createElement(Text, { style: body.sectionTitle }, "Claim Identity"),
    React.createElement(View, { style: body.twoCol },
      React.createElement(View, { style: body.col },
        React.createElement(InfoRow, { label: "Claim Reference", value: fmt(claim?.claimNumber), mono: true }),
        React.createElement(InfoRow, { label: "Policy Number", value: fmt(claim?.policyNumber), mono: true }),
        React.createElement(InfoRow, { label: "Product Type", value: fmt(claim?.productType) }),
        React.createElement(InfoRow, { label: "Insurer", value: fmt(claim?.insurerName) }),
        React.createElement(InfoRow, { label: "Claimant", value: fmt(claim?.claimantName) }),
      ),
      React.createElement(View, { style: body.col },
        React.createElement(InfoRow, { label: "Vehicle", value: `${fmt(claim?.vehicleMake)} ${fmt(claim?.vehicleModel)} ${fmt(claim?.vehicleYear)}` }),
        React.createElement(InfoRow, { label: "Registration", value: fmt(claim?.vehicleRegistration), mono: true }),
        React.createElement(InfoRow, { label: "Incident Date", value: fmtDate(claim?.incidentDate) }),
        React.createElement(InfoRow, { label: "Incident Type", value: fmt(claim?.incidentType) }),
        React.createElement(InfoRow, { label: "Incident Location", value: fmt(claim?.incidentLocation) }),
      )
    ),
    claim?.incidentDescription && React.createElement(View, null,
      React.createElement(Text, { style: [body.kpiLabel, { marginBottom: 6, marginTop: 8 }] }, "INCIDENT NARRATIVE"),
      React.createElement(View, { style: body.blockquote },
        React.createElement(Text, { style: body.blockquoteText }, fmt(claim.incidentDescription))
      )
    )
  );
}

// ── Damage Analysis Section ──────────────────────────────────────────────────
function DamageAnalysisSection({ assessment }: any) {
  let components: any[] = [];
  try {
    if (assessment?.damagedComponentsJson) {
      components = JSON.parse(assessment.damagedComponentsJson);
    }
  } catch { /* ignore */ }

  return React.createElement(View, null,
    React.createElement(SectionHeader, { number: "02", title: "Damage Analysis" }),
    React.createElement(Text, { style: body.sectionTitle }, "Damage Analysis"),
    assessment?.damageDescription && React.createElement(View, { style: body.blockquote },
      React.createElement(Text, { style: body.blockquoteText }, fmt(assessment.damageDescription))
    ),
    React.createElement(View, { style: body.twoCol },
      React.createElement(View, { style: body.col },
        React.createElement(InfoRow, { label: "Structural Severity", value: fmt(assessment?.structuralDamageSeverity) }),
        React.createElement(InfoRow, { label: "Total Loss Indicated", value: assessment?.totalLossIndicated ? "YES" : "NO" }),
        React.createElement(InfoRow, { label: "Repair-to-Value Ratio", value: assessment?.repairToValueRatio ? `${assessment.repairToValueRatio}%` : "—" }),
      ),
      React.createElement(View, { style: body.col },
        React.createElement(InfoRow, { label: "Est. Parts Cost", value: fmtCurrency(assessment?.estimatedPartsCost) }),
        React.createElement(InfoRow, { label: "Est. Labour Cost", value: fmtCurrency(assessment?.estimatedLaborCost) }),
        React.createElement(InfoRow, { label: "Est. Vehicle Value", value: fmtCurrency(assessment?.estimatedVehicleValue) }),
      )
    ),
    components.length > 0 && React.createElement(View, null,
      React.createElement(Text, { style: [body.kpiLabel, { marginBottom: 6, marginTop: 8 }] }, "DAMAGED COMPONENTS"),
      React.createElement(View, { style: body.table },
        React.createElement(View, { style: body.tableHeaderRow },
          React.createElement(Text, { style: [body.tableHeaderCell, { flex: 2 }] }, "COMPONENT"),
          React.createElement(Text, { style: body.tableHeaderCell }, "SEVERITY"),
          React.createElement(Text, { style: body.tableHeaderCell }, "ACTION"),
          React.createElement(Text, { style: body.tableHeaderCell }, "COST"),
        ),
        ...components.slice(0, 20).map((c: any, i: number) =>
          React.createElement(View, { key: i, style: i % 2 === 0 ? body.tableRow : body.tableRowAlt },
            React.createElement(Text, { style: [body.tableCell, { flex: 2 }] }, fmt(c.name ?? c.component ?? c.part)),
            React.createElement(Text, { style: body.tableCellMono }, fmt(c.severity ?? c.damageLevel)),
            React.createElement(Text, { style: body.tableCell }, fmt(c.action ?? c.recommendation)),
            React.createElement(Text, { style: body.tableCellMono }, fmtCurrency(c.cost ?? c.estimatedCost)),
          )
        )
      )
    )
  );
}

// ── Cost Assessment Section ──────────────────────────────────────────────────
function CostAssessmentSection({ claim, assessment, quotes }: any) {
  const currency = claim?.currencyCode ?? "USD";
  const excess = claim?.excessAmountCents ? claim.excessAmountCents / 100 : null;
  const estimated = parseFloat(claim?.estimatedClaimValue ?? 0);
  const approved = parseFloat(claim?.finalApprovedAmount ?? 0);
  const saving = estimated - approved;

  return React.createElement(View, null,
    React.createElement(SectionHeader, { number: "03", title: "Cost Assessment" }),
    React.createElement(Text, { style: body.sectionTitle }, "Cost Assessment"),
    React.createElement(View, { style: body.table },
      React.createElement(View, { style: body.tableHeaderRow },
        React.createElement(Text, { style: [body.tableHeaderCell, { flex: 2 }] }, "ITEM"),
        React.createElement(Text, { style: body.tableHeaderCell }, "AMOUNT"),
        React.createElement(Text, { style: body.tableHeaderCell }, "SOURCE"),
      ),
      React.createElement(View, { style: body.tableRow },
        React.createElement(Text, { style: [body.tableCell, { flex: 2 }] }, "Submitted Claim Value"),
        React.createElement(Text, { style: body.tableCellMono }, fmtCurrency(estimated, currency)),
        React.createElement(Text, { style: body.tableCell }, "Claimant Submission"),
      ),
      assessment?.estimatedCost && React.createElement(View, { style: body.tableRowAlt },
        React.createElement(Text, { style: [body.tableCell, { flex: 2 }] }, "KINGA AI Estimate"),
        React.createElement(Text, { style: body.tableCellMono }, fmtCurrency(assessment.estimatedCost, currency)),
        React.createElement(Text, { style: [body.tableCell, { color: C.amber }] }, "Learning DB Estimate"),
      ),
      excess && React.createElement(View, { style: body.tableRow },
        React.createElement(Text, { style: [body.tableCell, { flex: 2 }] }, "Less: Excess"),
        React.createElement(Text, { style: body.tableCellMono }, `(${fmtCurrency(excess, currency)})`),
        React.createElement(Text, { style: body.tableCell }, "Policy Terms"),
      ),
      approved > 0 && React.createElement(View, { style: [body.tableRow, { backgroundColor: C.teal + "10" }] },
        React.createElement(Text, { style: [body.tableCell, { flex: 2, fontFamily: "Helvetica-Bold" }] }, "Approved Settlement"),
        React.createElement(Text, { style: [body.tableCellMono, { color: C.teal, fontFamily: "Helvetica-Bold" }] }, fmtCurrency(approved, currency)),
        React.createElement(Text, { style: [body.tableCell, { color: C.teal }] }, "Insurer Decision"),
      ),
      saving > 0 && React.createElement(View, { style: body.tableRowAlt },
        React.createElement(Text, { style: [body.tableCell, { flex: 2, fontStyle: "italic" }] }, "KINGA Identified Saving"),
        React.createElement(Text, { style: [body.tableCellMono, { color: C.teal }] }, fmtCurrency(saving, currency)),
        React.createElement(Text, { style: body.tableCell }, "vs Submitted Value"),
      ),
    )
  );
}

// ── Fraud Score Section ──────────────────────────────────────────────────────
function FraudScoreSection({ assessment, tier }: any) {
  const score = assessment?.fraudScore ?? 0;
  const colour = fraudColour(score);
  let breakdown: any[] = [];
  if (tier !== "process") {
    try {
      if (assessment?.fraudScoreBreakdownJson) {
        const parsed = JSON.parse(assessment.fraudScoreBreakdownJson);
        breakdown = parsed.indicators ?? parsed.signals ?? [];
      }
    } catch { /* ignore */ }
  }

  return React.createElement(View, null,
    React.createElement(SectionHeader, { number: "04", title: "Fraud Risk Assessment" }),
    React.createElement(Text, { style: body.sectionTitle }, "Fraud Risk Assessment"),
    React.createElement(View, { style: body.twoCol },
      React.createElement(View, { style: body.col },
        React.createElement(InfoRow, { label: "Fraud Risk Score", value: `${score} / 100`, mono: true }),
        React.createElement(InfoRow, { label: "Risk Level", value: fmt(assessment?.fraudRiskLevel) }),
        React.createElement(InfoRow, { label: "FCDI Score", value: assessment?.fcdiScore ? `${assessment.fcdiScore} / 100` : "—", mono: true }),
      ),
      React.createElement(View, { style: body.col },
        React.createElement(View, { style: { padding: 12, backgroundColor: colour + "15", borderWidth: 1, borderColor: colour + "40", borderRadius: 2 } },
          React.createElement(Text, { style: [body.kpiLabel, { marginBottom: 4 }] }, "FRAUD SCORE"),
          React.createElement(Text, { style: { fontSize: 32, fontFamily: "Helvetica-Bold", color: colour } }, String(score)),
          React.createElement(Text, { style: { fontSize: 8, color: colour, fontFamily: "Helvetica", letterSpacing: 1, marginTop: 2 } },
            score <= 35 ? "LOW RISK" : score <= 60 ? "MODERATE RISK" : "HIGH RISK"
          )
        )
      )
    ),
    tier !== "process" && breakdown.length > 0 && React.createElement(View, null,
      React.createElement(Text, { style: [body.kpiLabel, { marginBottom: 6, marginTop: 8 }] }, "FRAUD SIGNAL BREAKDOWN"),
      React.createElement(View, { style: body.table },
        React.createElement(View, { style: body.tableHeaderRow },
          React.createElement(Text, { style: [body.tableHeaderCell, { flex: 2 }] }, "INDICATOR"),
          React.createElement(Text, { style: body.tableHeaderCell }, "SCORE"),
          React.createElement(Text, { style: [body.tableHeaderCell, { flex: 3 }] }, "EVIDENCE"),
        ),
        ...breakdown.slice(0, 10).map((ind: any, i: number) =>
          React.createElement(View, { key: i, style: i % 2 === 0 ? body.tableRow : body.tableRowAlt },
            React.createElement(Text, { style: [body.tableCell, { flex: 2 }] }, fmt(ind.name ?? ind.indicator ?? ind.signal)),
            React.createElement(Text, { style: [body.tableCellMono, { color: fraudColour(ind.score) }] }, fmt(ind.score)),
            React.createElement(Text, { style: [body.tableCell, { flex: 3, fontSize: 8 }] }, fmt(ind.evidence ?? ind.description ?? ind.reason)),
          )
        )
      )
    ),
    tier === "process" && React.createElement(View, { style: { padding: 10, backgroundColor: C.cardBg, borderWidth: 1, borderColor: C.border, marginTop: 8 } },
      React.createElement(Text, { style: { fontSize: 8, color: C.amber, fontFamily: "Helvetica", letterSpacing: 1 } },
        "FULL FRAUD SIGNAL BREAKDOWN — AVAILABLE IN TIER 2 · PROTECT"
      )
    )
  );
}

// ── Assessor Checklist Section ───────────────────────────────────────────────
function AssessorChecklistSection({ evaluation }: any) {
  const checks = [
    { item: "Registration plate photograph", required: true },
    { item: "VIN / chassis number photograph", required: true },
    { item: "Licence disc photograph", required: true },
    { item: "Odometer reading photograph", required: true },
    { item: "All four tyres photographed", required: true },
    { item: "Engine bay photograph", required: true },
    { item: "All four sides of vehicle photographed", required: true },
    { item: "Every quoted item has a supporting photograph", required: true },
    { item: "Damage consistent with reported incident", required: true },
    { item: "Pre-existing damage noted and excluded", required: false },
  ];

  return React.createElement(View, null,
    React.createElement(SectionHeader, { number: "05", title: "Assessor Corroboration Checklist" }),
    React.createElement(Text, { style: body.sectionTitle }, "Assessor Corroboration Checklist"),
    evaluation && React.createElement(View, { style: { marginBottom: 12 } },
      React.createElement(InfoRow, { label: "Assessor", value: fmt(evaluation.assessorName ?? evaluation.assessorId) }),
      React.createElement(InfoRow, { label: "Assessment Date", value: fmtDate(evaluation.createdAt) }),
      evaluation.assessorComment && React.createElement(View, { style: body.blockquote },
        React.createElement(Text, { style: body.blockquoteText }, fmt(evaluation.assessorComment))
      )
    ),
    React.createElement(View, { style: body.table },
      React.createElement(View, { style: body.tableHeaderRow },
        React.createElement(Text, { style: [body.tableHeaderCell, { flex: 4 }] }, "CHECKLIST ITEM"),
        React.createElement(Text, { style: body.tableHeaderCell }, "REQUIRED"),
        React.createElement(Text, { style: body.tableHeaderCell }, "STATUS"),
      ),
      ...checks.map((c, i) =>
        React.createElement(View, { key: i, style: i % 2 === 0 ? body.tableRow : body.tableRowAlt },
          React.createElement(Text, { style: [body.tableCell, { flex: 4 }] }, c.item),
          React.createElement(Text, { style: body.tableCell }, c.required ? "MANDATORY" : "RECOMMENDED"),
          React.createElement(Text, { style: [body.tableCellMono, { color: C.textMuted }] }, "VERIFY"),
        )
      )
    )
  );
}

// ── Physics Reconstruction Section (Tier 2+) ─────────────────────────────────
function PhysicsSection({ assessment }: any) {
  let physics: any = null;
  try {
    if (assessment?.physicsAnalysis) {
      physics = typeof assessment.physicsAnalysis === "string"
        ? JSON.parse(assessment.physicsAnalysis)
        : assessment.physicsAnalysis;
    }
  } catch { /* ignore */ }

  return React.createElement(View, null,
    React.createElement(SectionHeader, { number: "06", title: "Physics Reconstruction" }),
    React.createElement(Text, { style: body.sectionTitle }, "Physics Reconstruction"),
    physics ? React.createElement(View, null,
      React.createElement(InfoRow, { label: "Consensus Speed", value: physics.consensusSpeed ? `${physics.consensusSpeed} km/h` : "—", mono: true }),
      React.createElement(InfoRow, { label: "Stated Speed", value: physics.statedSpeed ? `${physics.statedSpeed} km/h` : "—", mono: true }),
      React.createElement(InfoRow, { label: "Confidence", value: fmt(physics.confidence) }),
      physics.summary && React.createElement(View, { style: body.blockquote },
        React.createElement(Text, { style: body.blockquoteText }, fmt(physics.summary))
      )
    ) : React.createElement(Text, { style: { fontSize: 9, color: C.textMuted, fontFamily: "Helvetica", fontStyle: "italic" } },
      "Physics reconstruction data not available for this claim."
    )
  );
}

// ── Validated Determination Section ─────────────────────────────────────────
function DeterminationSection({ claim, reportId, generatedAt }: any) {
  return React.createElement(View, null,
    React.createElement(SectionHeader, { number: "07", title: "Validated Determination" }),
    React.createElement(Text, { style: body.sectionTitle }, "Validated Determination"),
    React.createElement(View, { style: { padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 16 } },
      React.createElement(InfoRow, { label: "Claim Reference", value: fmt(claim?.claimNumber), mono: true }),
      React.createElement(InfoRow, { label: "Claimant", value: fmt(claim?.claimantName) }),
      React.createElement(InfoRow, { label: "Vehicle", value: `${fmt(claim?.vehicleMake)} ${fmt(claim?.vehicleModel)} ${fmt(claim?.vehicleYear)}` }),
      React.createElement(InfoRow, { label: "Determination Date", value: fmtDate(generatedAt) }),
      React.createElement(View, { style: { marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.border}` } },
        React.createElement(Text, { style: [body.kpiLabel, { marginBottom: 8 }] }, "REVIEWER DECISION"),
        React.createElement(View, { style: { flexDirection: "row", gap: 24, marginBottom: 16 } },
          React.createElement(Text, { style: { fontSize: 10, color: C.textPrimary, fontFamily: "Helvetica" } }, "☐  APPROVE"),
          React.createElement(Text, { style: { fontSize: 10, color: C.textPrimary, fontFamily: "Helvetica" } }, "☐  NEGOTIATE"),
          React.createElement(Text, { style: { fontSize: 10, color: C.textPrimary, fontFamily: "Helvetica" } }, "☐  REJECT"),
        ),
        React.createElement(Text, { style: [body.kpiLabel, { marginBottom: 4 }] }, "REVIEWER NAME & DESIGNATION"),
        React.createElement(View, { style: { height: 1, backgroundColor: C.border, marginBottom: 16, marginTop: 20 } }),
        React.createElement(Text, { style: [body.kpiLabel, { marginBottom: 4 }] }, "SIGNATURE"),
        React.createElement(View, { style: { height: 1, backgroundColor: C.border, marginBottom: 16, marginTop: 20 } }),
        React.createElement(Text, { style: [body.kpiLabel, { marginBottom: 4 }] }, "DATE"),
        React.createElement(View, { style: { height: 1, backgroundColor: C.border, marginBottom: 8, marginTop: 20, width: 120 } }),
      )
    ),
    React.createElement(View, { style: body.disclaimer },
      React.createElement(Text, { style: body.disclaimerText },
        "KINGA AutoVerify AI provides decision-support intelligence only. The insurer's designated reviewer validates all determinations. The insurer owns the conclusion. This report is generated under the KINGA platform and is confidential to the insurer and its authorised representatives. Report ID: " + reportId
      )
    )
  );
}

// ── Main Document Builder ────────────────────────────────────────────────────
export interface ReportData {
  claim: any;
  assessment: any;
  evaluation: any;
  quotes: any[];
  reportType: string;
  tier: "process" | "protect" | "prove";
  reportId: string;
  generatedAt: string;
}

function KingaReport({ data }: { data: ReportData }) {
  const { claim, assessment, evaluation, quotes, reportType, tier, reportId, generatedAt } = data;

  return React.createElement(Document,
    { title: `KINGA Report — ${claim?.claimNumber ?? reportId}`, author: "KINGA AutoVerify AI" },

    // Page 1: Cover
    React.createElement(CoverPage, { claim, reportType, tier, reportId, generatedAt }),

    // Page 2+: Body
    React.createElement(Page, { size: "A4", style: body.page },
      // Page header
      React.createElement(View, { style: body.pageHeader },
        React.createElement(Text, { style: body.pageHeaderLeft }, `KINGA AUTOVERIFY AI  ·  ${reportTypeLabel(reportType).toUpperCase()}`),
        React.createElement(Text, { style: body.pageHeaderRight }, `${fmt(claim?.claimNumber)}  ·  ${fmtDate(generatedAt)}`)
      ),

      // Decision Banner
      React.createElement(DecisionBannerSection, { claim, assessment }),

      // KPI Strip
      React.createElement(KpiStrip, { claim, assessment }),

      // Section 01: Claim Identity
      React.createElement(ClaimIdentitySection, { claim }),

      // Page footer
      React.createElement(PageFooter, { reportId, tier, page: "2" })
    ),

    // Page 3: Damage Analysis + Cost Assessment
    React.createElement(Page, { size: "A4", style: body.page },
      React.createElement(View, { style: body.pageHeader },
        React.createElement(Text, { style: body.pageHeaderLeft }, `KINGA AUTOVERIFY AI  ·  ${reportTypeLabel(reportType).toUpperCase()}`),
        React.createElement(Text, { style: body.pageHeaderRight }, `${fmt(claim?.claimNumber)}  ·  ${fmtDate(generatedAt)}`)
      ),

      // Section 02: Damage Analysis
      React.createElement(DamageAnalysisSection, { assessment }),

      // Section 03: Cost Assessment (all tiers)
      React.createElement(CostAssessmentSection, { claim, assessment, quotes }),

      React.createElement(PageFooter, { reportId, tier, page: "3" })
    ),

    // Page 4: Fraud Score
    React.createElement(Page, { size: "A4", style: body.page },
      React.createElement(View, { style: body.pageHeader },
        React.createElement(Text, { style: body.pageHeaderLeft }, `KINGA AUTOVERIFY AI  ·  ${reportTypeLabel(reportType).toUpperCase()}`),
        React.createElement(Text, { style: body.pageHeaderRight }, `${fmt(claim?.claimNumber)}  ·  ${fmtDate(generatedAt)}`)
      ),

      // Section 04: Fraud Score
      React.createElement(FraudScoreSection, { assessment, tier }),

      // Section 05: Assessor Checklist
      React.createElement(AssessorChecklistSection, { evaluation }),

      React.createElement(PageFooter, { reportId, tier, page: "4" })
    ),

    // Page 5: Physics (Tier 2+) + Determination
    React.createElement(Page, { size: "A4", style: body.page },
      React.createElement(View, { style: body.pageHeader },
        React.createElement(Text, { style: body.pageHeaderLeft }, `KINGA AUTOVERIFY AI  ·  ${reportTypeLabel(reportType).toUpperCase()}`),
        React.createElement(Text, { style: body.pageHeaderRight }, `${fmt(claim?.claimNumber)}  ·  ${fmtDate(generatedAt)}`)
      ),

      // Section 06: Physics (Tier 2+ only)
      tier !== "process" && React.createElement(PhysicsSection, { assessment }),

      // Section 07: Validated Determination
      React.createElement(DeterminationSection, { claim, reportId, generatedAt }),

      React.createElement(PageFooter, { reportId, tier, page: "5" })
    )
  );
}

// ── Public API ───────────────────────────────────────────────────────────────
export async function generateReportPdf(data: ReportData): Promise<Buffer> {
  const element = React.createElement(KingaReport, { data });
  const instance = pdf(element);
  const blob = await instance.toBlob();
  const arrayBuffer = await blob.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
