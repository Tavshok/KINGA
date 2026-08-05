/**
 * QuoteComparisonView.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * M-01: Side-by-side quote comparison for agency customers.
 * Compares up to 4 quotation requests with premium, excess, cover type, and
 * vehicle risk score side by side.
 */

import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { BarChart3, CheckCircle2, X, TrendingDown, Shield } from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtPremium(cents: number | null | undefined): string {
  if (!cents) return "—";
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

const STATUS_COLORS: Record<string, string> = {
  accepted: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  quoted: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  expired: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

const COVER_LABELS: Record<string, string> = {
  comprehensive: "Comprehensive",
  third_party: "Third Party",
  third_party_fire_theft: "TP Fire & Theft",
  fleet: "Fleet",
  commercial: "Commercial",
};

// ─── Comparison Column ────────────────────────────────────────────────────────

function ComparisonColumn({ quote, isLowest, onRemove }: {
  quote: any;
  isLowest: boolean;
  onRemove: () => void;
}) {
  const riskScore = quote.vehicleRiskScore;
  const riskColor = riskScore == null ? "text-muted-foreground" :
    riskScore >= 70 ? "text-red-600" : riskScore >= 40 ? "text-amber-600" : "text-emerald-600";

  return (
    <div className={`flex-1 min-w-0 border rounded-lg overflow-hidden ${isLowest ? "border-emerald-400 ring-1 ring-emerald-400" : "border-border"}`}>
      {/* Header */}
      <div className={`p-3 ${isLowest ? "bg-emerald-50 dark:bg-emerald-900/20" : "bg-muted/30"}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-mono text-muted-foreground truncate">{quote.requestNumber}</p>
            <p className="text-sm font-semibold mt-0.5 truncate">
              {quote.vehicleYear} {quote.vehicleMake} {quote.vehicleModel}
            </p>
            {quote.vehicleRegistration && (
              <p className="text-xs text-muted-foreground">{quote.vehicleRegistration}</p>
            )}
          </div>
          <button onClick={onRemove} className="text-muted-foreground hover:text-foreground flex-shrink-0">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {isLowest && (
          <div className="flex items-center gap-1 mt-1.5">
            <TrendingDown className="h-3 w-3 text-emerald-600" />
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Lowest Premium</span>
          </div>
        )}
      </div>

      {/* Data rows */}
      <div className="divide-y divide-border">
        <div className="px-3 py-2.5">
          <p className="text-xs text-muted-foreground">Monthly Premium</p>
          <p className={`text-lg font-bold mt-0.5 ${isLowest ? "text-emerald-600" : ""}`}>
            {fmtPremium(quote.quotedPremium ? quote.quotedPremium * 100 : null)}
          </p>
        </div>
        <div className="px-3 py-2.5">
          <p className="text-xs text-muted-foreground">Annual Premium</p>
          <p className="text-sm font-medium">
            {fmtPremium(quote.quotedAnnualPremium ? quote.quotedAnnualPremium * 100 : null)}
          </p>
        </div>
        <div className="px-3 py-2.5">
          <p className="text-xs text-muted-foreground">Excess</p>
          <p className="text-sm font-medium">
            {quote.quotedExcess ? `$${quote.quotedExcess.toLocaleString()}` : "—"}
          </p>
        </div>
        <div className="px-3 py-2.5">
          <p className="text-xs text-muted-foreground">Cover Type</p>
          <p className="text-sm">{COVER_LABELS[quote.insuranceType] ?? quote.insuranceType}</p>
        </div>
        <div className="px-3 py-2.5">
          <p className="text-xs text-muted-foreground">Vehicle Value</p>
          <p className="text-sm">{quote.vehicleValue ? `$${quote.vehicleValue.toLocaleString()}` : "—"}</p>
        </div>
        <div className="px-3 py-2.5">
          <p className="text-xs text-muted-foreground">KINGA Risk Score</p>
          <p className={`text-sm font-medium ${riskColor}`}>
            {riskScore != null ? `${riskScore}/100` : "Not assessed"}
          </p>
        </div>
        <div className="px-3 py-2.5">
          <p className="text-xs text-muted-foreground">Status</p>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mt-0.5 ${STATUS_COLORS[quote.status] ?? ""}`}>
            {quote.status.replace(/_/g, " ")}
          </span>
        </div>
        {quote.quoteValidUntil && (
          <div className="px-3 py-2.5">
            <p className="text-xs text-muted-foreground">Valid Until</p>
            <p className="text-sm">{new Date(quote.quoteValidUntil).toLocaleDateString()}</p>
          </div>
        )}
        {quote.quoteNotes && (
          <div className="px-3 py-2.5">
            <p className="text-xs text-muted-foreground">Notes</p>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-3">{quote.quoteNotes}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function QuoteComparisonView() {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const { data: quotations = [], isLoading } = trpc.agency.myQuotations.useQuery();

  // Only show quoted/accepted quotes for comparison
  const comparableQuotes = (quotations as any[]).filter(q =>
    ["quoted", "accepted", "pending"].includes(q.status)
  );

  const selectedQuotes = comparableQuotes.filter(q => selectedIds.includes(q.id));

  const lowestPremiumId = selectedQuotes.length > 0
    ? selectedQuotes.reduce((min, q) => (q.quotedPremium ?? Infinity) < (min.quotedPremium ?? Infinity) ? q : min).id
    : null;

  const toggleSelect = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : prev.length < 4 ? [...prev, id] : prev
    );
  };

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Loading quotations…</div>;
  }

  if (comparableQuotes.length === 0) {
    return (
      <div className="py-12 text-center">
        <BarChart3 className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-40" />
        <p className="text-sm text-muted-foreground">No quotations available for comparison yet.</p>
        <p className="text-xs text-muted-foreground mt-1">Quotations will appear here once they have been quoted or accepted.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Selection panel */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            Select Quotes to Compare
            <Badge variant="secondary" className="text-xs font-normal ml-1">
              {selectedIds.length}/4 selected
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {comparableQuotes.map((q: any) => (
              <div
                key={q.id}
                className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                  selectedIds.includes(q.id) ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"
                }`}
                onClick={() => toggleSelect(q.id)}
              >
                <Checkbox
                  checked={selectedIds.includes(q.id)}
                  onCheckedChange={() => toggleSelect(q.id)}
                  disabled={!selectedIds.includes(q.id) && selectedIds.length >= 4}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground">{q.requestNumber}</span>
                    <span className="text-sm font-medium truncate">{q.vehicleYear} {q.vehicleMake} {q.vehicleModel}</span>
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[q.status] ?? ""}`}>
                      {q.status.replace(/_/g, " ")}
                    </span>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  {q.quotedPremium ? (
                    <span className="text-sm font-semibold text-emerald-600">${q.quotedPremium}/mo</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">No quote yet</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Comparison grid */}
      {selectedQuotes.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Side-by-Side Comparison</h3>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {selectedQuotes.map((q: any) => (
              <ComparisonColumn
                key={q.id}
                quote={q}
                isLowest={q.id === lowestPremiumId && q.quotedPremium != null}
                onRemove={() => toggleSelect(q.id)}
              />
            ))}
          </div>
          {selectedQuotes.length >= 2 && (
            <p className="text-xs text-muted-foreground mt-2 text-center">
              <CheckCircle2 className="h-3 w-3 inline mr-1 text-emerald-600" />
              The lowest premium option is highlighted in green.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
