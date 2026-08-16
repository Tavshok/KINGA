import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/intake-gate.ts"),
  "utf8",
);

describe("intake-gate tenant-bound claim writes", () => {
  it("keeps the actor tenant in escalation and override update predicates", () => {
    const escalation = source.slice(
      source.indexOf("flagForEscalation:"),
      source.indexOf("overrideIntakeGate:"),
    );
    const override = source.slice(source.indexOf("overrideIntakeGate:"));

    expect(escalation).toContain("eq(claims.tenantId, ctx.user.tenantId!)");
    expect(override).toContain("eq(claims.tenantId, ctx.user.tenantId!)");
    expect(escalation).toContain("earlyFraudSuspicion: 1");
    expect(override).toContain("workflowState: input.targetState");
  });
});
