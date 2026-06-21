import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KingaReportButton } from "@/components/KingaReportButton";
import { FileText, BarChart2, Shield, TrendingUp, Users, Wrench, Scale } from "lucide-react";

interface ReportEntry {
  reportKey: string;
  label: string;
  description: string;
  icon: React.ElementType;
  category: string;
  params?: Record<string, unknown>;
}

const CLAIMS_MANAGER_REPORTS: ReportEntry[] = [
  // Per-claim reports (shown in review queue; also listed here for ad-hoc access)
  {
    reportKey: "claim.assessment",
    label: "Assessment Report",
    description: "Full AI assessment for a specific claim",
    icon: FileText,
    category: "Claim-Level",
  },
  {
    reportKey: "claim.cost_comparison",
    label: "Cost Comparison",
    description: "Repair vs replace cost analysis",
    icon: Scale,
    category: "Claim-Level",
  },
  {
    reportKey: "claim.repair_decision",
    label: "Repair Decision",
    description: "Panel beater repair decision report",
    icon: Wrench,
    category: "Claim-Level",
  },
  {
    reportKey: "claim.forensic",
    label: "Forensic Report",
    description: "Fraud and integrity forensic analysis",
    icon: Shield,
    category: "Claim-Level",
  },
  {
    reportKey: "claim.audit_trail",
    label: "Claim Audit Trail",
    description: "Full workflow history and decision log",
    icon: FileText,
    category: "Claim-Level",
  },
  // Portfolio reports
  {
    reportKey: "portfolio.claims_summary",
    label: "Claims Summary",
    description: "Portfolio-wide claims overview",
    icon: BarChart2,
    category: "Portfolio",
  },
  {
    reportKey: "portfolio.dwell_time",
    label: "Dwell Time Report",
    description: "Processing time per workflow stage",
    icon: TrendingUp,
    category: "Portfolio",
  },
  {
    reportKey: "portfolio.panel_beater_performance",
    label: "Panel Beater Performance",
    description: "Repair network quality and cost analysis",
    icon: Wrench,
    category: "Portfolio",
  },
  {
    reportKey: "portfolio.fraud_summary",
    label: "Fraud Summary",
    description: "Portfolio fraud risk distribution",
    icon: Shield,
    category: "Portfolio",
  },
  {
    reportKey: "portfolio.assessor_performance",
    label: "Assessor Performance",
    description: "Assessor accuracy and throughput metrics",
    icon: Users,
    category: "Portfolio",
  },
  // Executive / trend reports
  {
    reportKey: "executive.claims_trend",
    label: "Claims Trend",
    description: "Monthly claim volume and value trends",
    icon: TrendingUp,
    category: "Trend",
  },
  {
    reportKey: "executive.financial_exposure",
    label: "Financial Exposure",
    description: "Outstanding liability and reserve analysis",
    icon: BarChart2,
    category: "Trend",
  },
  // Recovery
  {
    reportKey: "recovery.case_summary",
    label: "Recovery Case Summary",
    description: "Third-party recovery portfolio overview",
    icon: TrendingUp,
    category: "Recovery",
  },
  // Portfolio intelligence
  {
    reportKey: "risk_manager_portfolio",
    label: "Portfolio Intelligence",
    description: "Cross-portfolio risk and performance intelligence",
    icon: BarChart2,
    category: "Portfolio",
  },
];

const CATEGORIES = ["Claim-Level", "Portfolio", "Trend", "Recovery"];

export function ClaimsManagerReportsCentre() {
  const grouped = CATEGORIES.map((cat) => ({
    category: cat,
    reports: CLAIMS_MANAGER_REPORTS.filter((r) => r.category === cat),
  }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <FileText className="h-4 w-4 text-teal-600" />
          Reports Centre
          <Badge className="ml-auto bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300 text-xs">
            {CLAIMS_MANAGER_REPORTS.length} reports
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-4">
          {grouped.map(({ category, reports }) => (
            <div key={category}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {category}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {reports.map((report) => {
                  const Icon = report.icon;
                  return (
                    <div
                      key={report.reportKey}
                      className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors"
                    >
                      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{report.label}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {report.description}
                        </p>
                      </div>
                      <KingaReportButton
                        reportKey={report.reportKey}
                        label="Export"
                        size="sm"
                        variant="outline"
                        className="shrink-0 text-xs h-6 px-2"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
