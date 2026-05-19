/**
 * ConfidenceImprovementChecklist
 *
 * Derives actionable gap items from the aiAssessment pipeline output and
 * renders them as a structured appendix section inside both KingaClaimsReport
 * and ForensicAuditReport.
 *
 * Design principles:
 *  - Pure client-side: no extra tRPC calls, reads from aiAssessment prop only
 *  - Three priority tiers: CRITICAL (blocks confidence), RECOMMENDED (improves score), OPTIONAL (best practice)
 *  - Each item links to the specific pipeline dimension it would improve
 *  - Styled to match the report's design language (passed via styleMode prop)
 */

import React from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ChecklistStyleMode = "kinga" | "forensic";

export interface ChecklistItem {
  id: string;
  priority: "CRITICAL" | "RECOMMENDED" | "OPTIONAL";
  category: "evidence" | "documentation" | "financial" | "identity" | "physics";
  title: string;
  description: string;
  impact: string; // what dimension this improves
  impactDelta: string; // e.g. "+8–12 confidence points"
}

interface ConfidenceImprovementChecklistProps {
  aiAssessment: any;
  claim?: any;
  /** Explicit quotes array from the parent — preferred over claim.quotes or aiAssessment fallbacks */
  quotes?: any[];
  styleMode: ChecklistStyleMode;
}

// ─── Gap Analysis Engine ─────────────────────────────────────────────────────

