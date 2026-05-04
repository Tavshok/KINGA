/**
 * ReportsBadgeWidget
 *
 * A compact KPI card that shows the number of reports available to the current
 * user and links directly to the Reports Centre. Designed to be dropped into
 * any dashboard's KPI grid without disrupting the existing layout.
 *
 * Usage:
 *   import ReportsBadgeWidget from "@/components/ReportsBadgeWidget";
 *   <ReportsBadgeWidget />
 */
import { useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { FileBarChart } from "lucide-react";

interface ReportsBadgeWidgetProps {
  /** Optional CSS class overrides for the outer Card */
  className?: string;
  /** If true, renders as a compact inline chip instead of a full card */
  compact?: boolean;
}

export default function ReportsBadgeWidget({ className = "", compact = false }: ReportsBadgeWidgetProps) {
  const [, navigate] = useLocation();
  const { data: catalogue, isLoading } = trpc.reportingEngine.getCatalogue.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // catalogue rarely changes mid-session
    retry: false,
  });

  const count = catalogue?.length ?? 0;

  const handleClick = useCallback(() => {
    navigate("/insurer-portal/reports-centre");
  }, [navigate]);

  if (compact) {
    return (
      <button
        onClick={handleClick}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-xs font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
      >
        <FileBarChart className="h-3.5 w-3.5" />
        {isLoading ? "…" : `${count} Report${count !== 1 ? "s" : ""} Available`}
      </button>
    );
  }

  return (
    <Card
      onClick={handleClick}
      className={`cursor-pointer bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors ${className}`}
    >
      <CardContent className="p-4 text-center">
        <div className="flex justify-center mb-1">
          <FileBarChart className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />
        </div>
        <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">
          {isLoading ? "…" : count}
        </p>
        <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">Reports Available</p>
      </CardContent>
    </Card>
  );
}
