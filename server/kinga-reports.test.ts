/**
 * KINGA Report Tests — Claims Intelligence Report & Forensic Claim Decision Report
 *
 * Architecture note:
 *   - "claim.forensic" is the CANONICAL key for the Forensic Claim Decision Report.
 *     It is NOT a new report — it is the existing forensic report key, now routed to
 *     the new v7 generateForensicDecisionReport generator (redesigned rendering).
 *   - "claim.intelligence" is the NEW Process-tier Claims Intelligence Report.
 *
 * Tests cover:
 *   1. REPORT_ACCESS — both keys registered with correct roles
 *   2. Role-based access — Claims Intelligence Report (claim.intelligence)
 *   3. Role-based access — Forensic Claim Decision Report (claim.forensic / v7)
 *   4. REPORT_CATALOGUE — both keys in reporting.ts with correct metadata
 *   5. Dispatcher — claim.forensic routes to v7 generator; claim.intelligence wired
 *   6. Column mapping — no banned/old column names in either new generator
 *   7. HTML structure — claimsIntelligenceReport.ts structural checks
 *   8. HTML structure — forensicDecisionReport.ts structural checks
 *   9. Design system — shared CSS tokens present in kingaDesignSystem.ts
 *  10. UI — ClaimsManagerReportsCentre includes both reports correctly
 */

import { describe, it, expect } from "vitest";
import { REPORT_ACCESS } from "./reporting/reportDefinitions";
import fs from "fs";
import path from "path";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function canAccessReport(reportKey: string, userRole: string, insurerRole?: string | null): boolean {
  const allowed = REPORT_ACCESS[reportKey];
  if (!allowed) return false;
  if (userRole === "admin") return allowed.includes("admin");
  if (insurerRole) return allowed.includes(insurerRole);
  return allowed.includes(userRole);
}

function reportsFor(userRole: string, insurerRole?: string | null): string[] {
  return Object.keys(REPORT_ACCESS).filter((k) => canAccessReport(k, userRole, insurerRole));
}

// claim.forensic = canonical key, now routes to v7 generateForensicDecisionReport
const CIR_KEY = "claim.intelligence";
const FDR_KEY = "claim.forensic";

// ─── 1. REPORT_ACCESS — Registration ─────────────────────────────────────────

describe("REPORT_ACCESS — report key registration", () => {
  it("claim.intelligence is registered in REPORT_ACCESS", () => {
    expect(REPORT_ACCESS).toHaveProperty(CIR_KEY);
  });

  it("claim.forensic is registered in REPORT_ACCESS (canonical key for Forensic Claim Decision Report)", () => {
    expect(REPORT_ACCESS).toHaveProperty(FDR_KEY);
  });

  it("claim.intelligence has at least one allowed role", () => {
    expect(REPORT_ACCESS[CIR_KEY].length).toBeGreaterThan(0);
  });

  it("claim.forensic has at least one allowed role", () => {
    expect(REPORT_ACCESS[FDR_KEY].length).toBeGreaterThan(0);
  });

  it("claim.forensic_decision is NOT in REPORT_ACCESS (removed — claim.forensic is canonical)", () => {
    expect(REPORT_ACCESS).not.toHaveProperty("claim.forensic_decision");
  });
});

// ─── 2. REPORT_ACCESS — Role-based access: Claims Intelligence Report ─────────

