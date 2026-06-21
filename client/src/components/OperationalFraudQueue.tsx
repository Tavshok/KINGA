/**
 * Operational Fraud Queue
 *
 * Replaces the flat fraud alert list in the Fraud Alerts tab.
 * Groups getFraudAlerts data into four actionable categories:
 *   1. Critical Risk  — fraudRiskLevel === "critical"
 *   2. High Value     — totalClaimAmount > 500,000 cents (R5,000)
 *   3. Pending Investigation — workflowState === "fraud_investigation"
 *   4. Escalated      — workflowState === "disputed" | "manual_review"
 */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle, DollarSign, ShieldAlert, Search, Gavel, Eye, Loader2,
} from "lucide-react";

interface FraudClaim {
  id: number;
  claimNumber?: string | null;
  claimantName?: string | null;
  fraudRiskLevel?: string | null;
  fraudRiskScore?: number | null;
  totalClaimAmount?: number | null;
  estimatedClaimValue?: number | null;
  workflowState?: string | null;
  status?: string | null;
  currencyCode?: string | null;
}

interface OperationalFraudQueueProps {
  claims: FraudClaim[];
  loading: boolean;
  onEscalate: (claim: FraudClaim) => void;
  onReview: (claim: FraudClaim) => void;
}

function fmtAmt(cents: number | null | undefined, currency = "ZAR"): string {
  if (!cents) return "—";
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

const HIGH_VALUE_THRESHOLD = 500_000; // R5,000 in cents

interface FraudCategory {
  key: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  badgeVariant: "destructive" | "secondary" | "outline";
  claims: FraudClaim[];
}

export function OperationalFraudQueue({
  claims, loading, onEscalate, onReview,
}: OperationalFraudQueueProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading fraud queue...</span>
      </div>
    );
  }

  const categories: FraudCategory[] = [
    {
      key: "critical_risk",
      label: "Critical Risk",
      description: "fraudRiskLevel = critical",
      icon: <ShieldAlert className="h-4 w-4" />,
      colorClass: "text-red-700 dark:text-red-400",
      bgClass: "bg-red-50 dark:bg-red-950/30",
      borderClass: "border-red-200 dark:border-red-800",
      badgeVariant: "destructive",
      claims: claims.filter(c => c.fraudRiskLevel === "critical"),
    },
    {
      key: "high_value",
      label: "High Value",
      description: `Claim value > ${fmtAmt(HIGH_VALUE_THRESHOLD)}`,
      icon: <DollarSign className="h-4 w-4" />,
      colorClass: "text-orange-700 dark:text-orange-400",
      bgClass: "bg-orange-50 dark:bg-orange-950/30",
      borderClass: "border-orange-200 dark:border-orange-800",
      badgeVariant: "destructive",
      claims: claims.filter(
        c => (c.totalClaimAmount ?? c.estimatedClaimValue ?? 0) > HIGH_VALUE_THRESHOLD,
      ),
    },
    {
      key: "pending_investigation",
      label: "Pending Investigation",
      description: "workflowState = fraud_investigation",
      icon: <Search className="h-4 w-4" />,
      colorClass: "text-amber-700 dark:text-amber-400",
      bgClass: "bg-amber-50 dark:bg-amber-950/30",
      borderClass: "border-amber-200 dark:border-amber-800",
      badgeVariant: "secondary",
      claims: claims.filter(c => c.workflowState === "fraud_investigation"),
    },
    {
      key: "escalated",
      label: "Escalated",
      description: "workflowState = disputed | manual_review",
      icon: <Gavel className="h-4 w-4" />,
      colorClass: "text-purple-700 dark:text-purple-400",
      bgClass: "bg-purple-50 dark:bg-purple-950/30",
      borderClass: "border-purple-200 dark:border-purple-800",
      badgeVariant: "outline",
      claims: claims.filter(
        c => c.workflowState === "disputed" || c.workflowState === "manual_review",
      ),
    },
  ];

  const categorisedIds = new Set(categories.flatMap(cat => cat.claims.map(c => c.id)));
  const uncategorised = claims.filter(c => !categorisedIds.has(c.id));

  return (
    <div className="space-y-4">
      {/* 2×2 category grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {categories.map(cat => (
          <div
            key={cat.key}
            className={`rounded-lg border p-4 ${cat.bgClass} ${cat.borderClass}`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className={cat.colorClass}>{cat.icon}</span>
                <span className={`text-sm font-semibold ${cat.colorClass}`}>{cat.label}</span>
              </div>
              <Badge variant={cat.badgeVariant} className="text-xs">{cat.claims.length}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-3">{cat.description}</p>

            {cat.claims.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No claims in this category</p>
            ) : (
              <div className="space-y-1.5">
                {cat.claims.slice(0, 3).map(claim => (
                  <div
                    key={claim.id}
                    className="flex items-center justify-between bg-white/60 dark:bg-black/20 rounded px-2 py-1.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">
                        {claim.claimNumber ?? `#${claim.id}`}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {claim.claimantName ?? "Unknown"} ·{" "}
                        <span className="text-red-600 font-medium">
                          {claim.fraudRiskScore ?? "?"}/100
                        </span>
                        {(claim.totalClaimAmount ?? claim.estimatedClaimValue) != null && (
                          <> · {fmtAmt(claim.totalClaimAmount ?? claim.estimatedClaimValue, claim.currencyCode ?? "ZAR")}</>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-1 ml-2 flex-shrink-0">
                      <Button
                        size="sm" variant="ghost" className="h-6 w-6 p-0"
                        title="Review claim" onClick={() => onReview(claim)}
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        className="h-6 w-6 p-0 text-red-600 hover:text-red-700"
                        title="Escalate claim" onClick={() => onEscalate(claim)}
                      >
                        <AlertTriangle className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
                {cat.claims.length > 3 && (
                  <p className="text-xs text-muted-foreground text-center pt-1">
                    +{cat.claims.length - 3} more in this category
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Uncategorised overflow */}
      {uncategorised.length > 0 && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-900/30">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            <AlertTriangle className="h-3 w-3 inline mr-1" />
            {uncategorised.length} additional elevated-risk claim{uncategorised.length !== 1 ? "s" : ""} (score &gt; 70, not yet categorised)
          </p>
          <div className="space-y-1">
            {uncategorised.slice(0, 5).map(claim => (
              <div key={claim.id} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground truncate">
                  {claim.claimNumber ?? `#${claim.id}`} · {claim.claimantName ?? "Unknown"} · Score: {claim.fraudRiskScore ?? "?"}/100
                </span>
                <div className="flex gap-1 flex-shrink-0 ml-2">
                  <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => onReview(claim)}>
                    <Eye className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-red-600" onClick={() => onEscalate(claim)}>
                    <AlertTriangle className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {claims.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <ShieldAlert className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No fraud alerts — all claims within acceptable risk thresholds</p>
        </div>
      )}

      {claims.length > 0 && (
        <p className="text-xs text-muted-foreground text-right pt-1">
          {categorisedIds.size} of {claims.length} claims categorised · sorted by risk score
        </p>
      )}
    </div>
  );
}
