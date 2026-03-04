/**
 * InsurerFleetRFQs — /insurer-portal/fleet-rfqs
 *
 * Insurer portal view: shows all fleet policy RFQs received from KINGA Agency.
 * Each row is tagged "Fleet Policy – via Agency" and the insurer can respond
 * with a quote amount.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, ArrowLeft, Building2, RefreshCw, DollarSign, Car, FileText } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type RFQRow = {
  id: number;
  claimId: number;
  claimNumber: string;
  agencyTenantId: string;
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
  incidentDescription: string | null;
  createdAt: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const variants: Record<string, { label: string; className: string }> = {
    pending:  { label: "Pending",  className: "bg-yellow-100 text-yellow-800 border-yellow-300" },
    sent:     { label: "Sent",     className: "bg-blue-100 text-blue-800 border-blue-300" },
    quoted:   { label: "Quoted",   className: "bg-emerald-100 text-emerald-800 border-emerald-300" },
    accepted: { label: "Accepted", className: "bg-green-100 text-green-800 border-green-300" },
    rejected: { label: "Rejected", className: "bg-red-100 text-red-800 border-red-300" },
    expired:  { label: "Expired",  className: "bg-gray-100 text-gray-600 border-gray-300" },
  };
  const v = variants[status] ?? { label: status, className: "bg-gray-100 text-gray-600" };
  return <Badge variant="outline" className={`text-xs ${v.className}`}>{v.label}</Badge>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function InsurerFleetRFQs() {
  const [, setLocation] = useLocation();
  const [respondDialog, setRespondDialog] = useState<RFQRow | null>(null);
  const [quoteAmount, setQuoteAmount] = useState("");
  const [quoteNotes, setQuoteNotes] = useState("");
  const [quoteValidUntil, setQuoteValidUntil] = useState("");

  const { data, isLoading, refetch } = trpc.agencyBroker.listInsurerFleetRFQs.useQuery(
    { limit: 100 },
    { refetchOnWindowFocus: false }
  );

  const respondMutation = trpc.agencyBroker.respondToQuote.useMutation({
    onSuccess: () => {
      toast.success("Quote submitted successfully.");
      setRespondDialog(null);
      setQuoteAmount("");
      setQuoteNotes("");
      setQuoteValidUntil("");
      refetch();
    },
    onError: (err) => {
      toast.error(err.message ?? "Failed to submit quote.");
    },
  });

  const rfqs: RFQRow[] = (data?.rfqs ?? []) as RFQRow[];

  function openRespondDialog(rfq: RFQRow) {
    setRespondDialog(rfq);
    setQuoteAmount("");
    setQuoteNotes("");
    setQuoteValidUntil("");
  }

  function handleSubmitQuote() {
    if (!respondDialog) return;
    const amount = parseFloat(quoteAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid quote amount.");
      return;
    }
    respondMutation.mutate({
      quoteRequestId: respondDialog.id,
      quoteAmount: amount,
      quoteCurrency: "ZAR",
      quoteNotes: quoteNotes || undefined,
      quoteValidUntil: quoteValidUntil || undefined,
    });
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setLocation("/insurer-portal")}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Insurer Portal
              </Button>
              <div className="h-6 w-px bg-gray-300" />
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                  <Car className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-gray-900">Fleet Policy RFQs</h1>
                  <p className="text-xs text-muted-foreground">Broker-sourced requests from KINGA Agency</p>
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
      <main className="container mx-auto px-4 py-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : rfqs.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center">
              <Car className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-700 mb-2">No Fleet RFQs Received</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Fleet insurance requests submitted through KINGA Agency will appear here for your response.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="border-b bg-gradient-to-r from-blue-50 to-indigo-50">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Building2 className="h-4 w-4 text-blue-600" />
                Fleet Policy Requests
                <Badge className="bg-blue-100 text-blue-800 border-blue-300 text-xs ml-1" variant="outline">
                  {rfqs.length} total
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="text-xs font-semibold">RFQ Reference</TableHead>
                    <TableHead className="text-xs font-semibold">Source</TableHead>
                    <TableHead className="text-xs font-semibold">Vehicles</TableHead>
                    <TableHead className="text-xs font-semibold">Details</TableHead>
                    <TableHead className="text-xs font-semibold">Status</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Your Quote</TableHead>
                    <TableHead className="text-xs font-semibold">Received</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rfqs.map(rfq => (
                    <TableRow key={rfq.id}>
                      <TableCell>
                        <div>
                          <p className="font-mono text-xs font-semibold text-blue-700">{rfq.claimNumber}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">ID #{rfq.id}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 text-xs whitespace-nowrap">
                          Fleet Policy – via Agency
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {rfq.vehicleCount != null ? (
                          <span className="flex items-center gap-1">
                            <Car className="h-3.5 w-3.5 text-gray-400" />
                            {rfq.vehicleCount}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px]">
                        {rfq.incidentDescription
                          ? rfq.incidentDescription.slice(0, 80) + (rfq.incidentDescription.length > 80 ? "…" : "")
                          : rfq.claimsHistorySummary
                            ? rfq.claimsHistorySummary.slice(0, 80)
                            : "—"}
                      </TableCell>
                      <TableCell>{statusBadge(rfq.status)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {rfq.quoteAmount
                          ? `${rfq.quoteCurrency ?? "ZAR"} ${parseFloat(rfq.quoteAmount).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`
                          : <span className="text-gray-400 text-xs">Not submitted</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(rfq.createdAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                      </TableCell>
                      <TableCell className="text-right">
                        {(rfq.status === "pending" || rfq.status === "sent") && (
                          <Button
                            size="sm"
                            className="h-7 px-3 text-xs bg-blue-600 hover:bg-blue-700"
                            onClick={() => openRespondDialog(rfq)}
                          >
                            <DollarSign className="h-3 w-3 mr-1" />
                            Submit Quote
                          </Button>
                        )}
                        {rfq.status === "quoted" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-3 text-xs"
                            onClick={() => openRespondDialog(rfq)}
                          >
                            <FileText className="h-3 w-3 mr-1" />
                            Revise
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Respond Dialog */}
      <Dialog open={!!respondDialog} onOpenChange={() => setRespondDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Submit Fleet Policy Quote</DialogTitle>
            <DialogDescription>
              RFQ: <span className="font-mono font-semibold">{respondDialog?.claimNumber}</span>
              {respondDialog?.vehicleCount ? ` · ${respondDialog.vehicleCount} vehicles` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="quoteAmount" className="text-sm font-medium">Quote Amount (ZAR) *</Label>
              <Input
                id="quoteAmount"
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 125000.00"
                value={quoteAmount}
                onChange={e => setQuoteAmount(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="quoteValidUntil" className="text-sm font-medium">Valid Until</Label>
              <Input
                id="quoteValidUntil"
                type="date"
                value={quoteValidUntil}
                onChange={e => setQuoteValidUntil(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="quoteNotes" className="text-sm font-medium">Notes / Conditions</Label>
              <Textarea
                id="quoteNotes"
                placeholder="Optional: coverage conditions, exclusions, or notes for the broker…"
                value={quoteNotes}
                onChange={e => setQuoteNotes(e.target.value)}
                className="mt-1 resize-none"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRespondDialog(null)}>Cancel</Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              disabled={respondMutation.isPending || !quoteAmount}
              onClick={handleSubmitQuote}
            >
              {respondMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Submit Quote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
