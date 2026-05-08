// @ts-nocheck
/**
 * KINGA AutoVerify AI — Report Generator
 *
 * Design spec:
 *  - Cover page: #0f0e0c dark background, electric lime title
 *  - Body pages: #ffffff white, near-black text #0f0e0c
 *  - Typography: Helvetica Bold (headings), Helvetica Oblique (narrative/blockquotes),
 *    Helvetica (body) — react-pdf built-in fonts, no external font loading required
 *  - Numbers/codes: Courier (monospace approximation in react-pdf)
 *  - Colour: ONLY on charts, gauges, status badges, and the 2pt lime section rule
 *  - Table headers: #1a1a1a near-black with white text
 *  - Alternating rows: white / #f5f5f5
 *  - Section rule: 2pt #e8f542 lime line above each section title
 *  - Tier depth: process (core), protect (+ analytics), prove (+ full breakdown)
 */

import React from 'react';
import {
  Document, Page, View, Text, StyleSheet, pdf,
} from '@react-pdf/renderer';

// ── Colour Tokens ────────────────────────────────────────────────────────────
const C = {
  // Page
  pageBg: '#ffffff',
  coverBg: '#0f0e0c',
  // Text
  textPrimary: '#0f0e0c',
  textSecondary: '#555550',
  textMuted: '#888884',
  textWhite: '#ffffff',
  // Brand accent (section rules only — never on white bg as fill)
  lime: '#e8f542',
  // Semantic signal colours (charts, gauges, badges only)
  teal: '#14b8a6',
  amber: '#f59e0b',
  red: '#ef4444',
  blue: '#3b82f6',
  // Table
  tableHeaderBg: '#1a1a1a',
  tableRowAlt: '#f5f5f5',
  // Borders
  border: '#d4d1cc',
  sectionBg: '#f7f7f7',
};

// ── Styles ───────────────────────────────────────────────────────────────────
const cover = StyleSheet.create({
  page: { backgroundColor: C.coverBg, padding: 0 },
  inner: { flex: 1, padding: 56, justifyContent: 'space-between' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  logo: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.lime, letterSpacing: 2 },
  tierBadge: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: '#555550',
    fontSize: 8, fontFamily: 'Helvetica', color: '#888884', letterSpacing: 1,
  },
  mid: { flex: 1, justifyContent: 'center', paddingVertical: 40 },
  reportType: { fontSize: 10, fontFamily: 'Helvetica', color: '#888884', letterSpacing: 3, marginBottom: 16 },
  title: { fontSize: 36, fontFamily: 'Helvetica-Bold', color: '#ffffff', lineHeight: 1.2, marginBottom: 12 },
  subtitle: { fontSize: 14, fontFamily: 'Helvetica-Oblique', color: '#888884', marginBottom: 32 },
  rule: { height: 1, backgroundColor: '#333330', marginBottom: 24 },
  metaRow: { flexDirection: 'row', gap: 32, marginBottom: 8 },
  metaLabel: { fontSize: 8, fontFamily: 'Helvetica', color: '#555550', letterSpacing: 1, marginBottom: 2 },
  metaValue: { fontSize: 10, fontFamily: 'Courier', color: '#ffffff' },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  disclaimer: { fontSize: 7, fontFamily: 'Helvetica', color: '#555550', maxWidth: 360, lineHeight: 1.4 },
  pageNum: { fontSize: 8, fontFamily: 'Courier', color: '#555550' },
});

