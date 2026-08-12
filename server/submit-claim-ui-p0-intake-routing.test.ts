import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "client/src/pages/SubmitClaim.tsx"), "utf8");

describe("P0 My Portal claim form canonical intake boundary", () => {
  it("uses the canonical claims.submit tRPC procedure rather than a channel-specific claim writer", () => {
    expect(source).toContain("trpc.claims.submit.useMutation");
    expect(source).not.toContain("createClaim.useMutation");
  });

  it("submits stable idempotency, full photo/document descriptors, repairer preferences, and the claimant portal channel without a visual three-repairer limit", () => {
    expect(source).toContain("idempotencyKey");
    expect(source).toContain("damagePhotos:");
    expect(source).toContain("supportingDocuments:");
    expect(source).toContain("repairerPreferences:");
    expect(source).toContain('channel: "claimant_portal"');
    expect(source).not.toContain("/ 3");
  });
});
