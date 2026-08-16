import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers/intake-gate.ts"), "utf8");

describe("intake auto-assignment statistics tenant authority", () => {
  it("requires a tenant session and joins the parent claim before counting audit events", () => {
    const block = source.slice(source.indexOf("getAutoAssignStats:"));
    expect(block).toContain("A tenant-scoped session is required");
    expect(block).toContain(".innerJoin(claims, eq(auditTrail.claimId, claims.id))");
    expect(block).toContain("eq(claims.tenantId, tenantId)");
  });
});
