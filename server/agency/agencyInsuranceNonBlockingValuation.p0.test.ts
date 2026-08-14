import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  compareClientValueToMarketValuation,
  evaluateAgencyServiceRequestProgression,
} from "./insuranceRequestValuation";

const projectRoot = resolve(import.meta.dirname, "../..");
const serviceRouter = readFileSync(resolve(projectRoot, "server/routers/agency-insurance-service.ts"), "utf8");

describe("agency insurance service non-blocking insurer valuation boundary", () => {
  it("allows acknowledged agency/client valuation evidence to progress without an insurer-provided valuation", () => {
    const progression = evaluateAgencyServiceRequestProgression({
      variance: compareClientValueToMarketValuation(850_000, 1_000_000),
      acknowledgementRecorded: true,
      selectedInsurerRecipientCount: 1,
    });
    expect(progression.canDispatch).toBe(true);
    expect(progression.insurerValuationRequired).toBe(false);
  });

  it("retains selected insurer recipients as a dispatch concern, not a valuation-provider gate", () => {
    const progression = evaluateAgencyServiceRequestProgression({
      variance: compareClientValueToMarketValuation(1_000_000, 1_000_000),
      acknowledgementRecorded: false,
      selectedInsurerRecipientCount: 0,
    });
    expect(progression.canDispatch).toBe(false);
    expect(progression.insurerValuationRequired).toBe(false);
    expect(progression.selectedInsurerRecipientsRequired).toBe(true);
  });

  it("uses the shared no-insurer-valuation progression contract inside the actual dispatch procedure", () => {
    const dispatch = serviceRouter.split("confirmAndDispatchInsuranceServiceRequest:")[1]?.split("recordVehicleConditionSnapshot:")[0] ?? "";
    expect(dispatch).toContain("evaluateAgencyServiceRequestProgression");
    expect(dispatch).toContain("insurerValuationRequired: progression.insurerValuationRequired");
    expect(dispatch).not.toContain("insurerValuationCents");
  });
});