describe("REPORT_ACCESS — claim.intelligence role access", () => {
  it("claims_processor can access Claims Intelligence Report", () => {
    expect(reportsFor("insurer", "claims_processor")).toContain(CIR_KEY);
  });

  it("assessor_internal can access Claims Intelligence Report", () => {
    expect(reportsFor("insurer", "assessor_internal")).toContain(CIR_KEY);
  });

  it("assessor_external can access Claims Intelligence Report", () => {
    expect(reportsFor("insurer", "assessor_external")).toContain(CIR_KEY);
  });

  it("claims_manager can access Claims Intelligence Report", () => {
    expect(reportsFor("insurer", "claims_manager")).toContain(CIR_KEY);
  });

  it("risk_manager can access Claims Intelligence Report", () => {
    expect(reportsFor("insurer", "risk_manager")).toContain(CIR_KEY);
  });

  it("insurer_admin can access Claims Intelligence Report", () => {
    expect(reportsFor("insurer", "insurer_admin")).toContain(CIR_KEY);
  });

  it("executive cannot access Claims Intelligence Report (claim-level, not executive)", () => {
    expect(reportsFor("insurer", "executive")).not.toContain(CIR_KEY);
  });

  it("panel_beater cannot access Claims Intelligence Report", () => {
    expect(reportsFor("panel_beater", null)).not.toContain(CIR_KEY);
  });

  it("platform admin cannot access Claims Intelligence Report (insurer-scoped)", () => {
    expect(reportsFor("admin", null)).not.toContain(CIR_KEY);
  });
});

// ─── 3. REPORT_ACCESS — Role-based access: Forensic Claim Decision Report ─────
// claim.forensic is the canonical key — same access rules as before, new v7 rendering

describe("REPORT_ACCESS — claim.forensic (v7 Forensic Claim Decision Report) role access", () => {
  it("claims_processor can access Forensic Claim Decision Report", () => {
    expect(reportsFor("insurer", "claims_processor")).toContain(FDR_KEY);
  });

  it("claims_manager can access Forensic Claim Decision Report", () => {
    expect(reportsFor("insurer", "claims_manager")).toContain(FDR_KEY);
  });

  it("risk_manager can access Forensic Claim Decision Report", () => {
    expect(reportsFor("insurer", "risk_manager")).toContain(FDR_KEY);
  });

  it("insurer_admin can access Forensic Claim Decision Report", () => {
    expect(reportsFor("insurer", "insurer_admin")).toContain(FDR_KEY);
  });

  it("assessor_internal cannot access Forensic Claim Decision Report (forensic tier — manager/risk only)", () => {
    expect(reportsFor("insurer", "assessor_internal")).not.toContain(FDR_KEY);
  });

  it("assessor_external cannot access Forensic Claim Decision Report", () => {
    expect(reportsFor("insurer", "assessor_external")).not.toContain(FDR_KEY);
  });

  it("executive cannot access Forensic Claim Decision Report", () => {
    expect(reportsFor("insurer", "executive")).not.toContain(FDR_KEY);
  });

  it("panel_beater cannot access Forensic Claim Decision Report", () => {
    expect(reportsFor("panel_beater", null)).not.toContain(FDR_KEY);
  });

  it("platform admin cannot access Forensic Claim Decision Report (insurer-scoped)", () => {
    expect(reportsFor("admin", null)).not.toContain(FDR_KEY);
  });
});

// ─── 4. REPORT_CATALOGUE — Registration in reporting.ts ──────────────────────

describe("REPORT_CATALOGUE — reports registered in reporting.ts", () => {
  const reportingSource = fs.readFileSync(
    path.resolve(__dirname, "routers/reporting.ts"),
    "utf-8"
  );

  it("claim.intelligence is in REPORT_CATALOGUE", () => {
    expect(reportingSource).toContain('"claim.intelligence"');
  });

  it("claim.forensic is in REPORT_CATALOGUE with updated name", () => {
    expect(reportingSource).toContain('"claim.forensic"');
    expect(reportingSource).toContain("Forensic Claim Decision Report");
  });

  it("claim.intelligence has a human-readable name", () => {
    expect(reportingSource).toContain("Claims Intelligence Report");
  });

  it("claim.forensic_decision is NOT in REPORT_CATALOGUE (removed)", () => {
    expect(reportingSource).not.toContain('"claim.forensic_decision"');
  });

  it("claim.intelligence has requiresClaimId: true", () => {
    const cirMatch = reportingSource.match(/claim\.intelligence[\s\S]{0,300}requiresClaimId:\s*(true|false)/);
    expect(cirMatch?.[1]).toBe("true");
  });

  it("claim.forensic has requiresClaimId: true", () => {
    const fdrMatch = reportingSource.match(/claim\.forensic[^_][\s\S]{0,300}requiresClaimId:\s*(true|false)/);
    expect(fdrMatch?.[1]).toBe("true");
  });
});

