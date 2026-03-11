/**
 * /platform/claim-debug/:claimId
 *
 * Super-admin claim integrity debugger.
 * Runs verifyClaimIntegrity and displays a structured report of all issues.
 */

import { useState } from "react";
import { useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Search, RefreshCw } from "lucide-react";

// ─── Severity helpers ─────────────────────────────────────────────────────────

const severityConfig = {
  error: {
    icon: AlertCircle,
    color: "text-red-600",
    bg: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800",
    badge: "destructive" as const,
    label: "Error",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-amber-600",
    bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800",
    badge: "secondary" as const,
    label: "Warning",
  },
  info: {
    icon: Info,
    color: "text-blue-600",
    bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800",
    badge: "outline" as const,
    label: "Info",
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function PlatformClaimDebug() {
  const [, params] = useRoute("/platform/claim-debug/:claimId");
  const [inputId, setInputId] = useState<string>(params?.claimId ?? "");
  const [queryId, setQueryId] = useState<number | null>(
    params?.claimId ? Number(params.claimId) : null
  );

  const { data, isLoading, error, refetch } = trpc.platformMarketplace.verifyClaimIntegrity.useQuery(
    { claimId: queryId! },
    { enabled: queryId !== null && !isNaN(queryId) }
  );

  function handleSearch() {
    const n = Number(inputId);
    if (!isNaN(n) && n > 0) setQueryId(n);
  }

  const errorCount = data?.issues.filter((i) => i.severity === "error").length ?? 0;
  const warningCount = data?.issues.filter((i) => i.severity === "warning").length ?? 0;
  const infoCount = data?.issues.filter((i) => i.severity === "info").length ?? 0;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {/* Header */}
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center">
            <Search className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">Claim Integrity Debugger</h1>
            <p className="text-sm text-gray-400 dark:text-muted-foreground/70">Platform super-admin · Verify internal claim consistency</p>
          </div>
        </div>

        {/* Search bar */}
        <div className="flex gap-3 mb-6">
          <Input
            type="number"
            placeholder="Enter Claim ID…"
            value={inputId}
            onChange={(e) => setInputId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="bg-gray-900 border-gray-700 text-white placeholder:text-gray-500 dark:text-muted-foreground max-w-xs"
          />
          <Button onClick={handleSearch} className="bg-violet-600 hover:bg-violet-700">
            <Search className="w-4 h-4 mr-2" />
            Verify
          </Button>
          {data && (
            <Button variant="outline" onClick={() => refetch()} className="border-gray-700 text-gray-300">
              <RefreshCw className="w-4 h-4 mr-2" />
              Re-run
            </Button>
          )}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="text-center py-12 text-gray-400 dark:text-muted-foreground/70">
            Running integrity checks…
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-800 bg-red-950 p-4 text-red-300">
            <AlertCircle className="w-4 h-4 inline mr-2" />
            {error.message}
          </div>
        )}

        {/* Report */}
        {data && (
          <div className="space-y-4">
            {/* Summary card */}
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white text-base">
                    Claim #{data.claimId}
                    {data.claimRef && (
                      <span className="ml-2 text-gray-400 dark:text-muted-foreground/70 font-normal text-sm">
                        · {data.claimRef}
                      </span>
                    )}
                  </CardTitle>
                  {data.passed ? (
                    <Badge className="bg-emerald-600 text-white">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Passed
                    </Badge>
                  ) : (
                    <Badge variant="destructive">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      Failed
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-400 dark:text-muted-foreground/70 block">Status</span>
                    <span className="text-white font-medium">{data.status ?? "—"}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 dark:text-muted-foreground/70 block">Tenant ID</span>
                    <span className="text-white font-mono text-xs">{data.tenantId ?? "—"}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 dark:text-muted-foreground/70 block">Checked At</span>
                    <span className="text-white text-xs">
                      {new Date(data.checkedAt).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 dark:text-muted-foreground/70 block">Issues</span>
                    <span className="text-white">
                      {errorCount > 0 && (
                        <span className="text-red-400 mr-2">{errorCount} error{errorCount !== 1 ? "s" : ""}</span>
                      )}
                      {warningCount > 0 && (
                        <span className="text-amber-400 mr-2">{warningCount} warning{warningCount !== 1 ? "s" : ""}</span>
                      )}
                      {infoCount > 0 && (
                        <span className="text-blue-400">{infoCount} info</span>
                      )}
                      {data.issues.length === 0 && (
                        <span className="text-emerald-400">None</span>
                      )}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Issue list */}
            {data.issues.length === 0 ? (
              <div className="rounded-lg border border-emerald-800 bg-emerald-950 p-4 text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                All integrity checks passed. No issues found.
              </div>
            ) : (
              <div className="space-y-2">
                {data.issues.map((issue, idx) => {
                  const cfg = severityConfig[issue.severity];
                  const Icon = cfg.icon;
                  return (
                    <div
                      key={idx}
                      className={`rounded-lg border p-4 flex items-start gap-3 ${cfg.bg}`}
                    >
                      <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${cfg.color}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={cfg.badge} className="text-xs">
                            {cfg.label}
                          </Badge>
                          <code className="text-xs font-mono text-gray-600 dark:text-muted-foreground">
                            {issue.code}
                          </code>
                          {issue.field && (
                            <code className="text-xs font-mono text-gray-500 dark:text-muted-foreground">
                              · {issue.field}
                            </code>
                          )}
                        </div>
                        <p className="text-sm text-gray-700 dark:text-foreground/80">{issue.message}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {!data && !isLoading && !error && (
          <div className="text-center py-16 text-gray-500 dark:text-muted-foreground">
            Enter a Claim ID above and click Verify to run integrity checks.
          </div>
        )}
      </div>
    </div>
  );
}
