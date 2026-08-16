import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/comments.ts"),
  "utf8",
);

const resolveBlock = source.slice(
  source.indexOf("resolveAnnotation: protectedProcedure"),
  source.indexOf("listComments: protectedProcedure"),
);

describe("annotation resolution tenant authority", () => {
  it("resolves the annotation through a parent claim in the session tenant before mutation", () => {
    expect(resolveBlock).toContain("innerJoin(claims, eq(claimComments.claimId, claims.id))");
    expect(resolveBlock).toContain("eq(claims.tenantId, ctx.user.tenantId)");
    expect(resolveBlock).toContain('message: "Tenant required"');
  });

  it("retains the authorised parent claim in the resolution update predicate", () => {
    expect(resolveBlock).toContain("eq(claimComments.claimId, comment.claimId)");
  });
});
