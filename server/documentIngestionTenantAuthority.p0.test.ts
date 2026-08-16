import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/document-ingestion.ts"),
  "utf8"
);

describe("document ingestion tenant authority", () => {
  it("requires a session tenant and removes the administrative default tenant fallback", () => {
    expect(source).toContain("function requireSessionTenant");
    expect(source).toContain("const tenantId = requireSessionTenant(ctx);");
    expect(source).not.toContain('"test-ops-001"');
    expect(source).not.toContain("isAdminRole(ctx.user.role)");
  });

  it("retains tenant scope at every document and batch final write", () => {
    expect(source).toContain(
      "and(eq(ingestionDocuments.id, docDbId), eq(ingestionDocuments.tenantId, tenantId))"
    );
    expect(source).toContain(
      "and(eq(ingestionBatches.id, batchDbId), eq(ingestionBatches.tenantId, tenantId))"
    );
    expect(source).toContain(
      "and(eq(ingestionDocuments.id, input.document_id), eq(ingestionDocuments.tenantId, tenantId))"
    );
  });
});
