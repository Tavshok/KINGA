/**
 * ClaimsManagerCommandCentre
 *
 * Wrapper component that renders all five command centre rows and the
 * Reports Centre for the Claims Manager Dashboard.
 *
 * Extracted from ClaimsManagerDashboard.tsx for maintainability.
 * Each row is self-contained and fetches its own data via tRPC.
 *
 * Row 1 — Queue Health Matrix
 * Row 2 — Attention Required + Escalation Centre
 * Row 3 — Approval Workbench + Capacity Forecast
 * Row 4 — Workforce Intelligence
 * Row 5 — Recovery Watchlist + Send-Back Analytics
 * Reports Centre
 */
import { QueueHealthMatrix } from "@/components/QueueHealthMatrix";
import { AttentionRequiredPanel } from "@/components/AttentionRequiredPanel";
import { EscalationCentre } from "@/components/EscalationCentre";
import { ApprovalWorkbench } from "@/components/ApprovalWorkbench";
import { CapacityForecast } from "@/components/CapacityForecast";
import { WorkforceIntelligence } from "@/components/WorkforceIntelligence";
import { RecoveryWatchlist } from "@/components/RecoveryWatchlist";
import { SendBackAnalytics } from "@/components/SendBackAnalytics";
import { ClaimsManagerReportsCentre } from "@/components/ClaimsManagerReportsCentre";

export function ClaimsManagerCommandCentre() {
  return (
    <div className="space-y-4">
      {/* Row 1 — Queue Health Matrix */}
      <QueueHealthMatrix />

      {/* Row 2 — Attention Required + Escalation Centre */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AttentionRequiredPanel />
        <EscalationCentre />
      </div>

      {/* Row 3 — Approval Workbench + Capacity Forecast */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ApprovalWorkbench />
        <CapacityForecast />
      </div>

      {/* Row 4 — Workforce Intelligence */}
      <WorkforceIntelligence />

      {/* Row 5 — Recovery Watchlist + Send-Back Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <RecoveryWatchlist />
        </div>
        <SendBackAnalytics />
      </div>

      {/* Reports Centre */}
      <ClaimsManagerReportsCentre />
    </div>
  );
}
