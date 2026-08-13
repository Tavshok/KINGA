export type ValuationEvidenceState = "market_supported" | "provisional" | "review_required";

export type ReliabilityComparable = {
  sourceType: "market_valuation_record" | "historical_claim";
  sourceReference: string;
  observedValueCents: number;
  observedAt: Date | string | null;
  vehicleYear: number | null;
  vehicleMatch: Record<string, unknown>;
  adjustment: Record<string, unknown> | null;
  limitation: string | null;
};

export type ValuationReliabilityEvidence = {
  clientEvidenceState: ValuationEvidenceState;
  clientMessage: string;
  professionalEvidence: {
    sourceCoverage: { comparableCount: number; reportedSourceCount: number | null; sourceTypes: string[] };
    vehicleMatch: { make: string; model: string; year: number; mileageProvided: boolean; conditionProvided: boolean };
    recency: { asOf: string; staleSourceCount: number; thresholdDays: number };
    adjustments: Array<{ type: string; amountCents: number; basis: string }>;
    limitations: string[];
    requiresHumanReview: boolean;
  };
  ledger: ReliabilityComparable[];
};

const RECENCY_THRESHOLD_DAYS = 90;

function ageInDays(value: Date | string | null, asOf: Date): number | null {
  if (!value) return null;
  const observedAt = new Date(value).getTime();
  if (Number.isNaN(observedAt)) return null;
  return Math.max(0, Math.floor((asOf.getTime() - observedAt) / 86_400_000));
}

export function buildValuationReliabilityEvidence(input: {
  vehicle: { make: string; model: string; year: number; mileage?: number; condition?: string };
  asOf: Date;
  source: "market_data" | "historical_claims" | "fallback";
  reportedSourceCount?: number | null;
  ledger: ReliabilityComparable[];
  adjustments: Array<{ type: string; amountCents: number; basis: string }>;
}): ValuationReliabilityEvidence {
  const staleSourceCount = input.ledger.filter((entry) => {
    const age = ageInDays(entry.observedAt, input.asOf);
    return age === null || age > RECENCY_THRESHOLD_DAYS;
  }).length;
  const limitations = input.ledger.flatMap((entry) => entry.limitation ? [entry.limitation] : []);

  if (!input.vehicle.mileage) limitations.push("Mileage was not supplied; mileage match cannot be assessed.");
  if (!input.vehicle.condition) limitations.push("Vehicle condition was not supplied; condition match cannot be assessed.");
  if (input.source === "fallback") limitations.push("No comparable evidence was available; the result is a provisional fallback indication.");
  if (staleSourceCount > 0) limitations.push("One or more source records are outside the 90-day recency control.");

  const hasFreshMarketRecord = input.source === "market_data"
    && input.ledger.length === 1
    && staleSourceCount === 0
    && (input.reportedSourceCount ?? 0) >= 3
    && Boolean(input.vehicle.mileage)
    && Boolean(input.vehicle.condition);
  const hasClaimsCoverage = input.source === "historical_claims" && input.ledger.length >= 3 && staleSourceCount === 0;

  const clientEvidenceState: ValuationEvidenceState = hasFreshMarketRecord
    ? "market_supported"
    : hasClaimsCoverage
      ? "provisional"
      : "review_required";
  const clientMessage = clientEvidenceState === "market_supported"
    ? "Market-supported valuation evidence is available. Confirm the vehicle facts and chosen insured value."
    : clientEvidenceState === "provisional"
      ? "A provisional valuation is available from available comparable evidence. Confirm the vehicle facts and request review if material details differ."
      : "A valuation indication is available, but the evidence requires expert review before it should be relied upon beyond decision support.";

  return {
    clientEvidenceState,
    clientMessage,
    professionalEvidence: {
      sourceCoverage: {
        comparableCount: input.ledger.length,
        reportedSourceCount: input.reportedSourceCount ?? null,
        sourceTypes: [...new Set(input.ledger.map((entry) => entry.sourceType))],
      },
      vehicleMatch: {
        make: input.vehicle.make,
        model: input.vehicle.model,
        year: input.vehicle.year,
        mileageProvided: Boolean(input.vehicle.mileage),
        conditionProvided: Boolean(input.vehicle.condition),
      },
      recency: { asOf: input.asOf.toISOString(), staleSourceCount, thresholdDays: RECENCY_THRESHOLD_DAYS },
      adjustments: input.adjustments,
      limitations: [...new Set(limitations)],
      requiresHumanReview: clientEvidenceState === "review_required",
    },
    ledger: input.ledger,
  };
}
