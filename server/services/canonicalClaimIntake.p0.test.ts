import { describe, expect, it } from "vitest";
import { assertCanonicalAttachmentOwnership, repairerPreferenceOutcome } from "./canonicalClaimIntake";

const actor = { id: 101, tenantId: "tenant-a", role: "claimant", uploadKeyPrefixes: ["whatsapp-claims/"] };
const attachment = (key: string) => ({ key, url: "https://files.example.test/object", fileName: "evidence.jpg", fileSize: 128, mimeType: "image/jpeg", category: "damage_photo" as const });

describe("P0 canonical intake guards", () => {
  it.each([0, 1, 2, 3, 4, 6])("accepts %i repairer preferences without a submission block", (count) => {
    const preferences = Array.from({ length: count }, (_, index) => `repairer-${index}`);
    const result = repairerPreferenceOutcome(preferences);
    expect(result.accepted).toHaveLength(count);
    expect(result.warnings.some((warning) => warning.includes("exception"))).toBe(count < 3);
  });

  it("records duplicate preference cleanup as an operational warning rather than rejecting intake", () => {
    expect(repairerPreferenceOutcome(["repairer-1", "repairer-1", "repairer-2"]))
      .toMatchObject({ accepted: ["repairer-1", "repairer-2"], warnings: expect.arrayContaining(["duplicate_repairer_preference_removed"]) });
  });

  it("allows claimant and WhatsApp-owned evidence but rejects a foreign claimant storage key", () => {
    expect(() => assertCanonicalAttachmentOwnership(actor, [attachment("claims/101/damage.jpg"), attachment("whatsapp-claims/damage.jpg")])).not.toThrow();
    expect(() => assertCanonicalAttachmentOwnership(actor, [attachment("claims/202/foreign.jpg")])).toThrow("not owned");
  });

  it("rejects repeated attachment metadata keys rather than duplicating evidence", () => {
    const duplicate = attachment("claims/101/damage.jpg");
    expect(() => assertCanonicalAttachmentOwnership(actor, [duplicate, duplicate])).toThrow("duplicated");
  });
});
