import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const readClientSource = (relativePath: string) =>
  fs.readFileSync(path.resolve(process.cwd(), "client/src", relativePath), "utf8");

describe("operational dashboard data integrity", () => {
  it("does not substitute demo claims or KPI records in the claims-manager dashboard", () => {
    const source = readClientSource("pages/ClaimsManagerDashboard.tsx");
    expect(source).not.toContain('from "@/lib/demoData"');
    expect(source).toContain("No claims yet");
    expect(source).toContain("Claims data is unavailable");
  });

  it("does not substitute demo analytics in the executive dashboard", () => {
    const source = readClientSource("components/ExecutiveAnalyticsCharts.tsx");
    expect(source).not.toContain('from "@/lib/demoData"');
    expect(source).toContain("No data available");
  });
});
