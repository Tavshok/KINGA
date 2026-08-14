import { describe, expect, it } from "vitest";
import {
  MATERIAL_VALUATION_VARIANCE_PERCENT,
  buildClientAcknowledgementRequired,
  buildInsuranceRequestValuationPresentation,
  compareClientValueToMarketValuation,
  evaluateAgencyServiceRequestProgression,
  normaliseVehicleRegistration,
} from "./insuranceRequestValuation";

describe("agency insurance-request valuation boundary", () => {
  it("retains aligned client and market values as non-binding comparison evidence", () => {
    const variance = compareClientValueToMarketValuation(1_000_000, 1_000_000);
    expect(variance).toMatchObject({ direction: "aligned", variancePercent: 0, materiallyDifferent: false });
    expect(buildClientAcknowledgementRequired(variance, false)).toBe(false);
  });

  it("requires client acknowledgement for a materially lower selected value", () => {
    const variance = compareClientValueToMarketValuation(850_000, 1_000_000);
    expect(variance.direction).toBe("below_market");
    expect(variance.variancePercent).toBe(-15);
    expect(variance.materiallyDifferent).toBe(true);
    expect(variance.clientDisclosure).toContain("underinsurance");
    expect(buildClientAcknowledgementRequired(variance, false)).toBe(true);
  });

  it("records materially higher selected values as a disclosure, not a decision", () => {
    const variance = compareClientValueToMarketValuation(1_150_000, 1_000_000);
    expect(variance.direction).toBe("above_market");
    expect(variance.variancePercent).toBe(15);
    expect(variance.materiallyDifferent).toBe(true);
    expect(variance.clientDisclosure).toContain("overinsurance");
    expect(buildClientAcknowledgementRequired(variance, true)).toBe(false);
  });

  it("does not manufacture a comparison when the market valuation is unavailable", () => {
    const variance = compareClientValueToMarketValuation(1_000_000, null);
    expect(variance).toMatchObject({ direction: "unavailable", variancePercent: null, materiallyDifferent: false });
  });

  it("uses a ten percent material-difference boundary and normalises vehicle identifiers", () => {
    const variance = compareClientValueToMarketValuation(1_100_000, 1_000_000);
    expect(MATERIAL_VALUATION_VARIANCE_PERCENT).toBe(10);
    expect(variance.materiallyDifferent).toBe(true);
    expect(normaliseVehicleRegistration(" abc 1234 ")).toBe("ABC1234");
  });

  it("projects one source-labelled material variance to the client, agency, and insurer without raw confidence or policy effects", () => {
    const presentation = buildInsuranceRequestValuationPresentation({
      clientProposedValueCents: 850_000,
      kingaMarketValuationCents: 1_000_000,
      acknowledgementRecorded: false,
    });

    expect(presentation.client.selectedValue.label).toBe("Client proposed insured value");
    expect(presentation.client.marketValuation.label).toBe("KINGA Market Valuation");
    expect(presentation.client.variance.clientDisclosure).toContain("underinsurance");
    expect(presentation.client.acknowledgementRequired).toBe(true);
    expect(presentation.agency).toMatchObject({ deviationRecordRequired: true, acknowledgementRecorded: false });
    expect(presentation.insurer.decisionBoundary).toContain("Decision support only");
    expect(JSON.stringify(presentation)).not.toContain("confidence");
    expect(presentation.insurer.decisionBoundary).not.toContain("premium decision");
  });

  it("does not require an insurer valuation for agency progression while retaining selected-insurer dispatch and material acknowledgement controls", () => {
    const materialVariance = compareClientValueToMarketValuation(850_000, 1_000_000);
    const blockedForAcknowledgement = evaluateAgencyServiceRequestProgression({
      variance: materialVariance,
      acknowledgementRecorded: false,
      selectedInsurerRecipientCount: 1,
    });
    expect(blockedForAcknowledgement).toMatchObject({
      canDispatch: false,
      acknowledgementRequired: true,
      insurerValuationRequired: false,
      selectedInsurerRecipientsRequired: true,
    });

    const readyWithoutInsurerValuation = evaluateAgencyServiceRequestProgression({
      variance: materialVariance,
      acknowledgementRecorded: true,
      selectedInsurerRecipientCount: 1,
    });
    expect(readyWithoutInsurerValuation).toMatchObject({
      canDispatch: true,
      acknowledgementSatisfied: true,
      insurerValuationRequired: false,
    });
  });
});
