/**
 * AgencyFleetQuotes — /agency/quotes
 *
 * Fleet owner view: shows all fleet policy RFQs dispatched via KINGA Agency,
 * grouped by claim/RFQ, with a comparison table of insurer responses.
 * Allows accepting or rejecting individual insurer quotes.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { getCurrencySymbolForCode } from "../../../shared/currency";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, ArrowLeft, Building2, RefreshCw, CheckCircle, XCircle, Clock, DollarSign, TrendingDown } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type QuoteRow = {
  id: number;
  claimId: number;
  claimNumber: string;
  insurerTenantId: string;
  insurerName: string | null;
  status: string;
  requestType: string;
  claimSource: string;
  fleetAccountId: number | null;
  vehicleCount: number | null;
  estimatedTotalValue: string | null;
  claimsHistorySummary: string | null;
  quoteAmount: string | null;
  quoteCurrency: string | null;
  quoteNotes: string | null;
  quoteValidUntil: string | null;
  sentAt: string | null;
  quotedAt: string | null;
  respondedAt: string | null;
  createdAt: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupByClaimId(quotes: QuoteRow[]): Map<number, QuoteRow[]> {
  const map = new Map<number, QuoteRow[]>();
  for (const q of quotes) {
    if (!map.has(q.claimId)) map.set(q.claimId, []);
    map.get(q.claimId)!.push(q);
  }
  return map;
}

function statusBadge(status: string) {
  const variants: Record<string, { label: string; className: string }> = {
    pending:  { label: "Pending",  className: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 border-yellow-300 dark:border-yellow-700" },
    sent:     { label: "Sent",     className: "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border-blue-300 dark:border-blue-700" },
    quoted:   { label: "Quoted",   className: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700" },
    accepted: { label: "Accepted", className: "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 border-green-300 dark:border-green-700" },
    rejected: { label: "Rejected", className: "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border-red-300 dark:border-red-700" },
    expired:  { label: "Expired",  className: "bg-gray-100 dark:bg-muted text-gray-600 dark:text-muted-foreground border-gray-300 dark:border-border" },
  };
  const v = variants[status] ?? { label: status, className: "bg-gray-100 dark:bg-muted text-gray-600 dark:text-muted-foreground" };
  return <Badge variant="outline" className={`text-xs ${v.className}`}>{v.label}</Badge>;
}

function lowestQuote(quotes: QuoteRow[]): QuoteRow | null {
  const responded = quotes.filter(q => q.quoteAmount !== null && q.status === "quoted");
  if (responded.length === 0) return null;
  return responded.reduce((best, q) =>
    parseFloat(q.quoteAmount!) < parseFloat(best.quoteAmount!) ? q : best
  );
}

function commissionEstimate(quoteAmount: string | null, sym: string): string {
  if (!quoteAmount) return "—";
  const base = parseFloat(quoteAmount);
  const commission = base * 0.10; // 10% placeholder
  return `${sym}${commission.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AgencyFleetQuotes() {
  const { currencySymbol } = useTenantCurrency();
  const [, setLocation] = useLocation();
  const [confirmDialog, setConfirmDialog] = useState<{ quoteId: number; action: "accepted" | "rejected"; insurerName: string } | null>(null);

  const { data, isLoading, refetch } = trpc.agencyBroker.listFleetQuoteRequests.useQuery(
    { limit: 100 },
    { refetchOnWindowFocus: false }
  );

  const acceptReject = trpc.agencyBroker.acceptOrRejectQuote.useMutation({
    onSuccess: (_, variables) => {
      toast.success(`Quote ${variables.action === "accepted" ? "accepted" : "rejected"} successfully.`);
      setConfirmDialog(null);
      refetch();
    },
    onError: (err) => {
      toast.error(err.message ?? "Action failed.");
    },
  });

  const quotes: QuoteRow[] = (data?.quotes ?? []) as QuoteRow[];
  const grouped = groupByClaimId(quotes);
  const rfqGroups = Array.from(grouped.entries()).sort((a, b) => b[0] - a[0]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      {/* Header */}
      <header className="bg-white/80 dark:bg-card/80 backdrop-blur-sm border-b shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setLocation("/agency")}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Agency Hub
              </Button>
              <div className="h-6 w-px bg-gray-300" />
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-gray-900 dark:text-foreground">Fleet Quote Comparison</h1>
                  <p className="text-xs text-muted-foreground">All insurer responses — via KINGA Agency</p>
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="container mx-auto px-4 py-8 space-y-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          </div>
        ) : rfqGroups.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center">
              <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-700 dark:text-foreground/80 mb-2">No Fleet RFQs Yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                When you submit a fleet insurance request, all insurer responses will appear here for comparison.
              </p>
              <Button className="mt-6 bg-emerald-600 hover:bg-emerald-700" onClick={() => setLocation("/fleet")}>
                Go to Fleet Management
              </Button>
            </CardContent>
          </Card>
        ) : (
          rfqGroups.map(([claimId, rfqQuotes]) => {
            const first = rfqQuotes[0];
            const best = lowestQuote(rfqQuotes);
            const quotedCount = rfqQuotes.filter(q => q.status === "quoted").length;
            const totalCount = rfqQuotes.length;

            return (
              <Card key={claimId} className="overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-emerald-50 to-teal-50 border-b">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="text-base font-bold text-gray-900 dark:text-foreground flex items-center gap-2">
                        <span className="font-mono text-emerald-700 dark:text-emerald-300">{first.claimNumber}</span>
                        <Badge className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700 text-xs" variant="outline">
                          Fleet Policy – via Agency
                        </Badge>
                      </CardTitle>
                      <CardDescription className="mt-1 text-xs text-gray-500 dark:text-muted-foreground">
                        Submitted {new Date(first.createdAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                        {first.vehicleCount ? ` · ${first.vehicleCount} vehicles` : ""}
                        {first.claimsHistorySummary ? ` · ${first.claimsHistorySummary.slice(0, 60)}${first.claimsHistorySummary.length > 60 ? "…" : ""}` : ""}
                      </CardDescription>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground">{quotedCount}/{totalCount} insurers responded</p>
                      {best && (
                        <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1 justify-end mt-1">
                          <TrendingDown className="h-3.5 w-3.5" />
                          Best: {getCurrencySymbolForCode(best.quoteCurrency ?? currencySymbol)}{parseFloat(best.quoteAmount!).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </p>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50 dark:bg-muted/50">
                        <TableHead className="text-xs font-semibold">Insurer</TableHead>
                        <TableHead className="text-xs font-semibold">Status</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Quote Amount</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Commission (est.)</TableHead>
                        <TableHead className="text-xs font-semibold">Valid Until</TableHead>
                        <TableHead className="text-xs font-semibold">Notes</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rfqQuotes.map(q => {
                        const isBest = best?.id === q.id;
                        return (
                          <TableRow key={q.id} className={isBest ? "bg-emerald-50/60 dark:bg-emerald-950/60" : ""}>
                            <TableCell className="font-medium text-sm">
                              <div className="flex items-center gap-1.5">
                                {isBest && <TrendingDown className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
                                {q.insurerName ?? q.insurerTenantId}
                              </div>
                            </TableCell>
                            <TableCell>{statusBadge(q.status)}</TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {q.quoteAmount
                                ? `${getCurrencySymbolForCode(q.quoteCurrency ?? currencySymbol)}${parseFloat(q.quoteAmount).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                                : <span className="text-gray-400 dark:text-muted-foreground/70 text-xs">Awaiting</span>}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-muted-foreground">
                              {commissionEstimate(q.quoteAmount, currencySymbol)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {q.quoteValidUntil
                                ? new Date(q.quoteValidUntil).toLocaleDateString("en-ZA")
                                : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">
                              {q.quoteNotes ?? "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              {q.status === "quoted" && (
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-xs border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:bg-emerald-950/30"
                                    onClick={() => setConfirmDialog({ quoteId: q.id, action: "accepted", insurerName: q.insurerName ?? q.insurerTenantId })}
                                  >
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    Accept
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-xs border-red-300 dark:border-red-700 text-red-600 hover:bg-red-50 dark:bg-red-950/30"
                                    onClick={() => setConfirmDialog({ quoteId: q.id, action: "rejected", insurerName: q.insurerName ?? q.insurerTenantId })}
                                  >
                                    <XCircle className="h-3 w-3 mr-1" />
                                    Reject
                                  </Button>
                                </div>
                              )}
                              {q.status === "accepted" && (
                                <span className="text-xs text-emerald-600 font-medium flex items-center justify-end gap-1">
                                  <CheckCircle className="h-3.5 w-3.5" /> Accepted
                                </span>
                              )}
                              {q.status === "rejected" && (
                                <span className="text-xs text-red-500 font-medium flex items-center justify-end gap-1">
                                  <XCircle className="h-3.5 w-3.5" /> Rejected
                                </span>
                              )}
                              {(q.status === "pending" || q.status === "sent") && (
                                <span className="text-xs text-gray-400 dark:text-muted-foreground/70 flex items-center justify-end gap-1">
                                  <Clock className="h-3.5 w-3.5" /> Awaiting
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })
        )}
      </main>

      {/* Confirm Dialog */}
      <Dialog open={!!confirmDialog} onOpenChange={() => setConfirmDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmDialog?.action === "accepted" ? "Accept Quote" : "Reject Quote"}
            </DialogTitle>
            <DialogDescription>
              {confirmDialog?.action === "accepted"
                ? `Accept the quote from ${confirmDialog?.insurerName}? This will mark it as accepted and notify the insurer.`
                : `Reject the quote from ${confirmDialog?.insurerName}? This action cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>Cancel</Button>
            <Button
              className={confirmDialog?.action === "accepted" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}
              disabled={acceptReject.isPending}
              onClick={() => {
                if (!confirmDialog) return;
                acceptReject.mutate({ quoteRequestId: confirmDialog.quoteId, action: confirmDialog.action });
              }}
            >
              {acceptReject.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {confirmDialog?.action === "accepted" ? "Accept" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
