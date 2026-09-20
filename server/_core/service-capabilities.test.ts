import { describe, expect, it } from "vitest";
import {
  getServiceCapabilityDefinition,
  isServiceCapability,
  SERVICE_CAPABILITY_REGISTRY,
} from "./service-capabilities";

describe("G1 closed service capability registry", () => {
  it("contains only the two approved exact scheduled capabilities", () => {
    expect(Object.keys(SERVICE_CAPABILITY_REGISTRY)).toEqual([
      "scheduled:intake-escalation:run",
      "scheduled:stuck-recovery:run",
    ]);
    expect(
      getServiceCapabilityDefinition("scheduled:intake-escalation:run")
    ).toEqual({
      capability: "scheduled:intake-escalation:run",
      jobKey: "intake-escalation",
      canonicalPath: "/api/service/scheduled/intake-escalation",
    });
    expect(Object.isFrozen(SERVICE_CAPABILITY_REGISTRY)).toBe(true);
    expect(
      Object.values(SERVICE_CAPABILITY_REGISTRY).every(Object.isFrozen)
    ).toBe(true);
  });

  it.each([
    "scheduled:*",
    "scheduled:intake-escalation",
    "scheduled:recovery-deadline-sweep:run",
    "scheduled:keepwarm:run",
    "trpc:intake-escalation:run",
    "intake-escalation",
    "scheduled:intake-escalation:run ",
  ])(
    "rejects excluded wildcard, route, alias, and recovery capability %s",
    value => {
      expect(isServiceCapability(value)).toBe(false);
    }
  );
});