// ─── 5. Dispatcher — Both keys wired in generateReportHtml ───────────────────

describe("generateReportHtml dispatcher — report keys wired correctly", () => {
  const reportDefsSource = fs.readFileSync(
    path.resolve(__dirname, "reporting/reportDefinitions.ts"),
    "utf-8"
  );

  it("claim.intelligence has a case in the switch dispatcher", () => {
    expect(reportDefsSource).toContain('case "claim.intelligence"');
  });

  it("claim.forensic routes to generateForensicDecisionReport (v7 generator)", () => {
    const forensicCase = reportDefsSource.match(/case "claim\.forensic":[^\n]+/);
    expect(forensicCase?.[0]).toContain("generateForensicDecisionReport");
  });

  it("claim.forensic_decision is NOT in the dispatcher (removed)", () => {
    expect(reportDefsSource).not.toContain('case "claim.forensic_decision"');
  });

  it("claim.intelligence calls generateClaimsIntelligenceReport", () => {
    expect(reportDefsSource).toContain("generateClaimsIntelligenceReport");
  });

  it("generateForensicDecisionReport is imported and used", () => {
    expect(reportDefsSource).toContain("generateForensicDecisionReport");
  });

  it("imports claimsIntelligenceReport module", () => {
    expect(reportDefsSource).toContain("claimsIntelligenceReport");
  });

  it("imports forensicDecisionReport module", () => {
    expect(reportDefsSource).toContain("forensicDecisionReport");
  });
});

// ─── 6. Column mapping — no banned column names in new generators ─────────────

describe("Column mapping — no banned column names in new generators", () => {
  const BANNED_COLUMNS = [
    "a.overall_fraud_score",
    "a.final_recommendation",
    "a.total_claimed_amount",
    "a.ai_recommended_settlement",
    "a.true_cost_estimate",
    "a.claim_quality_score",
    "c.psm_status",
    "c.date_of_loss",
    "c.policyholder_name",
    "c.policyholder_id",
    "c.claim_type",
    "a.triggered_by_admin",
    "a.pipeline_version",
    "a.assessment_date",
    "a.approved_amount",
  ];

  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  const cirSource = stripComments(
    fs.readFileSync(path.resolve(__dirname, "reporting/claimsIntelligenceReport.ts"), "utf-8")
  );
  const fdrSource = stripComments(
    fs.readFileSync(path.resolve(__dirname, "reporting/forensicDecisionReport.ts"), "utf-8")
  );

  for (const col of BANNED_COLUMNS) {
    const escapedCol = col.replace(/\./g, "\\.");
    const strictPattern = new RegExp(`${escapedCol}(?![_a-zA-Z0-9])`);

    it(`claimsIntelligenceReport.ts does not use banned column "${col}"`, () => {
      expect(strictPattern.exec(cirSource)).toBeNull();
    });

    it(`forensicDecisionReport.ts does not use banned column "${col}"`, () => {
      expect(strictPattern.exec(fdrSource)).toBeNull();
    });
  }
});

// ─── 7. HTML structure — Claims Intelligence Report generator ─────────────────

