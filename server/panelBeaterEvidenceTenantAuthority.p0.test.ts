import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers/panel-beaters-core.ts"), "utf8");

describe("panel-beater evidence tenant authority", () => {
  it("resolves tenant-owned claims before quote upload and repair photo side effects", () => {
    const quote = source.slice(source.indexOf("uploadQuotePdf:"), source.indexOf("extractQuoteFromPdf:"));
    const photos = source.slice(source.indexOf("uploadRepairPhotos:"));
    expect(quote).toContain("eq(claims.tenantId, tenantId)");
    expect(photos).toContain("eq(claims.tenantId, tenantId)");
    expect(photos).toContain(".where(and(eq(claims.id, input.claimId), eq(claims.tenantId, tenantId)))");
  });
});
