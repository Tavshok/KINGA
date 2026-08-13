import { describe, expect, it } from "vitest";
import { canExecuteFleetInstruction, canSubmitFleetInstruction, resolveRfqAuthority } from "./rfqAuthority";

describe("resolveRfqAuthority", () => {
  it("requires authorised client or fleet instruction for fleet-policy RFQs", () => {
    expect(resolveRfqAuthority("fleet_policy")).toEqual({
      mode: "client_instruction_required",
      requiresClientInstruction: true,
    });
  });

  it("does not attach an instruction requirement to standard claim RFQs", () => {
    expect(resolveRfqAuthority("standard_claim")).toEqual({
      mode: "agency_direct",
      requiresClientInstruction: false,
    });
  });

  it("permits submission only by the owner of a quoted fleet RFQ", () => {
    expect(canSubmitFleetInstruction({
      requestType: "fleet_policy", quoteStatus: "quoted", hasFleetAccount: true, requesterOwnsFleet: true,
    })).toBe(true);
    expect(canSubmitFleetInstruction({
      requestType: "fleet_policy", quoteStatus: "pending", hasFleetAccount: true, requesterOwnsFleet: true,
    })).toBe(false);
    expect(canSubmitFleetInstruction({
      requestType: "fleet_policy", quoteStatus: "quoted", hasFleetAccount: true, requesterOwnsFleet: false,
    })).toBe(false);
  });

  it("permits agency execution only for a pending matching fleet instruction", () => {
    expect(canExecuteFleetInstruction({
      instructionStatus: "requested", requestType: "fleet_policy", quoteStatus: "quoted", fleetAccountMatches: true,
    })).toBe(true);
    expect(canExecuteFleetInstruction({
      instructionStatus: "executed", requestType: "fleet_policy", quoteStatus: "quoted", fleetAccountMatches: true,
    })).toBe(false);
    expect(canExecuteFleetInstruction({
      instructionStatus: "requested", requestType: "fleet_policy", quoteStatus: "accepted", fleetAccountMatches: true,
    })).toBe(false);
  });
});
