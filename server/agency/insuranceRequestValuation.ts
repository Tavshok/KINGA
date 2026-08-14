export const MATERIAL_VALUATION_VARIANCE_PERCENT = 10;

export type ValuationVariance = {
  differenceCents: number;
  variancePercent: number | null;
  direction: "aligned" | "below_market" | "above_market" | "unavailable";
  materiallyDifferent: boolean;
  clientDisclosure: string;
};

export type InsuranceRequestValuationPresentation = {
  client: {
    selectedValue: { label: "Client proposed insured value"; amountCents: number | null };
    marketValuation: { label: "KINGA Market Valuation"; amountCents: number | null };
    variance: ValuationVariance;
    acknowledgementRequired: boolean;
    acknowledgementRecorded: boolean;
    responsibilityMessage: string;
  };
  agency: {
    variance: ValuationVariance;
    deviationRecordRequired: boolean;
    acknowledgementRecorded: boolean;
  };
  insurer: {
    selectedValueLabel: "Client proposed insured value";
    marketValuationLabel: "KINGA Market Valuation";
    variance: ValuationVariance;
    acknowledgementRecorded: boolean;
    decisionBoundary: string;
  };
};

export type AgencyServiceRequestProgression = {
  canDispatch: boolean;
  acknowledgementRequired: boolean;
  acknowledgementSatisfied: boolean;
  selectedInsurerRecipientsRequired: true;
  insurerValuationRequired: false;
};

/**
 * Compares the client's chosen insured value with the non-binding KINGA Market
 * Valuation. The result is decision support only: it cannot set a premium,
 * policy term, sum insured, claim outcome, settlement, or repair cost.
 */
export function compareClientValueToMarketValuation(
  clientProposedValueCents: number | null | undefined,
  kingaMarketValuationCents: number | null | undefined,
  materialThresholdPercent = MATERIAL_VALUATION_VARIANCE_PERCENT,
): ValuationVariance {
  if (!clientProposedValueCents || !kingaMarketValuationCents || kingaMarketValuationCents <= 0) {
    return {
      differenceCents: 0,
      variancePercent: null,
      direction: "unavailable",
      materiallyDifferent: false,
      clientDisclosure: "KINGA Market Valuation comparison is unavailable. Confirm the vehicle facts and selected insured value before any insurer review.",
    };
  }

  const differenceCents = clientProposedValueCents - kingaMarketValuationCents;
  const variancePercent = Number(((differenceCents / kingaMarketValuationCents) * 100).toFixed(2));
  const materiallyDifferent = Math.abs(variancePercent) >= materialThresholdPercent;
  const direction = differenceCents === 0 ? "aligned" : differenceCents < 0 ? "below_market" : "above_market";

  const clientDisclosure = direction === "aligned"
    ? "Your chosen insured value aligns with the KINGA Market Valuation. You remain responsible for confirming vehicle facts and the selected value."
    : direction === "below_market"
      ? "Your chosen insured value is below the KINGA Market Valuation. This may create an underinsurance exposure if the value is retained. Confirm that the vehicle facts and selected insured value are accurate."
      : "Your chosen insured value is above the KINGA Market Valuation. This may create an overinsurance or affordability exposure if the value is retained. Confirm that the vehicle facts and selected insured value are accurate.";

  return { differenceCents, variancePercent, direction, materiallyDifferent, clientDisclosure };
}

export function buildClientAcknowledgementRequired(
  variance: ValuationVariance,
  clientConfirmed: boolean,
): boolean {
  return variance.materiallyDifferent && !clientConfirmed;
}

/**
 * Keeps client, agency, and insurer projections on one source-labelled comparison
 * while preserving their distinct language and the insurance-service boundary.
 */
export function buildInsuranceRequestValuationPresentation(input: {
  clientProposedValueCents: number | null | undefined;
  kingaMarketValuationCents: number | null | undefined;
  acknowledgementRecorded?: boolean;
}): InsuranceRequestValuationPresentation {
  const variance = compareClientValueToMarketValuation(
    input.clientProposedValueCents,
    input.kingaMarketValuationCents,
  );
  const acknowledgementRecorded = Boolean(input.acknowledgementRecorded);
  const acknowledgementRequired = buildClientAcknowledgementRequired(variance, acknowledgementRecorded);

  return {
    client: {
      selectedValue: { label: "Client proposed insured value", amountCents: input.clientProposedValueCents ?? null },
      marketValuation: { label: "KINGA Market Valuation", amountCents: input.kingaMarketValuationCents ?? null },
      variance,
      acknowledgementRequired,
      acknowledgementRecorded,
      responsibilityMessage: "The client remains responsible for confirming vehicle facts and the selected insured value.",
    },
    agency: {
      variance,
      deviationRecordRequired: variance.materiallyDifferent,
      acknowledgementRecorded,
    },
    insurer: {
      selectedValueLabel: "Client proposed insured value",
      marketValuationLabel: "KINGA Market Valuation",
      variance,
      acknowledgementRecorded,
      decisionBoundary: "Decision support only. This comparison does not create or change a policy, premium, sum insured, claim, repair cost, settlement, payment, or underwriting decision.",
    },
  };
}

/**
 * Insurers are dispatch recipients and optional decision-support consumers; they
 * are never a required valuation provider for an agency service request.
 */
export function evaluateAgencyServiceRequestProgression(input: {
  variance: ValuationVariance;
  acknowledgementRecorded: boolean;
  selectedInsurerRecipientCount: number;
}): AgencyServiceRequestProgression {
  const acknowledgementRequired = buildClientAcknowledgementRequired(
    input.variance,
    input.acknowledgementRecorded,
  );
  return {
    canDispatch: !acknowledgementRequired && input.selectedInsurerRecipientCount > 0,
    acknowledgementRequired,
    acknowledgementSatisfied: !acknowledgementRequired,
    selectedInsurerRecipientsRequired: true,
    insurerValuationRequired: false,
  };
}

export function normaliseVehicleRegistration(value?: string | null): string | null {
  const normalized = value?.trim().toUpperCase().replace(/\s+/g, "") ?? "";
  return normalized.length >= 2 ? normalized : null;
}