const body = StyleSheet.create({
  page: { backgroundColor: C.pageBg, paddingTop: 40, paddingBottom: 48, paddingHorizontal: 48, fontSize: 9 },
  // Page header
  pageHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: C.border,
    paddingBottom: 8, marginBottom: 20,
  },
  pageHeaderLeft: { fontSize: 7, fontFamily: 'Helvetica', color: C.textMuted, letterSpacing: 1 },
  pageHeaderRight: { fontSize: 7, fontFamily: 'Courier', color: C.textMuted },
  // Page footer
  pageFooter: {
    position: 'absolute', bottom: 24, left: 48, right: 48,
    flexDirection: 'row', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: C.border, paddingTop: 6,
  },
  pageFooterText: { fontSize: 7, fontFamily: 'Helvetica', color: C.textMuted },
  pageFooterMono: { fontSize: 7, fontFamily: 'Courier', color: C.textMuted },
  // Section
  sectionRule: { height: 2, backgroundColor: C.lime, marginBottom: 6, marginTop: 20 },
  sectionTitle: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.textPrimary, marginBottom: 4 },
  sectionEyebrow: { fontSize: 7, fontFamily: 'Helvetica', color: C.textMuted, letterSpacing: 2, marginBottom: 2 },
  // KPI strip
  kpiStrip: { flexDirection: 'row', gap: 8, marginBottom: 16, marginTop: 8 },
  kpiCard: {
    flex: 1, padding: 10,
    backgroundColor: C.sectionBg,
    borderWidth: 1, borderColor: C.border,
  },
  kpiLabel: { fontSize: 7, fontFamily: 'Helvetica', color: C.textMuted, letterSpacing: 1, marginBottom: 4 },
  kpiValue: { fontSize: 18, fontFamily: 'Courier', color: C.textPrimary, lineHeight: 1 },
  kpiDelta: { fontSize: 7, fontFamily: 'Helvetica', color: C.textMuted, marginTop: 2 },
  // Decision banner
  decisionBanner: {
    padding: 14, marginBottom: 16,
    borderWidth: 1, borderColor: C.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  decisionVerdict: { fontSize: 22, fontFamily: 'Helvetica-Bold' },
  decisionSub: { fontSize: 8, fontFamily: 'Helvetica-Oblique', color: C.textSecondary, marginTop: 2 },
  decisionRight: { alignItems: 'flex-end' },
  decisionSaving: { fontSize: 14, fontFamily: 'Courier', color: C.teal },
  decisionSavingLabel: { fontSize: 7, fontFamily: 'Helvetica', color: C.textMuted, letterSpacing: 1 },
  // Two-column layout
  twoCol: { flexDirection: 'row', gap: 16, marginBottom: 8 },
  col: { flex: 1 },
  // Info rows
  infoRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border, paddingVertical: 5 },
  infoLabel: { width: 140, fontSize: 8, fontFamily: 'Helvetica', color: C.textSecondary },
  infoValue: { flex: 1, fontSize: 8, fontFamily: 'Helvetica', color: C.textPrimary },
  infoValueMono: { flex: 1, fontSize: 8, fontFamily: 'Courier', color: C.textPrimary },
  // Tables
  table: { borderWidth: 1, borderColor: C.border, marginBottom: 12 },
  tableHeaderRow: { flexDirection: 'row', backgroundColor: C.tableHeaderBg, padding: 6 },
  tableHeaderCell: { flex: 1, fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.textWhite, letterSpacing: 0.5 },
  tableRow: { flexDirection: 'row', padding: 5, backgroundColor: C.pageBg },
  tableRowAlt: { flexDirection: 'row', padding: 5, backgroundColor: C.tableRowAlt },
  tableCell: { flex: 1, fontSize: 8, fontFamily: 'Helvetica', color: C.textPrimary },
  tableCellMono: { flex: 1, fontSize: 8, fontFamily: 'Courier', color: C.textPrimary },
  // Blockquote
  blockquote: {
    borderLeftWidth: 3, borderLeftColor: C.lime,
    paddingLeft: 10, paddingVertical: 6,
    backgroundColor: C.sectionBg, marginVertical: 8,
  },
  blockquoteText: { fontSize: 9, fontFamily: 'Helvetica-Oblique', color: C.textSecondary, lineHeight: 1.5 },
  // Status badge (inline in table)
  badgeApproved: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.teal, letterSpacing: 0.5 },
  badgeRejected: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.red, letterSpacing: 0.5 },
  badgeReview: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.amber, letterSpacing: 0.5 },
  badgeNeutral: { fontSize: 7, fontFamily: 'Helvetica', color: C.textMuted, letterSpacing: 0.5 },
  // Bar indicator (for charts in PDF — no canvas)
  barTrack: { height: 8, backgroundColor: C.border, marginVertical: 2 },
  barFill: { height: 8 },
  // Locked section (tier gating)
  lockedBox: {
    padding: 12, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.sectionBg, marginTop: 8,
  },
  lockedText: { fontSize: 8, fontFamily: 'Helvetica', color: C.amber, letterSpacing: 1 },
  // Determination / sign-off
  signoffBox: { borderWidth: 1, borderColor: C.border, padding: 16, marginTop: 8 },
  signoffLabel: { fontSize: 7, fontFamily: 'Helvetica', color: C.textMuted, letterSpacing: 1, marginBottom: 4 },
  signoffLine: { height: 1, backgroundColor: C.border, marginTop: 20, marginBottom: 12 },
  // Disclaimer
  disclaimerBox: { marginTop: 24, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border },
  disclaimerText: { fontSize: 7, fontFamily: 'Helvetica-Oblique', color: C.textMuted, lineHeight: 1.5 },
});

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (v: any) => (v == null || v === '' ? '—' : String(v));
const fmtDate = (v: any) => {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch { return String(v); }
};
const fmtMono = (v: any) => (v == null || v === '' ? '—' : String(v));
const fmtCurrency = (v: any, code = 'USD') => {
  const n = parseFloat(String(v ?? 0));
  if (isNaN(n)) return '—';
  const sym = code === 'USD' ? 'US$' : code === 'EUR' ? '€' : code === 'GBP' ? '£' : code === 'ZAR' ? 'R' : code === 'ZIG' ? 'ZIG' : code === 'ZWL' ? 'ZWL' : code;
  return `${sym} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtPct = (v: any) => (v == null ? '—' : `${Number(v).toFixed(1)}%`);
const fraudColour = (score: number) => score <= 35 ? C.teal : score <= 65 ? C.amber : C.red;
const statusColour = (s: string) => {
  const sl = (s ?? '').toLowerCase();
  if (['approved', 'completed', 'closed'].includes(sl)) return C.teal;
  if (['rejected', 'fraud', 'critical'].includes(sl)) return C.red;
  if (['review', 'escalated', 'disputed', 'high', 'elevated'].includes(sl)) return C.amber;
  return C.textMuted;
};
const decisionColour = (rec: string) => {
  const r = (rec ?? '').toLowerCase();
  if (r.includes('approve')) return C.teal;
  if (r.includes('reject')) return C.red;
  return C.amber;
};
const tierLabel = (t: string) => ({ process: 'TIER 1 · PROCESS', protect: 'TIER 2 · PROTECT', prove: 'TIER 3 · PROVE' }[t] ?? 'TIER 1 · PROCESS');

// ── Shared Components ────────────────────────────────────────────────────────
const PageHeader = ({ reportType, claimRef, date }: any) =>
  React.createElement(View, { style: body.pageHeader },
    React.createElement(Text, { style: body.pageHeaderLeft }, `KINGA AUTOVERIFY AI  ·  ${(reportType ?? '').toUpperCase()}`),
    React.createElement(Text, { style: body.pageHeaderRight }, `${fmt(claimRef)}  ·  ${fmtDate(date)}`)
  );

const PageFooter = ({ reportId, tier, page }: any) =>
  React.createElement(View, { style: body.pageFooter },
    React.createElement(Text, { style: body.pageFooterText }, `KINGA AutoVerify AI  ·  ${tierLabel(tier)}  ·  Confidential`),
    React.createElement(Text, { style: body.pageFooterMono }, `${fmt(reportId)}  ·  ${page}`)
  );

const SectionHeader = ({ number, title }: any) =>
  React.createElement(View, null,
    React.createElement(View, { style: body.sectionRule }),
    React.createElement(Text, { style: body.sectionEyebrow }, `SECTION ${number}`),
    React.createElement(Text, { style: body.sectionTitle }, title),
  );

const InfoRow = ({ label, value, mono = false }: any) =>
  React.createElement(View, { style: body.infoRow },
    React.createElement(Text, { style: body.infoLabel }, label),
    React.createElement(Text, { style: mono ? body.infoValueMono : body.infoValue }, fmt(value))
  );

const KpiCard = ({ label, value, delta, colour }: any) =>
  React.createElement(View, { style: body.kpiCard },
    React.createElement(Text, { style: body.kpiLabel }, (label ?? '').toUpperCase()),
    React.createElement(Text, { style: [body.kpiValue, colour ? { color: colour } : {}] }, fmt(value)),
    delta != null && React.createElement(Text, { style: [body.kpiDelta, { color: delta >= 0 ? C.teal : C.red }] },
      `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}% vs prior period`
    )
  );

const BarIndicator = ({ value, max, colour }: any) => {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return React.createElement(View, { style: body.barTrack },
    React.createElement(View, { style: [body.barFill, { width: `${pct}%`, backgroundColor: colour ?? C.teal }] })
  );
};

const LockedSection = ({ availableIn }: any) =>
  React.createElement(View, { style: body.lockedBox },
    React.createElement(Text, { style: body.lockedText },
      `THIS SECTION IS AVAILABLE IN ${availableIn ?? 'TIER 2 · PROTECT'}`
    )
  );

const StatusBadge = ({ status }: any) =>
  React.createElement(Text, { style: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: statusColour(status), letterSpacing: 0.5 } },
    (status ?? '—').toUpperCase()
  );

// ── Cover Page ───────────────────────────────────────────────────────────────
function CoverPage({ reportTitle, reportSubtitle, reportTypeLabel, meta, tier, reportId, generatedAt }: any) {
  return React.createElement(Page, { size: 'A4', style: cover.page },
    React.createElement(View, { style: cover.inner },
      // Top bar
      React.createElement(View, { style: cover.topBar },
        React.createElement(Text, { style: cover.logo }, 'KINGA AUTOVERIFY AI'),
        React.createElement(Text, { style: cover.tierBadge }, tierLabel(tier))
      ),
      // Mid — title block
      React.createElement(View, { style: cover.mid },
        React.createElement(Text, { style: cover.reportType }, (reportTypeLabel ?? '').toUpperCase()),
        React.createElement(Text, { style: cover.title }, reportTitle ?? 'Report'),
        reportSubtitle && React.createElement(Text, { style: cover.subtitle }, reportSubtitle),
        React.createElement(View, { style: cover.rule }),
        React.createElement(View, { style: cover.metaRow },
          ...(meta ?? []).map((m: any, i: number) =>
            React.createElement(View, { key: i },
              React.createElement(Text, { style: cover.metaLabel }, (m.label ?? '').toUpperCase()),
              React.createElement(Text, { style: cover.metaValue }, fmt(m.value))
            )
          )
        )
      ),
      // Bottom
      React.createElement(View, { style: cover.bottom },
        React.createElement(Text, { style: cover.disclaimer },
          'This report is generated by KINGA AutoVerify AI and is confidential to the insurer and its authorised representatives. KINGA provides decision-support intelligence only. The insurer\'s designated reviewer validates all determinations.'
        ),
        React.createElement(View, null,
          React.createElement(Text, { style: cover.pageNum }, `Report ID: ${fmt(reportId)}`),
          React.createElement(Text, { style: cover.pageNum }, `Generated: ${fmtDate(generatedAt)}`)
        )
      )
    )
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// REPORT TYPE 1: CLAIMS ASSESSMENT REPORT (single claim)
// ═══════════════════════════════════════════════════════════════════════════

function ClaimsAssessmentReport({ data }: { data: any }) {
  const { claim, aiAssessment, assessorEvaluation, panelBeaterQuotes = [], tier, reportId, generatedAt } = data;
  const currency = claim?.currencyCode ?? 'USD';
  const estimated = parseFloat(claim?.estimatedClaimValue ?? '0');
  const approved = parseFloat(claim?.finalApprovedAmount ?? '0');
  const saving = estimated > 0 && approved > 0 && approved < estimated ? estimated - approved : 0;
  const fraudScore = aiAssessment?.fraudScore ?? aiAssessment?.fraudRiskScore ?? 0;
  const aiRec = aiAssessment?.recommendation ?? aiAssessment?.aiRecommendation ?? '';
  const decColour = decisionColour(aiRec);

  return React.createElement(Document,
    { title: `KINGA Claims Assessment — ${claim?.claimNumber ?? reportId}`, author: 'KINGA AutoVerify AI' },

    // ── Cover ──
    React.createElement(CoverPage, {
      reportTitle: `Claims Assessment Report`,
      reportSubtitle: `${fmt(claim?.claimNumber)}  ·  ${fmt(claim?.claimantName)}`,
      reportTypeLabel: 'Claims Assessment',
      meta: [
        { label: 'Claim Reference', value: claim?.claimNumber },
        { label: 'Incident Type', value: claim?.incidentType },
        { label: 'Period', value: fmtDate(claim?.incidentDate ?? claim?.createdAt) },
        { label: 'Workflow State', value: claim?.workflowState },
      ],
      tier, reportId, generatedAt,
    }),

    // ── Page 2: Decision Banner + KPI Strip + Claim Identity ──
    React.createElement(Page, { size: 'A4', style: body.page },
      React.createElement(PageHeader, { reportType: 'Claims Assessment Report', claimRef: claim?.claimNumber, date: generatedAt }),

      // Decision Banner
      React.createElement(View, { style: [body.decisionBanner, { borderColor: decColour + '60' }] },
        React.createElement(View, null,
          React.createElement(Text, { style: [body.decisionVerdict, { color: decColour }] },
            (aiRec || 'PENDING').toUpperCase()
          ),
          React.createElement(Text, { style: body.decisionSub },
            'AI Recommendation — subject to insurer review and validation'
          )
        ),
        React.createElement(View, { style: body.decisionRight },
          saving > 0 && React.createElement(Text, { style: body.decisionSaving }, fmtCurrency(saving, currency)),
          saving > 0 && React.createElement(Text, { style: body.decisionSavingLabel }, 'KINGA IDENTIFIED SAVING'),
          React.createElement(Text, { style: [body.kpiLabel, { marginTop: 4 }] },
            `Confidence: ${fmt(aiAssessment?.confidenceScore ?? aiAssessment?.confidence)}%`
          )
        )
      ),

      // KPI Strip
      React.createElement(View, { style: body.kpiStrip },
        React.createElement(KpiCard, { label: 'Fraud Score', value: `${fraudScore}/100`, colour: fraudColour(fraudScore) }),
        React.createElement(KpiCard, { label: 'Claimed Value', value: fmtCurrency(estimated, currency) }),
        React.createElement(KpiCard, { label: 'Approved Amount', value: approved > 0 ? fmtCurrency(approved, currency) : 'Pending' }),
        React.createElement(KpiCard, { label: 'KINGA Saving', value: saving > 0 ? fmtCurrency(saving, currency) : '—', colour: saving > 0 ? C.teal : undefined }),
        React.createElement(KpiCard, { label: 'Workflow State', value: claim?.workflowState }),
      ),

      // Section 01: Claim Identity
      React.createElement(SectionHeader, { number: '01', title: 'Claim Identity & Policy Details' }),
      React.createElement(View, { style: body.twoCol },
        React.createElement(View, { style: body.col },
          React.createElement(InfoRow, { label: 'Claim Number', value: claim?.claimNumber, mono: true }),
          React.createElement(InfoRow, { label: 'Claimant Name', value: claim?.claimantName }),
          React.createElement(InfoRow, { label: 'Policy Number', value: claim?.policyNumber, mono: true }),
          React.createElement(InfoRow, { label: 'Incident Type', value: claim?.incidentType }),
          React.createElement(InfoRow, { label: 'Incident Date', value: fmtDate(claim?.incidentDate) }),
          React.createElement(InfoRow, { label: 'Date Submitted', value: fmtDate(claim?.createdAt) }),
        ),
        React.createElement(View, { style: body.col },
          React.createElement(InfoRow, { label: 'Vehicle Make', value: claim?.vehicleMake }),
          React.createElement(InfoRow, { label: 'Vehicle Model', value: claim?.vehicleModel }),
          React.createElement(InfoRow, { label: 'Vehicle Year', value: claim?.vehicleYear, mono: true }),
          React.createElement(InfoRow, { label: 'Registration', value: claim?.vehicleRegistration, mono: true }),
          React.createElement(InfoRow, { label: 'VIN / Chassis', value: claim?.vin ?? claim?.chassisNumber, mono: true }),
          React.createElement(InfoRow, { label: 'Workflow State', value: claim?.workflowState }),
        )
      ),
      claim?.incidentDescription && React.createElement(View, { style: body.blockquote },
        React.createElement(Text, { style: body.blockquoteText }, fmt(claim.incidentDescription))
      ),

      React.createElement(PageFooter, { reportId, tier, page: '2' })
    ),

    // ── Page 3: Damage Analysis + Cost Assessment ──
    React.createElement(Page, { size: 'A4', style: body.page },
      React.createElement(PageHeader, { reportType: 'Claims Assessment Report', claimRef: claim?.claimNumber, date: generatedAt }),

      // Section 02: Damage Analysis
      React.createElement(SectionHeader, { number: '02', title: 'Damage Analysis' }),
      (() => {
        let components: any[] = [];
        try {
          const raw = aiAssessment?.damagedComponentsJson ?? assessorEvaluation?.damagedComponentsJson;
          if (raw) {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            components = Array.isArray(parsed) ? parsed : (parsed.components ?? parsed.items ?? []);
          }
        } catch { /* ignore */ }
        return components.length > 0
          ? React.createElement(View, null,
              React.createElement(View, { style: body.table },
                React.createElement(View, { style: body.tableHeaderRow },
                  React.createElement(Text, { style: [body.tableHeaderCell, { flex: 3 }] }, 'COMPONENT'),
                  React.createElement(Text, { style: body.tableHeaderCell }, 'SEVERITY'),
                  React.createElement(Text, { style: body.tableHeaderCell }, 'ACTION'),
                  React.createElement(Text, { style: body.tableHeaderCell }, 'EST. COST'),
                ),
                ...components.slice(0, 15).map((c: any, i: number) =>
                  React.createElement(View, { key: i, style: i % 2 === 0 ? body.tableRow : body.tableRowAlt },
                    React.createElement(Text, { style: [body.tableCell, { flex: 3 }] }, fmt(c.name ?? c.component ?? c.part)),
                    React.createElement(Text, { style: body.tableCell }, fmt(c.severity ?? c.damageLevel)),
                    React.createElement(Text, { style: body.tableCell }, fmt(c.action ?? c.recommendation)),
                    React.createElement(Text, { style: body.tableCellMono }, fmtCurrency(c.cost ?? c.estimatedCost ?? 0, currency)),
                  )
                )
              )
            )
          : React.createElement(Text, { style: { fontSize: 8, fontFamily: 'Helvetica-Oblique', color: C.textMuted, marginBottom: 12 } },
              'Detailed component breakdown not available for this claim.'
            );
      })(),

      // Section 03: Cost Assessment
      React.createElement(SectionHeader, { number: '03', title: 'Cost Assessment' }),
      React.createElement(View, { style: body.table },
        React.createElement(View, { style: body.tableHeaderRow },
          React.createElement(Text, { style: [body.tableHeaderCell, { flex: 3 }] }, 'ITEM'),
          React.createElement(Text, { style: body.tableHeaderCell }, 'AMOUNT'),
          React.createElement(Text, { style: body.tableHeaderCell }, 'SOURCE'),
        ),
        React.createElement(View, { style: body.tableRow },
          React.createElement(Text, { style: [body.tableCell, { flex: 3 }] }, 'Submitted Claim Value'),
          React.createElement(Text, { style: body.tableCellMono }, fmtCurrency(estimated, currency)),
          React.createElement(Text, { style: body.tableCell }, 'Claimant Submission'),
        ),
        aiAssessment?.estimatedCost && React.createElement(View, { style: body.tableRowAlt },
          React.createElement(Text, { style: [body.tableCell, { flex: 3 }] }, 'KINGA AI Estimate'),
          React.createElement(Text, { style: body.tableCellMono }, fmtCurrency(aiAssessment.estimatedCost, currency)),
          React.createElement(Text, { style: [body.tableCell, { color: C.amber }] }, 'AI Learning Database'),
        ),
        claim?.excessAmountCents && React.createElement(View, { style: body.tableRow },
          React.createElement(Text, { style: [body.tableCell, { flex: 3 }] }, 'Less: Policy Excess'),
          React.createElement(Text, { style: body.tableCellMono }, `(${fmtCurrency(claim.excessAmountCents / 100, currency)})`),
          React.createElement(Text, { style: body.tableCell }, 'Policy Terms'),
        ),
        approved > 0 && React.createElement(View, { style: [body.tableRow, { backgroundColor: '#f0fdf4' }] },
          React.createElement(Text, { style: [body.tableCell, { flex: 3, fontFamily: 'Helvetica-Bold' }] }, 'Approved Settlement'),
          React.createElement(Text, { style: [body.tableCellMono, { color: C.teal, fontFamily: 'Courier' }] }, fmtCurrency(approved, currency)),
          React.createElement(Text, { style: [body.tableCell, { color: C.teal }] }, 'Insurer Decision'),
        ),
        saving > 0 && React.createElement(View, { style: body.tableRowAlt },
          React.createElement(Text, { style: [body.tableCell, { flex: 3, fontFamily: 'Helvetica-Oblique' }] }, 'KINGA Identified Saving'),
          React.createElement(Text, { style: [body.tableCellMono, { color: C.teal }] }, fmtCurrency(saving, currency)),
          React.createElement(Text, { style: body.tableCell }, 'vs Submitted Value'),
        ),
      ),

      React.createElement(PageFooter, { reportId, tier, page: '3' })
    ),

    // ── Page 4: Fraud Risk Assessment ──
    React.createElement(Page, { size: 'A4', style: body.page },
      React.createElement(PageHeader, { reportType: 'Claims Assessment Report', claimRef: claim?.claimNumber, date: generatedAt }),

      // Section 04: Fraud Risk
      React.createElement(SectionHeader, { number: '04', title: 'Fraud Risk Assessment' }),
      React.createElement(View, { style: body.twoCol },
        React.createElement(View, { style: body.col },
          React.createElement(InfoRow, { label: 'Fraud Risk Score', value: `${fraudScore} / 100`, mono: true }),
          React.createElement(InfoRow, { label: 'Risk Level', value: claim?.fraudRiskLevel ?? aiAssessment?.fraudRiskLevel }),
          React.createElement(InfoRow, { label: 'FCDI Score', value: aiAssessment?.fcdiScore ? `${aiAssessment.fcdiScore} / 100` : '—', mono: true }),
          React.createElement(InfoRow, { label: 'Repeat Claimant', value: aiAssessment?.isRepeatClaimant ? 'YES' : 'No' }),
        ),
        React.createElement(View, { style: [body.col, { alignItems: 'center', justifyContent: 'center' }] },
          React.createElement(View, { style: { padding: 16, borderWidth: 1, borderColor: fraudColour(fraudScore) + '40', backgroundColor: fraudColour(fraudScore) + '08' } },
            React.createElement(Text, { style: body.kpiLabel }, 'FRAUD SCORE'),
            React.createElement(Text, { style: { fontSize: 40, fontFamily: 'Courier', color: fraudColour(fraudScore), lineHeight: 1 } }, String(fraudScore)),
            React.createElement(Text, { style: { fontSize: 8, fontFamily: 'Helvetica', color: fraudColour(fraudScore), letterSpacing: 1, marginTop: 4 } },
              fraudScore <= 35 ? 'LOW RISK' : fraudScore <= 65 ? 'MODERATE RISK' : 'HIGH RISK'
            ),
            // Bar gauge
            React.createElement(View, { style: { marginTop: 8, width: 100 } },
              React.createElement(BarIndicator, { value: fraudScore, max: 100, colour: fraudColour(fraudScore) })
            )
          )
        )
      ),

      // Fraud signal breakdown (Protect+ only)
      tier !== 'process' ? (() => {
        let breakdown: any[] = [];
        try {
          const raw = aiAssessment?.fraudScoreBreakdownJson;
          if (raw) {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            breakdown = parsed.indicators ?? parsed.signals ?? [];
          }
        } catch { /* ignore */ }
        return breakdown.length > 0
          ? React.createElement(View, null,
              React.createElement(Text, { style: [body.kpiLabel, { marginTop: 12, marginBottom: 6 }] }, 'FRAUD SIGNAL BREAKDOWN'),
              React.createElement(View, { style: body.table },
                React.createElement(View, { style: body.tableHeaderRow },
                  React.createElement(Text, { style: [body.tableHeaderCell, { flex: 3 }] }, 'INDICATOR'),
                  React.createElement(Text, { style: body.tableHeaderCell }, 'SCORE'),
                  React.createElement(Text, { style: [body.tableHeaderCell, { flex: 4 }] }, 'EVIDENCE'),
                ),
                ...breakdown.slice(0, 8).map((ind: any, i: number) =>
                  React.createElement(View, { key: i, style: i % 2 === 0 ? body.tableRow : body.tableRowAlt },
                    React.createElement(Text, { style: [body.tableCell, { flex: 3 }] }, fmt(ind.name ?? ind.indicator ?? ind.signal)),
                    React.createElement(Text, { style: [body.tableCellMono, { color: fraudColour(ind.score ?? 0) }] }, fmt(ind.score)),
                    React.createElement(Text, { style: [body.tableCell, { flex: 4, fontSize: 7 }] }, fmt(ind.evidence ?? ind.description ?? ind.reason)),
                  )
                )
              )
            )
          : React.createElement(Text, { style: { fontSize: 8, fontFamily: 'Helvetica-Oblique', color: C.textMuted, marginTop: 8 } },
              'Fraud signal breakdown data not available for this assessment.'
            );
      })()
      : React.createElement(LockedSection, { availableIn: 'TIER 2 · PROTECT' }),

      // Section 05: Assessor Checklist
      React.createElement(SectionHeader, { number: '05', title: 'Assessor Corroboration Checklist' }),
      assessorEvaluation && React.createElement(View, { style: { marginBottom: 8 } },
        React.createElement(InfoRow, { label: 'Assessor', value: assessorEvaluation.assessorName ?? assessorEvaluation.assessorId }),
        React.createElement(InfoRow, { label: 'Assessment Date', value: fmtDate(assessorEvaluation.createdAt) }),
        assessorEvaluation.assessorComment && React.createElement(View, { style: body.blockquote },
          React.createElement(Text, { style: body.blockquoteText }, fmt(assessorEvaluation.assessorComment))
        )
      ),
      React.createElement(View, { style: body.table },
        React.createElement(View, { style: body.tableHeaderRow },
          React.createElement(Text, { style: [body.tableHeaderCell, { flex: 5 }] }, 'CHECKLIST ITEM'),
          React.createElement(Text, { style: body.tableHeaderCell }, 'REQUIRED'),
          React.createElement(Text, { style: body.tableHeaderCell }, 'STATUS'),
        ),
        ...[
          { item: 'Registration plate photograph', required: 'MANDATORY' },
          { item: 'VIN / chassis number photograph', required: 'MANDATORY' },
          { item: 'Licence disc photograph', required: 'MANDATORY' },
          { item: 'Odometer reading photograph', required: 'MANDATORY' },
          { item: 'All four tyres photographed', required: 'MANDATORY' },
          { item: 'Engine bay photograph', required: 'MANDATORY' },
          { item: 'All four sides of vehicle photographed', required: 'MANDATORY' },
          { item: 'Every quoted item has a supporting photograph', required: 'MANDATORY' },
          { item: 'Damage consistent with reported incident', required: 'MANDATORY' },
          { item: 'Pre-existing damage noted and excluded', required: 'RECOMMENDED' },
        ].map((c, i) =>
          React.createElement(View, { key: i, style: i % 2 === 0 ? body.tableRow : body.tableRowAlt },
            React.createElement(Text, { style: [body.tableCell, { flex: 5 }] }, c.item),
            React.createElement(Text, { style: body.tableCell }, c.required),
            React.createElement(Text, { style: body.tableCellMono }, 'VERIFY'),
          )
        )
      ),

      React.createElement(PageFooter, { reportId, tier, page: '4' })
    ),

    // ── Page 5: Physics + Quote Optimisation + Determination ──
    React.createElement(Page, { size: 'A4', style: body.page },
      React.createElement(PageHeader, { reportType: 'Claims Assessment Report', claimRef: claim?.claimNumber, date: generatedAt }),

      // Section 06: Physics Reconstruction (Protect+)
      tier !== 'process' ? (() => {
        let physics: any = null;
        try {
          const raw = aiAssessment?.physicsAnalysis;
          if (raw) physics = typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch { /* ignore */ }
        return React.createElement(View, null,
          React.createElement(SectionHeader, { number: '06', title: 'Physics Reconstruction' }),
          physics
            ? React.createElement(View, null,
                React.createElement(View, { style: body.twoCol },
                  React.createElement(View, { style: body.col },
                    React.createElement(InfoRow, { label: 'Consensus Speed', value: physics.consensusSpeed ? `${physics.consensusSpeed} km/h` : '—', mono: true }),
                    React.createElement(InfoRow, { label: 'Stated Speed', value: physics.statedSpeed ? `${physics.statedSpeed} km/h` : '—', mono: true }),
                    React.createElement(InfoRow, { label: 'Confidence', value: fmt(physics.confidence) }),
                  ),
                  React.createElement(View, { style: body.col },
                    React.createElement(InfoRow, { label: 'Impact Angle', value: physics.impactAngle ? `${physics.impactAngle}°` : '—', mono: true }),
                    React.createElement(InfoRow, { label: 'Delta-V', value: physics.deltaV ? `${physics.deltaV} km/h` : '—', mono: true }),
                    React.createElement(InfoRow, { label: 'Consistency', value: fmt(physics.damageConsistency) }),
                  )
                ),
                physics.summary && React.createElement(View, { style: body.blockquote },
                  React.createElement(Text, { style: body.blockquoteText }, fmt(physics.summary))
                )
              )
            : React.createElement(Text, { style: { fontSize: 8, fontFamily: 'Helvetica-Oblique', color: C.textMuted, marginBottom: 12 } },
                'Physics reconstruction data not available for this claim.'
              )
        );
      })()
      : React.createElement(LockedSection, { availableIn: 'TIER 2 · PROTECT' }),

      // Section 07: Quote Optimisation (Prove only)
      tier === 'prove' && panelBeaterQuotes.length > 0
        ? React.createElement(View, null,
            React.createElement(SectionHeader, { number: '07', title: 'Quote Optimisation' }),
            React.createElement(View, { style: body.table },
              React.createElement(View, { style: body.tableHeaderRow },
                React.createElement(Text, { style: [body.tableHeaderCell, { flex: 3 }] }, 'PANEL BEATER'),
                React.createElement(Text, { style: body.tableHeaderCell }, 'QUOTED'),
                React.createElement(Text, { style: body.tableHeaderCell }, 'AI ESTIMATE'),
                React.createElement(Text, { style: body.tableHeaderCell }, 'VARIANCE'),
                React.createElement(Text, { style: body.tableHeaderCell }, 'STATUS'),
              ),
              ...panelBeaterQuotes.slice(0, 8).map((q: any, i: number) => {
                const quoted = parseFloat(q.quotedAmount ?? '0');
                const aiEst = parseFloat(q.aiEstimate ?? aiAssessment?.estimatedCost ?? '0');
                const variance = aiEst > 0 ? Math.round(((quoted - aiEst) / aiEst) * 100) : null;
                return React.createElement(View, { key: i, style: i % 2 === 0 ? body.tableRow : body.tableRowAlt },
                  React.createElement(Text, { style: [body.tableCell, { flex: 3 }] }, fmt(q.panelBeaterName ?? q.panelBeaterId)),
                  React.createElement(Text, { style: body.tableCellMono }, fmtCurrency(quoted, currency)),
                  React.createElement(Text, { style: body.tableCellMono }, aiEst > 0 ? fmtCurrency(aiEst, currency) : '—'),
                  React.createElement(Text, { style: [body.tableCellMono, { color: variance != null ? (Math.abs(variance) > 20 ? C.red : Math.abs(variance) > 10 ? C.amber : C.teal) : C.textMuted }] },
                    variance != null ? `${variance > 0 ? '+' : ''}${variance}%` : '—'
                  ),
                  React.createElement(StatusBadge, { status: q.status ?? q.quoteStatus }),
                );
              })
            )
          )
        : tier !== 'prove' && React.createElement(LockedSection, { availableIn: 'TIER 3 · PROVE' }),

      // Section 08: Validated Determination
      React.createElement(SectionHeader, { number: tier === 'prove' ? '08' : '07', title: 'Validated Determination' }),
      React.createElement(View, { style: body.signoffBox },
        React.createElement(InfoRow, { label: 'Claim Reference', value: claim?.claimNumber, mono: true }),
        React.createElement(InfoRow, { label: 'Claimant', value: claim?.claimantName }),
        React.createElement(InfoRow, { label: 'Vehicle', value: `${fmt(claim?.vehicleMake)} ${fmt(claim?.vehicleModel)} ${fmt(claim?.vehicleYear)}` }),
        React.createElement(InfoRow, { label: 'AI Recommendation', value: (aiRec || 'PENDING').toUpperCase() }),
        React.createElement(InfoRow, { label: 'Determination Date', value: fmtDate(generatedAt) }),
        React.createElement(View, { style: { marginTop: 16 } },
          React.createElement(Text, { style: body.kpiLabel }, 'REVIEWER DECISION'),
          React.createElement(View, { style: { flexDirection: 'row', gap: 32, marginTop: 8, marginBottom: 16 } },
            React.createElement(Text, { style: { fontSize: 10, fontFamily: 'Helvetica', color: C.textPrimary } }, '☐  APPROVE'),
            React.createElement(Text, { style: { fontSize: 10, fontFamily: 'Helvetica', color: C.textPrimary } }, '☐  NEGOTIATE'),
            React.createElement(Text, { style: { fontSize: 10, fontFamily: 'Helvetica', color: C.textPrimary } }, '☐  REJECT'),
          ),
          React.createElement(Text, { style: body.signoffLabel }, 'REVIEWER NAME & DESIGNATION'),
          React.createElement(View, { style: body.signoffLine }),
          React.createElement(Text, { style: body.signoffLabel }, 'SIGNATURE'),
          React.createElement(View, { style: body.signoffLine }),
          React.createElement(Text, { style: body.signoffLabel }, 'DATE'),
          React.createElement(View, { style: [body.signoffLine, { width: 120 }] }),
        )
      ),

      React.createElement(View, { style: body.disclaimerBox },
        React.createElement(Text, { style: body.disclaimerText },
          `KINGA AutoVerify AI provides decision-support intelligence only. The insurer's designated reviewer validates all determinations. The insurer owns the conclusion. This report is generated under the KINGA platform and is confidential to the insurer and its authorised representatives. Report ID: ${fmt(reportId)}`
        )
      ),

      React.createElement(PageFooter, { reportId, tier, page: '5' })
    )
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// REPORT TYPE 2: CLAIMS MANAGER PORTFOLIO REPORT
// ═══════════════════════════════════════════════════════════════════════════

