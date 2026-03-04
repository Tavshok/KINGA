/**
 * Claim PDF Export
 *
 * Generates a comprehensive single-claim PDF report for insurers, including:
 *   - Claim header (vehicle, policy, incident details)
 *   - AI Assessment summary
 *   - Panel beater quotes table
 *   - AI Quote Optimisation Summary (risk score, recommended repairer,
 *     per-quote cost deviation, flags, AI narrative, insurer decision)
 *   - Graceful fallback when no optimisation result exists
 *
 * Uses Puppeteer-core + Chromium (same pattern as pdf-export.ts and
 * final-claim-report-pdf.ts) to convert HTML → PDF, then uploads to S3.
 */

import { z } from "zod";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import puppeteer from "puppeteer-core";
import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";

import { protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { storagePut } from "./storage";
import {
  claims,
  panelBeaterQuotes,
  aiAssessments,
  quoteOptimisationResults,
  users,
} from "../drizzle/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

/** A single per-quote analysis entry from quoteOptimisationResults.quoteAnalysis */
interface PerQuoteAnalysis {
  profileId?: string;
  companyName?: string;
  totalAmount?: number;
  partsAmount?: number;
  labourAmount?: number;
  costDeviationPercent?: number;
  flags?: string[];
  recommendation?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(cents: number | null | undefined): string {
  if (cents == null) return "N/A";
  return `R ${(cents / 100).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "N/A";
  return new Date(d).toLocaleDateString("en-ZA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return "N/A";
  return new Date(d).toLocaleString("en-ZA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function deviationColor(pct: number): string {
  const abs = Math.abs(pct);
  if (abs <= 5) return "#10b981";  // green  — within 5 %
  if (abs <= 15) return "#f59e0b"; // amber  — 5–15 %
  return "#ef4444";                // red    — > 15 %
}

function riskScoreColor(score: number): string {
  if (score <= 30) return "#10b981";
  if (score <= 60) return "#f59e0b";
  return "#ef4444";
}

function riskLevelLabel(level: string | null | undefined): string {
  switch (level) {
    case "low":      return "LOW";
    case "medium":   return "MEDIUM";
    case "high":     return "HIGH";
    case "critical": return "CRITICAL";
    default:         return "N/A";
  }
}

function riskLevelColor(level: string | null | undefined): string {
  switch (level) {
    case "low":      return "#10b981";
    case "medium":   return "#f59e0b";
    case "high":     return "#ef4444";
    case "critical": return "#7c3aed";
    default:         return "#6b7280";
  }
}

// ─── HTML Generator ──────────────────────────────────────────────────────────

interface ClaimPDFData {
  claim: typeof claims.$inferSelect;
  aiAssessment: typeof aiAssessments.$inferSelect | null;
  quotes: (typeof panelBeaterQuotes.$inferSelect)[];
  optimisation: typeof quoteOptimisationResults.$inferSelect | null;
  decisionUser: { name: string | null } | null;
}

function generateClaimPDFHTML(data: ClaimPDFData): string {
  const { claim, aiAssessment, quotes, optimisation, decisionUser } = data;

  // ── Parse per-quote analysis ──────────────────────────────────────────────
  let perQuoteAnalysis: PerQuoteAnalysis[] = [];
  if (optimisation?.quoteAnalysis) {
    try {
      const raw = typeof optimisation.quoteAnalysis === "string"
        ? JSON.parse(optimisation.quoteAnalysis)
        : optimisation.quoteAnalysis;
      if (Array.isArray(raw)) perQuoteAnalysis = raw as PerQuoteAnalysis[];
    } catch {
      // malformed JSON — leave empty
    }
  }

  // ── Insurer decision block ────────────────────────────────────────────────
  const hasDecision = optimisation?.insurerAcceptedRecommendation != null;
  const accepted = optimisation?.insurerAcceptedRecommendation === 1;
  const overrideReason = optimisation?.insurerOverrideReason ?? null;

  // ── Flags ─────────────────────────────────────────────────────────────────
  const flagLabourInflation = (optimisation?.labourInflationDetected ?? 0) === 1;
  const flagPartsInflation  = (optimisation?.partsInflationDetected  ?? 0) === 1;
  const flagOverpricing     = (optimisation?.overpricingDetected     ?? 0) === 1;

  // ── Risk score numeric (stored as decimal string) ─────────────────────────
  const riskNumeric = optimisation?.riskScoreNumeric
    ? parseFloat(String(optimisation.riskScoreNumeric))
    : null;

  // ── Quotes table rows ─────────────────────────────────────────────────────
  const quotesTableRows = quotes.map((q, idx) => {
    const pqa = perQuoteAnalysis[idx] ?? {};
    const dev = pqa.costDeviationPercent ?? null;
    const devStr = dev != null
      ? `<span style="color:${deviationColor(dev)};font-weight:600;">${dev >= 0 ? "+" : ""}${dev.toFixed(1)}%</span>`
      : "<span style=\"color:#6b7280;\">—</span>";
    const flagStr = (pqa.flags ?? []).length > 0
      ? pqa.flags!.map(f => `<span class="flag-chip">${f}</span>`).join(" ")
      : "<span style=\"color:#6b7280;\">None</span>";
    return `
      <tr>
        <td><strong>${pqa.companyName ?? `Panel Beater #${q.panelBeaterId}`}</strong></td>
        <td>${formatCurrency(q.quotedAmount)}</td>
        <td>${formatCurrency(q.laborCost)}</td>
        <td>${formatCurrency(q.partsCost)}</td>
        <td>${devStr}</td>
        <td>${flagStr}</td>
      </tr>`;
  }).join("\n");

  // ── AI Optimisation Summary section ──────────────────────────────────────
  let optimisationSection: string;

  if (!optimisation || optimisation.status !== "completed") {
    optimisationSection = `
    <div class="section no-break">
      <h2 class="section-title">AI Quote Optimisation Summary</h2>
      <div class="no-optimisation-notice">
        <span class="no-opt-icon">ℹ</span>
        No AI optimisation performed.
      </div>
    </div>`;
  } else {
    // ── Decision block ──────────────────────────────────────────────────────
    let decisionBlock: string;
    if (!hasDecision) {
      decisionBlock = `
        <div class="decision-pending">
          <span class="decision-label">Insurer Decision:</span>
          <span class="decision-badge decision-pending-badge">Pending</span>
        </div>`;
    } else if (accepted) {
      decisionBlock = `
        <div class="decision-block decision-accepted">
          <span class="decision-label">Insurer Decision:</span>
          <span class="decision-badge decision-accepted-badge">✓ Accepted</span>
          <div class="decision-meta">
            Decision recorded by ${decisionUser?.name ?? "Unknown"} on ${formatDateTime(optimisation.insurerDecisionAt)}.
          </div>
        </div>`;
    } else {
      decisionBlock = `
        <div class="decision-block decision-overridden">
          <span class="decision-label">Insurer Decision:</span>
          <span class="decision-badge decision-overridden-badge">⚠ Overridden</span>
          <div class="decision-meta">
            Decision recorded by ${decisionUser?.name ?? "Unknown"} on ${formatDateTime(optimisation.insurerDecisionAt)}.
          </div>
          ${overrideReason ? `
          <div class="override-reason-box">
            <strong>Override Reason:</strong><br/>
            ${overrideReason}
          </div>` : ""}
        </div>`;
    }

    // ── Per-quote analysis table (only when data is present) ────────────────
    const perQuoteTable = perQuoteAnalysis.length > 0 ? `
      <h3 class="section-subtitle">Per-Quote Cost Deviation Analysis</h3>
      <table class="opt-table">
        <thead>
          <tr>
            <th>Repairer</th>
            <th>Total Quote</th>
            <th>Labour</th>
            <th>Parts</th>
            <th>Deviation %</th>
            <th>Flags</th>
          </tr>
        </thead>
        <tbody>
          ${perQuoteAnalysis.map(pqa => {
            const dev = pqa.costDeviationPercent ?? null;
            const devStr = dev != null
              ? `<span style="color:${deviationColor(dev)};font-weight:600;">${dev >= 0 ? "+" : ""}${dev.toFixed(1)}%</span>`
              : "<span style=\"color:#6b7280;\">—</span>";
            const flagStr = (pqa.flags ?? []).length > 0
              ? pqa.flags!.map(f => `<span class="flag-chip">${f}</span>`).join(" ")
              : "<span style=\"color:#6b7280;\">None</span>";
            return `
            <tr>
              <td><strong>${pqa.companyName ?? "Unknown"}</strong></td>
              <td>${pqa.totalAmount != null ? formatCurrency(pqa.totalAmount) : "—"}</td>
              <td>${pqa.labourAmount != null ? formatCurrency(pqa.labourAmount) : "—"}</td>
              <td>${pqa.partsAmount != null ? formatCurrency(pqa.partsAmount) : "—"}</td>
              <td>${devStr}</td>
              <td>${flagStr}</td>
            </tr>`;
          }).join("\n")}
        </tbody>
      </table>` : "";

    optimisationSection = `
    <div class="section page-break">
      <h2 class="section-title">AI Quote Optimisation Summary</h2>

      <!-- Risk Score + Recommended Repairer ─────────────────────────────── -->
      <div class="opt-header-grid">
        <div class="opt-metric-card">
          <div class="opt-metric-label">Risk Score</div>
          <div class="opt-metric-value" style="color:${riskNumeric != null ? riskScoreColor(riskNumeric) : "#6b7280"};">
            ${riskNumeric != null ? riskNumeric.toFixed(0) : "—"}<span class="opt-metric-unit">/100</span>
          </div>
          <div class="opt-metric-sublabel">
            <span class="risk-level-badge" style="background:${riskLevelColor(optimisation.overallRiskScore)};">
              ${riskLevelLabel(optimisation.overallRiskScore)}
            </span>
          </div>
        </div>

        <div class="opt-metric-card">
          <div class="opt-metric-label">Recommended Repairer</div>
          <div class="opt-metric-value opt-metric-repairer">
            ${optimisation.recommendedCompanyName ?? "—"}
          </div>
          <div class="opt-metric-sublabel">AI-selected lowest-risk quote</div>
        </div>

        <div class="opt-metric-card">
          <div class="opt-metric-label">Inflation Flags</div>
          <div class="opt-flags-list">
            ${flagLabourInflation ? `<span class="flag-chip flag-red">Labour Inflation</span>` : ""}
            ${flagPartsInflation  ? `<span class="flag-chip flag-red">Parts Inflation</span>`  : ""}
            ${flagOverpricing     ? `<span class="flag-chip flag-amber">Overpricing</span>`    : ""}
            ${!flagLabourInflation && !flagPartsInflation && !flagOverpricing
              ? `<span class="flag-chip flag-green">No Flags</span>` : ""}
          </div>
        </div>
      </div>

      <!-- Per-quote deviation table ─────────────────────────────────────── -->
      ${perQuoteTable}

      <!-- AI Narrative Summary ─────────────────────────────────────────── -->
      ${optimisation.optimisationSummary ? `
      <h3 class="section-subtitle">AI Narrative Summary</h3>
      <div class="narrative-box">
        ${optimisation.optimisationSummary}
      </div>` : ""}

      <!-- Insurer Decision ─────────────────────────────────────────────── -->
      <h3 class="section-subtitle">Insurer Decision</h3>
      ${decisionBlock}
    </div>`;
  }

  // ── Full HTML document ────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Claim Report — ${claim.claimNumber}</title>
  <style>
    @page { size: A4; margin: 20mm 15mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      font-size: 10pt;
      line-height: 1.5;
      color: #1f2937;
      background: white;
    }

    /* ── Layout ─────────────────────────────────────────────────────────── */
    .container { max-width: 100%; }
    .section { margin-bottom: 28px; }
    .no-break { page-break-inside: avoid; }
    .page-break { page-break-before: always; }

    /* ── Header ─────────────────────────────────────────────────────────── */
    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 16px;
      border-bottom: 3px solid #2563eb;
      margin-bottom: 28px;
    }
    .report-title { font-size: 20pt; font-weight: 700; color: #1e40af; margin-bottom: 6px; }
    .report-subtitle { font-size: 10pt; color: #6b7280; margin-bottom: 12px; }
    .header-meta { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; font-size: 9pt; }
    .header-meta-label { font-weight: 600; color: #374151; }
    .header-meta-value { color: #1f2937; }
    .kinga-brand { font-size: 14pt; font-weight: 700; color: #1e40af; }
    .generated-at { font-size: 8pt; color: #6b7280; margin-top: 6px; }

    /* ── Section titles ──────────────────────────────────────────────────── */
    .section-title {
      font-size: 13pt;
      font-weight: 700;
      color: #1e40af;
      border-bottom: 2px solid #93c5fd;
      padding-bottom: 6px;
      margin-bottom: 14px;
    }
    .section-subtitle {
      font-size: 10pt;
      font-weight: 600;
      color: #374151;
      margin-top: 14px;
      margin-bottom: 8px;
    }

    /* ── Tables ──────────────────────────────────────────────────────────── */
    table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 9pt; }
    th {
      background: #1e40af;
      color: white;
      padding: 8px 10px;
      text-align: left;
      font-weight: 600;
      border: 1px solid #1e3a8a;
    }
    td { padding: 8px 10px; border: 1px solid #d1d5db; }
    tr:nth-child(even) td { background: #f9fafb; }

    /* ── AI assessment card ──────────────────────────────────────────────── */
    .ai-card {
      background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
      border-left: 4px solid #3b82f6;
      padding: 14px;
      border-radius: 6px;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 14px;
    }
    .ai-card-item-label { font-size: 8pt; color: #6b7280; text-transform: uppercase; letter-spacing: 0.4px; }
    .ai-card-item-value { font-size: 14pt; font-weight: 700; color: #1e40af; }

    /* ── Optimisation header grid ────────────────────────────────────────── */
    .opt-header-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 14px;
      margin-bottom: 18px;
    }
    .opt-metric-card {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 14px;
    }
    .opt-metric-label { font-size: 8pt; color: #6b7280; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 6px; }
    .opt-metric-value { font-size: 22pt; font-weight: 700; line-height: 1; margin-bottom: 6px; }
    .opt-metric-repairer { font-size: 13pt; }
    .opt-metric-unit { font-size: 11pt; font-weight: 400; color: #6b7280; }
    .opt-metric-sublabel { font-size: 8pt; color: #6b7280; }

    /* ── Risk level badge ────────────────────────────────────────────────── */
    .risk-level-badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 8pt;
      font-weight: 700;
      color: white;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* ── Flags ───────────────────────────────────────────────────────────── */
    .opt-flags-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .flag-chip {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 8pt;
      font-weight: 600;
    }
    .flag-red    { background: #fee2e2; color: #991b1b; }
    .flag-amber  { background: #fef3c7; color: #92400e; }
    .flag-green  { background: #d1fae5; color: #065f46; }

    /* ── Optimisation table ──────────────────────────────────────────────── */
    .opt-table th { background: #1e40af; }

    /* ── AI Narrative ────────────────────────────────────────────────────── */
    .narrative-box {
      background: #fefce8;
      border-left: 4px solid #ca8a04;
      padding: 14px;
      border-radius: 6px;
      font-size: 9pt;
      line-height: 1.7;
      color: #1f2937;
      margin-bottom: 14px;
    }

    /* ── Decision blocks ─────────────────────────────────────────────────── */
    .decision-block { padding: 14px; border-radius: 6px; margin-top: 10px; }
    .decision-accepted  { background: #d1fae5; border: 1px solid #6ee7b7; }
    .decision-overridden { background: #fef3c7; border: 2px solid #f59e0b; }
    .decision-pending   { padding: 10px 0; }
    .decision-label { font-size: 9pt; font-weight: 600; color: #374151; margin-right: 10px; }
    .decision-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 9pt;
      font-weight: 700;
    }
    .decision-accepted-badge  { background: #065f46; color: white; }
    .decision-overridden-badge { background: #92400e; color: white; }
    .decision-pending-badge   { background: #6b7280; color: white; }
    .decision-meta { font-size: 8pt; color: #374151; margin-top: 8px; }
    .override-reason-box {
      margin-top: 10px;
      padding: 10px;
      background: white;
      border: 1px solid #f59e0b;
      border-radius: 4px;
      font-size: 9pt;
      line-height: 1.6;
      color: #78350f;
    }

    /* ── No-optimisation notice ──────────────────────────────────────────── */
    .no-optimisation-notice {
      display: flex;
      align-items: center;
      gap: 10px;
      background: #f3f4f6;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      padding: 16px;
      font-size: 10pt;
      color: #374151;
    }
    .no-opt-icon { font-size: 18pt; color: #9ca3af; }

    /* ── Footer ──────────────────────────────────────────────────────────── */
    .report-footer {
      margin-top: 30px;
      padding-top: 12px;
      border-top: 1px solid #d1d5db;
      font-size: 8pt;
      color: #6b7280;
      text-align: center;
    }
  </style>
</head>
<body>
<div class="container">

  <!-- ── Report Header ──────────────────────────────────────────────────── -->
  <div class="report-header no-break">
    <div>
      <div class="report-title">Claim Report</div>
      <div class="report-subtitle">KINGA AutoVerify AI — Insurer Export</div>
      <div class="header-meta">
        <span class="header-meta-label">Claim Number:</span>
        <span class="header-meta-value">${claim.claimNumber}</span>

        <span class="header-meta-label">Status:</span>
        <span class="header-meta-value">${(claim.status ?? "").replace(/_/g, " ").toUpperCase()}</span>

        <span class="header-meta-label">Vehicle:</span>
        <span class="header-meta-value">${claim.vehicleMake ?? ""} ${claim.vehicleModel ?? ""} ${claim.vehicleYear ?? ""}</span>

        <span class="header-meta-label">Registration:</span>
        <span class="header-meta-value">${claim.vehicleRegistration ?? "N/A"}</span>

        <span class="header-meta-label">Policy Number:</span>
        <span class="header-meta-value">${claim.policyNumber ?? "N/A"}</span>

        <span class="header-meta-label">Incident Date:</span>
        <span class="header-meta-value">${formatDate(claim.incidentDate)}</span>

        <span class="header-meta-label">Incident Location:</span>
        <span class="header-meta-value">${claim.incidentLocation ?? "N/A"}</span>
      </div>
    </div>
    <div style="text-align:right;">
      <div class="kinga-brand">KINGA</div>
      <div class="generated-at">Generated: ${formatDateTime(new Date())}</div>
    </div>
  </div>

  <!-- ── AI Assessment Summary ──────────────────────────────────────────── -->
  <div class="section no-break">
    <h2 class="section-title">AI Assessment Summary</h2>
    ${aiAssessment ? `
    <div class="ai-card">
      <div>
        <div class="ai-card-item-label">Estimated Cost</div>
        <div class="ai-card-item-value">${formatCurrency(aiAssessment.estimatedCost)}</div>
      </div>
      <div>
        <div class="ai-card-item-label">Fraud Risk</div>
        <div class="ai-card-item-value" style="color:${riskLevelColor(aiAssessment.fraudRiskLevel)};">
          ${(aiAssessment.fraudRiskLevel ?? "N/A").toUpperCase()}
        </div>
      </div>
      <div>
        <div class="ai-card-item-label">Confidence Score</div>
        <div class="ai-card-item-value">${aiAssessment.confidenceScore ?? "—"}%</div>
      </div>
    </div>
    ${aiAssessment.damageDescription ? `<p style="font-size:9pt;color:#374151;">${aiAssessment.damageDescription}</p>` : ""}
    ` : `<p style="color:#6b7280;font-size:9pt;">No AI assessment has been performed for this claim.</p>`}
  </div>

  <!-- ── Panel Beater Quotes ─────────────────────────────────────────────── -->
  <div class="section no-break">
    <h2 class="section-title">Panel Beater Quotes</h2>
    ${quotes.length > 0 ? `
    <table>
      <thead>
        <tr>
          <th>Repairer</th>
          <th>Total Quote</th>
          <th>Labour</th>
          <th>Parts</th>
          <th>Deviation %</th>
          <th>Flags</th>
        </tr>
      </thead>
      <tbody>
        ${quotesTableRows}
      </tbody>
    </table>` : `<p style="color:#6b7280;font-size:9pt;">No quotes have been submitted for this claim.</p>`}
  </div>

  <!-- ── AI Quote Optimisation Summary ──────────────────────────────────── -->
  ${optimisationSection}

  <!-- ── Footer ─────────────────────────────────────────────────────────── -->
  <div class="report-footer">
    KINGA AutoVerify AI &nbsp;|&nbsp; Claim ${claim.claimNumber} &nbsp;|&nbsp; Confidential — For Insurance Use Only
  </div>

</div>
</body>
</html>`;
}

// ─── tRPC Procedure ──────────────────────────────────────────────────────────

/**
 * exportClaimPDF
 *
 * Generates a comprehensive PDF for a single claim, including the AI Quote
 * Optimisation Summary section. Uploads the result to S3 and returns the URL.
 *
 * @requires Authentication (any authenticated user with access to the claim)
 * @param claimId - The numeric ID of the claim to export
 * @returns { success, pdfUrl, fileName }
 */
export const exportClaimPDF = protectedProcedure
  .input(z.object({ claimId: z.number().int().positive() }))
  .mutation(async ({ ctx, input }) => {
    if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });

    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    // ── 1. Fetch claim (with optional tenant isolation for non-admin users) ─
    const tenantId = ctx.user.role === "admin" ? undefined : (ctx.user.tenantId ?? undefined);

    const claimRows = await db
      .select()
      .from(claims)
      .where(
        tenantId
          ? and(eq(claims.id, input.claimId), eq(claims.tenantId, tenantId))
          : eq(claims.id, input.claimId)
      )
      .limit(1);

    const claim = claimRows[0];
    if (!claim) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found or access denied" });
    }

    // ── 2. Fetch AI assessment ─────────────────────────────────────────────
    const aiRows = await db
      .select()
      .from(aiAssessments)
      .where(eq(aiAssessments.claimId, input.claimId))
      .orderBy(aiAssessments.id)
      .limit(1);
    const aiAssessment = aiRows[0] ?? null;

    // ── 3. Fetch panel beater quotes ──────────────────────────────────────
    const quotes = await db
      .select()
      .from(panelBeaterQuotes)
      .where(eq(panelBeaterQuotes.claimId, input.claimId))
      .orderBy(panelBeaterQuotes.id);

    // ── 4. Fetch latest completed optimisation result ─────────────────────
    const optRows = await db
      .select()
      .from(quoteOptimisationResults)
      .where(
        and(
          eq(quoteOptimisationResults.claimId, input.claimId),
          eq(quoteOptimisationResults.status, "completed")
        )
      )
      .orderBy(quoteOptimisationResults.id)
      .limit(1);
    const optimisation = optRows[0] ?? null;

    // ── 5. Fetch insurer decision user name (if decision was recorded) ─────
    let decisionUser: { name: string | null } | null = null;
    if (optimisation?.insurerDecisionBy) {
      const userRows = await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, optimisation.insurerDecisionBy))
        .limit(1);
      decisionUser = userRows[0] ?? null;
    }

    // ── 6. Generate HTML ──────────────────────────────────────────────────
    const htmlContent = generateClaimPDFHTML({
      claim,
      aiAssessment,
      quotes,
      optimisation,
      decisionUser,
    });

    // ── 7. Convert HTML → PDF via Puppeteer ──────────────────────────────
    const tempId = randomBytes(16).toString("hex");
    const htmlPath = join(tmpdir(), `kinga-claim-${tempId}.html`);

    await writeFile(htmlPath, htmlContent, "utf-8");

    let pdfBuffer: Buffer;
    let browser;
    try {
      browser = await puppeteer.launch({
        executablePath: "/usr/bin/chromium-browser",
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
      });
      const page = await browser.newPage();
      await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle0", timeout: 30_000 });
      pdfBuffer = Buffer.from(
        await page.pdf({
          format: "A4",
          printBackground: true,
          margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
          displayHeaderFooter: true,
          headerTemplate: "<div></div>",
          footerTemplate: `
            <div style="width:100%;font-size:8px;color:#6b7280;text-align:center;padding:0 10mm;">
              KINGA AutoVerify AI &nbsp;|&nbsp; Claim ${claim.claimNumber} &nbsp;|&nbsp; Confidential
              <span style="float:right;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
            </div>`,
        })
      );
    } finally {
      if (browser) await browser.close();
      await unlink(htmlPath).catch(() => {});
    }

    // ── 8. Upload to S3 ───────────────────────────────────────────────────
    const fileName = `claim-report-${claim.claimNumber}-${Date.now()}.pdf`;
    const { url: pdfUrl } = await storagePut(
      `claim-reports/${fileName}`,
      pdfBuffer,
      "application/pdf"
    );

    return { success: true, pdfUrl, fileName };
  });