function deriveChecklistItems(aiAssessment: any, claim?: any, quotesOverride?: any[]): ChecklistItem[] {
  const items: ChecklistItem[] = [];

  if (!aiAssessment) return items;

  const claimRecord = aiAssessment._claimRecord ?? null;
  const claimQuality = aiAssessment._claimQuality ?? null;
  const phase1 = aiAssessment._phase1 ?? null;
  const fraudScore = Number(aiAssessment.fraudScore ?? 0);
  const confidenceScore = Number(aiAssessment.confidenceScore ?? 50);
  const photosDetected = Number(aiAssessment.photosDetected ?? 0);
  // quoteCount: prefer explicit quotes prop, then claim.quotes, then aiAssessment fallback.
  const quotesFromClaim: any[] = Array.isArray(quotesOverride) && quotesOverride.length > 0 ? quotesOverride
    : Array.isArray((claim as any)?.quotes) ? (claim as any).quotes
    : Array.isArray(aiAssessment?._quotes) ? aiAssessment._quotes
    : [];
  const quoteCount = quotesFromClaim.length > 0 ? quotesFromClaim.length : Number(aiAssessment.quoteCount ?? 0);
  // hasQuoteWithNoLineItems: a quote was submitted but line items have zero prices (extraction failure)
  const hasQuoteWithNoLineItems = quoteCount > 0 && quotesFromClaim.some((q: any) => {
    const items: any[] = Array.isArray(q.lineItems) ? q.lineItems : [];
    return items.length === 0 || items.every((li: any) => !Number(li.lineTotal ?? 0) && !Number(li.unitPrice ?? 0));
  });

  // ── 1. Damage Photos ──────────────────────────────────────────────────────
  const photoUrls: string[] = (() => {
    try {
      if (aiAssessment.damagePhotosJson) {
        const p = typeof aiAssessment.damagePhotosJson === "string"
          ? JSON.parse(aiAssessment.damagePhotosJson)
          : aiAssessment.damagePhotosJson;
        return Array.isArray(p) ? p : [];
      }
    } catch { /* ignore */ }
    return [];
  })();

  if (photoUrls.length === 0 && photosDetected === 0) {
    items.push({
      id: "photos-missing",
      priority: "CRITICAL",
      category: "evidence",
      title: "No damage photographs attached",
      description:
        "The KINGA physics engine and damage consistency model require at least 3 photographs of the damaged vehicle (front, rear, and the primary impact zone) to validate the reported damage pattern against the claimed collision mechanics.",
      impact: "Physics Consistency Score, Damage Zone Validation, Fraud Risk Score",
      impactDelta: "+12–18 confidence points",
    });
  } else if (photoUrls.length < 3 || photosDetected < 3) {
    items.push({
      id: "photos-insufficient",
      priority: "RECOMMENDED",
      category: "evidence",
      title: `Only ${Math.max(photoUrls.length, photosDetected)} damage photograph(s) detected — 3+ recommended`,
      description:
        "Additional photographs from multiple angles (front, rear, driver side, passenger side, interior if applicable) significantly improve KINGA's ability to cross-validate the damage pattern against the reported impact vector.",
      impact: "Damage Zone Validation, Physics Consistency Score",
      impactDelta: "+6–10 confidence points",
    });
  }

  // ── 2. Police Report ──────────────────────────────────────────────────────
  const policeReport = claimRecord?.policeReport ?? claimRecord?.police_report ?? null;
  const policeReportPresent =
    !!(policeReport?.caseNumber || policeReport?.case_number || policeReport?.reportNumber) ||
    !!(phase1?.gates?.find?.((g: any) => g.name === "police_report" && g.status === "pass"));

  if (!policeReportPresent) {
    items.push({
      id: "police-report-missing",
      priority: fraudScore >= 40 ? "CRITICAL" : "RECOMMENDED",
      category: "documentation",
      title: "Police accident report not attached",
      description:
        "A certified police accident report provides an independent third-party account of the incident date, location, and parties involved. It is the single most effective document for reducing the fraud risk score when KINGA has flagged date or location inconsistencies.",
      impact: "Fraud Risk Score, Accident Date Cross-Check, Incident Verification",
      impactDelta: fraudScore >= 40 ? "+15–25 confidence points" : "+8–12 confidence points",
    });
  }

  // ── 3. Witness Statements ─────────────────────────────────────────────────
  const witnesses = claimRecord?.witnesses ?? claimRecord?.witness_statements ?? [];
  const witnessCount = Array.isArray(witnesses) ? witnesses.length : 0;

  if (witnessCount === 0 && fraudScore >= 30) {
    items.push({
      id: "witness-statements-missing",
      priority: "RECOMMENDED",
      category: "documentation",
      title: "No witness statements on record",
      description:
        "Independent witness statements corroborate the reported collision sequence and are weighted by the narrative analysis engine when KINGA detects inconsistencies between the claimed impact direction and the observed damage pattern.",
      impact: "Narrative Consistency Score, Fraud Risk Score",
      impactDelta: "+5–8 confidence points",
    });
  }

  // ── 4. Quote Coverage ─────────────────────────────────────────────────────
  if (quoteCount === 0) {
    items.push({
      id: "quotes-missing",
      priority: "CRITICAL",
      category: "financial",
      title: "No repair quotes submitted",
      description:
        "The cost intelligence engine requires at least one itemised repair quote to validate the estimated repair cost against market benchmarks. Without a quote, KINGA cannot perform parts reconciliation or detect over-pricing.",
      impact: "Cost Intelligence Score, Parts Reconciliation, Quote Optimisation",
      impactDelta: "+10–15 confidence points",
    });
  } else if (hasQuoteWithNoLineItems) {
    items.push({
      id: "quotes-no-line-items",
      priority: "CRITICAL",
      category: "financial",
      title: "Quote submitted — itemised line items not extracted",
      description:
        "A repair quote has been submitted but KINGA could not extract the individual line items and prices from the document. This prevents parts reconciliation and cost benchmarking. Re-run KINGA Analysis to attempt re-extraction, or request the panel beater to resubmit a typed/digital quote.",
      impact: "Cost Intelligence Score, Parts Reconciliation, Quote Optimisation",
      impactDelta: "+10–15 confidence points",
    });
  } else if (quoteCount === 1) {
    items.push({
      id: "quotes-single",
      priority: "RECOMMENDED",
      category: "financial",
      title: "Only one repair quote — two or more recommended",
      description:
        "A second competitive quote enables KINGA to perform cross-quote validation, detect anomalous pricing on individual line items, and provide a statistically grounded cost band assessment (FAIR / HIGH / LOW).",
      impact: "Cost Intelligence Score, Quote Optimisation, Fraud Risk Score",
      impactDelta: "+4–7 confidence points",
    });
  }

  // ── 5. Itemised Quote Line Items ──────────────────────────────────────────
  const hasZeroLineItems = (() => {
    try {
      const ci = aiAssessment.costIntelligenceJson
        ? (typeof aiAssessment.costIntelligenceJson === "string"
          ? JSON.parse(aiAssessment.costIntelligenceJson)
          : aiAssessment.costIntelligenceJson)
        : null;
      if (!ci) return false;
      const lineItems = ci.lineItems ?? ci.line_items ?? [];
      if (!Array.isArray(lineItems) || lineItems.length === 0) return false;
      return lineItems.every((li: any) => !li.lineTotal && !li.line_total && !li.unitCost && !li.unit_cost);
    } catch { return false; }
  })();

  if (hasZeroLineItems && quoteCount > 0) {
    items.push({
      id: "quote-line-items-unpriced",
      priority: "RECOMMENDED",
      category: "financial",
      title: "Repair quote line items have no individual prices",
      description:
        "The submitted quote contains part descriptions but no per-item pricing. Attach a fully itemised quote (with unit cost and quantity for each part) so KINGA can perform parts-level reconciliation against market pricing databases.",
      impact: "Parts Reconciliation, Cost Intelligence Score, Over-pricing Detection",
      impactDelta: "+6–10 confidence points",
    });
  }

  // ── 6. Vehicle Market Value ───────────────────────────────────────────────
  const marketValue = Number(
    aiAssessment.vehicleMarketValueCents ??
    // claim.vehicleMarketValue is stored in cents in the claims table
    (claim as any)?.vehicleMarketValue ??
    claimRecord?.vehicle?.marketValueCents ??
    claimRecord?.vehicle?.market_value_cents ??
    0
  );
  const estimatedCost = Number(aiAssessment.estimatedCost ?? 0);

  if (marketValue === 0 && estimatedCost > 0) {
    items.push({
      id: "market-value-missing",
      priority: "RECOMMENDED",
      category: "financial",
      title: "Vehicle market value not established",
      description:
        "Without a verified market value, KINGA cannot determine whether the repair cost exceeds the economic write-off threshold (typically 70–80% of market value). Provide a current trade or retail valuation from a recognised source (e.g. TransUnion, Mead & McGrouther).",
      impact: "Write-off Threshold Assessment, Cost Reasonableness Score",
      impactDelta: "+4–6 confidence points",
    });
  }

  // ── 7. Excess / Deductible on Record ─────────────────────────────────────
  const excess = claimRecord?.policy?.excess ?? claimRecord?.policy?.deductible ?? null;
  if (!excess && claim?.policyNumber) {
    items.push({
      id: "excess-missing",
      priority: "OPTIONAL",
      category: "financial",
      title: "Policy excess / deductible not recorded",
      description:
        "Recording the policy excess allows KINGA to compute the net claimable amount and flag cases where the repair cost is suspiciously close to the excess threshold — a known indicator of inflated claims.",
      impact: "Fraud Risk Score (excess-proximity flag)",
      impactDelta: "+2–4 confidence points",
    });
  }

  // ── 8. Data Quality Score ─────────────────────────────────────────────────
  const missingFields: string[] = claimQuality?.missingFields ?? claimQuality?.missing_fields ?? [];
  if (missingFields.length > 0) {
    items.push({
      id: "missing-claim-fields",
      priority: "RECOMMENDED",
      category: "documentation",
      title: `${missingFields.length} claim field(s) incomplete`,
      description:
        `The following fields were not populated when the claim was submitted: ${missingFields.slice(0, 5).join(", ")}${missingFields.length > 5 ? `, and ${missingFields.length - 5} more` : ""}. Complete these fields and re-run the KINGA assessment to improve the data completeness score.`,
      impact: "Data Completeness Score, Overall Confidence Score",
      impactDelta: "+3–8 confidence points",
    });
  }

  // ── 9. Physics Consistency ────────────────────────────────────────────────
  const physicsScore = Number(
    aiAssessment.physicsConsistencyScore ??
    aiAssessment._normalised?.physicsConsistencyScore ??
    0
  );

  if (physicsScore > 0 && physicsScore < 60) {
    items.push({
      id: "physics-low-confidence",
      priority: "RECOMMENDED",
      category: "physics",
      title: "Physics consistency score below 60% — additional evidence recommended",
      description:
        "KINGA's biomechanical model has detected potential inconsistencies between the reported collision speed/direction and the observed damage pattern. Attaching a dashcam recording, telematics data export, or a detailed third-party accident reconstruction report would allow the engine to resolve these inconsistencies.",
      impact: "Physics Consistency Score, Fraud Risk Score, Structural Damage Assessment",
      impactDelta: "+8–15 confidence points",
    });
  }

  // ── 10. Fraud Score High ──────────────────────────────────────────────────
  if (fraudScore >= 50) {
    items.push({
      id: "fraud-score-elevated",
      priority: "CRITICAL",
      category: "identity",
      title: "Elevated fraud risk score — identity verification recommended",
      description:
        "KINGA has flagged this claim with a fraud risk score of " + fraudScore + "/100. To reduce this score, provide: (1) certified copy of the claimant's driver's licence, (2) independent repair assessment from a SAMBRA-accredited assessor, and (3) if the vehicle was financed, a letter from the financier confirming the vehicle was not under a repossession order at the time of the incident.",
      impact: "Fraud Risk Score, Recommendation Outcome",
      impactDelta: "May reduce fraud score by 15–30 points",
    });
  }

  // Sort: CRITICAL first, then RECOMMENDED, then OPTIONAL
  const ORDER = { CRITICAL: 0, RECOMMENDED: 1, OPTIONAL: 2 };
  return items.sort((a, b) => ORDER[a.priority] - ORDER[b.priority]);
}

