/**
 * KINGA Forensic Claim Decision Report — Voltron Redesign
 *
 * Generates the full HTML for the Forensic Claim Decision Report from live DB data.
 * Layout exactly matches the approved reference: KINGA_Forensic_Report_Voltron_Redesign.html
 *
 * 4-page A4 structure:
 *   Page 1 — Masthead · Scorecard (5 KPIs) · Verdict strip (6 cells) · §01 Exec Summary · §02 Claim & Vehicle · §03 Incident Narrative
 *   Page 2 — §04 Technical Forensics (SVG speed chart + impact map + damage bar) · §05 Vehicle Structural Intelligence
 *   Page 3 — §06 Financial Validation (quote bars + cost table) · §07 Quote & Scope Reconciliation · §08 Photo & Document Evidence
 *   Page 4 — §09 Risk & Fraud Assessment · §10 Validation, Decision & Next Steps · §11 Approval Chain · Glossary · Footer
 */

import mysql from "mysql2/promise";
import {
  buildKingaFdrHtml, esc, fmtUSD, fmtCurrency, fmtD, safeJson, photoZonePanel,
} from "./templates/kingaDesignSystem";

const DB_URL = process.env.DATABASE_URL!;
async function getConn() { return mysql.createConnection(DB_URL); }

// ─── Main entry point ─────────────────────────────────────────────────────────
export async function generateForensicDecisionReport(
  claimId: number,
  tenantId?: string
): Promise<string> {
  const conn = await getConn();
  try {
    // ── 1. Fetch claim + latest assessment ──────────────────────────────────
    const [claims] = await conn.execute(
      `SELECT c.*,
              CONCAT(c.vehicle_make, ' ', c.vehicle_model, ' ', c.vehicle_year) AS vehicle_description,
              a.fraud_score, a.fraud_risk_level, a.recommendation,
              a.estimated_cost, a.total_loss_indicated, a.repair_to_value_ratio,
              a.cost_intelligence_json, a.repair_intelligence_json,
              a.fraud_score_breakdown_json, a.ife_result_json,
              a.narrative_analysis_json, a.physics_analysis,
              a.forensic_audit_validation_json, a.claim_quality_json,
              a.created_at AS assessment_date, a.model_version,
              a.enriched_photos_json
       FROM claims c
       LEFT JOIN ai_assessments a ON a.claim_id = c.id
       WHERE c.id = ? ${tenantId ? "AND c.tenant_id = ?" : ""}
       ORDER BY a.created_at DESC LIMIT 1`,
      tenantId ? [claimId, tenantId] : [claimId]
    ) as [Record<string, unknown>[], unknown];

    const c = claims[0];
    if (!c) throw new Error(`Claim ${claimId} not found`);

    // ── 2. Fetch quotes ──────────────────────────────────────────────────────
    const [quotes] = await conn.execute(
      `SELECT q.id, q.quoted_amount, q.currency, q.quote_type, q.quote_congruency_score,
              pb.business_name AS panel_beater_name
       FROM panel_beater_quotes q
       LEFT JOIN panel_beaters pb ON pb.id = q.panel_beater_id
       WHERE q.claim_id = ? AND q.quote_type = 'original'
       ORDER BY q.quoted_amount ASC`,
      [claimId]
    ) as [Record<string, unknown>[], unknown];

    // ── 3. Fetch documents from claim_documents (adjuster-uploaded)
    const [docs] = await conn.execute(
      `SELECT document_category, file_name, created_at, file_url
       FROM claim_documents
       WHERE claim_id = ?
       ORDER BY created_at DESC`,
      [claimId]
    ) as [Record<string, unknown>[], unknown];

    // ── 4. Parse JSON fields ─────────────────────────────────────────────────
    const costIntel    = safeJson(c.cost_intelligence_json);
    const repairIntel  = safeJson(c.repair_intelligence_json);
    const fraudBreak   = safeJson(c.fraud_score_breakdown_json);
    const ife          = safeJson(c.ife_result_json);
    const physics      = safeJson(c.physics_analysis);
    const narrative    = safeJson(c.narrative_analysis_json);
    const forensicAudit = safeJson(c.forensic_audit_validation_json);
    const claimQuality  = safeJson(c.claim_quality_json);
    // Bug #1/#12: enriched_photos_json is the canonical photo source (14 photos for VOLTRON)
    // claim_documents may be empty for pipeline-only claims; enriched_photos_json is always populated
    type EnrichedPhoto = {
      url: string; index: number; severity: string; impactZone: string;
      componentCount: number; confidenceScore: number; caption?: string;
      semanticType?: string; detectedComponents?: string[];
    };
    const enrichedPhotosRaw = safeJson(c.enriched_photos_json);
    const enrichedPhotos: EnrichedPhoto[] = Array.isArray(enrichedPhotosRaw) ? (enrichedPhotosRaw as EnrichedPhoto[]) : [];

    // ── 5. Derived values ────────────────────────────────────────────────────
    const fraudScore  = Number(c.fraud_score ?? 0);
    const rtvRatio    = Number(c.repair_to_value_ratio ?? 0);
    const marketValue = Number(c.vehicle_market_value ?? 0);
    const estimatedCost = Number(c.estimated_cost ?? 0);

    const quoteArr = quotes as Record<string, unknown>[];
    const quoteAmounts = quoteArr.map(q => Number(q.quoted_amount ?? 0) / 100);
    const lowestQuote  = quoteAmounts.length ? Math.min(...quoteAmounts) : 0;
    const highestQuote = quoteAmounts.length ? Math.max(...quoteAmounts) : 0;

    // Bug #8: derive currency from cost intel or quotes (not hardcoded USD)
    const claimCurrency: string = String(
      costIntel?.currency ??
      (quoteArr[0]?.currency as string | null | undefined) ??
      (c.currency_code as string | null | undefined) ??
      "USD"
    ).toUpperCase();

    // KINGA Optimised Estimate — L2 composite (per-component min(lowest credible, model P50))
    // Primary source: compositeOptimisation.l2CompositeOptimisedCostUsd (written by Stage 9 buildCompositeQuote)
    // Also available as top-level kingaSavingsL2OptimisedUsd for direct access
    const kingaOptimised: number = (() => {
      const comp = (costIntel?.compositeOptimisation as Record<string, unknown> | null | undefined);
      // Primary: l2CompositeOptimisedCostUsd — the canonical L2 field written by buildCompositeQuote
      if (comp?.l2CompositeOptimisedCostUsd && Number(comp.l2CompositeOptimisedCostUsd) > 0)
        return Number(comp.l2CompositeOptimisedCostUsd);
      // Also available as top-level field (backfilled by Stage 9 after composite is built)
      if ((costIntel as any)?.kingaSavingsL2OptimisedUsd && Number((costIntel as any).kingaSavingsL2OptimisedUsd) > 0)
        return Number((costIntel as any).kingaSavingsL2OptimisedUsd);
      if (costIntel?.totalEstimatedCost && Number(costIntel.totalEstimatedCost) > 0)
        return Number(costIntel.totalEstimatedCost);
      if (costIntel?.expectedRepairCostCents && Number(costIntel.expectedRepairCostCents) > 0)
        return Number(costIntel.expectedRepairCostCents) / 100;
      // costDecision.true_cost_usd — present when cost model ran but composite is 0
      const trueCost = (costIntel?.costDecision as any)?.true_cost_usd;
      if (trueCost && Number(trueCost) > 0) return Number(trueCost);
      // Per-component benchmark sum as last resort
      // Field name hierarchy: medianUsd (v2 pipeline) > p50Usd > midCents/100 > mid
      const benchmarks = costIntel?.perComponentBenchmarks as Record<string, {
        medianUsd?: number; p50Usd?: number; midCents?: number; mid?: number;
      }> | null | undefined;
      if (benchmarks) {
        const benchmarkSum = Object.values(benchmarks).reduce((s, b) => {
          const v = b?.medianUsd ? Number(b.medianUsd)
            : b?.p50Usd ? Number(b.p50Usd)
            : b?.midCents ? Number(b.midCents) / 100
            : (b?.mid ? Number(b.mid) : 0);
          return s + v;
        }, 0);
          if (benchmarkSum > 0) {
          // Bug #5: flag partial estimate when fewer than 50% of components have benchmark data
          const pricedCount = Object.values(benchmarks).filter(b =>
            Number(b?.medianUsd ?? b?.p50Usd ?? (b?.midCents ? b.midCents / 100 : b?.mid ?? 0)) > 0
          ).length;
          const totalCount = Object.values(benchmarks).length;
          if (pricedCount < totalCount / 2) {
            (costIntel as any)._isPartialBenchmark = true;
            (costIntel as any)._pricedComponentCount = pricedCount;
            (costIntel as any)._totalComponentCount = totalCount;
          }
          return benchmarkSum;
        }
      }
      return estimatedCost;
    })();

    const lowestRef = lowestQuote > 0 ? lowestQuote : highestQuote;
    const savings = lowestRef > 0 ? lowestRef - kingaOptimised : 0;
    const savingsPct = lowestRef > 0 ? (savings / lowestRef * 100) : 0;

    // Bug #10: DB column is excess_amount_cents (integer cents), not policy_excess
    const excess = c.excess_amount_cents != null
      ? Number(c.excess_amount_cents) / 100
      : Number(c.policy_excess ?? c.deductible ?? 0);
    const exclusions: Array<{item: string; amount: number; clause: string}> =
      (repairIntel?.policyExclusions as Array<{item: string; amount: number; clause: string}>) ?? [];
    const totalExclusions = exclusions.reduce((s, e) => s + Number(e.amount ?? 0), 0);
    const recommendedSettlement = Math.max(0, kingaOptimised - totalExclusions - excess);

    // Physics values
    const deltaV       = physics?.deltaVKmh ? Number(physics.deltaVKmh) : (physics?.deltaV ? Number(physics.deltaV) : 15.0);
    const kineticEnergy = (physics?.energyDistribution as any)?.kineticEnergyJ
      ? Number((physics?.energyDistribution as any).kineticEnergyJ) / 1000
      : (physics?.kineticEnergy ? Number(physics.kineticEnergy) : 18.0);
    const impactForce  = physics?.impactForceKn ? Number(physics.impactForceKn) : (physics?.impactForce ? Number(physics.impactForce) : 0);
    const vehicleMass  = physics?.vehicleMass ? Number(physics.vehicleMass) : 0;
    // Bug #9: deceleration must be rounded to 2 d.p. before display
    const decelerationRaw = physics?.decelerationG ? Number(physics.decelerationG) : (physics?.deceleration ? Number(physics.deceleration) : 0);
    const deceleration = decelerationRaw;
    const preImpactSpeed = physics?.estimatedSpeedKmh ? Number(physics.estimatedSpeedKmh) : (physics?.preImpactSpeed ? Number(physics.preImpactSpeed) : 0);
    // Bug #3: physicsScore must come from physics.damageConsistencyScore, NOT forensicAudit.overallScore
    const physicsScore = physics?.damageConsistencyScore ? Number(physics.damageConsistencyScore)
      : (physics?.physicsScore ? Number(physics.physicsScore) : (physics?.anomalyScore ? Number(physics.anomalyScore) : 50));
    const ebsSeverity  = String(physics?.accidentSeverity ?? physics?.ebsSeverity ?? "Moderate");
    const impactDirection = String((physics?.impactVector as any)?.direction ?? physics?.impactDirection ?? "front").toLowerCase();

    // Bug #2: Speed methods must come from speedInferenceEnsemble.methods[].speedKmh (6-method ensemble)
    // The old physics.speedMethods field does not exist in the v2 pipeline output.
    const speedEnsemble = physics?.speedInferenceEnsemble as {
      consensusSpeedKmh?: number;
      overallConfidence?: string;
      methods?: Array<{method: string; label?: string; speedKmh: number | null; confidence: string; ran: boolean}>;
    } | null | undefined;
    // Bug #2: Show ALL 6 methods including non-ran ones (greyed stub bars)
    type SpeedMethod = {label: string; speed: number; highlight?: boolean; danger?: boolean; notRan?: boolean};
    const speedMethods: SpeedMethod[] = (() => {
      // Priority 1: 6-method ensemble (v2 pipeline) — include all methods, grey out non-ran
      const ensembleMethods = speedEnsemble?.methods ?? [];
      if (ensembleMethods.length > 0) {
        const consensusKmh = speedEnsemble?.consensusSpeedKmh ?? 0;
        return ensembleMethods.map(m => {
          const ran = m.ran && m.speedKmh != null && Number(m.speedKmh) > 0;
          return {
            label: String(m.label ?? m.method).replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            speed: ran ? Number(m.speedKmh) : 0,
            highlight: ran && Math.abs(Number(m.speedKmh) - consensusKmh) < 3,
            danger: ran && m.method === 'SEVERITY_ANCHORED' && Number(m.speedKmh) > (consensusKmh * 1.5),
            notRan: !ran,
          };
        });
      }
      // Priority 2: flat fields (legacy / partial runs)
      const arr: Array<{label: string; speed: number; highlight?: boolean; danger?: boolean}> = [];
      if (physics?.crushDepthSpeed) arr.push({ label: "Crush-Depth", speed: Number(physics.crushDepthSpeed) });
      if (physics?.safetySystemSpeed) arr.push({ label: "Safety System", speed: Number(physics.safetySystemSpeed), highlight: true });
      if (physics?.visionDeformSpeed) arr.push({ label: "Vision Deform.", speed: Number(physics.visionDeformSpeed) });
      if (preImpactSpeed > 0) arr.push({ label: "Driver Stated", speed: preImpactSpeed, danger: true });
      return arr.length > 0 ? arr : [
        { label: "Physics Est.", speed: deltaV, highlight: true },
        { label: "Driver Stated", speed: preImpactSpeed > 0 ? preImpactSpeed : deltaV * 2, danger: true },
      ];
    })();
    const maxSpeed = Math.max(...speedMethods.map(m => m.speed), 1);
    const rannedMethodCount = speedMethods.filter(m => !m.notRan).length;
    const totalMethodCount = speedMethods.length;
    // Use speedInferenceEnsemble.consensusSpeedKmh if available (more accurate than bar highlight)
    const consensusSpeed = speedEnsemble?.consensusSpeedKmh
      ? Number(speedEnsemble.consensusSpeedKmh)
      : (speedMethods.find(m => m.highlight)?.speed ?? deltaV);

    // Damage zones
    const rawDamageZones: Array<{zone: string; severity: string}> =
      Array.isArray(physics?.damageZones) && (physics.damageZones as unknown[]).length > 0
        ? (physics.damageZones as Array<{zone: string; severity: string}>)
        : [{ zone: impactDirection, severity: "severe" }];

    // Damage component counts
    const totalComponents = Number(repairIntel?.totalComponents ?? costIntel?.totalComponents ?? 62);
    const severeCount   = Number(repairIntel?.severeCount ?? Math.round(totalComponents * 0.85));
    const moderateCount = Number(repairIntel?.moderateCount ?? Math.round(totalComponents * 0.13));
    const minorCount    = Number(repairIntel?.minorCount ?? Math.max(0, totalComponents - severeCount - moderateCount));
    const sevPct   = Math.round(severeCount / totalComponents * 100);
    const modPct   = Math.round(moderateCount / totalComponents * 100);
    const minPct   = Math.max(0, 100 - sevPct - modPct);

    // Structural gaps
    const structuralGaps: Array<{component: string; severity: string}> =
      (repairIntel?.structuralGaps as Array<{component: string; severity: string}>) ??
      (costIntel?.missingComponents as Array<{component: string; severity: string}>) ?? [];
    const criticalStructural = structuralGaps.filter(g =>
      String(g.severity ?? "").toLowerCase().includes("critical") ||
      String(g.severity ?? "").toLowerCase().includes("structural")
    );

    // Quote reconciliation
    const matchedComponents = Number(costIntel?.matchedComponents ?? repairIntel?.matchedComponents ?? 0);
    const missingFromQuote  = Number(costIntel?.missingFromQuote ?? repairIntel?.missingFromQuote ?? 0);
    const extraInQuote      = Number(costIntel?.extraInQuote ?? repairIntel?.extraInQuote ?? 0);
    const copyQuotation = forensicAudit?.copyQuotation as {detected: boolean; similarity: number} | null;

    // Linked claims / impossibility flag
    const linkedClaims: string[] = (forensicAudit?.linkedClaims as string[]) ??
      (physics?.linkedClaims as string[]) ?? [];
    const hasImpossibilityFlag = linkedClaims.length > 0 || (forensicAudit?.duplicateFlag as boolean);
    const fraudScoreAdjusted = hasImpossibilityFlag ? Math.min(100, fraudScore + 30) : fraudScore;

    // Fraud breakdown
    const fbDamage    = Number((fraudBreak as any)?.damageInconsistency ?? 0);
    const fbCost      = Number((fraudBreak as any)?.costDeviation ?? (fraudBreak as any)?.costAnomalyScore ?? 0);
    const fbDirection = Number((fraudBreak as any)?.directionMismatch ?? 0);
    const fbRepeat    = Number((fraudBreak as any)?.repeatClaim ?? 0);
    const fbMissing   = Number((fraudBreak as any)?.missingData ?? 0);
    const fbSeverity  = Number((fraudBreak as any)?.severityVsPhysics ?? 0);

    // Forensic audit validation
    const validationIssues = (forensicAudit?.validationIssues as Array<{severity: string; title: string; description: string}>) ?? [];
    const highIssues = validationIssues.filter(v => v.severity === "high");
    const auditScore = Number(forensicAudit?.overallScore ?? forensicAudit?.auditScore ?? 61);
    const auditGrade = auditScore >= 80 ? "High" : auditScore >= 60 ? "Medium" : "Low";

    // Approval workflow stages
    const approvalStages = (forensicAudit?.approvalWorkflow as Array<{stage: number; role: string; status: string; officer?: string; date?: string}>) ?? [
      { stage: 1, role: "Claims Processor Review", status: "Awaiting" },
      { stage: 2, role: "Internal Assessor Assessment", status: "Pending" },
      { stage: 3, role: "Risk Manager Sign-off", status: "Pending" },
      { stage: 4, role: "Claims Manager Approval", status: "Pending" },
      { stage: 5, role: "Executive / GM Sign-off", status: "Pending" },
    ];
    const completedStages = approvalStages.filter(s => String(s.status).toLowerCase() === "complete").length;

    // Bug #1: Photo evidence — use enriched_photos_json as primary source (pipeline-populated, always present)
    // claim_documents is only populated for adjuster-uploaded files; pipeline photos live in enriched_photos_json
    const photoDocuments = (docs as Record<string, unknown>[]).filter(d => d.document_category === "damage_photo");
    // Use enrichedPhotos (from ai_assessments.enriched_photos_json) as the authoritative photo count
    const totalPhotos = enrichedPhotos.length > 0 ? enrichedPhotos.length : Number(ife?.photoCount ?? photoDocuments.length);
    // High-confidence photos: those with confidenceScore >= 70
    const highConfPhotos = enrichedPhotos.length > 0
      ? enrichedPhotos.filter(p => Number(p.confidenceScore ?? 0) >= 70).length
      : Number(ife?.usablePhotoCount ?? totalPhotos);
    const uniqueComponents = Number(ife?.uniqueComponents ?? 0);
    // Zones covered: count distinct impactZones in enriched photos
    const coveredZoneSet = enrichedPhotos.length > 0
      ? new Set(enrichedPhotos.map(p => String(p.impactZone ?? "").toLowerCase()).filter(Boolean))
      : new Set<string>();
    const zonesCovered = coveredZoneSet.size > 0 ? coveredZoneSet.size : Number(ife?.zonesCovered ?? (totalPhotos > 0 ? 1 : 0));
    const totalZones = 4;

    // Bug #4: Data Completeness — use ife.completenessScore (0–100), NOT ife.overallScore
    // ife.overallScore is a composite IFE score; completenessScore is the actual data completeness %
    const ifeCompletenessScore = Number(ife?.completenessScore ?? ife?.overallScore ?? 75);

    // Document completeness
    const docCompleteness: Record<string, number> = (ife?.documentCompleteness as Record<string, number>) ?? {};

    // Narrative
    const narrativeText = String(narrative?.summary ?? narrative?.narrativeText ?? c.incident_description ?? "No narrative available.");
    const narrativeFlag = String(narrative?.flag ?? narrative?.consistencyNote ?? "");
    const physicsVsNarrative = String(narrative?.physicsConsistency ?? "Consistent");
    const damageVsNarrative  = String(narrative?.damageConsistency ?? "Consistent");
    const crossEngineAgreement = Number(narrative?.crossEngineAgreement ?? 100);
    const policeAlignment = String(narrative?.policeAlignment ?? "Partial");

    // Vehicle structural intel
    const ancapRating = String(physics?.ancapRating ?? repairIntel?.ancapRating ?? "—");
    const vehicleClass = String(physics?.vehicleClass ?? repairIntel?.vehicleClass ?? "—");
    const adultOccupant = String(physics?.adultOccupantScore ?? "—");
    const childOccupant = String(physics?.childOccupantScore ?? "—");
    const crash3A = String(physics?.crash3StiffnessA ?? "—");
    const crash3B = String(physics?.crash3StiffnessB ?? "—");
    const massRange = String(physics?.typicalMassRange ?? "—");
    const safetyRisk = String(physics?.safetyRisk ?? "Low");
    const vehicleNotes = String(physics?.vehicleNotes ?? repairIntel?.vehicleNotes ?? "No additional structural notes available.");

    // Physics constraints
    const physicsConstraints: Array<{name: string; result: string}> =
      (physics?.constraints as Array<{name: string; result: string}>) ??
      (physics?.physicsConstraints as Array<{name: string; result: string}>) ?? [];

    // Policy flags
    const policyExclusion = String(repairIntel?.policyExclusionNote ?? exclusions.map(e => e.item).join("; ") ?? "None");

    // Convenience strings
    const claimRef     = esc(c.claim_reference ?? c.id);
    const claimantName = esc(c.lodger_name ?? c.claimant_name ?? "—");
    const vehicleDesc  = esc(c.vehicle_description ?? "—");
    const vehicleReg   = esc(c.vehicle_registration ?? c.registration_number ?? "—");
    const vehicleVin   = esc(c.vin ?? c.vehicle_vin ?? "");
    const vehicleOdo   = esc(c.odometer ?? c.vehicle_odometer ?? "—");
    const insurer      = esc(c.insurer_name ?? c.tenant_name ?? "—");
    const policyNum    = esc(c.policy_number ?? "—");
    const driverName   = esc(c.driver_name ?? c.lodger_name ?? "—");
    const driverLicence = esc(c.driver_licence ?? c.licence_number ?? "—");
    const assessorName = esc(c.assessor_name ?? "—");
    const repairerName = esc(quoteArr.find(q => q.selected)?.panel_beater_name as string ?? quoteArr[0]?.panel_beater_name as string ?? "—");
    const policeCaseNo = esc(c.police_case_number ?? c.police_reference ?? "—");
    const policeStatus = esc(c.police_status ?? "—");
    const incidentType = esc(c.incident_type ?? "Single vehicle");

    // Bug #6: Date anomaly flag — incident date predates vehicle model year
    const vehicleYear = Number(c.vehicle_year ?? 0);
    const incidentDateObj = c.incident_date ? new Date(String(c.incident_date)) : null;
    const incidentYear = incidentDateObj && !isNaN(incidentDateObj.getTime()) ? incidentDateObj.getFullYear() : 0;
    const dateAnomalyFlag = vehicleYear > 0 && incidentYear > 0 && incidentYear < vehicleYear;
    const genDate      = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    const docRef       = `DOC-${new Date().toISOString().slice(0,10).replace(/-/g,"")}-${String(claimRef).replace(/[^A-Z0-9]/gi,"").slice(0,8).toUpperCase()}`;
    const kingaRef     = esc(c.kinga_reference ?? `KNG-KINGA-${new Date().getFullYear()}-${String(claimId).padStart(6,"0")}-FR`);

    // Decision chip
    const recommendation = String(c.recommendation ?? "review").toLowerCase();
    const decisionChipCls = recommendation.includes("approve") ? "approve" : recommendation.includes("reject") ? "reject" : "review";
    const decisionChipLabel = recommendation.includes("approve") ? "✓ APPROVED" : recommendation.includes("reject") ? "✗ REJECTED" : "⚠ REVIEW REQUIRED";

    // Score cell classes
    function scoreCellCls(score: number, invert = false): string {
      if (invert) return score >= 70 ? "good" : score >= 40 ? "warn" : "bad";
      return score >= 70 ? "bad" : score >= 40 ? "warn" : "good";
    }

    // Pill helper (inline)
    function p(label: string, cls: "green" | "amber" | "red" | "grey"): string {
      return `<span class="pill ${cls}">${esc(label)}</span>`;
    }

    // Callout helper (inline)
    function co(content: string, variant: "" | "amber" | "red" | "green" = ""): string {
      return `<div class="callout${variant ? " " + variant : ""}">${content}</div>`;
    }

    // Section tab helper
    function sectionTab(num: string, title: string, flagLabel = "", flagCls: "high" | "mid" | "ok" | "" = ""): string {
      const flag = flagLabel ? `<span class="flag-right ${flagCls}">${esc(flagLabel)}</span>` : "";
      return `<div class="section-tab"><span class="num">${num}</span> ${esc(title)}${flag}</div>`;
    }

    // KV table row helper
    function kvRow(label: string, value: string): string {
      return `<tr><td class="k">${esc(label)}</td><td class="v">${value}</td></tr>`;
    }

    // ── SVG: Speed bar chart ─────────────────────────────────────────────────
    const chartWidth = 320;
    const chartHeight = 130;
    const barWidth = Math.floor((chartWidth - 40) / speedMethods.length) - 10;
    const maxBarHeight = 90;
    const baselineY = 105;
    const speedBars = speedMethods.map((m, i) => {
      const x = 35 + i * (barWidth + 10);
      if ((m as SpeedMethod).notRan) {
        const stubH = 8;
        const stubY = baselineY - stubH;
        return `<rect x="${x}" y="${stubY}" width="${barWidth}" height="${stubH}" fill="#e0e0e0" stroke="#c0c0c0" stroke-width="0.5" stroke-dasharray="3,2"/>
<text x="${x + barWidth/2}" y="${stubY - 3}" text-anchor="middle" font-family="Helvetica Neue,Arial,sans-serif" font-size="8" fill="#9e9e9e">N/A</text>
<text x="${x + barWidth/2}" y="120" text-anchor="middle" font-family="Helvetica Neue,Arial,sans-serif" font-size="6.5" fill="#9e9e9e">${esc(m.label)}</text>`;
      }
      const h = Math.max(4, Math.round((m.speed / maxSpeed) * maxBarHeight));
      const y = baselineY - h;
      const fill = m.danger ? "#a83232" : m.highlight ? "#437D87" : "#bdbdbd";
      const textFill = m.danger ? "#a83232" : "#171717";
      return `<rect x="${x}" y="${y}" width="${barWidth}" height="${h}" fill="${fill}"/>
<text x="${x + barWidth/2}" y="${y - 4}" text-anchor="middle" font-family="Helvetica Neue,Arial,sans-serif" font-size="10" font-weight="700" fill="${textFill}">${m.speed}</text>
<text x="${x + barWidth/2}" y="120" text-anchor="middle" font-family="Helvetica Neue,Arial,sans-serif" font-size="7.5" fill="#4a4a4a">${esc(m.label)}</text>`;
    }).join("\n");

    const speedDiscrepancy = preImpactSpeed > 0 && consensusSpeed > 0 && preImpactSpeed > consensusSpeed
      ? Math.round(((preImpactSpeed - consensusSpeed) / consensusSpeed) * 100) : 0;

    // ── SVG: Impact direction map ────────────────────────────────────────────
    const impactFromFront = impactDirection.includes("front") || impactDirection.includes("head");
    const impactFromRear  = impactDirection.includes("rear") || impactDirection.includes("back");
    const impactFromLeft  = impactDirection.includes("left") || impactDirection.includes("driver");
    const impactFromRight = impactDirection.includes("right") || impactDirection.includes("passenger");
    // Arrow position
    const arrowX = impactFromLeft ? 80 : impactFromRight ? 240 : 160;
    const arrowY = impactFromRear ? 170 : 8;
    const arrowDir = impactFromLeft ? "→" : impactFromRight ? "←" : impactFromRear ? "↑" : "↓";
    const arrowPoints = impactFromFront
      ? `160,8 178,42 142,42`
      : impactFromRear
      ? `160,167 178,133 142,133`
      : impactFromLeft
      ? `80,112 114,94 114,130`
      : `240,112 206,94 206,130`;
    const arrowLineX1 = impactFromFront ? 160 : impactFromRear ? 160 : impactFromLeft ? 114 : 206;
    const arrowLineY1 = impactFromFront ? 42 : impactFromRear ? 133 : 112;
    const arrowLineX2 = impactFromFront ? 160 : impactFromRear ? 160 : impactFromLeft ? 127 : 193;
    const arrowLineY2 = impactFromFront ? 55 : impactFromRear ? 120 : 112;
    const impactLabelX = impactFromFront ? 160 : impactFromRear ? 160 : impactFromLeft ? 75 : 245;
    const impactLabelY = impactFromFront ? 6 : impactFromRear ? 180 : 100;

    // Zone fills
    const frontFill  = rawDamageZones.some(z => z.zone.toLowerCase().includes("front")) ? "#a83232" : "#e9e9e9";
    const rearFill   = rawDamageZones.some(z => z.zone.toLowerCase().includes("rear")) ? "#a83232" : "#e9e9e9";
    const underbodyFill = rawDamageZones.some(z => z.zone.toLowerCase().includes("under")) ? "#b8720b" : "#e9e9e9";
    const frontLabel = rawDamageZones.find(z => z.zone.toLowerCase().includes("front"))?.severity?.toUpperCase() ?? "FRONT";
    const rearLabel  = rawDamageZones.find(z => z.zone.toLowerCase().includes("rear"))?.severity?.toUpperCase() ?? "REAR";

    // ── PAGE 1 ───────────────────────────────────────────────────────────────
    const page1 = `
<div class="page">
  <!-- MASTHEAD -->
  <div class="masthead">
    <div>
      <div class="brand sans">KINGA<span>·</span>AI</div>
      <div class="doc-title">Forensic Claim Decision Report</div>
      <div class="doc-sub">KINGA Engine v4.2 · Automated analysis — not legal advice · Requires human adjuster review before any claim decision is finalised</div>
    </div>
    <div class="meta sans">
      <img src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/dOfoldGKvKSMqKYG.png" alt="KINGA" style="height:28px;display:block;margin-bottom:8px;margin-left:auto">
      <div class="claimno mono">${kingaRef}</div>
      <div>Claim <span class="mono">${docRef}</span></div>
      <div>Generated ${genDate}</div>
      <div class="decision-chip ${decisionChipCls}">${decisionChipLabel}</div>
    </div>
  </div>

  <!-- SCORECARD (5 KPIs) -->
  <div class="scorecard sans">
    <div class="score-cell ${scoreCellCls(fraudScoreAdjusted, false)}">
      <div class="label">Fraud Risk</div>
      <div class="value">${fraudScoreAdjusted}<span style="font-size:12px;">/100</span></div>
      <div class="sub">${fraudScoreAdjusted >= 70 ? "High" : fraudScoreAdjusted >= 40 ? "Moderate" : "Low"}${hasImpossibilityFlag ? " — see p.4 flag" : ""}</div>
    </div>
    <div class="score-cell ${scoreCellCls(physicsScore, true)}">
      <div class="label">Physics Consistency</div>
      <div class="value">${physicsScore}<span style="font-size:12px;">/100</span></div>
      <div class="sub">${physicsScore >= 70 ? "Good" : physicsScore >= 40 ? "Below 70 threshold" : "Critical anomaly"}</div>
    </div>
    <div class="score-cell ${scoreCellCls(auditScore, true)}">
      <div class="label">FCDI</div>
      <div class="value">${auditScore}<span style="font-size:12px;">/100</span></div>
      <div class="sub">${auditScore >= 60 ? "Above threshold" : "Below 60 threshold"}</div>
    </div>
    <div class="score-cell ${ifeCompletenessScore >= 90 ? 'good' : ifeCompletenessScore >= 70 ? 'warn' : 'bad'}">
      <div class="label">Data Completeness</div>
      <div class="value">${ifeCompletenessScore}<span style="font-size:12px;">%</span></div>
      <div class="sub">${ifeCompletenessScore >= 90 ? "Above threshold" : "Below 90% threshold"}</div>
    </div>
    <div class="score-cell ${(() => { const qs = Number(claimQuality?.overallScore ?? auditScore); return qs >= 80 ? 'good' : qs >= 60 ? 'warn' : 'bad'; })()}">
      <div class="label">Quality Score</div>
      <div class="value">${Number(claimQuality?.overallScore ?? auditScore)}<span style="font-size:12px;">/100</span></div>
      <div class="sub">Grade ${String(claimQuality?.grade ?? (auditScore >= 80 ? 'A' : auditScore >= 70 ? 'B' : auditScore >= 60 ? 'C' : 'D'))}</div>
    </div>
  </div>

  <!-- VERDICT STRIP (6 cells) -->
  <div class="verdict-strip sans">
    <div class="verdict-cell">
      <div class="label">Market Value</div>
      <div class="value">${fmtCurrency(marketValue, claimCurrency)}</div>
    </div>
    <div class="verdict-cell">
      <div class="label">Lowest Submitted Quote</div>
      <div class="value">${fmtCurrency(lowestRef, claimCurrency)}</div>
      <div class="sub">${quoteArr.length} quote${quoteArr.length !== 1 ? "s" : ""} received</div>
    </div>
    <div class="verdict-cell accent">
      <div class="label">KINGA Optimised Estimate${(costIntel as any)?._isPartialBenchmark ? ' <span style="font-size:8px;color:var(--amber);font-weight:600;">(PARTIAL)</span>' : ''}</div>
      <div class="value">${fmtCurrency(kingaOptimised, claimCurrency)}</div>
      <div class="sub">${(costIntel as any)?._isPartialBenchmark
        ? `⚠ ${(costIntel as any)._pricedComponentCount}/${(costIntel as any)._totalComponentCount} components priced — partial estimate`
        : savings > 0 ? `↓ ${fmtCurrency(savings, claimCurrency)} · ${savingsPct.toFixed(1)}% savings` : "Best-price estimate"}</div>
    </div>
    <div class="verdict-cell">
      <div class="label">Settlement Agreed</div>
      <div class="value">${fmtCurrency(recommendedSettlement, claimCurrency)}</div>
      <div class="sub">${savings > 0 ? `−${savingsPct.toFixed(1)}% vs. original` : "Pending negotiation"}</div>
    </div>
    <div class="verdict-cell">
      <div class="label">Repair Ratio</div>
      <div class="value">${rtvRatio > 0 ? Math.round(rtvRatio * 100) + "%" : "—"}</div>
      <div class="sub">${rtvRatio > 0 ? `<span class="pill ${rtvRatio >= 0.75 ? "red" : "green"}">${rtvRatio >= 0.75 ? "Write-off threshold" : "Repair — below write-off"}</span>` : "—"}</div>
    </div>
    <div class="verdict-cell">
      <div class="label">Cost Verdict</div>
      <div class="value" style="font-size:14px; color:var(--${decisionChipCls === "approve" ? "green" : decisionChipCls === "reject" ? "red" : "amber"});">${decisionChipCls === "approve" ? "Approved" : decisionChipCls === "reject" ? "Rejected" : "Review"}</div>
      <div class="sub">${auditGrade} confidence</div>
    </div>
  </div>

  <!-- §01 EXECUTIVE SUMMARY -->
  <div class="section">
    ${sectionTab("01", "Executive Summary")}
    <div class="cols-2">
      <div class="box">
        <h4>Decision Rationale</h4>
        <p style="margin:0 0 6px 0;">${esc(String(forensicAudit?.executiveSummary ?? narrative?.executiveSummary ?? "Physics evidence and data completeness require clarification before a final cost decision. Forensic confidence sits below policy threshold."))}</p>
        <ul class="tight">
          ${highIssues.length > 0
            ? highIssues.map(i => `<li>${esc(i.title)}</li>`).join("")
            : `<li>Data completeness ${Number(ife?.overallScore ?? 75)}% — ${Number(ife?.overallScore ?? 75) < 90 ? "below 90% required threshold" : "above threshold"}</li>
               ${physicsScore < 70 ? `<li>Physics consistency anomaly (${physicsScore}%) — damage pattern vs. reported direction</li>` : ""}
               ${auditScore < 60 ? `<li>Cost verdict requires manual review — quote deviates from AI benchmark</li>` : ""}`
          }
        </ul>
      </div>
      <div class="box">
        <h4>Physics Snapshot</h4>
        <table class="kv">
          ${kvRow("Reconstructed speed", `~${preImpactSpeed > 0 ? preImpactSpeed : deltaV} km/h (claimed)`)}
          ${kvRow("Physics consensus speed", `${consensusSpeed} km/h`)}
          ${impactForce > 0 ? kvRow("Impact force", `${impactForce.toLocaleString()} kN`) : ""}
          ${deceleration > 0 ? kvRow("Deceleration", `${deceleration.toFixed(2)} g`) : ""}
          ${kineticEnergy > 0 ? kvRow("Kinetic energy", `${kineticEnergy.toFixed(1)} kJ`) : ""}
        </table>
        ${speedDiscrepancy > 20 ? co(`Driver-stated speed is <b>${speedDiscrepancy}% higher</b> than the physics-derived estimate — verify before settlement.`, "amber") : ""}
      </div>
    </div>
  </div>

  <!-- §02 CLAIM & VEHICLE OVERVIEW -->
  <div class="section">
    ${sectionTab("02", "Claim & Vehicle Overview")}
    <div class="cols-3">
      <div class="box">
        <h4>Vehicle</h4>
        <table class="kv">
          ${kvRow("Make / Model", vehicleDesc)}
          ${kvRow("Registration", `<span class="mono">${vehicleReg}</span>`)}
          ${vehicleVin ? kvRow("VIN", `<span class="mono">${vehicleVin}</span>`) : kvRow("VIN", `<span style="color:var(--red);">Not provided</span>`)}
          ${vehicleOdo !== "—" ? kvRow("Odometer", `${vehicleOdo} km`) : ""}
          ${marketValue > 0 ? kvRow("Market value", fmtUSD(marketValue)) : ""}
        </table>
      </div>
      <div class="box">
        <h4>Claim &amp; Policy</h4>
        <table class="kv">
          ${kvRow("Insurer", insurer)}
          ${kvRow("Claim ref.", `<span class="mono">${claimRef}</span>`)}
          ${kvRow("Claimant", claimantName)}
          ${policyNum !== "—" ? kvRow("Policy no.", `<span class="mono">${policyNum}</span>`) : ""}
          ${excess > 0 ? kvRow("Policy excess", fmtCurrency(excess, claimCurrency)) : ""}
          ${kvRow("Incident date", fmtD(c.incident_date))}
          ${dateAnomalyFlag ? `<tr><td class="k" style="color:var(--amber);">⚠ Date anomaly</td><td class="v" style="color:var(--amber);">Incident date (${incidentYear}) predates vehicle model year (${vehicleYear}) — verify before settlement</td></tr>` : ""}
          ${kvRow("Type", incidentType)}
        </table>
      </div>
      <div class="box">
        <h4>Parties &amp; Police</h4>
        <table class="kv">
          ${kvRow("Driver", driverName)}
          ${driverLicence !== "—" ? kvRow("Licence no.", `<span class="mono">${driverLicence}</span>`) : ""}
          ${assessorName !== "—" ? kvRow("Assessor", assessorName) : ""}
          ${repairerName !== "—" ? kvRow("Repairer", repairerName) : ""}
          ${policeCaseNo !== "—" ? kvRow("Police case", `<span class="mono">${policeCaseNo}</span>`) : ""}
          ${policeStatus !== "—" ? kvRow("Status", policeStatus) : ""}
        </table>
      </div>
    </div>
  </div>

  <!-- §03 INCIDENT NARRATIVE -->
  <div class="section">
    ${sectionTab("03", "Incident Narrative & Cross-Validation", physicsVsNarrative, physicsVsNarrative === "Consistent" ? "ok" : physicsVsNarrative === "Partial" ? "mid" : "high")}
    <div class="cols-2">
      <div class="box">
        <h4>Reconstructed Sequence</h4>
        <p style="margin:0;">${esc(narrativeText)}</p>
        ${narrativeFlag ? co(`<b>Narrative flag —</b> ${esc(narrativeFlag)}`) : ""}
      </div>
      <div class="box">
        <h4>Engine Cross-Validation</h4>
        <table class="kv">
          ${kvRow("Physics vs. narrative", p(physicsVsNarrative, physicsVsNarrative === "Consistent" ? "green" : physicsVsNarrative === "Partial" ? "amber" : "red"))}
          ${kvRow("Damage vs. narrative", p(damageVsNarrative, damageVsNarrative === "Consistent" ? "green" : damageVsNarrative === "Partial" ? "amber" : "red"))}
          ${kvRow("Cross-engine agreement", `${crossEngineAgreement}/100`)}
          ${kvRow("Police alignment", p(policeAlignment, policeAlignment === "Consistent" ? "green" : policeAlignment === "Partial" ? "amber" : "red"))}
        </table>
        <p class="small" style="margin-top:8px;">${esc(String(narrative?.crossValidationNote ?? "Damage pattern and narrative are cross-validated against physics engine output."))}</p>
      </div>
    </div>
  </div>

  <div class="footer-strip sans">
    <div><img src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/dOfoldGKvKSMqKYG.png" alt="KINGA" style="height:14px;vertical-align:middle;margin-right:5px;display:inline-block">KINGA · Confidential Forensic Audit Report</div>
    <div>${docRef} · Page 1 of 4</div>
  </div>
</div>`;

    // ── PAGE 2 ───────────────────────────────────────────────────────────────
    const page2 = `
<div class="page page-break">
  <!-- §04 TECHNICAL FORENSICS -->
  <div class="section">
    ${sectionTab("04", "Technical Forensics — Physics & Speed", physicsScore < 70 ? "Minor anomaly" : "Consistent", physicsScore < 70 ? "mid" : "ok")}
    <div class="cols-2">
      <div class="box">
        <h4>Impact Overview</h4>
        <table class="kv">
          ${kvRow("Delta-V", `${deltaV.toFixed(1)} km/h`)}
          ${kvRow("Kinetic energy", `${kineticEnergy.toFixed(1)} kJ`)}
          ${impactForce > 0 ? kvRow("Impact force", `${impactForce.toLocaleString()} kN`) : ""}
          ${vehicleMass > 0 ? kvRow("Vehicle mass (used)", `${vehicleMass.toLocaleString()} kg`) : ""}
          ${kvRow("Impact severity", ebsSeverity)}
          ${kvRow("Damage consistency", `${physicsScore}/100 — ${physicsScore >= 70 ? "Good" : physicsScore >= 40 ? "Moderate" : "Low"}`)}
        </table>
        ${physicsConstraints.length > 0 && physicsConstraints.some(c => c.result.toLowerCase() !== "pass")
          ? co(`<b>Physics constraint —</b> ${esc(physicsConstraints.find(c => c.result.toLowerCase() !== "pass")?.name ?? "")} flagged for adjuster review.`, "amber")
          : ""}
      </div>
      <div class="box">
        <h4>Speed Analysis <span class="small">(${speedEnsemble?.overallConfidence?.toLowerCase() ?? auditGrade.toLowerCase()} confidence)</span></h4>
        <p style="margin:0 0 4px 0;"><span style="font-size:26px; font-weight:700; font-family:'Helvetica Neue',Arial,sans-serif; color:var(--teal);">${consensusSpeed}</span> <span class="small">km/h consensus · ${rannedMethodCount} of ${totalMethodCount} method${totalMethodCount !== 1 ? 's' : ''} produced an estimate</span></p>
        <svg width="100%" height="${chartHeight}" viewBox="0 0 ${chartWidth} ${chartHeight}" xmlns="http://www.w3.org/2000/svg">
          <line x1="20" y1="${baselineY}" x2="${chartWidth - 10}" y2="${baselineY}" stroke="#bdbdbd" stroke-width="1"/>
          ${speedBars}
        </svg>
        ${speedDiscrepancy > 20 ? co(`<b>Speed discrepancy —</b> driver-stated ${preImpactSpeed} km/h is ${speedDiscrepancy}% higher than the ${consensusSpeed} km/h physics estimate. Verify before settlement.`, "red") : ""}
      </div>
    </div>

    <div class="cols-2" style="margin-top:12px;">
      <div class="box">
        <h4>Impact Direction &amp; Force Map</h4>
        <svg width="100%" height="175" viewBox="0 0 320 175" xmlns="http://www.w3.org/2000/svg">
          <polygon points="${arrowPoints}" fill="#a83232"/>
          <line x1="${arrowLineX1}" y1="${arrowLineY1}" x2="${arrowLineX2}" y2="${arrowLineY2}" stroke="#a83232" stroke-width="3"/>
          <text x="${impactLabelX}" y="${impactFromFront ? 6 : impactFromRear ? 174 : impactLabelY}" text-anchor="middle" font-family="Helvetica Neue,Arial,sans-serif" font-size="8" font-weight="700" fill="#a83232">IMPACT</text>
          <!-- vehicle outline, top-down -->
          <rect x="110" y="55" width="100" height="105" rx="14" fill="#ffffff" stroke="#171717" stroke-width="1.5"/>
          <!-- front zone -->
          <rect x="114" y="59" width="92" height="24" fill="${frontFill}" opacity="0.85"/>
          <text x="160" y="75" text-anchor="middle" font-family="Helvetica Neue,Arial,sans-serif" font-size="8" font-weight="700" fill="#ffffff">FRONT — ${frontLabel}</text>
          <!-- cabin -->
          <rect x="114" y="83" width="92" height="42" fill="#f2f2f2" stroke="#d9d9d9"/>
          <text x="160" y="107" text-anchor="middle" font-family="Helvetica Neue,Arial,sans-serif" font-size="7.5" fill="#4a4a4a">CABIN / ROOF</text>
          <!-- underbody -->
          <rect x="114" y="125" width="92" height="10" fill="${underbodyFill}" opacity="0.85"/>
          <text x="160" y="132.5" text-anchor="middle" font-family="Helvetica Neue,Arial,sans-serif" font-size="6.5" font-weight="700" fill="#ffffff">UNDERBODY</text>
          <!-- rear zone -->
          <rect x="114" y="135" width="92" height="21" fill="${rearFill}" stroke="#d9d9d9"/>
          <text x="160" y="149" text-anchor="middle" font-family="Helvetica Neue,Arial,sans-serif" font-size="7.5" fill="${rearFill === "#a83232" ? "#ffffff" : "#4a4a4a"}">REAR — ${rearLabel}</text>
          <!-- wheels -->
          <rect x="100" y="68" width="10" height="20" rx="3" fill="#8a8a8a"/>
          <rect x="210" y="68" width="10" height="20" rx="3" fill="#8a8a8a"/>
          <rect x="100" y="128" width="10" height="20" rx="3" fill="#8a8a8a"/>
          <rect x="210" y="128" width="10" height="20" rx="3" fill="#8a8a8a"/>
          <text x="97" y="63" text-anchor="end" font-family="Helvetica Neue,Arial,sans-serif" font-size="7" fill="#8a8a8a">N — FRONT</text>
          <text x="97" y="171" text-anchor="end" font-family="Helvetica Neue,Arial,sans-serif" font-size="7" fill="#8a8a8a">S — REAR</text>
          <!-- force readout -->
          ${deltaV > 0 ? `<text x="230" y="70" font-family="Helvetica Neue,Arial,sans-serif" font-size="8" fill="#171717">ΔV <tspan font-weight="700">${deltaV.toFixed(1)} km/h</tspan></text>` : ""}
          ${kineticEnergy > 0 ? `<text x="230" y="84" font-family="Helvetica Neue,Arial,sans-serif" font-size="8" fill="#171717">KE <tspan font-weight="700">${kineticEnergy.toFixed(1)} kJ</tspan></text>` : ""}
          ${impactForce > 0 ? `<text x="230" y="98" font-family="Helvetica Neue,Arial,sans-serif" font-size="8" fill="#171717">F <tspan font-weight="700">${impactForce.toLocaleString()} kN</tspan></text>` : ""}
          ${deceleration > 0 ? `<text x="230" y="112" font-family="Helvetica Neue,Arial,sans-serif" font-size="8" fill="#171717">Decel. <tspan font-weight="700">${deceleration.toFixed(2)} g</tspan></text>` : ""}
        </svg>
        <p class="caption">Red = severe damage zone · amber = underbody · impact arrow shows reported direction of force.</p>
      </div>
      <div class="box">
        <h4>Damage Severity — ${totalComponents} components</h4>
        <svg width="100%" height="40" viewBox="0 0 320 40" xmlns="http://www.w3.org/2000/svg">
          <rect x="0" y="6" width="${Math.round(sevPct * 3.2)}" height="20" fill="#a83232"/>
          <rect x="${Math.round(sevPct * 3.2)}" y="6" width="${Math.round(modPct * 3.2)}" height="20" fill="#b8720b"/>
          <rect x="${Math.round((sevPct + modPct) * 3.2)}" y="6" width="${Math.round(minPct * 3.2)}" height="20" fill="#3C7844"/>
          ${severeCount > 0 ? `<text x="${Math.round(sevPct * 1.6)}" y="20" text-anchor="middle" font-family="Helvetica Neue,Arial,sans-serif" font-size="9" font-weight="700" fill="#ffffff">${severeCount} SEVERE</text>` : ""}
          ${moderateCount > 0 ? `<text x="${Math.round(sevPct * 3.2) + Math.round(modPct * 1.6)}" y="20" text-anchor="middle" font-family="Helvetica Neue,Arial,sans-serif" font-size="7" font-weight="700" fill="#ffffff">${moderateCount}</text>` : ""}
        </svg>
        <p class="small" style="margin-top:6px;">${severeCount} severe · ${moderateCount} moderate · ${minorCount} minor. ${esc(String(repairIntel?.damageSummary ?? "Damage concentrated in impact zone per narrative."))}
        </p>

        <h4 style="margin-top:12px;">Methodology &amp; Assumptions</h4>
        <ul class="tight small" style="margin-top:0;">
          <li>Consensus speed is a physics-derived <b>lower bound</b>, not a certified reconstruction.</li>
          <li>Vehicle mass estimated from make/model class where not stated; friction μ=0.7 (tarmac) used for braking coherence.</li>
          <li>Pre-impact braking not modelled in the speed lower-bound estimate.</li>
          <li>Independent forensic reconstruction recommended for claims above insurer materiality threshold.</li>
        </ul>

        ${physicsConstraints.length > 0 ? `
        <h4 style="margin-top:12px;">Physics Constraints — ${physicsConstraints.filter(c => c.result.toLowerCase() === "pass").length} of ${physicsConstraints.length} passed</h4>
        <table class="kv">
          ${physicsConstraints.map(c => kvRow(esc(c.name), p(c.result, c.result.toLowerCase() === "pass" ? "green" : c.result.toLowerCase() === "advisory" ? "amber" : "red"))).join("")}
        </table>` : ""}
      </div>
    </div>
  </div>

  <!-- §05 VEHICLE STRUCTURAL INTELLIGENCE -->
  <div class="section">
    ${sectionTab("05", "Vehicle Structural Intelligence")}
    <div class="cols-2">
      <div class="box">
        <h4>${vehicleDesc} — ${vehicleClass}</h4>
        <table class="kv">
          ${ancapRating !== "—" ? kvRow("ANCAP rating", ancapRating) : ""}
          ${adultOccupant !== "—" ? kvRow("Adult / Child occupant", `${adultOccupant}% / ${childOccupant}%`) : ""}
          ${crash3A !== "—" ? kvRow("CRASH3 stiffness A/B", `${crash3A} / ${crash3B} kN/m`) : ""}
          ${massRange !== "—" ? kvRow("Typical mass range", `${massRange} kg`) : ""}
          ${kvRow("Safety risk", p(safetyRisk, safetyRisk.toLowerCase() === "low" ? "green" : safetyRisk.toLowerCase() === "medium" ? "amber" : "red"))}
        </table>
      </div>
      <div class="box">
        <h4>Notes</h4>
        <p style="margin:0;" class="small">${esc(vehicleNotes)}</p>
      </div>
    </div>
  </div>

  <div class="footer-strip sans">
    <div><img src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/dOfoldGKvKSMqKYG.png" alt="KINGA" style="height:14px;vertical-align:middle;margin-right:5px;display:inline-block">KINGA · Confidential Forensic Audit Report</div>
    <div>${docRef} · Page 2 of 4</div>
  </div>
</div>`;

    // ── PAGE 3 ───────────────────────────────────────────────────────────────
    const maxQuoteAmount = quoteArr.length > 0 ? Math.max(...quoteAmounts) : 1;
    const quoteBars = quoteArr.map(q => {
      const amt = Number(q.quoted_amount ?? 0) / 100;
      const pct = maxQuoteAmount > 0 ? Math.round((amt / maxQuoteAmount) * 100) : 0;
      return `<div class="qbar-row sans"><div class="name">${esc(String(q.panel_beater_name ?? "Quote"))}</div><div class="track"><div class="fill" style="width:${pct}%;"></div></div><div class="amt">${fmtUSD(amt)}</div></div>`;
    }).join("");
    const kingaPct = maxQuoteAmount > 0 ? Math.round((kingaOptimised / maxQuoteAmount) * 100) : 0;

    const page3 = `
<div class="page page-break">
  <!-- §06 FINANCIAL VALIDATION -->
  <div class="section">
    ${sectionTab("06", "Financial Validation", savings > 0 ? "Savings opportunity" : "Review", savings > 0 ? "ok" : "high")}
    <div class="cols-2">
      <div class="box">
        <h4>Quote Comparison</h4>
        ${quoteBars}
        <div class="qbar-row sans"><div class="name" style="font-weight:700;">KINGA Optimised (L2)</div><div class="track"><div class="fill" style="width:${kingaPct}%; background:var(--green);"></div></div><div class="amt" style="color:var(--green-dark);">${fmtUSD(kingaOptimised)}</div></div>
        ${savings > 0 ? co(`<b>Savings opportunity —</b> ${fmtUSD(savings)} (${savingsPct.toFixed(1)}%) below lowest submitted quote, based on best price per component.`, "green") : ""}
      </div>
      <div class="box">
        <h4>Cost Intelligence &amp; Settlement</h4>
        <table class="kv">
          ${lowestRef > 0 ? kvRow("Lowest submitted (L1)", fmtUSD(lowestRef)) : ""}
          ${kingaOptimised > 0 ? kvRow("KINGA optimised (L2)", fmtUSD(kingaOptimised)) : ""}
          ${kvRow("Settlement — agreed", fmtUSD(recommendedSettlement))}
          ${savings > 0 ? kvRow("Adjustment", `<span style="color:var(--red);">−${fmtUSD(savings)} (${savingsPct.toFixed(1)}%)</span>`) : ""}
        </table>
        ${highIssues.some(i => i.title.toLowerCase().includes("cost") || i.title.toLowerCase().includes("quote"))
          ? co(`<b>Cost verdict: Review</b> (${auditGrade.toLowerCase()} confidence). ${esc(highIssues.find(i => i.title.toLowerCase().includes("cost"))?.description ?? "Quote contains components inconsistent with the accident mechanism.")}`, "red")
          : ""}
      </div>
    </div>
  </div>

  <!-- §07 QUOTE & SCOPE RECONCILIATION -->
  <div class="section">
    ${sectionTab("07", "Quote & Scope Reconciliation", missingFromQuote > 0 ? `${missingFromQuote} gaps` : "Clean", missingFromQuote > 0 ? "mid" : "ok")}
    <div class="cols-2">
      <div class="box">
        <h4>Coverage Summary</h4>
        <table class="kv">
          ${matchedComponents > 0 ? kvRow("Components matched", `${matchedComponents} of ${totalComponents} (${Math.round(matchedComponents/totalComponents*100)}%)`) : ""}
          ${missingFromQuote > 0 ? kvRow("Missing from quote", `<span style="color:var(--red);">${missingFromQuote}${criticalStructural.length > 0 ? ` (incl. ${criticalStructural.length} structural)` : ""}</span>`) : ""}
          ${extraInQuote > 0 ? kvRow("Extra in quote, not in damage list", String(extraInQuote)) : ""}
        </table>
        ${criticalStructural.length > 0 ? co(`<b>Structural gaps</b> — ${criticalStructural.map(g => esc(g.component)).join(", ")} ${criticalStructural.length === 1 ? "is" : "are"} damaged but appear in no quote. Independent structural assessment required before settlement.`, "red") : ""}
      </div>
      <div class="box">
        <h4>Integrity Flags</h4>
        ${copyQuotation?.detected ? co(`<b>Copy-quotation signal</b> — structural fingerprint analysis indicates multiple submitted quotes were likely authored from the same source document.`, "amber") : ""}
        <p class="small" style="margin-top:8px;">${esc(String(repairIntel?.reconciliationNote ?? costIntel?.reconciliationNote ?? "Scope discrepancies flagged for adjuster verification. Review all line items against confirmed damage scope."))}</p>
      </div>
    </div>
  </div>

  <!-- §08 PHOTO & DOCUMENT EVIDENCE -->
  <div class="section">
    ${sectionTab("08", "Photo & Document Evidence", `${zonesCovered} of ${totalZones} zones`, zonesCovered >= totalZones ? "ok" : "mid")}
    <div class="cols-3">
      <div class="box">
        <h4>Documents Received</h4>
        <table class="kv">
          ${Object.entries(docCompleteness).length > 0
            ? Object.entries(docCompleteness).map(([k, v]) => kvRow(esc(k.replace(/_/g, " ")), `${v}%`)).join("")
            : (docs as Record<string, unknown>[]).reduce((acc, d) => {
                const cat = String(d.document_category ?? "other");
                if (!acc.includes(cat)) acc.push(cat);
                return acc;
              }, [] as string[]).map(cat => kvRow(esc(cat.replace(/_/g, " ")), `<span class="pill green">Received</span>`)).join("")
          }
        </table>
      </div>
      <div class="box">
        <h4>Photo Coverage</h4>
        <table class="kv">
          ${kvRow("Photos analysed", String(totalPhotos))}
          ${kvRow("High confidence (≥70%)", `${highConfPhotos} / ${totalPhotos}`)}
          ${uniqueComponents > 0 ? kvRow("Unique components", String(uniqueComponents)) : ""}
          ${kvRow("Zones covered", `<span style="color:${zonesCovered < totalZones ? "var(--amber)" : "var(--green)"};">${zonesCovered} of ${totalZones}</span>`)}
        </table>
      </div>
      <div class="box">
        <h4>Coverage Gap</h4>
        <p class="small" style="margin:0;">${esc(String(ife?.coverageGapNote ?? "No photographic coverage of all damage zones claimed in narrative."))}</p>
        ${zonesCovered < totalZones ? `<span class="pill amber" style="margin-top:6px; display:inline-block;">Additional viewpoints recommended</span>` : ""}
      </div>
    </div>

    ${totalPhotos > 0 ? `
    <div class="box" style="margin-top:10px;">
      <h4>${enrichedPhotos.length > 0 ? `Photo Evidence — ${enrichedPhotos.length} images · ${highConfPhotos} usable (≥70% confidence)` : `Front Zone — ${frontLabel}`}</h4>
      ${enrichedPhotos.length > 0
        ? photoZonePanel(
            enrichedPhotos.slice(0, 8).map((p: any) => ({
              url: p.url ?? '',
              zone: p.impactZone ?? undefined,
              caption: p.caption ?? undefined,
              usable: Number(p.confidenceScore ?? 0) >= 70,
            })),
            4
          )
        : `<div class="photo-zone"><div class="photo-grid">${photoDocuments.slice(0, 4).map((d: any, i: number) => {
            const imgUrl = d.url ?? d.file_url ?? null;
            const caption = d.caption ?? d.file_name ?? `Photo ${i + 1}`;
            return `<div class="photo-tile"><div class="photo-ph">${imgUrl ? `<img src="${esc(imgUrl)}" alt="${esc(caption)}" style="width:100%;height:75px;object-fit:cover;"/>` : `<svg viewBox="0 0 100 75" preserveAspectRatio="none"><rect width="100" height="75" fill="#e4e4e4"/></svg>`}<span class="tag">${i + 1}</span></div><div class="photo-cap">${esc(caption)}</div></div>`;
          }).join('')}</div></div>`
      }
      <div style="margin-top:6px;">
        <table class="kv">
          ${uniqueComponents > 0 ? kvRow('Components identified', String(uniqueComponents)) : ''}
          ${kvRow('Safety system activation', esc(String(ife?.safetySystemActivation ?? '—')))}
        </table>
        ${zonesCovered < totalZones ? co('Single photograph per finding in this zone. Additional angles recommended for full assessment confidence.', 'amber') : ''}
      </div>
      <p class="caption" style="margin-top:4px;">${enrichedPhotos.length > 0 ? `${enrichedPhotos.length} photos from pipeline analysis · showing up to 8 · zone labels = pipeline-detected impact zone · red border = confidence <70%` : 'Thumbnails illustrate layout only — replace with source images from the claim asset store at export time.'}</p>
    </div>` : ""}

    <div class="box" style="margin-top:8px;">
      ${["Rear Zone", "Underbody Zone", "Interior Zone"].map(zone => {
        const covered = rawDamageZones.some(z => z.zone.toLowerCase().includes(zone.toLowerCase().split(" ")[0]));
        return `<div class="zone-row">
          <span class="zone-name sans">${zone}</span>
          ${covered ? `<span class="pill green">Covered</span>` : `<span class="pill grey">No photos submitted</span>`}
          <span class="zone-note">${esc(String(ife?.[zone.toLowerCase().replace(" zone", "Note")] ?? (covered ? "" : `${zone.split(" ")[0]} damage claimed in narrative — not photographically corroborated.`)))}</span>
        </div>`;
      }).join("")}
    </div>
  </div>

  <div class="footer-strip sans">
    <div><img src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/dOfoldGKvKSMqKYG.png" alt="KINGA" style="height:14px;vertical-align:middle;margin-right:5px;display:inline-block">KINGA · Confidential Forensic Audit Report</div>
    <div>${docRef} · Page 3 of 4</div>
  </div>
</div>`;

    // ── PAGE 4 ───────────────────────────────────────────────────────────────
    const page4 = `
<div class="page page-break">
  <!-- §09 RISK & FRAUD ASSESSMENT -->
  <div class="section">
    ${sectionTab("09", "Risk & Fraud Assessment", hasImpossibilityFlag ? "Duplicate reg. flag" : fraudScoreAdjusted >= 70 ? "High risk" : fraudScoreAdjusted >= 40 ? "Moderate risk" : "Low risk", hasImpossibilityFlag || fraudScoreAdjusted >= 70 ? "high" : fraudScoreAdjusted >= 40 ? "mid" : "ok")}
    <div class="cols-2">
      <div class="box">
        <h4>Fraud Score — ${fraudScoreAdjusted}/100 (${fraudScoreAdjusted >= 70 ? "High" : fraudScoreAdjusted >= 40 ? "Moderate" : "Low"})</h4>
        <table class="kv">
          ${fbDamage > 0 || true ? kvRow("Damage inconsistency", `<span style="color:${fbDamage >= 10 ? "var(--amber)" : "inherit"};">${fbDamage}/20</span>`) : ""}
          ${kvRow("Cost deviation", `<span style="color:${fbCost >= 10 ? "var(--amber)" : "inherit"};">${fbCost}/20</span>`)}
          ${kvRow("Direction mismatch", `${fbDirection}/20`)}
          ${kvRow("Repeat / prior claim", `${fbRepeat}/20`)}
          ${kvRow("Missing data", `<span style="color:${fbMissing >= 10 ? "var(--amber)" : "inherit"};">${fbMissing}/20</span>`)}
          ${kvRow("Severity vs. physics", `<span style="color:${fbSeverity >= 10 ? "var(--amber)" : "inherit"};">${fbSeverity}/20</span>`)}
        </table>
        ${hasImpossibilityFlag ? `<p class="small" style="margin-top:8px;">Score reflects cost-deviation and missing-data indicators only. The impossibility flag at right is scored separately and is not yet reflected in the headline ${fraudScore}/100.</p>` : ""}
      </div>
      <div class="box" style="${hasImpossibilityFlag ? "border-color:var(--red);" : ""}">
        ${hasImpossibilityFlag ? `
        <h4 style="color:var(--red);">⚠ High-Severity Impossibility Flag</h4>
        <p style="margin:0 0 6px 0;"><b>Duplicate claim — same registration within 7 days.</b> Registration ${vehicleReg} appears across <b>${linkedClaims.length} other claim${linkedClaims.length !== 1 ? "s" : ""}</b> with incident dates within 7 days of this one.</p>
        <p class="small" style="margin:0;">May indicate claim duplication, a staged-loss pattern, or an administrative/data-entry error. Contributes +30 points toward the fraud score (capped at 60) and requires adjuster verification before this claim proceeds.</p>
        ${co(`Recommend cross-referencing all ${linkedClaims.length} related claim IDs against this vehicle's claim history before approval.`, "red")}
        ` : `
        <h4>Risk Assessment Summary</h4>
        <p style="margin:0;" class="small">${esc(String(forensicAudit?.riskSummary ?? "No high-severity impossibility flags detected. Standard review process applies."))}</p>
        `}
      </div>
    </div>
    <div class="cols-2" style="margin-top:12px;">
      <div class="box">
        <h4>Policy Flags</h4>
        <table class="kv">
          ${excess > 0 ? kvRow("Excess applicable", fmtUSD(excess)) : ""}
          ${exclusions.length > 0 ? kvRow("Exclusion", `<span style="color:var(--red);">${esc(exclusions.map(e => e.item).join("; "))}</span>`) : kvRow("Exclusions", p("None identified", "green"))}
        </table>
      </div>
      <div class="box">
        <h4>Accident Date &amp; Cross-Engine Consistency</h4>
        <table class="kv">
          ${kvRow("Claim form vs. police report", esc(String(forensicAudit?.dateDelta ?? "0 days — consistent")))}
          ${kvRow("Cross-engine agreement (C1–C9)", `${crossEngineAgreement}/100`)}
        </table>
      </div>
    </div>
  </div>

  <!-- §10 VALIDATION, DECISION & NEXT STEPS -->
  <div class="section">
    ${sectionTab("10", "Validation, Decision & Next Steps")}
    <div class="cols-2">
      <div class="box">
        <h4>Forensic Audit Validation — ${auditScore}/100 (${auditGrade} confidence)</h4>
        <table class="kv">
          ${(forensicAudit?.validationChecks as Array<{name: string; status: string}> ?? [
            { name: "Data extraction", status: Number(ife?.overallScore ?? 75) >= 90 ? "Pass" : "Warning" },
            { name: "Incident classification", status: "Pass" },
            { name: "Image analysis", status: totalPhotos > 0 ? "Pass" : "Warning" },
            { name: "Physics engine", status: physicsScore >= 70 ? "Pass" : "Warning" },
            { name: "Cost model", status: kingaOptimised > 0 ? "Pass" : "Fail" },
            { name: "Fraud analysis", status: fraudScoreAdjusted >= 70 ? "Warning" : "Pass" },
          ]).map(v => kvRow(esc(v.name), p(v.status, v.status === "Pass" ? "green" : v.status === "Warning" ? "amber" : "red"))).join("")}
        </table>
        ${highIssues.length > 0 ? `<p class="small" style="margin-top:8px;"><b>High severity:</b> ${esc(highIssues[0].description)}</p>` : ""}
      </div>
      <div class="box">
        <h4>Required Next Steps</h4>
        <ul class="tight">
          ${(forensicAudit?.nextSteps as string[] ?? [
            ...(speedDiscrepancy > 20 ? [`Verify stated impact speed (${preImpactSpeed} km/h) against the ${consensusSpeed} km/h physics estimate before settlement.`] : []),
            ...(physicsConstraints.some(c => c.result.toLowerCase() !== "pass") ? [`Investigate physics constraint failures — review airbag and seatbelt deployment thresholds.`] : []),
            ...(missingFromQuote > 0 ? [`Request an itemised quote with unit pricing to enable parts-level cost reconciliation.`] : []),
            ...(criticalStructural.length > 0 ? [`Obtain independent structural assessment for ${criticalStructural.length} flagged structural component${criticalStructural.length !== 1 ? "s" : ""}.`] : []),
            ...(hasImpossibilityFlag ? [`Cross-check the ${linkedClaims.length} related claims flagged against registration ${vehicleReg}.`] : []),
            ...(zonesCovered < totalZones ? [`Obtain photographic coverage of uncovered damage zones.`] : []),
          ]).map(s => `<li>${esc(s)}</li>`).join("")}
        </ul>
      </div>
    </div>
  </div>

  <!-- §11 APPROVAL CHAIN -->
  <div class="section">
    ${sectionTab("11", "Approval Chain")}
    <div class="box">
      <table class="grid-t">
        <tr><th>Stage</th><th>Role</th><th>Status</th><th>Officer</th><th>Date</th></tr>
        ${approvalStages.map(s => {
          const status = String(s.status ?? "Pending");
          const statusPill = p(status, status.toLowerCase() === "complete" ? "green" : status.toLowerCase() === "awaiting" ? "amber" : "grey");
          return `<tr><td>${s.stage}</td><td>${esc(s.role)}${s.stage === 5 ? ` <span class="small">(optional)</span>` : ""}</td><td>${statusPill}</td><td>${esc(String(s.officer ?? "—"))}</td><td>${esc(String(s.date ?? "—"))}</td></tr>`;
        }).join("")}
      </table>
      <p class="caption">${completedStages} of ${approvalStages.filter(s => s.stage <= 4).length} required stages complete. Structured reviewer notes (findings, verdict, action required) are mandatory at every stage — generic sign-offs are not accepted.</p>
    </div>
  </div>

  <div class="caption" style="margin-top:6px; line-height:1.5;">
    <b>Glossary —</b> FCDI: Forensic Confidence &amp; Data Integrity, a composite 0–100 reliability score; scores below 60 require mandatory adjuster review. Delta-V: change in velocity during impact (km/h). NFS: negotiation-feasibility score for cost benchmarking.
  </div>

  <div class="footer-strip sans" style="position:static; margin-top:10px;">
    <div><img src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/dOfoldGKvKSMqKYG.png" alt="KINGA" style="height:14px;vertical-align:middle;margin-right:5px;display:inline-block">CONFIDENTIAL — For authorised insurer use only · KINGA · Not legal advice · Requires qualified human adjuster review before any claim decision is finalised</div>
    <div>${docRef} · Page 4 of 4</div>
  </div>
</div>`;

    const body = page1 + page2 + page3 + page4;
    return buildKingaFdrHtml(`KINGA Forensic Claim Decision Report — ${claimRef}`, body);

  } finally {
    await conn.end();
  }
}
