/**
 * AssessorSubscriptionBanner
 *
 * Displays the assessor's current tier, monthly usage, and remaining assignments.
 * For free-tier assessors, shows an upgrade call-to-action placeholder.
 *
 * Usage: render at the top of the AssessorDashboard or AssessorProfile page.
 *
 * Design intent:
 *   - Informative, not intrusive.
 *   - Free tier shows a soft amber warning when ≤ 3 assignments remain.
 *   - Cap-reached state shows a red blocking banner.
 *   - Pro tier shows a clean green confirmation badge.
 *   - Upgrade button is a placeholder (toast) — wired to payment flow later.
 */

import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Loader2, Zap, CheckCircle2, AlertTriangle, Lock } from "lucide-react";

export function AssessorSubscriptionBanner() {
  const { data: status, isLoading } = trpc.assessorSubscription.getMyStatus.useQuery(undefined, {
    staleTime: 60_000, // refresh every minute
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground px-4 py-2 rounded-lg bg-muted/30 border mb-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading subscription status…
      </div>
    );
  }

  if (!status) return null;

  const { tier, usedThisMonth, maxClaimsPerMonth, remaining, upgradeAvailable, isExpired } = status;
  const usagePct = Math.min(100, Math.round((usedThisMonth / maxClaimsPerMonth) * 100));
  const isCapReached = remaining === 0 && tier === "free";
  const isLow = remaining <= 3 && remaining > 0 && tier === "free";

  // ── Pro tier ────────────────────────────────────────────────────────────────
  if (tier === "pro" && !isExpired) {
    return (
      <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-green-50 border border-green-200 mb-4">
        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-green-800">Pro Plan</span>
          <span className="text-xs text-green-600 ml-2">Unlimited assignments this month</span>
        </div>
        <Badge className="bg-green-600 text-white text-xs">PRO</Badge>
      </div>
    );
  }

  // ── Free tier — cap reached ──────────────────────────────────────────────────
  if (isCapReached) {
    return (
      <div className="rounded-lg bg-red-50 border-2 border-red-300 px-4 py-3 mb-4">
        <div className="flex items-start gap-3">
          <Lock className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-800">
              Monthly assignment cap reached ({maxClaimsPerMonth}/{maxClaimsPerMonth})
            </p>
            <p className="text-xs text-red-600 mt-0.5">
              You have used all {maxClaimsPerMonth} free assignments for this month.
              Upgrade to Pro for unlimited assignments.
            </p>
            <Button
              size="sm"
              className="mt-2 gap-2 bg-red-600 hover:bg-red-700 text-white"
              onClick={() => toast.info("Upgrade to Pro — contact your platform administrator or visit the billing portal.", { duration: 6000 })}
            >
              <Zap className="h-4 w-4" />
              Upgrade to Pro
            </Button>
          </div>
          <Badge variant="destructive" className="text-xs shrink-0">FREE — CAPPED</Badge>
        </div>
      </div>
    );
  }

  // ── Free tier — low remaining ────────────────────────────────────────────────
  if (isLow) {
    return (
      <div className="rounded-lg bg-amber-50 border border-amber-300 px-4 py-3 mb-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-800">
              {remaining} assignment{remaining === 1 ? "" : "s"} remaining this month
            </p>
            <Progress value={usagePct} className="h-1.5 mt-1.5 bg-amber-100 [&>div]:bg-amber-500" />
            <p className="text-xs text-amber-600 mt-1">
              {usedThisMonth} of {maxClaimsPerMonth} used — upgrade to Pro for unlimited access.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 border-amber-400 text-amber-700 hover:bg-amber-100 shrink-0"
            onClick={() => toast.info("Upgrade to Pro — contact your platform administrator or visit the billing portal.", { duration: 6000 })}
          >
            <Zap className="h-3.5 w-3.5" />
            Upgrade
          </Button>
        </div>
      </div>
    );
  }

  // ── Free tier — normal ───────────────────────────────────────────────────────
  return (
    <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-muted/40 border mb-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Free Plan</span>
          <Badge variant="outline" className="text-xs">FREE</Badge>
        </div>
        <Progress value={usagePct} className="h-1.5 bg-muted [&>div]:bg-primary" />
        <p className="text-xs text-muted-foreground mt-1">
          {usedThisMonth} of {maxClaimsPerMonth} assignments used this month
          {upgradeAvailable && (
            <button
              className="ml-2 text-primary underline underline-offset-2 hover:no-underline"
              onClick={() => toast.info("Upgrade to Pro — contact your platform administrator or visit the billing portal.", { duration: 6000 })}
            >
              Upgrade to Pro
            </button>
          )}
        </p>
      </div>
    </div>
  );
}