describe("claimsIntelligenceReport.ts — HTML structure", () => {
  const cirSource = fs.readFileSync(
    path.resolve(__dirname, "reporting/claimsIntelligenceReport.ts"),
    "utf-8"
  );

  it("exports generateClaimsIntelligenceReport function", () => {
    expect(cirSource).toContain("export async function generateClaimsIntelligenceReport");
  });

  it("includes §1 Claim Identity section", () => {
    expect(cirSource).toMatch(/§1|Claim Identity|Claim.*Vehicle/i);
  });

  it("includes §P Policy & Coverage section", () => {
    expect(cirSource).toMatch(/§P|Policy.*Coverage|Coverage Check/i);
  });

  it("includes §2 Cost Intelligence section", () => {
    expect(cirSource).toMatch(/§2|Cost Intelligence/i);
  });

  it("includes §3 Risk Indicators section", () => {
    expect(cirSource).toMatch(/§3|Risk Indicators/i);
  });

  it("includes §4 Evidence Snapshot section", () => {
    expect(cirSource).toMatch(/§4|Evidence Snapshot/i);
  });

  it("includes §5 Decision & Next Steps section", () => {
    expect(cirSource).toMatch(/§5|Decision.*Next Steps|Next Steps/i);
  });

  it("includes upgrade banner for forensic upsell", () => {
    expect(cirSource).toMatch(/upgrade|forensic.*tier|Forensic Claim Decision/i);
  });

  it("includes score strip or KPI band", () => {
    expect(cirSource).toMatch(/score-strip|kpi-band|kpi|score.*strip/i);
  });

  it("includes settlement position calculation", () => {
    expect(cirSource).toMatch(/settlement|recommended.*settlement|net.*payable/i);
  });

  it("includes timeline integrity table", () => {
    expect(cirSource).toMatch(/timeline|incident.*date|submission.*date|days.*submit/i);
  });

  it("reads claim data only through the canonical resolved report record", () => {
    expect(cirSource).toContain("resolveReportRecord({ claimId, tenantId");
    expect(cirSource).toContain("toReportDefinitionRow(record)");
    expect(cirSource).not.toMatch(/mysql2\/promise|createConnection|conn\.(execute|query)|\bSELECT\b/);
  });
});

// ─── 8. HTML structure — Forensic Claim Decision Report generator ─────────────

describe("forensicDecisionReport.ts — HTML structure", () => {
  const fdrSource = fs.readFileSync(
    path.resolve(__dirname, "reporting/forensicDecisionReport.ts"),
    "utf-8"
  );

  it("exports generateForensicDecisionReport function", () => {
    expect(fdrSource).toContain("export async function generateForensicDecisionReport");
  });

  it("includes cover with verdict bar", () => {
    expect(fdrSource).toMatch(/verdict|cover|KINGA.*Forensic|Forensic.*Decision/i);
  });

  it("includes critical flags section", () => {
    expect(fdrSource).toMatch(/critical.*flag|§F|impossibility|I2/i);
  });

  it("includes §1 Vehicle Identity section", () => {
    expect(fdrSource).toMatch(/§1|Vehicle Identity|Claim Identity/i);
  });

  it("includes §2 Physics & Incident Analysis section", () => {
    expect(fdrSource).toMatch(/§2|Physics|Incident Analysis/i);
  });

  it("includes SVG speed scale", () => {
    expect(fdrSource).toMatch(/speed.*scale|Delta-V|speed-track|<svg/i);
  });

  it("includes damage zone map SVG", () => {
    expect(fdrSource).toMatch(/damage.*zone|zone.*map|damage.*map/i);
  });

  it("includes speed estimation methods table", () => {
    expect(fdrSource).toMatch(/M1|Crush.*Depth|Energy.*Balance|speed.*method/i);
  });

  it("includes §3 Cost Intelligence section", () => {
    expect(fdrSource).toMatch(/§3|Cost Intelligence|Quote.*Comparison/i);
  });

  it("includes SVG speed bar chart or Chart.js visualisation", () => {
    // The forensic report uses pure SVG for speed charts (no CDN dependency, no render timing issues)
    expect(fdrSource).toMatch(/Chart\.js|chart\.js|new Chart|chartjs|<svg|viewBox/i);
  });

  it("includes §4 Photo Forensics section", () => {
    expect(fdrSource).toMatch(/§4|Photo.*Forensic|photo.*grid|Evidence.*Photo/i);
  });

  it("includes §5 Fraud Intelligence section", () => {
    expect(fdrSource).toMatch(/§5|Fraud.*Intelligence|fraud.*radar|fraud.*score/i);
  });

  it("includes §6 Decision & Approval Workflow section", () => {
    expect(fdrSource).toMatch(/§6|Decision.*Workflow|Approval.*Workflow|5.*stage/i);
  });

  it("includes §7 Quality & Validation section", () => {
    expect(fdrSource).toMatch(/§7|Quality|Validation|validation.*issue/i);
  });

  it("includes definitions appendix", () => {
    expect(fdrSource).toMatch(/§B|Definitions|Glossary|KINGA.*term/i);
  });

  it("reads forensic report data only through the tenant-scoped forensic model", () => {
    expect(fdrSource).toContain("resolveForensicReportModel({ claimId, tenantId, audience: \"forensic\" })");
    expect(fdrSource).toContain("toForensicLegacyRendererInputs(forensicModel)");
    expect(fdrSource).not.toMatch(/mysql2\/promise|createConnection|conn\.(execute|query)|\bSELECT\b/);
  });
});

