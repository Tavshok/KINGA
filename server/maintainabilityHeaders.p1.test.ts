import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const highPriorityFiles = [
  "server/db.ts",
  "server/routers/assessor-onboarding.ts",
  "server/routers/agency-insurance-service.ts",
  "client/src/pages/ClaimsProcessorDashboard.tsx",
  "client/src/pages/SubmitClaim.tsx",
  "client/src/pages/KingaAgency.tsx",
  "client/src/pages/AssessmentResults.tsx",
  "client/src/pages/HistoricalClaimsPipeline.tsx",
  "client/src/pages/ReportsCentre.tsx",
  "client/src/pages/FleetManagement.tsx",
  "client/src/pages/RiskManagerDashboard.tsx",
  "client/src/pages/AssessorClaimDetails.tsx",
  "client/src/pages/ExternalAssessorDashboard.tsx",
  "client/src/pages/ClaimantDashboard.tsx",
  "client/src/pages/InsurerClaimsTriage.tsx",
  "client/src/pages/RelationshipIntelligence.tsx",
  "client/src/pages/AdminDashboard.tsx",
  "client/src/pages/PanelBeaterDashboard.tsx",
  "client/src/pages/ValuationRequestPage.tsx",
  "client/src/pages/InsurerQuoteComparison.tsx",
  "client/src/pages/AdminTierManagement.tsx",
  "client/src/pages/AssessorPerformanceDashboard.tsx",
  "client/src/pages/ClientProfile.tsx",
  "client/src/pages/JoinAsAssessor.tsx",
  "client/src/pages/AgencyValuationInbox.tsx",
  "client/src/pages/BatchExport.tsx",
  "client/src/pages/AddAssessor.tsx",
  "client/src/pages/PortalSelection.tsx",
  "client/src/pages/PanelBeaterPerformance.tsx",
  "client/src/pages/PortalHub.tsx",
  "client/src/pages/InsurerRoleSelection.tsx",
  "client/src/pages/admin/TenantManagement.tsx",
  "client/src/pages/AssignAssessor.tsx",
  "client/src/pages/FleetDriverDashboard.tsx",
  "client/src/components/ClaimReviewDialog.tsx",
  "client/src/components/EnhancedDocumentUpload.tsx",
  "client/src/components/InsurerHistoricalClaims.tsx",
  "client/src/components/ExecutiveSummary.tsx",
  "client/src/components/PanelBeaterQuoteForm.tsx",
  "client/src/components/DashboardLayout.tsx",
  "client/src/components/PoliceReportForm.tsx",
  "client/src/components/CostBreakdownChart.tsx",
  "client/src/components/CrossValidationPanel.tsx",
  "client/src/components/QuoteComparison.tsx",
  "client/src/components/IntakeQueueTab.tsx",
  "client/src/components/executive/ExecutiveReportTab.tsx",
  "client/src/components/ui/sidebar.tsx",
  "client/src/components/ui/dropdown-menu.tsx",
  "client/src/pages/processor/UploadDocuments.tsx",
  "client/src/pages/AssessorLeaderboard.tsx",
] as const;

describe("Phase 1 maintainability headers", () => {
  it("keeps the 50 high-priority file contracts explicit", () => {
    expect(highPriorityFiles).toHaveLength(50);
    for (const file of highPriorityFiles) {
      const source = fs.readFileSync(path.join(root, file), "utf8");
      expect(source).toMatch(/^\/\*\*\n \* PURPOSE: .+\n \* PRIMARY CALLERS: .+\n \* NEVER: .+\n \*\/\n/s);
    }
  });
});
