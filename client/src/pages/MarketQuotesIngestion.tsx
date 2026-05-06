import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Upload, FileText, Clock, ChevronDown, ChevronUp, CheckCircle2,
  XCircle, Loader2, Package, DollarSign, Truck
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

// ─── QuoteReviewPanel ─────────────────────────────────────────────────────────
// Inline expandable panel that loads quote details and provides approve/reject
function QuoteReviewPanel({ quoteId, onDone }: { quoteId: number; onDone: () => void }) {
  const { data, isLoading, error } = trpc.marketQuotes.getQuoteDetails.useQuery({ quoteId });
  const approveQuote = trpc.marketQuotes.approveQuote.useMutation({
    onSuccess: () => {
      toast.success("Quote approved — line items added to pricing baseline.");
      onDone();
    },
    onError: (err) => toast.error("Approve failed: " + err.message),
  });
  const rejectQuote = trpc.marketQuotes.rejectQuote.useMutation({
    onSuccess: () => {
      toast.success("Quote rejected and removed from queue.");
      onDone();
    },
    onError: (err) => toast.error("Reject failed: " + err.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 px-6 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading line items…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="py-4 px-6 text-sm text-destructive">
        Failed to load quote details: {error?.message ?? "Unknown error"}
      </div>
    );
  }

  const { quote, lineItems } = data;
  const allIds = lineItems.map((li: any) => li.id);
  const isBusy = approveQuote.isPending || rejectQuote.isPending;

  return (
    <div className="border-t bg-muted/20 px-6 py-4 space-y-4">
      {/* Summary row */}
      <div className="flex flex-wrap gap-4 text-sm">
        <span className="flex items-center gap-1 text-muted-foreground">
          <Package className="h-3.5 w-3.5" />
          {lineItems.length} line items
        </span>
        <span className="flex items-center gap-1 text-muted-foreground">
          <DollarSign className="h-3.5 w-3.5" />
          {(quote as any).currency ?? "USD"}
        </span>
        {quote.supplierCountry && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Truck className="h-3.5 w-3.5" />
            {quote.supplierCountry}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Badge
            variant={
              (Number((quote as any).extractionConfidence) ?? 0) >= 0.8
                ? "default"
                : (Number((quote as any).extractionConfidence) ?? 0) >= 0.5
                ? "secondary"
                : "destructive"
            }
          >
            {Math.round((Number((quote as any).extractionConfidence) ?? 0) * 100)}% extraction confidence
          </Badge>
        </span>
      </div>

      {/* Line items table */}
      {lineItems.length > 0 ? (
        <div className="overflow-x-auto rounded-md border text-xs">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">#</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Part</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Category</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Type</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Price</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Lead (days)</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((li: any, idx: number) => (
                <tr key={li.id} className={idx % 2 === 0 ? "bg-background" : "bg-muted/10"}>
                  <td className="px-3 py-2 text-muted-foreground">{li.lineNumber ?? idx + 1}</td>
                  <td className="px-3 py-2 font-medium">
                    {li.partName ?? "—"}
                    {li.partNumber && (
                      <span className="ml-1 text-muted-foreground font-mono">({li.partNumber})</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{li.partCategory ?? "—"}</td>
                  <td className="px-3 py-2">
                    {li.partType ? (
                      <Badge variant="outline" className="text-xs">{li.partType}</Badge>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {li.price != null
                      ? `${li.currency ?? (quote as any).currency ?? "USD"} ${Number(li.price).toFixed(2)}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {li.leadTimeDays ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No line items extracted for this quote.</p>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-3 pt-2">
        <Button
          size="sm"
          disabled={isBusy || lineItems.length === 0}
          onClick={() =>
            approveQuote.mutate({ quoteId, approvedLineItemIds: allIds })
          }
        >
          {approveQuote.isPending ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
          )}
          Approve All &amp; Add to Baseline
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={isBusy}
          onClick={() => rejectQuote.mutate({ quoteId, rejectionReason: 'Rejected by reviewer' })}
        >
          {rejectQuote.isPending ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <XCircle className="mr-2 h-3.5 w-3.5" />
          )}
          Reject
        </Button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MarketQuotesIngestion() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Fetch pending quotes
  const { data: pendingQuotes, refetch } = trpc.marketQuotes.getPendingQuotes.useQuery();

  // Upload quote mutation
  const uploadQuote = trpc.marketQuotes.uploadQuote.useMutation({
    onSuccess: () => {
      toast.success("Quote uploaded successfully", {
        description: "AI extraction complete. Review the extracted data.",
      });
      refetch();
      setUploading(false);
    },
    onError: (error) => {
      toast.error("Upload failed: " + error.message);
      setUploading(false);
    },
  });

  // Handle file selection
  const handleFileSelect = useCallback(async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large (max 10MB)");
      return;
    }
    const allowedTypes = [
      "application/pdf",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "image/png",
      "image/jpeg",
      "image/jpg",
    ];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Invalid file type. Please upload PDF, Excel, or image files only");
      return;
    }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64Data = e.target?.result as string;
      const base64Content = base64Data.split(",")[1] || base64Data;
      const documentType =
        file.type === "application/pdf"
          ? "pdf"
          : file.type.includes("sheet") || file.type.includes("excel")
          ? "excel"
          : "image";
      await uploadQuote.mutateAsync({
        documentBase64: base64Content,
        documentType: documentType as "pdf" | "excel" | "image",
        fileName: file.name,
      });
    };
    reader.readAsDataURL(file);
  }, [uploadQuote]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);
  const handleDragLeave = useCallback(() => setIsDragging(false), []);
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );
  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  // Redirect if not admin
  if (user && user.role !== "admin") {
    setLocation("/");
    return null;
  }

  return (
    <div className="container py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">KINGA Agency — Market Data</h1>
        <p className="text-muted-foreground mt-2">
          Upload supplier quotes (PDF / Excel / Image) for AI extraction and pricing baseline
          building. Review extracted line items before approving.
        </p>
      </div>

      {/* Upload Card */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Upload Supplier Quote</CardTitle>
          <CardDescription>
            Drag and drop or click to upload. Supports PDF, Excel, and image files (max 10 MB).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
              isDragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary/50"
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              type="file"
              id="file-upload"
              className="hidden"
              accept=".pdf,.xlsx,.xls,.png,.jpg,.jpeg"
              onChange={handleFileInput}
              disabled={uploading}
            />
            <label
              htmlFor="file-upload"
              className="cursor-pointer flex flex-col items-center gap-4"
            >
              <Upload className="h-12 w-12 text-muted-foreground" />
              <div>
                <p className="text-lg font-medium">
                  {uploading
                    ? "Uploading and extracting…"
                    : "Drop files here or click to browse"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  PDF, Excel (.xlsx, .xls), or Image (.png, .jpg) up to 10 MB
                </p>
              </div>
              {!uploading && (
                <Button type="button" variant="outline">
                  Select File
                </Button>
              )}
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Pending Quotes */}
      <Card>
        <CardHeader>
          <CardTitle>Pending Review Queue</CardTitle>
          <CardDescription>
            Quotes awaiting review and approval ({pendingQuotes?.length ?? 0} pending). Click
            "Review" to inspect extracted line items before approving.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {!pendingQuotes || pendingQuotes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No pending quotes. Upload a supplier quote to get started.</p>
            </div>
          ) : (
            <div className="divide-y">
              {pendingQuotes.map((quote: any) => (
                <div key={quote.id}>
                  {/* Quote row */}
                  <div className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-4 flex-1">
                      <FileText className="h-8 w-8 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium truncate">
                          {quote.supplierName ?? "Unknown Supplier"}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {quote.supplierCountry} &bull;{" "}
                          {new Date(quote.quoteDate).toLocaleDateString()} &bull;{" "}
                          {quote.lineItemCount} items
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          variant={
                            quote.extractionConfidence >= 0.8
                              ? "default"
                              : quote.extractionConfidence >= 0.5
                              ? "secondary"
                              : "destructive"
                          }
                        >
                          {Math.round(quote.extractionConfidence * 100)}% confidence
                        </Badge>
                        <Badge variant="outline">
                          <Clock className="h-3 w-3 mr-1" />
                          Pending
                        </Badge>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-4 shrink-0"
                      onClick={() =>
                        setExpandedId(expandedId === quote.id ? null : quote.id)
                      }
                    >
                      {expandedId === quote.id ? (
                        <>
                          <ChevronUp className="mr-1.5 h-4 w-4" />
                          Collapse
                        </>
                      ) : (
                        <>
                          <ChevronDown className="mr-1.5 h-4 w-4" />
                          Review
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Inline review panel */}
                  {expandedId === quote.id && (
                    <QuoteReviewPanel
                      quoteId={quote.id}
                      onDone={() => {
                        setExpandedId(null);
                        refetch();
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
