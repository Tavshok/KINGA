import { createHash } from "node:crypto";

import type { ScheduledExecutionFence } from "./scheduled-execution-lease";

const EFFECT_DEFINITIONS = Object.freeze({
  "intake-escalation:queue-claim": Object.freeze({
    subjectPattern: /^claim:[1-9][0-9]{0,18}$/u,
    reasonCodes: new Set(["intake_timeout", "manual_retry"]),
  }),
  "stuck-recovery:queue-assessment": Object.freeze({
    subjectPattern: /^assessment:[1-9][0-9]{0,18}$/u,
    reasonCodes: new Set(["assessment_stuck", "manual_retry"]),
  }),
});

export type ScheduledEffectType = keyof typeof EFFECT_DEFINITIONS;

export interface ScheduledEffectInput {
  readonly effectType: ScheduledEffectType;
  /** Opaque, typed business reference such as `claim:42`; never a person identifier. */
  readonly subjectKey: string;
  /** The only persisted payload field is a reviewed operational reason code. */
  readonly payload: Readonly<{ reasonCode: string }>;
}

export interface ValidatedScheduledEffect extends ScheduledEffectInput {
  readonly canonicalPayload: string;
}

export function canonicalScheduledEffectPayload(
  payload: ScheduledEffectInput["payload"]
): string {
  return JSON.stringify({ reasonCode: payload.reasonCode });
}

export function validateScheduledEffect(
  input: ScheduledEffectInput
): ValidatedScheduledEffect {
  const definition = EFFECT_DEFINITIONS[input.effectType];
  if (!definition) throw new Error("Unsupported scheduled effect type");
  if (!definition.subjectPattern.test(input.subjectKey)) {
    throw new Error("Invalid scheduled effect subject");
  }
  if (
    !input.payload ||
    typeof input.payload !== "object" ||
    Array.isArray(input.payload) ||
    Object.keys(input.payload).length !== 1 ||
    typeof input.payload.reasonCode !== "string" ||
    !definition.reasonCodes.has(input.payload.reasonCode)
  ) {
    throw new Error("Invalid scheduled effect payload");
  }
  return Object.freeze({
    effectType: input.effectType,
    subjectKey: input.subjectKey,
    payload: Object.freeze({ reasonCode: input.payload.reasonCode }),
    canonicalPayload: canonicalScheduledEffectPayload(input.payload),
  });
}

/**
 * One effect key per canonical job window, effect type, and opaque subject.
 * This intentionally deduplicates the same effect across lease generations.
 */
export function scheduledEffectKey(
  fence: Pick<ScheduledExecutionFence, "jobKey" | "windowKey">,
  effectType: ScheduledEffectType,
  subjectKey: string
): string {
  validateScheduledEffect({
    effectType,
    subjectKey,
    payload: {
      reasonCode:
        effectType === "intake-escalation:queue-claim"
          ? "intake_timeout"
          : "assessment_stuck",
    },
  });
  return createHash("sha256")
    .update("g1-effect-v1\0")
    .update(fence.jobKey)
    .update("\0")
    .update(fence.windowKey)
    .update("\0")
    .update(effectType)
    .update("\0")
    .update(subjectKey)
    .digest("hex");
}
