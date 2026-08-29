/**
 * Unit tests for REPORT_ACCESS role-based access control
 * Tests that each role sees exactly the reports they should — no more, no less.
 */
import { describe, it, expect } from "vitest";
import { REPORT_ACCESS } from "./reporting/reportDefinitions";

// Mirror of canAccessReport from reporting.ts
function canAccessReport(reportKey: string, userRole: string, insurerRole?: string | null): boolean {
  const allowed = REPORT_ACCESS[reportKey];
  if (!allowed) return false;
  if (userRole === "admin") return allowed.includes("admin");
  if (insurerRole) return allowed.includes(insurerRole);
  return allowed.includes(userRole);
}

const ALL_REPORT_KEYS = Object.keys(REPORT_ACCESS);

// Helper: get all reports accessible to a role
function reportsFor(userRole: string, insurerRole?: string | null): string[] {
  return ALL_REPORT_KEYS.filter((k) => canAccessReport(k, userRole, insurerRole));
}

describe("REPORT_ACCESS — role-based access control", () => {

  // ── Claims Processor ──────────────────────────────────────────────────────
  describe("claims_processor", () => {
    const reports = reportsFor("insurer", "claims_processor");

    it("can access individual claim reports", () => {
      expect(reports).toContain("claim.assessment");
      expect(reports).toContain("claim.cost_comparison");
      expect(reports).toContain("claim.repair_decision");
      expect(reports).toContain("claim.forensic");
      expect(reports).toContain("claim.audit_trail");
    });

    it("can access assessor performance report (for export/view)", () => {
      expect(reports).toContain("portfolio.assessor_performance");
    });

    it("cannot access portfolio-level reports", () => {
      expect(reports).not.toContain("portfolio.claims_summary");
      expect(reports).not.toContain("portfolio.dwell_time");
      expect(reports).not.toContain("portfolio.panel_beater_performance");
      expect(reports).not.toContain("portfolio.fraud_summary");
      expect(reports).not.toContain("risk_manager_portfolio");
    });

    it("cannot access executive reports", () => {
      expect(reports).not.toContain("executive.insurer_summary");
      expect(reports).not.toContain("executive.claims_trend");
      expect(reports).not.toContain("executive.financial_exposure");
    });

    it("cannot access platform admin reports", () => {
      expect(reports).not.toContain("executive.platform_dashboard");
      expect(reports).not.toContain("executive.cross_insurer_fraud");
      expect(reports).not.toContain("executive.ml_performance");
    });

    it("cannot access governance reports", () => {
      expect(reports).not.toContain("governance.sar");
      expect(reports).not.toContain("governance.regulatory_compliance");
      expect(reports).not.toContain("governance.data_retention");
    });

    it("cannot access assessor or panel beater reports", () => {
      expect(reports).not.toContain("assessor.my_assignments");
      expect(reports).not.toContain("assessor.performance_summary");
      expect(reports).not.toContain("panel_beater.quote_history");
      expect(reports).not.toContain("panel_beater.job_completion");
    });
  });

  // ── Claims Manager ────────────────────────────────────────────────────────
  describe("claims_manager", () => {
    const reports = reportsFor("insurer", "claims_manager");

    it("can access all individual claim reports", () => {
      expect(reports).toContain("claim.assessment");
      expect(reports).toContain("claim.cost_comparison");
      expect(reports).toContain("claim.repair_decision");
      expect(reports).toContain("claim.forensic");
      expect(reports).toContain("claim.audit_trail");
    });

    it("can access portfolio reports", () => {
      expect(reports).toContain("portfolio.claims_summary");
      expect(reports).toContain("portfolio.dwell_time");
      expect(reports).toContain("portfolio.panel_beater_performance");
      expect(reports).toContain("portfolio.fraud_summary");
      expect(reports).toContain("portfolio.assessor_performance");
      expect(reports).toContain("risk_manager_portfolio");
      expect(reports).toContain("claims_manager.portfolio_overview");
      expect(reports).not.toContain("risk_manager.portfolio_overview");
    });

    it("cannot access retired executive reports", () => {
      expect(reports).not.toContain("executive.claims_trend");
      expect(reports).not.toContain("executive.financial_exposure");
    });

    it("cannot access insurer executive summary (executive only)", () => {
      expect(reports).not.toContain("executive.insurer_summary");
      expect(reports).not.toContain("executive.portfolio_overview");
    });

    it("cannot access platform admin reports", () => {
      expect(reports).not.toContain("executive.platform_dashboard");
      expect(reports).not.toContain("executive.cross_insurer_fraud");
      expect(reports).not.toContain("executive.ml_performance");
    });

  });
  // ── Risk Managerr ──────────────────────────────────────────────────────────
  describe("risk_manager", () => {
    const reports = reportsFor("insurer", "risk_manager");

    it("can access forensic and audit trail", () => {
      expect(reports).toContain("claim.forensic");
      expect(reports).toContain("claim.audit_trail");
    });

    it("can access portfolio and fraud reports", () => {
      expect(reports).toContain("portfolio.claims_summary");
      expect(reports).toContain("portfolio.dwell_time");
      expect(reports).toContain("portfolio.panel_beater_performance");
      expect(reports).toContain("portfolio.fraud_summary");
      expect(reports).toContain("portfolio.assessor_performance");
      expect(reports).toContain("risk_manager_portfolio");
      expect(reports).toContain("risk_manager.portfolio_overview");
      expect(reports).not.toContain("claims_manager.portfolio_overview");
    });

    it("cannot access retired executive reports", () => {
      expect(reports).not.toContain("executive.claims_trend");
      expect(reports).not.toContain("executive.financial_exposure");
      expect(reports).not.toContain("executive.portfolio_overview");
    });

    it("cannot access individual claim working documents (cost comparison, repair decision)", () => {
      expect(reports).not.toContain("claim.cost_comparison");
      expect(reports).not.toContain("claim.repair_decision");
      expect(reports).not.toContain("claim.assessment");
    });

    it("cannot access platform admin reports", () => {
      expect(reports).not.toContain("executive.platform_dashboard");
      expect(reports).not.toContain("executive.cross_insurer_fraud");
    });
  });

  // ── Executive ─────────────────────────────────────────────────────────────
  describe("executive", () => {
    const reports = reportsFor("insurer", "executive");

    it("can access executive KPI reports", () => {
      expect(reports).toContain("executive.portfolio_overview");
      expect(reports).not.toContain("executive.insurer_summary");
      expect(reports).not.toContain("executive.claims_trend");
      expect(reports).not.toContain("executive.financial_exposure");
    });

    it("can access portfolio claims summary", () => {
      expect(reports).toContain("portfolio.claims_summary");
      expect(reports).not.toContain("claims_manager.portfolio_overview");
      expect(reports).not.toContain("risk_manager.portfolio_overview");
    });

    it("can access regulatory compliance", () => {
      expect(reports).toContain("governance.regulatory_compliance");
    });

    it("cannot access individual claim reports", () => {
      expect(reports).not.toContain("claim.assessment");
      expect(reports).not.toContain("claim.forensic");
      expect(reports).not.toContain("claim.cost_comparison");
    });

    it("cannot access platform admin reports", () => {
      expect(reports).not.toContain("executive.platform_dashboard");
      expect(reports).not.toContain("executive.cross_insurer_fraud");
      expect(reports).not.toContain("executive.ml_performance");
    });

    it("cannot access governance SAR or data retention", () => {
      expect(reports).not.toContain("governance.sar");
      expect(reports).not.toContain("governance.data_retention");
    });
  });

  // ── Governance Officer (REMOVED — reports reassigned to claims_manager) ──────
  describe("governance_officer (deprecated role — no access)", () => {
    const reports = reportsFor("insurer", "governance_officer");
    it("returns empty list (role removed from REPORT_ACCESS)", () => {
      expect(reports).toHaveLength(0);
    });
  });
  // ── Claims Manager gets governance reports ────────────────────────────────────────────
  describe("claims_manager — governance report access", () => {
    const reports = reportsFor("insurer", "claims_manager");
    it("can access governance SAR, compliance, and data retention", () => {
      expect(reports).toContain("governance.sar");
      expect(reports).toContain("governance.regulatory_compliance");
      expect(reports).toContain("governance.data_retention");
    });
    it("can access audit trail", () => {
      expect(reports).toContain("claim.audit_trail");
    });
  });
    // ── Insurer Admin ─────────────────────────────────────────────────────────
  describe("insurer_admin", () => {
    const reports = reportsFor("insurer", "insurer_admin");

    it("can access all insurer reports", () => {
      // Exclude reports that are restricted to non-insurer domains (e.g. agency-only or engineer-only reports)
      // Agency reports (T7+T8) are intentionally not accessible to insurer_admin.
      // Engineer reports (Epic 3) are restricted to engineer/admin/platform_super_admin only.
      const AGENCY_ONLY_REPORTS = [
        "agency.vehicle_verification",
        "agency.vehicle_valuation",
        "engineer.inspection_report",
        "engineer.risk_survey",
      ];
      const insurerReports = ALL_REPORT_KEYS.filter(
        (k) =>
          !REPORT_ACCESS[k].every((r) => r === "admin") &&
          !AGENCY_ONLY_REPORTS.includes(k)
      );
      for (const key of insurerReports) {
        expect(reports).toContain(key);
      }
    });

    it("cannot access platform admin reports", () => {
      expect(reports).not.toContain("executive.platform_dashboard");
      expect(reports).not.toContain("executive.cross_insurer_fraud");
      expect(reports).not.toContain("executive.ml_performance");
    });
  });

  // ── Platform Admin ────────────────────────────────────────────────────────
  describe("admin (platform super-admin)", () => {
    const reports = reportsFor("admin", null);

    it("can access platform admin reports", () => {
      expect(reports).toContain("executive.platform_dashboard");
      expect(reports).toContain("executive.cross_insurer_fraud");
      expect(reports).toContain("executive.ml_performance");
    });

    it("cannot access insurer-specific reports (strict separation)", () => {
      expect(reports).not.toContain("claim.assessment");
      expect(reports).not.toContain("portfolio.fraud_summary");
      expect(reports).not.toContain("governance.sar");
      expect(reports).not.toContain("assessor.my_assignments");
    });
  });

  // ── Assessor Internal ─────────────────────────────────────────────────────
  describe("assessor_internal", () => {
    const reports = reportsFor("insurer", "assessor_internal");

    it("can access claim assessment and own assignment/performance reports", () => {
      expect(reports).toContain("claim.assessment");
      expect(reports).toContain("assessor.my_assignments");
      expect(reports).toContain("assessor.performance_summary");
    });

    it("cannot access portfolio or executive reports", () => {
      expect(reports).not.toContain("portfolio.fraud_summary");
      expect(reports).not.toContain("executive.insurer_summary");
      expect(reports).not.toContain("executive.platform_dashboard");
    });
  });

  // ── Assessor External ─────────────────────────────────────────────────────
  describe("assessor_external", () => {
    const reports = reportsFor("insurer", "assessor_external");

    it("can access claim assessment and own assignments", () => {
      expect(reports).toContain("claim.assessment");
      expect(reports).toContain("assessor.my_assignments");
    });

    it("cannot access performance summary (internal only)", () => {
      expect(reports).not.toContain("assessor.performance_summary");
    });

    it("cannot access portfolio or executive reports", () => {
      expect(reports).not.toContain("portfolio.fraud_summary");
      expect(reports).not.toContain("executive.insurer_summary");
    });
  });

  // ── Panel Beater ──────────────────────────────────────────────────────────
  describe("panel_beater (top-level role)", () => {
    const reports = reportsFor("panel_beater", null);

    it("can access panel beater reports only", () => {
      expect(reports).toContain("panel_beater.quote_history");
      expect(reports).toContain("panel_beater.job_completion");
    });

    it("cannot access any insurer reports", () => {
      expect(reports).not.toContain("claim.assessment");
      expect(reports).not.toContain("portfolio.fraud_summary");
      expect(reports).not.toContain("executive.insurer_summary");
    });
  });
});
