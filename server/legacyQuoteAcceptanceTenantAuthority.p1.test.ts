import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/insurance-phase7.ts"),
  "utf8",
);

describe("legacy quotation acceptance tenant authority", () => {
  it("requires a session tenant and retains it on both target lookup and accepted-status write", () => {
    const block = source.slice(
      source.indexOf("acceptQuote: protectedProcedure"),
      source.indexOf("sendDocumentToClient: protectedProcedure"),
    );
    expect(block).toContain("const tenantId = ctx.user.tenantId");
    expect(block).toContain("eq(quotationRequests.tenantId, tenantId)");
    expect(block.match(/eq\(quotationRequests\.tenantId, tenantId\)/g)).toHaveLength(2);
    expect(block.indexOf("eq(quotationRequests.tenantId, tenantId)")).toBeLessThan(
      block.indexOf("createNotification"),
    );
  });
});
