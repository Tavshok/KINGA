/**
 * server/recovery/recoveryTrigger.ts
 *
 * SUBROGATION RECOVERY TRIGGER
 *
 * Fires automatically when a claim transitions to 'completed' or 'closed'.
 * Responsibilities:
 *   1. Compute the Recovery Potential Score (RPS) for the claim
 *   2. If RPS >= 30, create a recovery_case record
 *   3. Set the recovery deadline (3 years from incident date per applicable limitation period)
 *   4. Skip if a recovery case already exists for this claim
 *
 * The trigger is fire-and-forget — it logs errors but never throws,
 * so a recovery scoring failure cannot block the claims workflow.
 */

import { getDb } from "../db";
import {
  claims,
  aiAssessments,
  recoveryCases,
  thirdPartyVehicles,
} from "../../drizzle/schema";
import { eq, and, or, desc } from "drizzle-orm";
import type { CausalVerdict } from "../pipeline-v2/stage-7b-causal-reasoning";

// ─────────────────────────────────────────────────────────────────────────────
// Recovery Potential Score (RPS) — 0 to 100
// ─────────────────────────────────────────────────────────────────────────────
// Weights:
//   Liability posture (wrongedParty = 'insured')  30 pts
//   Causal verdict confidence (plausibilityScore) 20 pts (scaled)
//   Third-party data completeness                 20 pts
//   Police report present                         15 pts
//   Fraud score inverse (low fraud = recoverable) 10 pts
//   Quantum (approved amount > 0)                  5 pts
const RPS_THRESHOLD = 30; // Minimum score to create a recovery case

interface RPSInput {
  wrongedParty: CausalVerdict["wrongedParty"] | null;
  thirdPartyLiabilityPct: number;
  plausibilityScore: number | null;
  hasThirdPartyName: boolean;
  hasThirdPartyRegistration: boolean;
  hasThirdPartyInsurer: boolean;
  hasThirdPartyContact: boolean;
  hasPoliceReport: boolean;
  fraudScore: number | null;
  approvedAmount: number | null;
}

export function computeRPS(input: RPSInput): number {
  let score = 0;

  // 1. Liability posture (30 pts)
  if (input.wrongedParty === "insured") {
    score += 30;
  } else if (input.wrongedParty === "shared") {
    // Partial recovery possible — scale by third-party liability percentage
    score += Math.round(30 * (input.thirdPartyLiabilityPct / 100));
  }
  // 'third_party' or 'unknown' = 0 pts (no recovery basis)

  // 2. Causal verdict confidence (20 pts, scaled from plausibilityScore 0–100)
  if (input.plausibilityScore !== null && input.plausibilityScore >= 0) {
    score += Math.round(20 * (input.plausibilityScore / 100));
  }

  // 3. Third-party data completeness (20 pts — 5 pts each for 4 fields)
  if (input.hasThirdPartyName) score += 5;
  if (input.hasThirdPartyRegistration) score += 5;
  if (input.hasThirdPartyInsurer) score += 5;
  if (input.hasThirdPartyContact) score += 5;

  // 4. Police report present (15 pts)
  if (input.hasPoliceReport) score += 15;

  // 5. Fraud score inverse (10 pts — low fraud = more recoverable)
  // A fraudulent claim should not be pursued for recovery
  if (input.fraudScore !== null) {
    const fraudPenalty = Math.round(10 * (input.fraudScore / 100));
    score += (10 - fraudPenalty);
  } else {
    score += 5; // Unknown fraud = half credit
  }

  // 6. Quantum (5 pts — only if there is an approved amount to recover)
  if (input.approvedAmount && input.approvedAmount > 0) score += 5;

  return Math.min(100, Math.max(0, score));
}

