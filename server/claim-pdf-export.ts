/**
 * Claim PDF Export — Governance-Complete Edition
 *
 * Generates a comprehensive single-claim PDF report for insurers, including:
 *   - Claim header (vehicle, policy, incident details)
 *   - AI Assessment summary
 *   - Ranked Panel Beater Choices (1st/2nd/3rd) with Preferred, SLA Signed,
 *     and AI Recommended badges
 *   - Mismatch warning when assigned repairer differs from claimant preference
 *   - Override Reason display when insurer overrode the AI recommendation
 *   - Panel beater quotes table
 *   - AI Quote Optimisation Summary (risk score, recommended repairer,
 *     per-quote cost deviation, flags, AI narrative, insurer decision)
 *   - Graceful fallback when no optimisation result exists
 *   - Audit log entry: action = "claim_pdf_exported"
 *
 * Security: uses insurerDomainProcedure — structural tenant isolation enforced.
 * All queries filter by ctx.insurerTenantId.
 *
 * Uses Puppeteer-core + Chromium to convert HTML → PDF, then uploads to S3.
 */

import { z } from "zod";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import puppeteer from "puppeteer-core";
import { TRPCError } from "@trpc/server";
import { eq, and, inArray } from "drizzle-orm";

import { insurerDomainProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { storagePut } from "./storage";
import {
  claims,
  panelBeaterQuotes,
  aiAssessments,
  quoteOptimisationResults,
  marketplaceProfiles,
  insurerMarketplaceRelationships,
  auditTrail,
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

/** Resolved panel beater choice with relationship metadata */
interface PanelBeaterChoice {
  rank: 1 | 2 | 3;
  profileId: string;
  companyName: string;
  preferred: boolean;
  slaSigned: boolean;
  aiRecommended: boolean;
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

const RANK_LABELS: Record<1 | 2 | 3, string> = {
  1: "1st Choice",
  2: "2nd Choice",
  3: "3rd Choice",
};

const RANK_ICONS: Record<1 | 2 | 3, string> = {
  1: "①",
  2: "②",
  3: "③",
};

// ─── HTML Generator ──────────────────────────────────────────────────────────

interface ClaimPDFData {
  claim: typeof claims.$inferSelect;
  aiAssessment: typeof aiAssessments.$inferSelect | null;
  quotes: (typeof panelBeaterQuotes.$inferSelect)[];
  optimisation: typeof quoteOptimisationResults.$inferSelect | null;
  decisionUser: { name: string | null } | null;
  panelBeaterChoices: PanelBeaterChoice[];
  assignedRepairerName: string | null;
}

function generateClaimPDFHTML(data: ClaimPDFData): string {
  const {
    claim,
    aiAssessment,
    quotes,
    optimisation,
    decisionUser,
    panelBeaterChoices,
    assignedRepairerName,
  } = data;

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

  // ── Ranked Panel Beater Choices section ──────────────────────────────────
  const choiceProfileIds = new Set(panelBeaterChoices.map(c => c.profileId));
  const assignedIsInChoices = assignedRepairerName != null &&
    panelBeaterChoices.some(c => c.companyName === assignedRepairerName);

  const choicesRows = panelBeaterChoices.length > 0
    ? panelBeaterChoices.map(choice => {
        const badges: string[] = [];
        if (choice.aiRecommended) {
          badges.push(`<span class="badge badge-ai">AI Recommended</span>`);
        }
        if (choice.preferred) {
          badges.push(`<span class="badge badge-preferred">Preferred</span>`);
        }
        if (choice.slaSigned) {
          badges.push(`<span class="badge badge-sla">SLA Signed</span>`);
        }
        const badgeStr = badges.length > 0
          ? `<div class="choice-badges">${badges.join(" ")}</div>`
          : "";
        return `
        <div class="choice-row">
          <div class="choice-rank">${RANK_ICONS[choice.rank]}</div>
          <div class="choice-body">
            <div class="choice-label">${RANK_LABELS[choice.rank]}</div>
            <div class="choice-name">${choice.companyName}</div>
            ${badgeStr}
          </div>
        </div>`;
      }).join("\n")
    : `<p class="no-data-text">No panel beater preferences were recorded for this claim.</p>`;

  // ── Mismatch warning ──────────────────────────────────────────────────────
  const mismatchWarning = (assignedRepairerName && !assignedIsInChoices)
    ? `
    <div class="mismatch-warning">
      <span class="mismatch-icon">⚠</span>
      <div>
        <strong>Final assigned repairer differs from claimant preference.</strong>
        <div class="mismatch-sub">
          Assigned: <strong>${assignedRepairerName}</strong>
          ${overrideReason
            ? `<div class="override-reason-inline">Override Reason: ${overrideReason}</div>`
            : ""}
        </div>
      </div>
    </div>`
    : "";

  const panelBeaterChoicesSection = `
  <div class="section no-break">
    <h2 class="section-title">Panel Beater Choices (Claimant Preference)</h2>
    <div class="choices-container">
      ${choicesRows}
    </div>
    ${mismatchWarning}
  </div>`;

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
          <div class="opt-metric-label">AI Recommended Repairer</div>
          <div class="opt-metric-value opt-metric-repairer">
            ${optimisation.recommendedCompanyName ?? optimisation.recommendedProfileId ?? "—"}
          </div>
        </div>

        <div class="opt-metric-card">
          <div class="opt-metric-label">Inflation Flags</div>
          <div class="opt-flags-list">
            ${flagLabourInflation ? `<span class="flag-chip flag-red">Labour Inflation</span>` : ""}
            ${flagPartsInflation  ? `<span class="flag-chip flag-red">Parts Inflation</span>`  : ""}
            ${flagOverpricing     ? `<span class="flag-chip flag-amber">Overpricing</span>`    : ""}
            ${!flagLabourInflation && !flagPartsInflation && !flagOverpricing
              ? `<span style="color:#10b981;font-size:9pt;">✓ No flags raised</span>`
              : ""}
          </div>
        </div>
      </div>

      <!-- AI Narrative ────────────────────────────────────────────────────── -->
      ${optimisation.optimisationSummary ? `
      <h3 class="section-subtitle">AI Narrative Summary</h3>
      <div class="ai-narrative">${optimisation.optimisationSummary}</div>` : ""}

      <!-- Per-Quote Analysis ──────────────────────────────────────────────── -->
      ${perQuoteTable}

      <!-- Insurer Decision ───────────────────────────────────────────────── -->
      ${decisionBlock}
    </div>`;
  }

  // ── Full HTML document ────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Claim Report — ${claim.claimNumber}</title>
  <style>
    /* ── Base ─────────────────────────────────────────────────────────────── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-size: 10pt;
      color: #1f2937;
      background: #ffffff;
      line-height: 1.5;
    }
    .container { max-width: 780px; margin: 0 auto; padding: 8mm 10mm; }

    /* ── Page breaks ─────────────────────────────────────────────────────── */
    .page-break { page-break-before: always; }
    .no-break   { page-break-inside: avoid; }

    /* ── Report header ───────────────────────────────────────────────────── */
    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #1e3a5f;
      padding-bottom: 8px;
      margin-bottom: 16px;
    }
    .report-title   { font-size: 18pt; font-weight: 700; color: #1e3a5f; }
    .report-subtitle { font-size: 9pt; color: #6b7280; margin-top: 2px; }
    .kinga-brand    { font-size: 22pt; font-weight: 900; color: #1e3a5f; letter-spacing: 2px; }
    .generated-at   { font-size: 8pt; color: #9ca3af; margin-top: 4px; }
    .header-meta    { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 4px 16px; }
    .header-meta-label { font-size: 8pt; color: #6b7280; }
    .header-meta-value { font-size: 8pt; font-weight: 600; color: #1f2937; }

    /* ── Sections ────────────────────────────────────────────────────────── */
    .section { margin-bottom: 18px; }
    .section-title {
      font-size: 11pt;
      font-weight: 700;
      color: #1e3a5f;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 4px;
      margin-bottom: 10px;
    }
    .section-subtitle {
      font-size: 10pt;
      font-weight: 600;
      color: #374151;
      margin: 10px 0 6px;
    }

    /* ── AI Assessment card ──────────────────────────────────────────────── */
    .ai-card {
      display: flex;
      gap: 20px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 14px;
      margin-bottom: 8px;
    }
    .ai-card-item-label { font-size: 8pt; color: #6b7280; }
    .ai-card-item-value { font-size: 12pt; font-weight: 700; color: #1f2937; }

    /* ── Panel Beater Choices ────────────────────────────────────────────── */
    .choices-container {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 10px;
    }
    .choice-row {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 8px 12px;
    }
    .choice-rank {
      font-size: 18pt;
      color: #1e3a5f;
      font-weight: 700;
      min-width: 28px;
      line-height: 1.2;
    }
    .choice-body { flex: 1; }
    .choice-label { font-size: 7.5pt; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
    .choice-name  { font-size: 11pt; font-weight: 700; color: #1f2937; margin: 2px 0 4px; }
    .choice-badges { display: flex; flex-wrap: wrap; gap: 4px; }

    /* ── Badges ──────────────────────────────────────────────────────────── */
    .badge {
      display: inline-block;
      font-size: 7.5pt;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 10px;
      letter-spacing: 0.3px;
    }
    .badge-ai        { background: #dbeafe; color: #1d4ed8; }
    .badge-preferred { background: #fef3c7; color: #92400e; }
    .badge-sla       { background: #d1fae5; color: #065f46; }

    /* ── Mismatch warning ────────────────────────────────────────────────── */
    .mismatch-warning {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      background: #fff7ed;
      border: 1px solid #fed7aa;
      border-left: 4px solid #f97316;
      border-radius: 6px;
      padding: 10px 14px;
      margin-top: 8px;
    }
    .mismatch-icon { font-size: 14pt; color: #f97316; }
    .mismatch-sub  { font-size: 9pt; color: #374151; margin-top: 4px; }
    .override-reason-inline {
      margin-top: 4px;
      font-size: 9pt;
      color: #7c3aed;
      font-style: italic;
    }

    /* ── Tables ──────────────────────────────────────────────────────────── */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.5pt;
      margin-bottom: 8px;
    }
    th {
      background: #1e3a5f;
      color: #ffffff;
      font-weight: 600;
      padding: 5px 8px;
      text-align: left;
    }
    td { padding: 4px 8px; border-bottom: 1px solid #e5e7eb; }
    tr:nth-child(even) td { background: #f9fafb; }

    /* ── Flag chips ──────────────────────────────────────────────────────── */
    .flag-chip {
      display: inline-block;
      font-size: 7pt;
      font-weight: 600;
      padding: 1px 6px;
      border-radius: 8px;
      background: #fee2e2;
      color: #991b1b;
      margin-right: 2px;
    }
    .flag-red   { background: #fee2e2; color: #991b1b; }
    .flag-amber { background: #fef3c7; color: #92400e; }

    /* ── AI Optimisation header grid ─────────────────────────────────────── */
    .opt-header-grid {
      display: flex;
      gap: 12px;
      margin-bottom: 12px;
    }
    .opt-metric-card {
      flex: 1;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 12px;
    }
    .opt-metric-label    { font-size: 8pt; color: #6b7280; margin-bottom: 4px; }
    .opt-metric-value    { font-size: 18pt; font-weight: 700; color: #1f2937; line-height: 1.1; }
    .opt-metric-unit     { font-size: 10pt; color: #6b7280; }
    .opt-metric-repairer { font-size: 11pt; }
    .opt-metric-sublabel { margin-top: 4px; }
    .opt-flags-list      { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }

    /* ── Risk level badge ────────────────────────────────────────────────── */
    .risk-level-badge {
      display: inline-block;
      font-size: 7.5pt;
      font-weight: 700;
      color: #ffffff;
      padding: 2px 8px;
      border-radius: 10px;
    }

    /* ── AI Narrative ────────────────────────────────────────────────────── */
    .ai-narrative {
      background: #f0f9ff;
      border-left: 3px solid #0ea5e9;
      padding: 8px 12px;
      font-size: 9pt;
      color: #374151;
      border-radius: 0 4px 4px 0;
      margin-bottom: 10px;
    }

    /* ── Decision blocks ─────────────────────────────────────────────────── */
    .decision-block, .decision-pending {
      margin-top: 12px;
      padding: 10px 14px;
      border-radius: 6px;
      border: 1px solid #e5e7eb;
    }
    .decision-accepted  { background: #f0fdf4; border-color: #86efac; }
    .decision-overridden { background: #fff7ed; border-color: #fed7aa; }
    .decision-pending   { background: #f8fafc; }
    .decision-label     { font-size: 9pt; color: #6b7280; margin-right: 8px; }
    .decision-badge {
      display: inline-block;
      font-size: 9pt;
      font-weight: 700;
      padding: 2px 10px;
      border-radius: 10px;
    }
    .decision-accepted-badge  { background: #dcfce7; color: #15803d; }
    .decision-overridden-badge { background: #fee2e2; color: #dc2626; }
    .decision-pending-badge   { background: #e5e7eb; color: #374151; }
    .decision-meta { font-size: 8.5pt; color: #6b7280; margin-top: 6px; }
    .override-reason-box {
      margin-top: 8px;
      padding: 8px 10px;
      background: #fef9c3;
      border: 1px solid #fde047;
      border-radius: 4px;
      font-size: 9pt;
      color: #713f12;
    }

    /* ── No-data states ──────────────────────────────────────────────────── */
    .no-optimisation-notice {
      display: flex;
      align-items: center;
      gap: 8px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 14px;
      font-size: 9pt;
      color: #6b7280;
    }
    .no-opt-icon { font-size: 14pt; }
    .no-data-text { font-size: 9pt; color: #6b7280; }

    /* ── Opt table ───────────────────────────────────────────────────────── */
    .opt-table { margin-bottom: 12px; }

    /* ── Footer ──────────────────────────────────────────────────────────── */
    .report-footer {
      margin-top: 20px;
      padding-top: 8px;
      border-top: 1px solid #e5e7eb;
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

  <!-- ── Ranked Panel Beater Choices ────────────────────────────────────── -->
  ${panelBeaterChoicesSection}

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
 * Generates a governance-complete PDF for a single claim.
 * Includes ranked panel beater choices with Preferred/SLA/AI-Recommended badges,
 * mismatch warning, override reason, AI Quote Optimisation Summary, and an
 * audit log entry (action: "claim_pdf_exported").
 *
 * @requires insurerDomainProcedure — structural tenant isolation enforced
 * @param claimId - The numeric ID of the claim to export
 * @returns { success, pdfUrl, fileName }
 */
export const exportClaimPDF = insurerDomainProcedure
  .input(z.object({ claimId: z.number().int().positive() }))
  .mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    const tenantId = ctx.insurerTenantId; // guaranteed non-null by insurerDomainProcedure

    // ── 1. Fetch claim — hard-filtered by tenant ───────────────────────────
    const claimRows = await db
      .select()
      .from(claims)
      .where(
        and(
          eq(claims.id, input.claimId),
          eq(claims.tenantId, tenantId)
        )
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

    // ── 5. Fetch insurer decision user name ───────────────────────────────
    let decisionUser: { name: string | null } | null = null;
    if (optimisation?.insurerDecisionBy) {
      const userRows = await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, optimisation.insurerDecisionBy))
        .limit(1);
      decisionUser = userRows[0] ?? null;
    }

    // ── 6. Resolve ranked panel beater choices ────────────────────────────
    const choiceIds = [
      claim.panelBeaterChoice1,
      claim.panelBeaterChoice2,
      claim.panelBeaterChoice3,
    ].filter((id): id is string => !!id);

    let panelBeaterChoices: PanelBeaterChoice[] = [];

    if (choiceIds.length > 0) {
      // Fetch marketplace profiles for the three choices
      const profiles = await db
        .select({ id: marketplaceProfiles.id, companyName: marketplaceProfiles.companyName })
        .from(marketplaceProfiles)
        .where(inArray(marketplaceProfiles.id, choiceIds));

      // Fetch insurer relationship flags (preferred, slaSigned) for this tenant
      const relationships = await db
        .select({
          marketplaceProfileId: insurerMarketplaceRelationships.marketplaceProfileId,
          preferred: insurerMarketplaceRelationships.preferred,
          slaSigned: insurerMarketplaceRelationships.slaSigned,
        })
        .from(insurerMarketplaceRelationships)
        .where(
          and(
            eq(insurerMarketplaceRelationships.insurerTenantId, tenantId),
            inArray(insurerMarketplaceRelationships.marketplaceProfileId, choiceIds)
          )
        );

      const profileMap = new Map(profiles.map(p => [p.id, p.companyName]));
      const relMap = new Map(relationships.map(r => [
        r.marketplaceProfileId,
        { preferred: r.preferred === 1, slaSigned: r.slaSigned === 1 },
      ]));

      const aiRecommendedId = optimisation?.recommendedProfileId ?? null;

      const rawChoices: [string | null, 1 | 2 | 3][] = [
        [claim.panelBeaterChoice1, 1],
        [claim.panelBeaterChoice2, 2],
        [claim.panelBeaterChoice3, 3],
      ];

      panelBeaterChoices = rawChoices
        .filter(([id]) => !!id)
        .map(([id, rank]) => {
          const profileId = id!;
          const rel = relMap.get(profileId);
          return {
            rank,
            profileId,
            companyName: profileMap.get(profileId) ?? profileId,
            preferred: rel?.preferred ?? false,
            slaSigned: rel?.slaSigned ?? false,
            aiRecommended: profileId === aiRecommendedId,
          };
        });
    }

    // ── 7. Resolve assigned repairer name (if any) ────────────────────────
    let assignedRepairerName: string | null = null;
    if (claim.assignedPanelBeaterId) {
      // assignedPanelBeaterId is an integer FK to panel_beater_quotes.panel_beater_id
      // Try to find the company name from the quotes submitted for this claim
      const assignedQuote = quotes.find(q => q.panelBeaterId === claim.assignedPanelBeaterId);
      if (assignedQuote) {
        // Try to match to a marketplace profile via the per-quote analysis
        let perQuoteAnalysis: PerQuoteAnalysis[] = [];
        if (optimisation?.quoteAnalysis) {
          try {
            const raw = typeof optimisation.quoteAnalysis === "string"
              ? JSON.parse(optimisation.quoteAnalysis)
              : optimisation.quoteAnalysis;
            if (Array.isArray(raw)) perQuoteAnalysis = raw as PerQuoteAnalysis[];
          } catch { /* ignore */ }
        }
        const qIdx = quotes.indexOf(assignedQuote);
        assignedRepairerName = perQuoteAnalysis[qIdx]?.companyName ?? null;
      }
    }

    // ── 8. Generate HTML ──────────────────────────────────────────────────
    const htmlContent = generateClaimPDFHTML({
      claim,
      aiAssessment,
      quotes,
      optimisation,
      decisionUser,
      panelBeaterChoices,
      assignedRepairerName,
    });

    // ── 9. Convert HTML → PDF via Puppeteer ──────────────────────────────
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

    // ── 10. Upload to S3 ──────────────────────────────────────────────────
    const fileName = `claim-report-${claim.claimNumber}-${Date.now()}.pdf`;
    const { url: pdfUrl } = await storagePut(
      `claim-reports/${fileName}`,
      pdfBuffer,
      "application/pdf"
    );

    // ── 11. Audit log — fire-and-forget ───────────────────────────────────
    // Write audit entry asynchronously; failure must never block the response.
    (async () => {
      try {
        await db.insert(auditTrail).values({
          claimId: input.claimId,
          userId: ctx.user.id,
          action: "claim_pdf_exported",
          entityType: "claim",
          entityId: input.claimId,
          changeDescription: `PDF exported for claim ${claim.claimNumber} by user ${ctx.user.id} (tenant: ${tenantId}). File: ${fileName}`,
          ipAddress: (ctx.req?.headers?.["x-forwarded-for"] as string | undefined)
            ?.split(",")[0]?.trim()
            ?? (ctx.req as any)?.ip
            ?? null,
          userAgent: ctx.req?.headers?.["user-agent"] as string | undefined ?? null,
        });
      } catch (err) {
        console.error("[ClaimPDFExport] Failed to write audit log:", err);
      }
    })();

    return { success: true, pdfUrl, fileName };
  });