// ─── 9. Design system — shared CSS tokens present ────────────────────────────

describe("kingaDesignSystem.ts — shared CSS design tokens", () => {
  const dsSource = fs.readFileSync(
    path.resolve(__dirname, "reporting/templates/kingaDesignSystem.ts"),
    "utf-8"
  );

  it("exports a KINGA CSS constant", () => {
    expect(dsSource).toMatch(/export.*const.*KINGA|export.*KINGA_CSS/i);
  });

  it("defines kinga green colour token", () => {
    expect(dsSource).toMatch(/#15803d|#22c55e|kinga.*green|--kinga/i);
  });

  it("defines section heading styles", () => {
    expect(dsSource).toMatch(/section.*heading|\.sh\b|section-heading/i);
  });

  it("defines KPI band styles", () => {
    expect(dsSource).toMatch(/kpi.*band|\.kpi\b|kpi-band/i);
  });

  it("defines finding card styles", () => {
    expect(dsSource).toMatch(/finding.*card|\.fc\b|alert.*card/i);
  });

  it("defines running header or footer styles", () => {
    expect(dsSource).toMatch(/running.*header|page.*header|\.rh\b/i);
  });
});

// ─── 10. UI — ClaimsManagerReportsCentre includes both reports correctly ──────

describe("ClaimsManagerReportsCentre.tsx — report entries", () => {
  const uiSource = fs.readFileSync(
    path.resolve(__dirname, "../client/src/components/ClaimsManagerReportsCentre.tsx"),
    "utf-8"
  );

  it("includes claim.intelligence in the report list", () => {
    expect(uiSource).toContain('"claim.intelligence"');
  });

  it("includes claim.forensic in the report list (canonical key for Forensic Claim Decision Report)", () => {
    expect(uiSource).toContain('"claim.forensic"');
  });

  it("claim.forensic_decision is NOT in the UI (removed — claim.forensic is canonical)", () => {
    expect(uiSource).not.toContain('"claim.forensic_decision"');
  });

  it("Claims Intelligence Report has a human-readable label", () => {
    expect(uiSource).toContain("Claims Intelligence Report");
  });

  it("Forensic Claim Decision Report has a human-readable label on claim.forensic entry", () => {
    expect(uiSource).toContain("Forensic Claim Decision Report");
  });

  it("claim.intelligence is in the Claim-Level category", () => {
    const cirMatch = uiSource.match(/claim\.intelligence[\s\S]{0,300}category:\s*["']([^"']+)["']/);
    expect(cirMatch?.[1]).toBe("Claim-Level");
  });

  it("claim.forensic is in the Claim-Level category", () => {
    const fdrMatch = uiSource.match(/claim\.forensic[^_][\s\S]{0,300}category:\s*["']([^"']+)["']/);
    expect(fdrMatch?.[1]).toBe("Claim-Level");
  });
});
