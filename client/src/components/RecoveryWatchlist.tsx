import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, AlertCircle, Clock, TrendingUp, Eye } from "lucide-react";
import { useLocation } from "wouter";

function formatAmount(cents: number) {
  if (!cents) return "—";
  return `R ${(cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 0 })}`;
}

interface WatchlistCategory {
  count: number;
  totalAmount: number;
  topCases: Array<{
    id: number;
    thirdPartyName: string | null;
    thirdPartyInsurer: string | null;
    status: string;
    recoveryPotentialScore: number;
    recoveryDeadline: string | null;
  }>;
}

interface WatchlistData {
  recoveryEligible: WatchlistCategory;
  demandOutstanding: WatchlistCategory;
  deadlineApproaching: WatchlistCategory;
  highValueRecoveries: WatchlistCategory;
  totalWatchlistItems: number;
}

export function RecoveryWatchlist() {
  const [, navigate] = useLocation();
  const { data, isLoading } = trpc.recovery.getWatchlist.useQuery();

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardHeader className="pb-2">
          <div className="h-5 bg-muted rounded w-48" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const watchlist = data as WatchlistData | undefined;
  if (!watchlist) return null;

  const categories = [
    {
      key: "recoveryEligible",
      label: "Recovery Eligible",
      icon: TrendingUp,
      color: "text-green-600 dark:text-green-400",
      bg: "bg-green-50 dark:bg-green-900/20",
      data: watchlist.recoveryEligible,
    },
    {
      key: "demandOutstanding",
      label: "Demand Outstanding",
      icon: AlertCircle,
      color: "text-orange-600 dark:text-orange-400",
      bg: "bg-orange-50 dark:bg-orange-900/20",
      data: watchlist.demandOutstanding,
    },
    {
      key: "deadlineApproaching",
      label: "Deadline Approaching",
      icon: Clock,
      color: "text-red-600 dark:text-red-400",
      bg: "bg-red-50 dark:bg-red-900/20",
      data: watchlist.deadlineApproaching,
    },
    {
      key: "highValueRecoveries",
      label: "High Value",
      icon: Shield,
      color: "text-purple-600 dark:text-purple-400",
      bg: "bg-purple-50 dark:bg-purple-900/20",
      data: watchlist.highValueRecoveries,
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Shield className="h-4 w-4 text-teal-600" />
          Recovery Watchlist
          {watchlist.totalWatchlistItems > 0 && (
            <Badge className="ml-auto bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300 text-xs">
              {watchlist.totalWatchlistItems} cases
            </Badge>
          )}
          <button
            onClick={() => navigate("/recovery")}
            className="ml-1 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <Eye className="h-3 w-3" />
            View all
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {categories.map(({ key, label, icon: Icon, color, bg, data: cat }) => (
            <div
              key={key}
              className={`rounded-lg p-3 ${bg} cursor-pointer hover:opacity-80 transition-opacity`}
              onClick={() => navigate("/recovery")}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Icon className={`h-3.5 w-3.5 ${color}`} />
                <span className="text-xs font-medium text-muted-foreground">{label}</span>
              </div>
              <p className={`text-2xl font-bold ${color}`}>{cat.count}</p>
              {cat.totalAmount > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatAmount(cat.totalAmount)}
                </p>
              )}
              {cat.topCases.length > 0 && (
                <div className="mt-1.5 space-y-0.5">
                  {cat.topCases.slice(0, 2).map((c) => (
                    <p key={c.id} className="text-xs text-muted-foreground truncate">
                      {c.thirdPartyName ?? c.thirdPartyInsurer ?? `Case #${c.id}`}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
