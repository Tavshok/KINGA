import { describe, expect, it } from "vitest";
import { isRestrictedAgencyAssistedIdentity } from "./agencyAssistedClaimantIdentity";

describe("restricted agency-assisted claimant authority", () => {
  it("keeps a new agency-assisted identity lower trust until a verified claimant link exists", () => {
    expect(isRestrictedAgencyAssistedIdentity({ status: "restricted", verifiedClaimantUserId: null })).toBe(true);
  });

  it("does not treat a verified link as an unrestricted agency authority grant", () => {
    expect(isRestrictedAgencyAssistedIdentity({ status: "linked_to_verified_claimant", verifiedClaimantUserId: 42 })).toBe(false);
  });
});
