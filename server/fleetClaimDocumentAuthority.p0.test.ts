import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("P0 fleet claim-document route and server authority conformance", () => {
  it("uses an object-scoped claim context instead of an insurer status list on the document page", () => {
    const page = readFileSync("client/src/pages/ClaimDocuments.tsx", "utf8");
    expect(page).toContain("trpc.documents.getClaimContext.useQuery");
    expect(page).not.toContain("trpc.claims.byStatus.useQuery");
  });

  it("enforces the shared claim-document authority before upload, list, unified list, and delete actions", () => {
    const router = readFileSync("server/routers.ts", "utf8");
    expect(router).toContain('import { getAuthorizedClaimDocumentContext } from "./documents/claimDocumentAuthority"');
    expect((router.match(/getAuthorizedClaimDocumentContext\(ctx\.user/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(router).toContain('"fleet_manager", "fleet_admin", "fleet_driver"');
  });
});
