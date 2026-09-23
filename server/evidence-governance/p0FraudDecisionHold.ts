import { TRPCError } from "@trpc/server";

export {
  buildP0B1FraudDecisionHold,
  P0_B1_FRAUD_DECISION_HOLD,
  P0_B1_FRAUD_EVIDENCE_REQUIREMENTS,
} from "../../shared/p0FraudDecisionHoldPresentation";

import { P0_B1_FRAUD_DECISION_HOLD } from "../../shared/p0FraudDecisionHoldPresentation";

export function throwP0B1FraudDecisionHold(): never {
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: `${P0_B1_FRAUD_DECISION_HOLD.explanation} Required evidence: ${P0_B1_FRAUD_DECISION_HOLD.requiredEvidence.join("; ")}`,
  });
}
