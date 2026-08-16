import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/workflow.ts"),
  "utf8",
);

describe("workflow configuration tenant authority", () => {
  it("requires a session tenant for configuration reads and writes", () => {
    expect(source).not.toContain('tenantId || "default"');
    expect(source).toContain("getConfiguration: protectedProcedure");
    expect(source).toContain("updateConfiguration: protectedProcedure");
    expect((source.match(/A tenant-scoped session is required/g) ?? []).length).toBe(2);
  });
});
