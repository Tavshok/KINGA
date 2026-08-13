export type RfqAuthority =
  | { mode: "agency_direct"; requiresClientInstruction: false }
  | { mode: "client_instruction_required"; requiresClientInstruction: true };

/**
 * Fleet-policy RFQs are executed by the agency only after an authorised client or
 * fleet-owner instruction. This rule has no policy-issuance or commission effect.
 */
export function resolveRfqAuthority(requestType: "standard_claim" | "fleet_policy"): RfqAuthority {
  return requestType === "fleet_policy"
    ? { mode: "client_instruction_required", requiresClientInstruction: true }
    : { mode: "agency_direct", requiresClientInstruction: false };
}

export function canSubmitFleetInstruction(input: {
  requestType: "standard_claim" | "fleet_policy";
  quoteStatus: string;
  hasFleetAccount: boolean;
  requesterOwnsFleet: boolean;
}): boolean {
  return input.requestType === "fleet_policy"
    && input.quoteStatus === "quoted"
    && input.hasFleetAccount
    && input.requesterOwnsFleet;
}

export function canExecuteFleetInstruction(input: {
  instructionStatus: "requested" | "executed" | "cancelled";
  requestType: "standard_claim" | "fleet_policy";
  quoteStatus: string;
  fleetAccountMatches: boolean;
}): boolean {
  return input.instructionStatus === "requested"
    && input.requestType === "fleet_policy"
    && input.quoteStatus === "quoted"
    && input.fleetAccountMatches;
}