// ─── Style helpers ────────────────────────────────────────────────────────────

const PRIORITY_LABELS: Record<ChecklistItem["priority"], string> = {
  CRITICAL: "CRITICAL",
  RECOMMENDED: "RECOMMENDED",
  OPTIONAL: "OPTIONAL",
};

// ─── Component ────────────────────────────────────────────────────────────────

export const ConfidenceImprovementChecklist: React.FC<ConfidenceImprovementChecklistProps> = ({
  aiAssessment,
  claim,
  quotes,
  styleMode,
}) => {
  // C-08: Filter out any null/undefined items to ensure sequential numbering starting from 1
  const items = deriveChecklistItems(aiAssessment, claim, quotes).filter((item): item is ChecklistItem => !!item && !!item.id);

  if (items.length === 0) {
    // All gaps resolved — render a positive completion notice
    if (styleMode === "kinga") {
      return (
        <div style={{ pageBreakBefore: "always", padding: "32px 40px" }}>
          <div style={{ borderTop: "3px solid #1a3a5c", paddingTop: "24px", marginBottom: "24px" }}>
            <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "2px", color: "#6b7280", textTransform: "uppercase", marginBottom: "6px" }}>
              Appendix A
            </div>
            <div style={{ fontSize: "18px", fontWeight: 700, color: "#1a3a5c" }}>
              Confidence Improvement Checklist
            </div>
          </div>
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "6px", padding: "20px 24px", display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ fontSize: "20px" }}>✓</div>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#166534" }}>All evidence requirements satisfied</div>
              <div style={{ fontSize: "11px", color: "#15803d", marginTop: "2px" }}>No additional documentation is required to improve the confidence score for this assessment.</div>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="conf-section" style={{ pageBreakBefore: "always" }}>
        <div className="section-heading">
          Appendix A — Confidence Improvement Checklist
        </div>
        <div style={{ background: "var(--fp-bg-success, #f0fdf4)", border: "1px solid var(--fp-success, #22c55e)", borderRadius: "4px", padding: "16px 20px" }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--fp-text-primary)" }}>✓ All evidence requirements satisfied — no gaps detected.</span>
        </div>
      </div>
    );
  }

  const criticalItems = items.filter(i => i.priority === "CRITICAL");
  const recommendedItems = items.filter(i => i.priority === "RECOMMENDED");
  const optionalItems = items.filter(i => i.priority === "OPTIONAL");

  if (styleMode === "kinga") {
    return (
      <div style={{ pageBreakBefore: "always", padding: "32px 40px" }}>
        {/* Section header */}
        <div style={{ borderTop: "3px solid #1a3a5c", paddingTop: "24px", marginBottom: "8px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "2px", color: "#6b7280", textTransform: "uppercase", marginBottom: "6px" }}>
            Appendix A
          </div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "#1a3a5c" }}>
            Confidence Improvement Checklist
          </div>
          <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "4px" }}>
            The following items have been identified by the KINGA assessment engine as opportunities to improve the confidence score and reduce the fraud risk rating for this claim. Items are ranked by impact.
          </div>
        </div>

        {/* Summary bar */}
        <div style={{ display: "flex", gap: "12px", marginBottom: "24px", marginTop: "16px" }}>
          {criticalItems.length > 0 && (
            <div style={{ background: "#ffffff", border: "1px solid #fca5a5", borderLeft: "4px solid #dc2626", borderRadius: "4px", padding: "8px 14px", textAlign: "center" }}>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#dc2626" }}>{criticalItems.length}</div>
              <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "1px", color: "#dc2626", textTransform: "uppercase" }}>Critical</div>
            </div>
          )}
          {recommendedItems.length > 0 && (
            <div style={{ background: "#ffffff", border: "1px solid #fcd34d", borderLeft: "4px solid #d97706", borderRadius: "4px", padding: "8px 14px", textAlign: "center" }}>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#d97706" }}>{recommendedItems.length}</div>
              <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "1px", color: "#d97706", textTransform: "uppercase" }}>Recommended</div>
            </div>
          )}
          {optionalItems.length > 0 && (
            <div style={{ background: "#ffffff", border: "1px solid #7dd3fc", borderLeft: "4px solid #0284c7", borderRadius: "4px", padding: "8px 14px", textAlign: "center" }}>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#0284c7" }}>{optionalItems.length}</div>
              <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "1px", color: "#0284c7", textTransform: "uppercase" }}>Optional</div>
            </div>
          )}
        </div>

        {/* Items */}
        {items.map((item, idx) => {
          const priorityColors: Record<ChecklistItem["priority"], { bg: string; border: string; badge: string; badgeText: string }> = {
            CRITICAL: { bg: "#ffffff", border: "#fca5a5", badge: "#dc2626", badgeText: "#fff" },
            RECOMMENDED: { bg: "#ffffff", border: "#fcd34d", badge: "#d97706", badgeText: "#fff" },
            OPTIONAL: { bg: "#ffffff", border: "#7dd3fc", badge: "#0284c7", badgeText: "#fff" },
          };
          const c = priorityColors[item.priority];
          return (
            <div key={item.id} style={{
              background: c.bg,
              border: `1px solid ${c.border}`,
              borderLeft: `4px solid ${c.badge}`,
              borderRadius: "4px",
              padding: "14px 18px",
              marginBottom: "10px",
              pageBreakInside: "avoid",
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                <div style={{ minWidth: "22px", height: "22px", background: c.badge, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", marginTop: "1px" }}>
                  <span style={{ fontSize: "10px", fontWeight: 800, color: c.badgeText }}>{idx + 1}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "#111827" }}>{item.title}</span>
                    <span style={{ fontSize: "8px", fontWeight: 700, letterSpacing: "1px", color: c.badge, textTransform: "uppercase", border: `1px solid ${c.badge}`, borderRadius: "2px", padding: "1px 5px" }}>
                      {PRIORITY_LABELS[item.priority]}
                    </span>
                  </div>
                  <p style={{ fontSize: "10px", color: "#374151", lineHeight: "1.5", margin: "0 0 6px 0" }}>{item.description}</p>
                  <div style={{ display: "flex", gap: "16px" }}>
                    <div>
                      <span style={{ fontSize: "9px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>Affects: </span>
                      <span style={{ fontSize: "9px", color: "#374151" }}>{item.impact}</span>
                    </div>
                    <div>
                      <span style={{ fontSize: "9px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>Estimated gain: </span>
                      <span style={{ fontSize: "9px", fontWeight: 600, color: "#059669" }}>{item.impactDelta}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Footer note */}
        <div style={{ marginTop: "20px", paddingTop: "12px", borderTop: "1px solid #e5e7eb" }}>
          <p style={{ fontSize: "9px", color: "#9ca3af", lineHeight: "1.5", margin: 0 }}>
            This checklist is generated automatically by the KINGA assessment engine based on the data available at the time of the last pipeline run. Re-running the assessment after attaching additional evidence will update this checklist and recalculate the confidence score. Items marked CRITICAL must be resolved before the claim can be approved at the Claims Manager stage.
          </p>
        </div>
      </div>
    );
  }

  // ── Forensic Report style ──────────────────────────────────────────────────
  return (
    <div className="conf-section" style={{ pageBreakBefore: "always" }}>
      <div className="section-heading">
        Appendix A — Confidence Improvement Checklist
      </div>
      <div style={{ fontSize: "10px", color: "#555", marginBottom: "12px", marginTop: "-8px" }}>
        Actionable gaps identified by the KINGA pipeline. Address CRITICAL items before the claim proceeds to Claims Manager approval.
      </div>

      {/* Summary — FAR-01: B&W typographic hierarchy */}
      <div style={{ display: "flex", gap: "10px", margin: "16px 0" }}>
        {criticalItems.length > 0 && (
          <div style={{ background: "#f0f0f0", border: "2px solid #111", borderRadius: "0", padding: "6px 12px", textAlign: "center" }}>
            <div style={{ fontSize: "16px", fontWeight: 800, color: "#111" }}>{criticalItems.length}</div>
            <div style={{ fontSize: "8px", fontWeight: 700, letterSpacing: "1px", color: "#111", textTransform: "uppercase" }}>Critical</div>
          </div>
        )}
        {recommendedItems.length > 0 && (
          <div style={{ background: "#f8f8f8", border: "1px solid #555", borderRadius: "0", padding: "6px 12px", textAlign: "center" }}>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#111" }}>{recommendedItems.length}</div>
            <div style={{ fontSize: "8px", fontWeight: 600, letterSpacing: "1px", color: "#555", textTransform: "uppercase" }}>Recommended</div>
          </div>
        )}
        {optionalItems.length > 0 && (
          <div style={{ background: "#ffffff", border: "1px solid #aaa", borderRadius: "0", padding: "6px 12px", textAlign: "center" }}>
            <div style={{ fontSize: "16px", fontWeight: 500, color: "#444" }}>{optionalItems.length}</div>
            <div style={{ fontSize: "8px", fontWeight: 500, letterSpacing: "1px", color: "#888", textTransform: "uppercase" }}>Optional</div>
          </div>
        )}
      </div>

      {/* Items table */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
        <thead>
          <tr style={{ background: "#ffffff" }}>
            <th style={{ padding: "8px 10px", textAlign: "left", fontWeight: 700, fontSize: "9px", letterSpacing: "1px", textTransform: "uppercase", color: "var(--fp-text-muted)", borderBottom: "2px solid var(--fp-border)", width: "3%" }}>#</th>
            <th style={{ padding: "8px 10px", textAlign: "left", fontWeight: 700, fontSize: "9px", letterSpacing: "1px", textTransform: "uppercase", color: "var(--fp-text-muted)", borderBottom: "2px solid var(--fp-border)", width: "10%" }}>Priority</th>
            <th style={{ padding: "8px 10px", textAlign: "left", fontWeight: 700, fontSize: "9px", letterSpacing: "1px", textTransform: "uppercase", color: "var(--fp-text-muted)", borderBottom: "2px solid var(--fp-border)", width: "25%" }}>Gap</th>
            <th style={{ padding: "8px 10px", textAlign: "left", fontWeight: 700, fontSize: "9px", letterSpacing: "1px", textTransform: "uppercase", color: "var(--fp-text-muted)", borderBottom: "2px solid var(--fp-border)", width: "37%" }}>Action Required</th>
            <th style={{ padding: "8px 10px", textAlign: "left", fontWeight: 700, fontSize: "9px", letterSpacing: "1px", textTransform: "uppercase", color: "var(--fp-text-muted)", borderBottom: "2px solid var(--fp-border)", width: "25%" }}>Dimension Affected</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => {
            /* FAR-01: B&W priority badge styles — typographic weight hierarchy */
            const priorityStyle: Record<ChecklistItem["priority"], { color: string; bg: string; border: string; weight: number; borderWidth: string }> = {
              CRITICAL: { color: "#111", bg: "#f0f0f0", border: "#111", weight: 700, borderWidth: "2px" },
              RECOMMENDED: { color: "#111", bg: "#f8f8f8", border: "#555", weight: 600, borderWidth: "1px" },
              OPTIONAL: { color: "#555", bg: "#ffffff", border: "#aaa", weight: 500, borderWidth: "1px" },
            };
            const ps = priorityStyle[item.priority];
            return (
              <tr key={item.id} style={{ background: "transparent", pageBreakInside: "avoid" }}>
                <td style={{ padding: "10px", borderBottom: "1px solid var(--fp-border)", color: "var(--fp-text-muted)", fontWeight: 600 }}>{idx + 1}</td>
                <td style={{ padding: "10px", borderBottom: "1px solid var(--fp-border)" }}>
                  <span style={{ fontSize: "8px", fontWeight: ps.weight, letterSpacing: "0.5px", color: ps.color, background: ps.bg, border: `${ps.borderWidth} solid ${ps.border}`, borderRadius: "2px", padding: "2px 5px", textTransform: "uppercase" }}>
                    {PRIORITY_LABELS[item.priority]}
                  </span>
                </td>
                <td style={{ padding: "10px", borderBottom: "1px solid var(--fp-border)", fontWeight: 600, color: "var(--fp-text-primary)" }}>{item.title}</td>
                <td style={{ padding: "10px", borderBottom: "1px solid var(--fp-border)", color: "var(--fp-text-secondary, #374151)", lineHeight: "1.5" }}>{item.description}</td>
                <td style={{ padding: "10px", borderBottom: "1px solid var(--fp-border)" }}>
                  <div style={{ color: "var(--fp-text-secondary, #374151)", marginBottom: "3px" }}>{item.impact}</div>
                  {/* FAR-01: impact delta in B&W bold instead of green */}
                  <div style={{ fontSize: "9px", fontWeight: 700, color: "#111" }}>{item.impactDelta}</div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ marginTop: "16px", paddingTop: "10px", borderTop: "1px solid var(--fp-border)" }}>
        <p style={{ fontSize: "9px", color: "var(--fp-text-muted)", lineHeight: "1.5", margin: 0 }}>
          This checklist is generated automatically by the KINGA assessment engine. Re-running the assessment after attaching additional evidence will recalculate all scores and update this checklist. Items marked CRITICAL must be resolved before the claim can proceed to Claims Manager approval.
        </p>
      </div>
    </div>
  );
};

export default ConfidenceImprovementChecklist;
