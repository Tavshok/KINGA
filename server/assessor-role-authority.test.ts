import { describe, expect, it } from "vitest";
import { isAssignedAssessorActor, isExternalAssessor } from "./assessor-role-authority";

describe("external assessor authority", () => {
  it("recognises only the insurer external-assessor sub-role as an external assessor", () => {
    expect(isExternalAssessor({ role: "insurer", insurerRole: "assessor_external" })).toBe(true);
    expect(isExternalAssessor({ role: "insurer", insurerRole: "assessor_internal" })).toBe(false);
    expect(isExternalAssessor({ role: "assessor", insurerRole: "assessor_external" })).toBe(false);
  });

  it("extends assigned-assessor work authority only to marketplace and external assessor actors", () => {
    expect(isAssignedAssessorActor({ role: "assessor" })).toBe(true);
    expect(isAssignedAssessorActor({ role: "insurer", insurerRole: "assessor_external" })).toBe(true);
    expect(isAssignedAssessorActor({ role: "insurer", insurerRole: "claims_manager" })).toBe(false);
    expect(isAssignedAssessorActor({ role: "platform_super_admin" })).toBe(false);
  });
});