function ClaimsManagerReport({ data }: { data: any }) {
  const { overview, activeClaims = [], fraudAlerts = [], escalations = [], stats, tier, reportId, generatedAt, period, tenantName, currencyCode } = data;
  const kpis = overview?.kpis ?? {};
  const currency = currencyCode ?? 'USD';

  return React.createElement(Document,
    { title: `KINGA Claims Portfolio Report — ${tenantName ?? reportId}`, author: 'KINGA AutoVerify AI' },

    React.createElement(CoverPage, {
      reportTitle: 'Claims Portfolio Report',
      reportSubtitle: tenantName ?? 'Portfolio Overview',
      reportTypeLabel: 'Claims Manager Report',
      meta: [
        { label: 'Period From', value: period?.from ?? overview?.period?.from },
        { label: 'Period To', value: period?.to ?? overview?.period?.to },
        { label: 'Total Claims', value: kpis.totalClaims?.value },
        { label: 'Generated', value: fmtDate(generatedAt) },
      ],
      tier, reportId, generatedAt,
    }),

    // Page 2: KPI Strip + Status Distribution
    React.createElement(Page, { size: 'A4', style: body.page },
      React.createElement(PageHeader, { reportType: 'Claims Portfolio Report', claimRef: tenantName, date: generatedAt }),

      React.createElement(SectionHeader, { number: '01', title: 'Portfolio Executive Summary' }),
      React.createElement(View, { style: body.kpiStrip },
        React.createElement(KpiCard, { label: 'Total Claims', value: kpis.totalClaims?.value ?? stats?.total, delta: kpis.totalClaims?.delta }),
        React.createElement(KpiCard, { label: 'Active Claims', value: kpis.activeClaims?.value ?? stats?.activeCount, delta: kpis.activeClaims?.delta }),
        React.createElement(KpiCard, { label: 'Completed', value: kpis.completedClaims?.value ?? stats?.completedCount, delta: kpis.completedClaims?.delta }),
        React.createElement(KpiCard, { label: 'KINGA Savings', value: fmtCurrency(kpis.totalSavings?.value ?? 0, currency), colour: C.teal, delta: kpis.totalSavings?.delta }),
        React.createElement(KpiCard, { label: 'Fraud Rate', value: fmtPct(kpis.fraudRate?.value ?? stats?.fraudRate), colour: (kpis.fraudRate?.value ?? 0) > 15 ? C.red : C.teal }),
        React.createElement(KpiCard, { label: 'Avg Cycle Days', value: kpis.avgCycleDays?.value ?? stats?.avgProcessingDays, delta: kpis.avgCycleDays?.delta }),
      ),

      React.createElement(SectionHeader, { number: '02', title: 'Status Distribution' }),
      (() => {
        const statusCounts = overview?.statusDonut ?? stats?.workflowStateCounts ?? {};
        const entries = Object.entries(statusCounts).sort(([, a], [, b]) => (b as number) - (a as number));
        const total = entries.reduce((s, [, v]) => s + (v as number), 0);
        return entries.length > 0
          ? React.createElement(View, { style: body.table },
              React.createElement(View, { style: body.tableHeaderRow },
                React.createElement(Text, { style: [body.tableHeaderCell, { flex: 3 }] }, 'STATUS'),
                React.createElement(Text, { style: body.tableHeaderCell }, 'COUNT'),
                React.createElement(Text, { style: body.tableHeaderCell }, 'SHARE'),
                React.createElement(Text, { style: [body.tableHeaderCell, { flex: 4 }] }, 'DISTRIBUTION'),
              ),
              ...entries.map(([status, count], i) => {
                const pct = total > 0 ? Math.round(((count as number) / total) * 100) : 0;
                return React.createElement(View, { key: i, style: i % 2 === 0 ? body.tableRow : body.tableRowAlt },
                  React.createElement(StatusBadge, { status }),
                  React.createElement(Text, { style: body.tableCellMono }, String(count)),
                  React.createElement(Text, { style: body.tableCellMono }, `${pct}%`),
                  React.createElement(View, { style: [body.col, { flex: 4, justifyContent: 'center' }] },
                    React.createElement(BarIndicator, { value: count as number, max: total, colour: statusColour(status) })
                  ),
                );
              })
            )
          : React.createElement(Text, { style: { fontSize: 8, color: C.textMuted, fontFamily: 'Helvetica-Oblique' } }, 'No status data available.');
      })(),

      React.createElement(SectionHeader, { number: '03', title: 'Incident Type Breakdown' }),
      (() => {
        const incidentCounts = overview?.incidentTypeBar ?? stats?.incidentTypeCounts ?? {};
        const entries = Object.entries(incidentCounts).sort(([, a], [, b]) => (b as number) - (a as number));
        const max = entries.length > 0 ? (entries[0][1] as number) : 1;
        return entries.length > 0
          ? React.createElement(View, { style: body.table },
              React.createElement(View, { style: body.tableHeaderRow },
                React.createElement(Text, { style: [body.tableHeaderCell, { flex: 3 }] }, 'INCIDENT TYPE'),
                React.createElement(Text, { style: body.tableHeaderCell }, 'COUNT'),
                React.createElement(Text, { style: [body.tableHeaderCell, { flex: 4 }] }, 'VOLUME'),
              ),
              ...entries.slice(0, 10).map(([type, count], i) =>
                React.createElement(View, { key: i, style: i % 2 === 0 ? body.tableRow : body.tableRowAlt },
                  React.createElement(Text, { style: [body.tableCell, { flex: 3 }] }, fmt(type)),
                  React.createElement(Text, { style: body.tableCellMono }, String(count)),
                  React.createElement(View, { style: [body.col, { flex: 4, justifyContent: 'center' }] },
                    React.createElement(BarIndicator, { value: count as number, max, colour: C.blue })
                  ),
                )
              )
            )
          : React.createElement(Text, { style: { fontSize: 8, color: C.textMuted, fontFamily: 'Helvetica-Oblique' } }, 'No incident type data available.');
      })(),

      React.createElement(PageFooter, { reportId, tier, page: '2' })
    ),

    // Page 3: Active Claims Register
    React.createElement(Page, { size: 'A4', style: body.page },
      React.createElement(PageHeader, { reportType: 'Claims Portfolio Report', claimRef: tenantName, date: generatedAt }),

      React.createElement(SectionHeader, { number: '04', title: 'Active Claims Register' }),
      activeClaims.length > 0
        ? React.createElement(View, { style: body.table },
            React.createElement(View, { style: body.tableHeaderRow },
              React.createElement(Text, { style: [body.tableHeaderCell, { flex: 2 }] }, 'CLAIM NO.'),
              React.createElement(Text, { style: [body.tableHeaderCell, { flex: 2 }] }, 'CLAIMANT'),
              React.createElement(Text, { style: [body.tableHeaderCell, { flex: 2 }] }, 'INCIDENT TYPE'),
              React.createElement(Text, { style: body.tableHeaderCell }, 'STATE'),
              React.createElement(Text, { style: body.tableHeaderCell }, 'FRAUD'),
              React.createElement(Text, { style: body.tableHeaderCell }, 'DAYS'),
            ),
            ...activeClaims.slice(0, 25).map((c: any, i: number) => {
              const days = c.createdAt ? Math.round((Date.now() - new Date(c.createdAt).getTime()) / 86400000) : null;
              return React.createElement(View, { key: i, style: i % 2 === 0 ? body.tableRow : body.tableRowAlt },
                React.createElement(Text, { style: [body.tableCellMono, { flex: 2 }] }, fmt(c.claimNumber)),
                React.createElement(Text, { style: [body.tableCell, { flex: 2 }] }, fmt(c.claimantName)),
                React.createElement(Text, { style: [body.tableCell, { flex: 2 }] }, fmt(c.incidentType)),
                React.createElement(StatusBadge, { status: c.workflowState ?? c.status }),
                React.createElement(Text, { style: [body.tableCellMono, { color: fraudColour(c.fraudRiskScore ?? 0) }] }, fmt(c.fraudRiskScore)),
                React.createElement(Text, { style: body.tableCellMono }, days != null ? String(days) : '—'),
              );
            })
          )
        : React.createElement(Text, { style: { fontSize: 8, color: C.textMuted, fontFamily: 'Helvetica-Oblique' } }, 'No active claims in the selected period.'),

      // Fraud Alerts (Protect+)
      tier !== 'process'
        ? React.createElement(View, null,
            React.createElement(SectionHeader, { number: '05', title: 'Fraud Alert Register' }),
            fraudAlerts.length > 0
              ? React.createElement(View, { style: body.table },
                  React.createElement(View, { style: body.tableHeaderRow },
                    React.createElement(Text, { style: [body.tableHeaderCell, { flex: 2 }] }, 'CLAIM NO.'),
                    React.createElement(Text, { style: [body.tableHeaderCell, { flex: 2 }] }, 'CLAIMANT'),
                    React.createElement(Text, { style: body.tableHeaderCell }, 'FRAUD SCORE'),
                    React.createElement(Text, { style: body.tableHeaderCell }, 'RISK LEVEL'),
                    React.createElement(Text, { style: body.tableHeaderCell }, 'EST. VALUE'),
                  ),
                  ...fraudAlerts.slice(0, 15).map((c: any, i: number) =>
                    React.createElement(View, { key: i, style: i % 2 === 0 ? body.tableRow : body.tableRowAlt },
                      React.createElement(Text, { style: [body.tableCellMono, { flex: 2 }] }, fmt(c.claimNumber)),
                      React.createElement(Text, { style: [body.tableCell, { flex: 2 }] }, fmt(c.claimantName)),
                      React.createElement(Text, { style: [body.tableCellMono, { color: fraudColour(c.fraudRiskScore ?? 0) }] }, fmt(c.fraudRiskScore)),
                      React.createElement(StatusBadge, { status: c.fraudRiskLevel }),
                      React.createElement(Text, { style: body.tableCellMono }, fmtCurrency(c.estimatedClaimValue ?? 0, currency)),
                    )
                  )
                )
              : React.createElement(Text, { style: { fontSize: 8, color: C.textMuted, fontFamily: 'Helvetica-Oblique' } }, 'No fraud alerts in the selected period.')
          )
        : React.createElement(LockedSection, { availableIn: 'TIER 2 · PROTECT' }),

      React.createElement(PageFooter, { reportId, tier, page: '3' })
    ),

    // Page 4: Leakage + Escalations + Determination
    React.createElement(Page, { size: 'A4', style: body.page },
      React.createElement(PageHeader, { reportType: 'Claims Portfolio Report', claimRef: tenantName, date: generatedAt }),

      // Leakage Analysis (Protect+)
      tier !== 'process'
        ? React.createElement(View, null,
            React.createElement(SectionHeader, { number: '06', title: 'Leakage Analysis' }),
            React.createElement(Text, { style: { fontSize: 8, fontFamily: 'Helvetica-Oblique', color: C.textSecondary, marginBottom: 8 } },
              'Claims where the approved settlement exceeded the KINGA estimated value by more than 10%, indicating potential over-payment.'
            ),
            (() => {
              const leakage = activeClaims.filter((c: any) => {
                const est = parseFloat(c.estimatedClaimValue ?? '0');
                const approved = parseFloat(c.finalApprovedAmount ?? '0');
                return est > 0 && approved > 0 && approved > est * 1.1;
              }).sort((a: any, b: any) => {
                const va = parseFloat(b.finalApprovedAmount ?? '0') - parseFloat(b.estimatedClaimValue ?? '0');
                const vb = parseFloat(a.finalApprovedAmount ?? '0') - parseFloat(a.estimatedClaimValue ?? '0');
                return va - vb;
              });
              return leakage.length > 0
                ? React.createElement(View, { style: body.table },
                    React.createElement(View, { style: body.tableHeaderRow },
                      React.createElement(Text, { style: [body.tableHeaderCell, { flex: 2 }] }, 'CLAIM NO.'),
                      React.createElement(Text, { style: body.tableHeaderCell }, 'ESTIMATED'),
                      React.createElement(Text, { style: body.tableHeaderCell }, 'APPROVED'),
                      React.createElement(Text, { style: body.tableHeaderCell }, 'VARIANCE'),
                    ),
                    ...leakage.slice(0, 10).map((c: any, i: number) => {
                      const est = parseFloat(c.estimatedClaimValue ?? '0');
                      const approved = parseFloat(c.finalApprovedAmount ?? '0');
                      const variance = est > 0 ? Math.round(((approved - est) / est) * 100) : 0;
                      return React.createElement(View, { key: i, style: i % 2 === 0 ? body.tableRow : body.tableRowAlt },
                        React.createElement(Text, { style: [body.tableCellMono, { flex: 2 }] }, fmt(c.claimNumber)),
                        React.createElement(Text, { style: body.tableCellMono }, fmtCurrency(est, currency)),
                        React.createElement(Text, { style: body.tableCellMono }, fmtCurrency(approved, currency)),
                        React.createElement(Text, { style: [body.tableCellMono, { color: C.red }] }, `+${variance}%`),
                      );
                    })
                  )
                : React.createElement(Text, { style: { fontSize: 8, color: C.teal, fontFamily: 'Helvetica-Oblique' } }, 'No leakage detected in the selected period.');
            })()
          )
        : React.createElement(LockedSection, { availableIn: 'TIER 2 · PROTECT' }),

      // Escalations
      React.createElement(SectionHeader, { number: tier !== 'process' ? '07' : '05', title: 'Escalations Register' }),
      escalations.length > 0
        ? React.createElement(View, { style: body.table },
            React.createElement(View, { style: body.tableHeaderRow },
              React.createElement(Text, { style: [body.tableHeaderCell, { flex: 2 }] }, 'CLAIM NO.'),
              React.createElement(Text, { style: [body.tableHeaderCell, { flex: 2 }] }, 'CLAIMANT'),
              React.createElement(Text, { style: body.tableHeaderCell }, 'STATE'),
              React.createElement(Text, { style: body.tableHeaderCell }, 'FRAUD'),
              React.createElement(Text, { style: body.tableHeaderCell }, 'DAYS OPEN'),
            ),
            ...escalations.slice(0, 10).map((c: any, i: number) => {
              const days = c.createdAt ? Math.round((Date.now() - new Date(c.createdAt).getTime()) / 86400000) : null;
              return React.createElement(View, { key: i, style: i % 2 === 0 ? body.tableRow : body.tableRowAlt },
                React.createElement(Text, { style: [body.tableCellMono, { flex: 2 }] }, fmt(c.claimNumber)),
                React.createElement(Text, { style: [body.tableCell, { flex: 2 }] }, fmt(c.claimantName)),
                React.createElement(StatusBadge, { status: c.workflowState }),
                React.createElement(Text, { style: [body.tableCellMono, { color: fraudColour(c.fraudRiskScore ?? 0) }] }, fmt(c.fraudRiskScore)),
                React.createElement(Text, { style: body.tableCellMono }, days != null ? String(days) : '—'),
              );
            })
          )
        : React.createElement(Text, { style: { fontSize: 8, color: C.textMuted, fontFamily: 'Helvetica-Oblique' } }, 'No escalations in the selected period.'),

      // Determination
      React.createElement(SectionHeader, { number: tier !== 'process' ? '08' : '06', title: 'Validated Determination' }),
      React.createElement(View, { style: body.signoffBox },
        React.createElement(InfoRow, { label: 'Report Period', value: `${period?.from ?? overview?.period?.from} to ${period?.to ?? overview?.period?.to}` }),
        React.createElement(InfoRow, { label: 'Total Claims', value: String(kpis.totalClaims?.value ?? stats?.total ?? 0), mono: true }),
        React.createElement(InfoRow, { label: 'KINGA Savings', value: fmtCurrency(kpis.totalSavings?.value ?? 0, currency), mono: true }),
        React.createElement(View, { style: { marginTop: 16 } },
          React.createElement(Text, { style: body.signoffLabel }, 'REVIEWED BY'),
          React.createElement(View, { style: body.signoffLine }),
          React.createElement(Text, { style: body.signoffLabel }, 'SIGNATURE'),
          React.createElement(View, { style: body.signoffLine }),
          React.createElement(Text, { style: body.signoffLabel }, 'DATE'),
          React.createElement(View, { style: [body.signoffLine, { width: 120 }] }),
        )
      ),

      React.createElement(View, { style: body.disclaimerBox },
        React.createElement(Text, { style: body.disclaimerText },
          `KINGA AutoVerify AI provides decision-support intelligence only. This portfolio report is confidential to the insurer and its authorised representatives. Report ID: ${fmt(reportId)}`
        )
      ),

      React.createElement(PageFooter, { reportId, tier, page: '4' })
    )
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// REPORT TYPE 3: RISK MANAGER PORTFOLIO REPORT
// ═══════════════════════════════════════════════════════════════════════════

function RiskManagerReport({ data }: { data: any }) {
  const { riskAnalytics, fraudAlerts = [], escalations = [], financialQueue = [], tier, reportId, generatedAt, tenantName, currencyCode } = data;
  const currency = currencyCode ?? 'USD';
  const riskKpis = riskAnalytics?.kpis ?? {};

  return React.createElement(Document,
    { title: `KINGA Risk Portfolio Report — ${tenantName ?? reportId}`, author: 'KINGA AutoVerify AI' },

    React.createElement(CoverPage, {
      reportTitle: 'Risk Portfolio Report',
      reportSubtitle: tenantName ?? 'Risk Intelligence Overview',
      reportTypeLabel: 'Risk Manager Report',
      meta: [
        { label: 'High-Risk Claims', value: riskKpis.highRiskCount?.value },
        { label: 'Fraud Rate', value: riskKpis.fraudRate?.value != null ? `${riskKpis.fraudRate.value}%` : '—' },
        { label: 'Escalations', value: escalations.length },
        { label: 'Generated', value: fmtDate(generatedAt) },
      ],
      tier, reportId, generatedAt,
    }),

    // Page 2: Fraud KPIs + Risk Distribution
    React.createElement(Page, { size: 'A4', style: body.page },
      React.createElement(PageHeader, { reportType: 'Risk Portfolio Report', claimRef: tenantName, date: generatedAt }),

      React.createElement(SectionHeader, { number: '01', title: 'Risk Executive Summary' }),
      React.createElement(View, { style: body.kpiStrip },
        React.createElement(KpiCard, { label: 'Fraud Rate', value: fmtPct(riskKpis.fraudRate?.value), colour: (riskKpis.fraudRate?.value ?? 0) > 15 ? C.red : C.amber }),
        React.createElement(KpiCard, { label: 'High-Risk Claims', value: riskKpis.highRiskCount?.value, colour: C.red }),
        React.createElement(KpiCard, { label: 'Avg Fraud Score', value: riskKpis.avgFraudScore?.value, colour: fraudColour(riskKpis.avgFraudScore?.value ?? 0) }),
        React.createElement(KpiCard, { label: 'Escalations', value: escalations.length, colour: C.amber }),
        React.createElement(KpiCard, { label: 'Financial Queue', value: financialQueue.length }),
      ),

      React.createElement(SectionHeader, { number: '02', title: 'Fraud Risk Distribution' }),
      (() => {
        const dist = riskAnalytics?.riskDistribution ?? {};
        const entries = Object.entries(dist).sort(([, a], [, b]) => (b as number) - (a as number));
        const total = entries.reduce((s, [, v]) => s + (v as number), 0);
        return entries.length > 0
          ? React.createElement(View, { style: body.table },
              React.createElement(View, { style: body.tableHeaderRow },
                React.createElement(Text, { style: [body.tableHeaderCell, { flex: 2 }] }, 'RISK LEVEL'),
                React.createElement(Text, { style: body.tableHeaderCell }, 'COUNT'),
                React.createElement(Text, { style: body.tableHeaderCell }, 'SHARE'),
                React.createElement(Text, { style: [body.tableHeaderCell, { flex: 4 }] }, 'DISTRIBUTION'),
              ),
              ...entries.map(([level, count], i) =>
                React.createElement(View, { key: i, style: i % 2 === 0 ? body.tableRow : body.tableRowAlt },
                  React.createElement(StatusBadge, { status: level }),
                  React.createElement(Text, { style: body.tableCellMono }, String(count)),
                  React.createElement(Text, { style: body.tableCellMono }, total > 0 ? `${Math.round(((count as number) / total) * 100)}%` : '—'),
                  React.createElement(View, { style: [body.col, { flex: 4, justifyContent: 'center' }] },
                    React.createElement(BarIndicator, { value: count as number, max: total, colour: statusColour(level) })
                  ),
                )
              )
            )
          : React.createElement(Text, { style: { fontSize: 8, color: C.textMuted, fontFamily: 'Helvetica-Oblique' } }, 'No risk distribution data available.');
      })(),

      React.createElement(SectionHeader, { number: '03', title: 'High-Risk Claims Register' }),
      fraudAlerts.length > 0
        ? React.createElement(View, { style: body.table },
            React.createElement(View, { style: body.tableHeaderRow },
              React.createElement(Text, { style: [body.tableHeaderCell, { flex: 2 }] }, 'CLAIM NO.'),
              React.createElement(Text, { style: [body.tableHeaderCell, { flex: 2 }] }, 'CLAIMANT'),
              React.createElement(Text, { style: body.tableHeaderCell }, 'FRAUD SCORE'),
              React.createElement(Text, { style: body.tableHeaderCell }, 'RISK LEVEL'),
              React.createElement(Text, { style: body.tableHeaderCell }, 'INCIDENT TYPE'),
              React.createElement(Text, { style: body.tableHeaderCell }, 'EST. VALUE'),
            ),
            ...fraudAlerts.slice(0, 20).map((c: any, i: number) =>
              React.createElement(View, { key: i, style: i % 2 === 0 ? body.tableRow : body.tableRowAlt },
                React.createElement(Text, { style: [body.tableCellMono, { flex: 2 }] }, fmt(c.claimNumber)),
                React.createElement(Text, { style: [body.tableCell, { flex: 2 }] }, fmt(c.claimantName)),
                React.createElement(Text, { style: [body.tableCellMono, { color: fraudColour(c.fraudRiskScore ?? 0) }] }, fmt(c.fraudRiskScore)),
                React.createElement(StatusBadge, { status: c.fraudRiskLevel }),
                React.createElement(Text, { style: body.tableCell }, fmt(c.incidentType)),
                React.createElement(Text, { style: body.tableCellMono }, fmtCurrency(c.estimatedClaimValue ?? 0, currency)),
              )
            )
          )
        : React.createElement(Text, { style: { fontSize: 8, color: C.textMuted, fontFamily: 'Helvetica-Oblique' } }, 'No high-risk claims in the selected period.'),

      React.createElement(PageFooter, { reportId, tier, page: '2' })
    ),

    // Page 3: Incident×Risk Matrix + Financial Queue + Determination
    React.createElement(Page, { size: 'A4', style: body.page },
      React.createElement(PageHeader, { reportType: 'Risk Portfolio Report', claimRef: tenantName, date: generatedAt }),

      // Incident×Risk Matrix (Protect+)
      tier !== 'process'
        ? React.createElement(View, null,
            React.createElement(SectionHeader, { number: '04', title: 'Incident Type × Risk Level Matrix' }),
            (() => {
              const matrix = riskAnalytics?.heatmapMatrix ?? {};
              const incidentTypes = Object.keys(matrix);
              const riskLevels = ['low', 'medium', 'high', 'critical', 'elevated'];
              return incidentTypes.length > 0
                ? React.createElement(View, { style: body.table },
                    React.createElement(View, { style: body.tableHeaderRow },
                      React.createElement(Text, { style: [body.tableHeaderCell, { flex: 3 }] }, 'INCIDENT TYPE'),
                      ...riskLevels.map(r => React.createElement(Text, { key: r, style: body.tableHeaderCell }, r.toUpperCase()))
                    ),
                    ...incidentTypes.slice(0, 12).map((type, i) =>
                      React.createElement(View, { key: i, style: i % 2 === 0 ? body.tableRow : body.tableRowAlt },
                        React.createElement(Text, { style: [body.tableCell, { flex: 3 }] }, fmt(type)),
                        ...riskLevels.map(r =>
                          React.createElement(Text, { key: r, style: [body.tableCellMono, { color: (matrix[type]?.[r] ?? 0) > 0 ? statusColour(r) : C.textMuted }] },
                            String(matrix[type]?.[r] ?? 0)
                          )
                        )
                      )
                    )
                  )
                : React.createElement(Text, { style: { fontSize: 8, color: C.textMuted, fontFamily: 'Helvetica-Oblique' } }, 'No matrix data available.');
            })()
          )
        : React.createElement(LockedSection, { availableIn: 'TIER 2 · PROTECT' }),

      // Financial Decision Queue
      React.createElement(SectionHeader, { number: tier !== 'process' ? '05' : '04', title: 'Financial Decision Queue' }),
      financialQueue.length > 0
        ? React.createElement(View, { style: body.table },
            React.createElement(View, { style: body.tableHeaderRow },
              React.createElement(Text, { style: [body.tableHeaderCell, { flex: 2 }] }, 'CLAIM NO.'),
              React.createElement(Text, { style: [body.tableHeaderCell, { flex: 2 }] }, 'CLAIMANT'),
              React.createElement(Text, { style: body.tableHeaderCell }, 'EST. VALUE'),
              React.createElement(Text, { style: body.tableHeaderCell }, 'AI REC.'),
              React.createElement(Text, { style: body.tableHeaderCell }, 'DAYS WAITING'),
            ),
            ...financialQueue.slice(0, 15).map((c: any, i: number) => {
              const days = c.createdAt ? Math.round((Date.now() - new Date(c.createdAt).getTime()) / 86400000) : null;
              return React.createElement(View, { key: i, style: i % 2 === 0 ? body.tableRow : body.tableRowAlt },
                React.createElement(Text, { style: [body.tableCellMono, { flex: 2 }] }, fmt(c.claimNumber)),
                React.createElement(Text, { style: [body.tableCell, { flex: 2 }] }, fmt(c.claimantName)),
                React.createElement(Text, { style: body.tableCellMono }, fmtCurrency(c.totalClaimAmount ?? c.estimatedClaimValue ?? 0, currency)),
                React.createElement(Text, { style: [body.tableCell, { color: decisionColour(c.aiRecommendation ?? '') }] }, fmt(c.aiRecommendation)),
                React.createElement(Text, { style: body.tableCellMono }, days != null ? String(days) : '—'),
              );
            })
          )
        : React.createElement(Text, { style: { fontSize: 8, color: C.textMuted, fontFamily: 'Helvetica-Oblique' } }, 'No claims in the financial decision queue.'),

      // Determination
      React.createElement(SectionHeader, { number: tier !== 'process' ? '06' : '05', title: 'Validated Determination' }),
      React.createElement(View, { style: body.signoffBox },
        React.createElement(InfoRow, { label: 'Fraud Rate', value: fmtPct(riskKpis.fraudRate?.value), mono: true }),
        React.createElement(InfoRow, { label: 'High-Risk Claims', value: String(riskKpis.highRiskCount?.value ?? 0), mono: true }),
        React.createElement(InfoRow, { label: 'Escalations', value: String(escalations.length), mono: true }),
        React.createElement(View, { style: { marginTop: 16 } },
          React.createElement(Text, { style: body.signoffLabel }, 'REVIEWED BY'),
          React.createElement(View, { style: body.signoffLine }),
          React.createElement(Text, { style: body.signoffLabel }, 'SIGNATURE'),
          React.createElement(View, { style: body.signoffLine }),
          React.createElement(Text, { style: body.signoffLabel }, 'DATE'),
          React.createElement(View, { style: [body.signoffLine, { width: 120 }] }),
        )
      ),
      React.createElement(View, { style: body.disclaimerBox },
        React.createElement(Text, { style: body.disclaimerText },
          `KINGA AutoVerify AI provides decision-support intelligence only. This risk portfolio report is confidential to the insurer and its authorised representatives. Report ID: ${fmt(reportId)}`
        )
      ),

      React.createElement(PageFooter, { reportId, tier, page: '3' })
    )
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// REPORT TYPE 4: EXECUTIVE SUMMARY REPORT
// ═══════════════════════════════════════════════════════════════════════════

function ExecutiveReport({ data }: { data: any }) {
  const { executiveSummary, overview, riskAnalytics, tier, reportId, generatedAt, tenantName, currencyCode } = data;
  const currency = currencyCode ?? 'USD';
  const kpis = executiveSummary?.kpis ?? overview?.kpis ?? {};

  return React.createElement(Document,
    { title: `KINGA Executive Summary — ${tenantName ?? reportId}`, author: 'KINGA AutoVerify AI' },

    React.createElement(CoverPage, {
      reportTitle: 'Executive Summary Report',
      reportSubtitle: tenantName ?? 'Board-Level Intelligence',
      reportTypeLabel: 'Executive Report',
      meta: [
        { label: 'Total Claims', value: kpis.totalClaims?.value },
        { label: 'KINGA Savings', value: fmtCurrency(kpis.totalSavings?.value ?? 0, currency) },
        { label: 'Resolution Rate', value: kpis.resolutionRate?.value != null ? `${kpis.resolutionRate.value}%` : '—' },
        { label: 'Generated', value: fmtDate(generatedAt) },
      ],
      tier, reportId, generatedAt,
    }),

    React.createElement(Page, { size: 'A4', style: body.page },
      React.createElement(PageHeader, { reportType: 'Executive Summary Report', claimRef: tenantName, date: generatedAt }),

      React.createElement(SectionHeader, { number: '01', title: 'Board-Level Summary' }),
      React.createElement(View, { style: body.blockquote },
        React.createElement(Text, { style: body.blockquoteText },
          `During the reporting period, ${tenantName ?? 'the insurer'} processed ${kpis.totalClaims?.value ?? '—'} claims through the KINGA AutoVerify AI platform. ` +
          `KINGA identified total savings of ${fmtCurrency(kpis.totalSavings?.value ?? 0, currency)} against submitted claim values. ` +
          `The portfolio fraud rate was ${kpis.fraudRate?.value != null ? `${kpis.fraudRate.value}%` : 'not available'}, ` +
          `with an average claim resolution time of ${kpis.avgCycleDays?.value ?? '—'} days. ` +
          `The overall resolution rate for the period was ${kpis.resolutionRate?.value != null ? `${kpis.resolutionRate.value}%` : 'not available'}.`
        )
      ),

      React.createElement(SectionHeader, { number: '02', title: 'Hero Key Performance Indicators' }),
      React.createElement(View, { style: body.kpiStrip },
        React.createElement(KpiCard, { label: 'Total Claims', value: kpis.totalClaims?.value, delta: kpis.totalClaims?.delta }),
        React.createElement(KpiCard, { label: 'KINGA Savings', value: fmtCurrency(kpis.totalSavings?.value ?? 0, currency), colour: C.teal, delta: kpis.totalSavings?.delta }),
        React.createElement(KpiCard, { label: 'Resolution Rate', value: fmtPct(kpis.resolutionRate?.value), colour: C.teal }),
        React.createElement(KpiCard, { label: 'Avg Cycle Days', value: kpis.avgCycleDays?.value, delta: kpis.avgCycleDays?.delta }),
        React.createElement(KpiCard, { label: 'Fraud Rate', value: fmtPct(kpis.fraudRate?.value), colour: (kpis.fraudRate?.value ?? 0) > 15 ? C.red : C.teal }),
      ),

      React.createElement(SectionHeader, { number: '03', title: 'Financial Performance' }),
      React.createElement(View, { style: body.table },
        React.createElement(View, { style: body.tableHeaderRow },
          React.createElement(Text, { style: [body.tableHeaderCell, { flex: 3 }] }, 'METRIC'),
          React.createElement(Text, { style: body.tableHeaderCell }, 'VALUE'),
          React.createElement(Text, { style: body.tableHeaderCell }, 'PERIOD DELTA'),
        ),
        ...[
          { label: 'Total Submitted Value', value: fmtCurrency(executiveSummary?.totalSubmitted ?? 0, currency), delta: null },
          { label: 'Total Approved Value', value: fmtCurrency(executiveSummary?.totalApproved ?? 0, currency), delta: null },
          { label: 'KINGA Identified Savings', value: fmtCurrency(kpis.totalSavings?.value ?? 0, currency), delta: kpis.totalSavings?.delta },
          { label: 'Savings Rate', value: executiveSummary?.totalSubmitted > 0 ? fmtPct(((kpis.totalSavings?.value ?? 0) / executiveSummary.totalSubmitted) * 100) : '—', delta: null },
          { label: 'High-Risk Claims (Fraud)', value: String(riskAnalytics?.kpis?.highRiskCount?.value ?? '—'), delta: null },
        ].map((row, i) =>
          React.createElement(View, { key: i, style: i % 2 === 0 ? body.tableRow : body.tableRowAlt },
            React.createElement(Text, { style: [body.tableCell, { flex: 3 }] }, row.label),
            React.createElement(Text, { style: body.tableCellMono }, row.value),
            React.createElement(Text, { style: [body.tableCellMono, { color: row.delta != null ? (row.delta >= 0 ? C.teal : C.red) : C.textMuted }] },
              row.delta != null ? `${row.delta >= 0 ? '▲' : '▼'} ${Math.abs(row.delta)}%` : '—'
            ),
          )
        )
      ),

      React.createElement(SectionHeader, { number: '04', title: 'KINGA ROI Calculation' }),
      (() => {
        const totalClaims = kpis.totalClaims?.value ?? 0;
        const tierFees: Record<string, number> = { process: 900, protect: 1300, prove: 1600 };
        const monthlyFee = tierFees[tier] ?? 900;
        const perClaimFee = 12;
        const platformCost = monthlyFee + (totalClaims * perClaimFee);
        const savings = kpis.totalSavings?.value ?? 0;
        const netRoi = savings - platformCost;
        const roiPct = platformCost > 0 ? Math.round((netRoi / platformCost) * 100) : 0;
        return React.createElement(View, { style: body.table },
          React.createElement(View, { style: body.tableHeaderRow },
            React.createElement(Text, { style: [body.tableHeaderCell, { flex: 3 }] }, 'ROI COMPONENT'),
            React.createElement(Text, { style: body.tableHeaderCell }, 'VALUE'),
          ),
          ...[
            { label: `Monthly Platform Fee (${tierLabel(tier)})`, value: fmtCurrency(monthlyFee, 'USD') },
            { label: `Per-Claim Fee (${totalClaims} × $12)`, value: fmtCurrency(totalClaims * perClaimFee, 'USD') },
            { label: 'Total Platform Cost', value: fmtCurrency(platformCost, 'USD') },
            { label: 'KINGA Identified Savings', value: fmtCurrency(savings, currency) },
            { label: 'Net ROI', value: fmtCurrency(netRoi, currency) },
            { label: 'ROI %', value: `${roiPct}%` },
          ].map((row, i) =>
            React.createElement(View, { key: i, style: i % 2 === 0 ? body.tableRow : body.tableRowAlt },
              React.createElement(Text, { style: [body.tableCell, { flex: 3 }] }, row.label),
              React.createElement(Text, { style: [body.tableCellMono, { color: row.label === 'Net ROI' ? (netRoi >= 0 ? C.teal : C.red) : C.textPrimary }] }, row.value),
            )
          )
        );
      })(),

      React.createElement(View, { style: body.disclaimerBox },
        React.createElement(Text, { style: body.disclaimerText },
          `KINGA AutoVerify AI provides decision-support intelligence only. This executive report is confidential to the insurer and its authorised representatives. Report ID: ${fmt(reportId)}`
        )
      ),

      React.createElement(PageFooter, { reportId, tier, page: '2' })
    )
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// REPORT TYPE 5: ASSESSOR PERFORMANCE REPORT
// ═══════════════════════════════════════════════════════════════════════════

function AssessorPerformanceReport({ data }: { data: any }) {
  const { performance, assignments = [], appointments = [], evaluations = [], tier, reportId, generatedAt, currencyCode } = data;
  const currency = currencyCode ?? 'USD';

  return React.createElement(Document,
    { title: `KINGA Assessor Performance Report — ${reportId}`, author: 'KINGA AutoVerify AI' },

    React.createElement(CoverPage, {
      reportTitle: 'Assessor Performance Report',
      reportSubtitle: `${performance?.assessorName ?? 'Internal Assessor'}`,
      reportTypeLabel: 'Assessor Report',
      meta: [
        { label: 'Assessor', value: performance?.assessorName },
        { label: 'Tier', value: performance?.assessorTier },
        { label: 'Performance Score', value: performance?.performanceScore != null ? `${performance.performanceScore}/100` : '—' },
        { label: 'Generated', value: fmtDate(generatedAt) },
      ],
      tier, reportId, generatedAt,
    }),

    React.createElement(Page, { size: 'A4', style: body.page },
      React.createElement(PageHeader, { reportType: 'Assessor Performance Report', claimRef: performance?.assessorName, date: generatedAt }),

      React.createElement(SectionHeader, { number: '01', title: 'Assessor Profile' }),
      React.createElement(View, { style: body.twoCol },
        React.createElement(View, { style: body.col },
          React.createElement(InfoRow, { label: 'Name', value: performance?.assessorName }),
          React.createElement(InfoRow, { label: 'Assessor Tier', value: performance?.assessorTier }),
          React.createElement(InfoRow, { label: 'Performance Score', value: performance?.performanceScore != null ? `${performance.performanceScore}/100` : '—', mono: true }),
        ),
        React.createElement(View, { style: body.col },
          React.createElement(InfoRow, { label: 'Total Assessments', value: performance?.totalAssessments, mono: true }),
          React.createElement(InfoRow, { label: 'Accuracy Score', value: performance?.accuracyScore != null ? `${performance.accuracyScore}%` : '—', mono: true }),
          React.createElement(InfoRow, { label: 'Avg Cycle Days', value: performance?.avgCycleDays, mono: true }),
        )
      ),

      React.createElement(SectionHeader, { number: '02', title: 'Performance KPIs' }),
      React.createElement(View, { style: body.kpiStrip },
        React.createElement(KpiCard, { label: 'Performance Score', value: `${performance?.performanceScore ?? '—'}/100`, colour: (performance?.performanceScore ?? 0) >= 80 ? C.teal : C.amber }),
        React.createElement(KpiCard, { label: 'Accuracy Score', value: fmtPct(performance?.accuracyScore), colour: (performance?.accuracyScore ?? 0) >= 80 ? C.teal : C.amber }),
        React.createElement(KpiCard, { label: 'Total Assessments', value: performance?.totalAssessments }),
        React.createElement(KpiCard, { label: 'Avg Cycle Days', value: performance?.avgCycleDays }),
      ),

      React.createElement(SectionHeader, { number: '03', title: 'Assigned Claims Register' }),
      assignments.length > 0
        ? React.createElement(View, { style: body.table },
            React.createElement(View, { style: body.tableHeaderRow },
              React.createElement(Text, { style: [body.tableHeaderCell, { flex: 2 }] }, 'CLAIM NO.'),
              React.createElement(Text, { style: [body.tableHeaderCell, { flex: 2 }] }, 'VEHICLE'),
              React.createElement(Text, { style: body.tableHeaderCell }, 'INCIDENT'),
              React.createElement(Text, { style: body.tableHeaderCell }, 'STATE'),
              React.createElement(Text, { style: body.tableHeaderCell }, 'MY ESTIMATE'),
              React.createElement(Text, { style: body.tableHeaderCell }, 'APPROVED'),
            ),
            ...assignments.slice(0, 20).map((c: any, i: number) =>
              React.createElement(View, { key: i, style: i % 2 === 0 ? body.tableRow : body.tableRowAlt },
                React.createElement(Text, { style: [body.tableCellMono, { flex: 2 }] }, fmt(c.claimNumber)),
                React.createElement(Text, { style: [body.tableCell, { flex: 2 }] }, `${fmt(c.vehicleMake)} ${fmt(c.vehicleModel)}`),
                React.createElement(Text, { style: body.tableCell }, fmt(c.incidentType)),
                React.createElement(StatusBadge, { status: c.workflowState ?? c.status }),
                React.createElement(Text, { style: body.tableCellMono }, c.assessorEstimatedCost ? fmtCurrency(c.assessorEstimatedCost, currency) : '—'),
                React.createElement(Text, { style: [body.tableCellMono, { color: c.finalApprovedAmount ? C.teal : C.textMuted }] }, c.finalApprovedAmount ? fmtCurrency(c.finalApprovedAmount, currency) : '—'),
              )
            )
          )
        : React.createElement(Text, { style: { fontSize: 8, color: C.textMuted, fontFamily: 'Helvetica-Oblique' } }, 'No assignments in the selected period.'),

      React.createElement(PageFooter, { reportId, tier, page: '2' })
    ),

    React.createElement(Page, { size: 'A4', style: body.page },
      React.createElement(PageHeader, { reportType: 'Assessor Performance Report', claimRef: performance?.assessorName, date: generatedAt }),

      React.createElement(SectionHeader, { number: '04', title: 'Appointments Summary' }),
      appointments.length > 0
        ? React.createElement(View, { style: body.table },
            React.createElement(View, { style: body.tableHeaderRow },
              React.createElement(Text, { style: [body.tableHeaderCell, { flex: 2 }] }, 'DATE'),
              React.createElement(Text, { style: [body.tableHeaderCell, { flex: 2 }] }, 'CLAIM NO.'),
              React.createElement(Text, { style: [body.tableHeaderCell, { flex: 3 }] }, 'LOCATION'),
              React.createElement(Text, { style: body.tableHeaderCell }, 'STATUS'),
            ),
            ...appointments.slice(0, 15).map((a: any, i: number) =>
              React.createElement(View, { key: i, style: i % 2 === 0 ? body.tableRow : body.tableRowAlt },
                React.createElement(Text, { style: [body.tableCellMono, { flex: 2 }] }, fmtDate(a.scheduledDate ?? a.appointmentDate)),
                React.createElement(Text, { style: [body.tableCellMono, { flex: 2 }] }, fmt(a.claimNumber ?? a.claimId)),
                React.createElement(Text, { style: [body.tableCell, { flex: 3 }] }, fmt(a.location ?? a.address)),
                React.createElement(StatusBadge, { status: a.status }),
              )
            )
          )
        : React.createElement(Text, { style: { fontSize: 8, color: C.textMuted, fontFamily: 'Helvetica-Oblique' } }, 'No appointments in the selected period.'),

      // Evaluations (Protect+)
      tier !== 'process'
        ? React.createElement(View, null,
            React.createElement(SectionHeader, { number: '05', title: 'Evaluations Received' }),
            evaluations.length > 0
              ? React.createElement(View, { style: body.table },
                  React.createElement(View, { style: body.tableHeaderRow },
                    React.createElement(Text, { style: [body.tableHeaderCell, { flex: 2 }] }, 'DATE'),
                    React.createElement(Text, { style: body.tableHeaderCell }, 'SCORE'),
                    React.createElement(Text, { style: [body.tableHeaderCell, { flex: 5 }] }, 'COMMENTS'),
                  ),
                  ...evaluations.slice(0, 10).map((e: any, i: number) =>
                    React.createElement(View, { key: i, style: i % 2 === 0 ? body.tableRow : body.tableRowAlt },
                      React.createElement(Text, { style: [body.tableCellMono, { flex: 2 }] }, fmtDate(e.createdAt)),
                      React.createElement(Text, { style: [body.tableCellMono, { color: (e.score ?? 0) >= 80 ? C.teal : C.amber }] }, fmt(e.score)),
                      React.createElement(Text, { style: [body.tableCell, { flex: 5, fontSize: 7 }] }, fmt(e.comments ?? e.feedback)),
                    )
                  )
                )
              : React.createElement(Text, { style: { fontSize: 8, color: C.textMuted, fontFamily: 'Helvetica-Oblique' } }, 'No evaluations in the selected period.')
          )
        : React.createElement(LockedSection, { availableIn: 'TIER 2 · PROTECT' }),

      React.createElement(View, { style: body.disclaimerBox },
        React.createElement(Text, { style: body.disclaimerText },
          `KINGA AutoVerify AI provides decision-support intelligence only. This assessor performance report is confidential. Report ID: ${fmt(reportId)}`
        )
      ),

      React.createElement(PageFooter, { reportId, tier, page: '3' })
    )
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// REPORT TYPE 6: CLAIMS PROCESSOR PERFORMANCE REPORT
// ═══════════════════════════════════════════════════════════════════════════

function ProcessorPerformanceReport({ data }: { data: any }) {
  const { queue = [], stats, tier, reportId, generatedAt, processorName, currencyCode } = data;
  const currency = currencyCode ?? 'USD';
  const breached = queue.filter((c: any) => c.slaStatus === 'breached').length;
  const critical = queue.filter((c: any) => c.slaStatus === 'critical').length;
  const onTrack = queue.filter((c: any) => c.slaStatus === 'on_track').length;

  return React.createElement(Document,
    { title: `KINGA Processor Performance Report — ${reportId}`, author: 'KINGA AutoVerify AI' },

    React.createElement(CoverPage, {
      reportTitle: 'Claims Processor Performance Report',
      reportSubtitle: processorName ?? 'Processing Queue Overview',
      reportTypeLabel: 'Processor Report',
      meta: [
        { label: 'Queue Size', value: queue.length },
        { label: 'SLA Breached', value: breached },
        { label: 'SLA Critical', value: critical },
        { label: 'Generated', value: fmtDate(generatedAt) },
      ],
      tier, reportId, generatedAt,
    }),

    React.createElement(Page, { size: 'A4', style: body.page },
      React.createElement(PageHeader, { reportType: 'Processor Performance Report', claimRef: processorName, date: generatedAt }),

      React.createElement(SectionHeader, { number: '01', title: 'Queue KPIs' }),
      React.createElement(View, { style: body.kpiStrip },
        React.createElement(KpiCard, { label: 'Total in Queue', value: queue.length }),
        React.createElement(KpiCard, { label: 'SLA Breached', value: breached, colour: breached > 0 ? C.red : C.teal }),
        React.createElement(KpiCard, { label: 'SLA Critical', value: critical, colour: critical > 0 ? C.amber : C.teal }),
        React.createElement(KpiCard, { label: 'On Track', value: onTrack, colour: C.teal }),
        React.createElement(KpiCard, { label: 'Completed', value: stats?.completedCount }),
      ),

      React.createElement(SectionHeader, { number: '02', title: 'SLA Compliance Analysis' }),
      React.createElement(View, { style: body.table },
        React.createElement(View, { style: body.tableHeaderRow },
          React.createElement(Text, { style: [body.tableHeaderCell, { flex: 3 }] }, 'SLA STATUS'),
          React.createElement(Text, { style: body.tableHeaderCell }, 'COUNT'),
          React.createElement(Text, { style: body.tableHeaderCell }, 'SHARE'),
          React.createElement(Text, { style: [body.tableHeaderCell, { flex: 4 }] }, 'DISTRIBUTION'),
        ),
        ...[
          { status: 'on_track', count: onTrack, colour: C.teal },
          { status: 'critical', count: critical, colour: C.amber },
          { status: 'breached', count: breached, colour: C.red },
        ].map((row, i) =>
          React.createElement(View, { key: i, style: i % 2 === 0 ? body.tableRow : body.tableRowAlt },
            React.createElement(StatusBadge, { status: row.status }),
            React.createElement(Text, { style: body.tableCellMono }, String(row.count)),
            React.createElement(Text, { style: body.tableCellMono }, queue.length > 0 ? `${Math.round((row.count / queue.length) * 100)}%` : '—'),
            React.createElement(View, { style: [body.col, { flex: 4, justifyContent: 'center' }] },
              React.createElement(BarIndicator, { value: row.count, max: queue.length, colour: row.colour })
            ),
          )
        )
      ),

      React.createElement(SectionHeader, { number: '03', title: 'Current Queue Register' }),
      queue.length > 0
        ? React.createElement(View, { style: body.table },
            React.createElement(View, { style: body.tableHeaderRow },
              React.createElement(Text, { style: [body.tableHeaderCell, { flex: 2 }] }, 'CLAIM NO.'),
              React.createElement(Text, { style: [body.tableHeaderCell, { flex: 2 }] }, 'CLAIMANT'),
              React.createElement(Text, { style: body.tableHeaderCell }, 'INCIDENT'),
              React.createElement(Text, { style: body.tableHeaderCell }, 'PRIORITY'),
              React.createElement(Text, { style: body.tableHeaderCell }, 'SLA'),
              React.createElement(Text, { style: body.tableHeaderCell }, 'DAYS'),
            ),
            ...queue.slice(0, 25).map((c: any, i: number) => {
              const days = c.createdAt ? Math.round((Date.now() - new Date(c.createdAt).getTime()) / 86400000) : null;
              return React.createElement(View, { key: i, style: i % 2 === 0 ? body.tableRow : body.tableRowAlt },
                React.createElement(Text, { style: [body.tableCellMono, { flex: 2 }] }, fmt(c.claimNumber)),
                React.createElement(Text, { style: [body.tableCell, { flex: 2 }] }, fmt(c.claimantName)),
                React.createElement(Text, { style: body.tableCell }, fmt(c.incidentType)),
                React.createElement(StatusBadge, { status: c.priority }),
                React.createElement(StatusBadge, { status: c.slaStatus }),
                React.createElement(Text, { style: body.tableCellMono }, days != null ? String(days) : '—'),
              );
            })
          )
        : React.createElement(Text, { style: { fontSize: 8, color: C.textMuted, fontFamily: 'Helvetica-Oblique' } }, 'Queue is empty.'),

      React.createElement(View, { style: body.disclaimerBox },
        React.createElement(Text, { style: body.disclaimerText },
          `KINGA AutoVerify AI provides decision-support intelligence only. Report ID: ${fmt(reportId)}`
        )
      ),

      React.createElement(PageFooter, { reportId, tier, page: '2' })
    )
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// REPORT TYPE 7: PANEL BEATER PERFORMANCE REPORT
// ═══════════════════════════════════════════════════════════════════════════

function PanelBeaterPerformanceReport({ data }: { data: any }) {
  const { analytics, quoteHistory = [], profile, tier, reportId, generatedAt, currencyCode } = data;
  const currency = currencyCode ?? 'USD';

  return React.createElement(Document,
    { title: `KINGA Panel Beater Performance Report — ${reportId}`, author: 'KINGA AutoVerify AI' },

    React.createElement(CoverPage, {
      reportTitle: 'Panel Beater Performance Report',
      reportSubtitle: profile?.businessName ?? profile?.name ?? 'Panel Beater Overview',
      reportTypeLabel: 'Panel Beater Report',
      meta: [
        { label: 'Panel Beater', value: profile?.businessName ?? profile?.name },
        { label: 'Approval Rate', value: analytics?.approvalRate != null ? `${analytics.approvalRate}%` : '—' },
        { label: 'Avg Variance', value: analytics?.avgVariancePct != null ? `${analytics.avgVariancePct}%` : '—' },
        { label: 'Generated', value: fmtDate(generatedAt) },
      ],
      tier, reportId, generatedAt,
    }),

    React.createElement(Page, { size: 'A4', style: body.page },
      React.createElement(PageHeader, { reportType: 'Panel Beater Performance Report', claimRef: profile?.businessName, date: generatedAt }),

      React.createElement(SectionHeader, { number: '01', title: 'Panel Beater Profile' }),
      React.createElement(View, { style: body.twoCol },
        React.createElement(View, { style: body.col },
          React.createElement(InfoRow, { label: 'Business Name', value: profile?.businessName }),
          React.createElement(InfoRow, { label: 'Registration No.', value: profile?.registrationNumber, mono: true }),
          React.createElement(InfoRow, { label: 'Location', value: profile?.location ?? profile?.address }),
        ),
        React.createElement(View, { style: body.col },
          React.createElement(InfoRow, { label: 'Rating', value: profile?.rating != null ? `${profile.rating}/5` : '—', mono: true }),
          React.createElement(InfoRow, { label: 'Specialisations', value: profile?.specialisations }),
          React.createElement(InfoRow, { label: 'Total Quotes', value: analytics?.totalQuotes, mono: true }),
        )
      ),

      React.createElement(SectionHeader, { number: '02', title: 'Performance KPIs' }),
      React.createElement(View, { style: body.kpiStrip },
        React.createElement(KpiCard, { label: 'Total Quotes', value: analytics?.totalQuotes }),
        React.createElement(KpiCard, { label: 'Approval Rate', value: fmtPct(analytics?.approvalRate), colour: (analytics?.approvalRate ?? 0) >= 70 ? C.teal : C.amber }),
        React.createElement(KpiCard, { label: 'Avg Variance vs AI', value: analytics?.avgVariancePct != null ? `${analytics.avgVariancePct}%` : '—', colour: Math.abs(analytics?.avgVariancePct ?? 0) > 20 ? C.red : C.teal }),
        React.createElement(KpiCard, { label: 'Avg Cycle Days', value: analytics?.avgCycleDays }),
      ),

      React.createElement(SectionHeader, { number: '03', title: 'Quote History Register' }),
      quoteHistory.length > 0
        ? React.createElement(View, { style: body.table },
            React.createElement(View, { style: body.tableHeaderRow },
              React.createElement(Text, { style: [body.tableHeaderCell, { flex: 2 }] }, 'CLAIM NO.'),
              React.createElement(Text, { style: [body.tableHeaderCell, { flex: 2 }] }, 'VEHICLE'),
              React.createElement(Text, { style: body.tableHeaderCell }, 'QUOTED'),
              React.createElement(Text, { style: body.tableHeaderCell }, 'AI ESTIMATE'),
              React.createElement(Text, { style: body.tableHeaderCell }, 'VARIANCE'),
              React.createElement(Text, { style: body.tableHeaderCell }, 'STATUS'),
            ),
            ...quoteHistory.slice(0, 20).map((q: any, i: number) => {
              const quoted = parseFloat(q.quotedAmount ?? '0');
              const aiEst = parseFloat(q.aiEstimate ?? '0');
              const variance = aiEst > 0 ? Math.round(((quoted - aiEst) / aiEst) * 100) : null;
              return React.createElement(View, { key: i, style: i % 2 === 0 ? body.tableRow : body.tableRowAlt },
                React.createElement(Text, { style: [body.tableCellMono, { flex: 2 }] }, fmt(q.claimNumber)),
                React.createElement(Text, { style: [body.tableCell, { flex: 2 }] }, `${fmt(q.vehicleMake)} ${fmt(q.vehicleModel)}`),
                React.createElement(Text, { style: body.tableCellMono }, fmtCurrency(quoted, currency)),
                React.createElement(Text, { style: body.tableCellMono }, aiEst > 0 ? fmtCurrency(aiEst, currency) : '—'),
                React.createElement(Text, { style: [body.tableCellMono, { color: variance != null ? (Math.abs(variance) > 20 ? C.red : Math.abs(variance) > 10 ? C.amber : C.teal) : C.textMuted }] },
                  variance != null ? `${variance > 0 ? '+' : ''}${variance}%` : '—'
                ),
                React.createElement(StatusBadge, { status: q.status ?? q.quoteStatus }),
              );
            })
          )
        : React.createElement(Text, { style: { fontSize: 8, color: C.textMuted, fontFamily: 'Helvetica-Oblique' } }, 'No quote history in the selected period.'),

      // Peer Comparison (Protect+)
      tier !== 'process' && analytics?.peerComparison
        ? React.createElement(View, null,
            React.createElement(SectionHeader, { number: '04', title: 'Peer Comparison (Anonymised)' }),
            React.createElement(View, { style: body.table },
              React.createElement(View, { style: body.tableHeaderRow },
                React.createElement(Text, { style: [body.tableHeaderCell, { flex: 3 }] }, 'METRIC'),
                React.createElement(Text, { style: body.tableHeaderCell }, 'YOUR VALUE'),
                React.createElement(Text, { style: body.tableHeaderCell }, 'PORTFOLIO AVG'),
              ),
              ...[
                { label: 'Approval Rate', yours: fmtPct(analytics.approvalRate), avg: fmtPct(analytics.peerComparison.avgApprovalRate) },
                { label: 'Avg Variance vs AI', yours: fmtPct(analytics.avgVariancePct), avg: fmtPct(analytics.peerComparison.avgVariancePct) },
                { label: 'Avg Cycle Days', yours: String(analytics.avgCycleDays ?? '—'), avg: String(analytics.peerComparison.avgCycleDays ?? '—') },
              ].map((row, i) =>
                React.createElement(View, { key: i, style: i % 2 === 0 ? body.tableRow : body.tableRowAlt },
                  React.createElement(Text, { style: [body.tableCell, { flex: 3 }] }, row.label),
                  React.createElement(Text, { style: body.tableCellMono }, row.yours),
                  React.createElement(Text, { style: [body.tableCellMono, { color: C.textMuted }] }, row.avg),
                )
              )
            )
          )
        : tier !== 'process' && React.createElement(LockedSection, { availableIn: 'TIER 2 · PROTECT' }),

      React.createElement(View, { style: body.disclaimerBox },
        React.createElement(Text, { style: body.disclaimerText },
          `KINGA AutoVerify AI provides decision-support intelligence only. Report ID: ${fmt(reportId)}`
        )
      ),

      React.createElement(PageFooter, { reportId, tier, page: '2' })
    )
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API — Report Dispatcher
// ═══════════════════════════════════════════════════════════════════════════

export type ReportType =
  | 'claims_assessment'
  | 'claims_manager_portfolio'
  | 'risk_manager_portfolio'
  | 'executive_summary'
  | 'assessor_performance'
  | 'processor_performance'
  | 'panel_beater_performance';

export interface KingaReportData {
  reportType: ReportType;
  tier: 'process' | 'protect' | 'prove';
  reportId: string;
  generatedAt: string;
  tenantName?: string;
  // Claims Assessment
  claim?: any;
  aiAssessment?: any;
  assessorEvaluation?: any;
  panelBeaterQuotes?: any[];
  // Portfolio reports
  overview?: any;
  riskAnalytics?: any;
  executiveSummary?: any;
  activeClaims?: any[];
  fraudAlerts?: any[];
  escalations?: any[];
  financialQueue?: any[];
  stats?: any;
  period?: { from: string; to: string };
  // Assessor
  performance?: any;
  assignments?: any[];
  appointments?: any[];
  evaluations?: any[];
  // Processor
  queue?: any[];
  processorName?: string;
  // Panel Beater
  analytics?: any;
  quoteHistory?: any[];
  profile?: any;
}

export async function generateKingaReport(data: KingaReportData): Promise<Buffer> {
  let element: any;

  switch (data.reportType) {
    case 'claims_assessment':
      element = React.createElement(ClaimsAssessmentReport, { data });
      break;
    case 'claims_manager_portfolio':
      element = React.createElement(ClaimsManagerReport, { data });
      break;
    case 'risk_manager_portfolio':
      element = React.createElement(RiskManagerReport, { data });
      break;
    case 'executive_summary':
      element = React.createElement(ExecutiveReport, { data });
      break;
    case 'assessor_performance':
      element = React.createElement(AssessorPerformanceReport, { data });
      break;
    case 'processor_performance':
      element = React.createElement(ProcessorPerformanceReport, { data });
      break;
    case 'panel_beater_performance':
      element = React.createElement(PanelBeaterPerformanceReport, { data });
      break;
    default:
      throw new Error(`Unknown report type: ${(data as any).reportType}`);
  }

  const instance = pdf(element);
  const blob = await instance.toBlob();
  const arrayBuffer = await blob.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