// ─────────────────────────────────────────────────────────────────────────────
// Recovery Deadline Calculation
// ─────────────────────────────────────────────────────────────────────────────
// South African limitation period (3 years from date of loss): 3 years from date of loss
function computeRecoveryDeadline(incidentDate: string | null | undefined): string | null {
  if (!incidentDate) return null;
  try {
    const date = new Date(incidentDate);
    if (isNaN(date.getTime())) return null;
    date.setFullYear(date.getFullYear() + 3);
    return date.toISOString().split("T")[0]; // YYYY-MM-DD
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Trigger
// ─────────────────────────────────────────────────────────────────────────────
export async function triggerRecoveryEvaluation(claimId: number): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.error("[RecoveryTrigger] Database not available");
    return;
  }

  try {
    // 1. Check if a recovery case already exists for this claim
    const [existing] = await db
      .select({ id: recoveryCases.id })
      .from(recoveryCases)
      .where(eq(recoveryCases.claimId, claimId))
      .limit(1);

    if (existing) {
      console.log(`[RecoveryTrigger] Recovery case already exists for claim ${claimId} — skipping`);
      return;
    }

    // 2. Load the claim
    const [claim] = await db
      .select()
      .from(claims)
      .where(eq(claims.id, claimId))
      .limit(1);

    if (!claim) {
      console.error(`[RecoveryTrigger] Claim ${claimId} not found`);
      return;
    }

    // 3. Load the latest AI assessment for this claim
    const [assessment] = await db
      .select()
      .from(aiAssessments)
      .where(eq(aiAssessments.claimId, claimId))
      .orderBy(aiAssessments.id)
      .limit(1);

    // 4. Parse the causal verdict for wrongedParty and plausibilityScore
    let wrongedParty: CausalVerdict["wrongedParty"] = "unknown";
    let thirdPartyLiabilityPct = 0;
    let plausibilityScore: number | null = null;

    if (assessment?.causalVerdictJson) {
      try {
        const verdict: CausalVerdict = JSON.parse(assessment.causalVerdictJson);
        wrongedParty = verdict.wrongedParty ?? "unknown";
        thirdPartyLiabilityPct = verdict.thirdPartyLiabilityPct ?? 0;
        plausibilityScore = verdict.plausibilityScore ?? null;
      } catch {
        console.warn(`[RecoveryTrigger] Could not parse causalVerdictJson for claim ${claimId}`);
      }
    }

    // 5. Load third-party vehicle data for completeness scoring
    const [tpVehicle] = await db
      .select()
      .from(thirdPartyVehicles)
      .where(eq(thirdPartyVehicles.claimId, claimId))
      .limit(1);

    // 6. Compute RPS
    const rpsInput: RPSInput = {
      wrongedParty,
      thirdPartyLiabilityPct,
      plausibilityScore,
      hasThirdPartyName: !!(claim.thirdPartyName || tpVehicle?.ownerName || tpVehicle?.driverName),
      hasThirdPartyRegistration: !!(claim.thirdPartyRegistration || tpVehicle?.registration),
      hasThirdPartyInsurer: !!(claim.thirdPartyInsurer || tpVehicle?.insuranceCompany),
      hasThirdPartyContact: !!(tpVehicle?.ownerContact || tpVehicle?.ownerAddress),
      hasPoliceReport: !!(claim.policeReportNumber),
      fraudScore: assessment?.fraudScore ?? null,
      approvedAmount: claim.finalApprovedAmount ? Number(claim.finalApprovedAmount) : null,
    };

    const rps = computeRPS(rpsInput);

    console.log(`[RecoveryTrigger] Claim ${claimId} RPS: ${rps} (wrongedParty: ${wrongedParty}, threshold: ${RPS_THRESHOLD})`);

    // 7a. Repeat offender detection
    const thirdPartyName = claim.thirdPartyName ?? tpVehicle?.ownerName ?? null;
    const thirdPartyReg = claim.thirdPartyRegistration ?? tpVehicle?.registration ?? null;
    let isRepeatOffender = false;
    let priorCaseCount = 0;
    let priorCaseIds: number[] = [];
    if (thirdPartyName || thirdPartyReg) {
      const matchConditions: any[] = [];
      if (thirdPartyReg) matchConditions.push(eq(recoveryCases.thirdPartyRegistration, thirdPartyReg));
      if (thirdPartyName) matchConditions.push(eq(recoveryCases.thirdPartyName, thirdPartyName));
      const priorCases = await db
        .select({ id: recoveryCases.id, claimId: recoveryCases.claimId })
        .from(recoveryCases)
        .where(and(
          eq(recoveryCases.tenantId, claim.tenantId ?? ""),
          or(...matchConditions)
        ))
        .orderBy(desc(recoveryCases.id))
        .limit(20);
      const filtered = priorCases.filter(p => p.claimId !== claimId);
      if (filtered.length > 0) {
        isRepeatOffender = true;
        priorCaseCount = filtered.length;
        priorCaseIds = filtered.map(p => p.id);
        console.log(`[RecoveryTrigger] Repeat offender detected for claim ${claimId}: ${priorCaseCount} prior case(s)`);
      }
    }

    // 7. Only create a case if RPS meets the threshold
    if (rps < RPS_THRESHOLD) {
      console.log(`[RecoveryTrigger] RPS ${rps} below threshold ${RPS_THRESHOLD} — archiving without case`);
      // Still create an archived record so recovery officers can see it was evaluated
      await db.insert(recoveryCases).values({
        tenantId: claim.tenantId ?? "",
        claimId,
        recoveryPotentialScore: rps,
        wrongedParty,
        thirdPartyLiabilityPct,
        thirdPartyName: claim.thirdPartyName ?? tpVehicle?.ownerName ?? null,
        thirdPartyRegistration: claim.thirdPartyRegistration ?? tpVehicle?.registration ?? null,
        thirdPartyInsurer: claim.thirdPartyInsurer ?? tpVehicle?.insuranceCompany ?? null,
        thirdPartyPolicyNumber: tpVehicle?.policyNumber ?? null,
        thirdPartyContactDetails: tpVehicle?.ownerContact ? `Tel: ${tpVehicle.ownerContact}${tpVehicle.ownerAddress ? `, Address: ${tpVehicle.ownerAddress}` : ""}` : null,
        approvedSettlementAmount: claim.finalApprovedAmount ? Math.round(Number(claim.finalApprovedAmount)) : null,
        currencyCode: claim.currencyCode ?? "ZAR",
        status: "archived",
        recoveryDeadline: computeRecoveryDeadline(claim.incidentDate),
        isRepeatOffender,
        priorCaseCount,
        priorCaseIds: priorCaseIds.length > 0 ? JSON.stringify(priorCaseIds) : null,
        createdAt: new Date().toISOString().replace("T", " ").substring(0, 19),
      });
      return;
    }

    // 8. Determine initial status based on whether liability is under investigation
    // If the claim has an active police investigation or liability is 'unknown', hold in investigation
    const hasActiveInvestigation = claim.policeReportNumber && wrongedParty === "unknown";
    const initialStatus = hasActiveInvestigation ? "under_investigation" : "open";
    const investigationReason = hasActiveInvestigation
      ? "Police investigation ongoing — liability determination pending. Recovery officer to review when investigation concludes."
      : null;

    // 9. Create the recovery case
    await db.insert(recoveryCases).values({
      tenantId: claim.tenantId ?? "",
      claimId,
      recoveryPotentialScore: rps,
      wrongedParty,
      thirdPartyLiabilityPct,
      thirdPartyName: claim.thirdPartyName ?? tpVehicle?.ownerName ?? null,
      thirdPartyRegistration: claim.thirdPartyRegistration ?? tpVehicle?.registration ?? null,
      thirdPartyInsurer: claim.thirdPartyInsurer ?? tpVehicle?.insuranceCompany ?? null,
      thirdPartyPolicyNumber: tpVehicle?.policyNumber ?? null,
      thirdPartyContactDetails: tpVehicle?.ownerContact ? `Tel: ${tpVehicle.ownerContact}${tpVehicle.ownerAddress ? `, Address: ${tpVehicle.ownerAddress}` : ""}` : null,
      approvedSettlementAmount: claim.finalApprovedAmount ? Math.round(Number(claim.finalApprovedAmount)) : null,
      currencyCode: claim.currencyCode ?? "ZAR",
      status: initialStatus as any,
      investigationReason,
      recoveryDeadline: computeRecoveryDeadline(claim.incidentDate),
      isRepeatOffender,
      priorCaseCount,
      priorCaseIds: priorCaseIds.length > 0 ? JSON.stringify(priorCaseIds) : null,
      createdAt: new Date().toISOString().replace("T", " ").substring(0, 19),
    });

    console.log(`[RecoveryTrigger] Recovery case created for claim ${claimId} — status: ${initialStatus}, RPS: ${rps}${isRepeatOffender ? ` [REPEAT OFFENDER: ${priorCaseCount} prior case(s)]` : ""}`);

  } catch (err) {
    // Never throw — recovery trigger failure must not block the workflow
    console.error(`[RecoveryTrigger] Error evaluating claim ${claimId}:`, err);
  }
}
