/**
 * Claims Manager Reports Centre
 *
 * Surfaces all 14 authorised reports grouped by category.
 * Redesign: removed `truncate` on labels/descriptions, switched to 2-column
 * grid (was 3-column), descriptions now wrap naturally with line-clamp-2.
 */
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
  // Per-claim reports
  {
    reportKey: "claim.assessment",
    label: "Assessment Report",
    description: "Full KINGA assessment for a specific claim",
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
    reportKey: "claim.intelligence",
    label: "Claims Intelligence Report",
    description: "Process-tier: cost intelligence, risk indicators, evidence snapshot, and decision actions",
    icon: FileText,
    category: "Claim-Level",
  },
  {
    reportKey: "claim.forensic",
    label: "Forensic Claim Decision Report",
    description: "Full physics reconstruction, damage zone map, fraud radar, and 5-stage approval workflow",
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
  // Claims-management portfolio report
  {
    reportKey: "claims_manager.portfolio_overview",
    label: "Claims Manager Portfolio",
    description: "Claims totals, processing status, value, and operational ageing",
    icon: TrendingUp,
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

const CATEGORY_COLORS: Record<string, string> = {
  "Claim-Level": "text-teal-700 dark:text-teal-400",
  Portfolio: "text-blue-700 dark:text-blue-400",
  Trend: "text-purple-700 dark:text-purple-400",
  Recovery: "text-amber-700 dark:text-amber-400",
};

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
        <div className="space-y-5">
          {grouped.map(({ category, reports }) => (
            <div key={category}>
              {/* Category header */}
              <div className="flex items-center gap-2 mb-2">
                <p
                  className={`text-xs font-semibold uppercase tracking-wide ${
                    CATEGORY_COLORS[category] ?? "text-muted-foreground"
                  }`}
                >
                  {category}
                </p>
                <span className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">{reports.length}</span>
              </div>

              {/* 2-column grid — wide enough for full labels */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {reports.map((report) => {
                  const Icon = report.icon;
                  return (
                    <div
                      key={report.reportKey}
                      className="flex items-start gap-2.5 p-3 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors"
                    >
                      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        {/* Label — no truncate, wraps naturally */}
                        <p className="text-xs font-medium leading-snug text-foreground">
                          {report.label}
                        </p>
                        {/* Description — line-clamp-2 allows 2 lines */}
                        <p className="text-xs text-muted-foreground leading-relaxed mt-0.5 line-clamp-2">
                          {report.description}
                        </p>
                      </div>
                      <KingaReportButton
                        reportKey={report.reportKey}
                        label="Export"
                        size="sm"
                        variant="outline"
                        className="shrink-0 text-xs h-6 px-2 mt-0.5"
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
