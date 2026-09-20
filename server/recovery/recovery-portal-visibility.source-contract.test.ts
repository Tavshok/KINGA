import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("Recovery Portal manual deadline and status visibility source contract", () => {
  it("retains table deadline/status columns, SLA chips, and the 90-day KPI", () => {
    const portal = source("client/src/pages/RecoveryPortal.tsx");

    expect(portal).toContain("<th>Deadline</th>");
    expect(portal).toContain("<th>Status</th>");
    expect(portal).toContain(
      "<SLADeadlineChip deadline={rc.recoveryDeadline} warnOnly={false} showOk={true} />"
    );
    expect(portal).toContain('label: "Approaching Deadline"');
    expect(portal).toContain("delta: 'Within 90 days'");
    expect(portal).toContain("kpis?.approachingDeadlines");
  });

  it("retains case-detail status/deadline visibility and its near-deadline warning", () => {
    const detail = source("client/src/pages/RecoveryCaseDetail.tsx");

    expect(detail).toContain("STATUS_META[caseData.status]");
    expect(detail).toContain("{/* Recovery Deadline warning */}");
    expect(detail).toContain("if (daysLeft > 90) return null;");
    expect(detail).toContain("Recovery deadline:");
    expect(detail).toContain('label="Recovery Deadline"');
    expect(detail).toContain("value={caseData.recoveryDeadline}");
  });

  it("records rather than conceals the current non-filtering approaching-deadline click-through", () => {
    const portal = source("client/src/pages/RecoveryPortal.tsx");
    const router = source("server/routers/recovery.ts");

    expect(portal).toContain("setActiveTab('approaching')");
    expect(portal).toContain(
      "STATUS_CARDS.find(c => c.tab === activeTab)?.dbStatus"
    );
    expect(portal).not.toMatch(/tab:\s*["']approaching["']/);
    expect(router).toContain("status: z.string().optional()");
    expect(router).not.toContain("approachingDeadlineOnly");
    expect(router).not.toContain("stalledCase");
  });
});
