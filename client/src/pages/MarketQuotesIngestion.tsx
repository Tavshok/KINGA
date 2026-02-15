import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, Clock } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

export default function MarketQuotesIngestion() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

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

    // Convert file to base64
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64Data = e.target?.result as string;
      const base64Content = base64Data.split(",")[1] || base64Data;

      const documentType = file.type === 'application/pdf' ? 'pdf' : 
        (file.type.includes('sheet') || file.type.includes('excel')) ? 'excel' : 'image';
      
      await uploadQuote.mutateAsync({
        documentBase64: base64Content,
        documentType: documentType as 'pdf' | 'excel' | 'image',
        fileName: file.name,
      });
    };
    reader.readAsDataURL(file);
  }, [uploadQuote]);

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  // File input handler
  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  // Redirect if not admin
  if (user && user.role !== "admin") {
    setLocation("/");
    return null;
  }

  return (
    <div className="container py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Market Quotes Ingestion</h1>
        <p className="text-muted-foreground mt-2">
          Upload supplier quotes (PDF/Excel/Image) for AI extraction and pricing baseline building
        </p>
      </div>

      {/* Upload Card */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Upload Supplier Quote</CardTitle>
          <CardDescription>
            Drag and drop or click to upload. Supports PDF, Excel, and image files (max 10MB)
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
                  {uploading ? "Uploading and extracting..." : "Drop files here or click to browse"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  PDF, Excel (.xlsx, .xls), or Image (.png, .jpg) up to 10MB
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
            Quotes awaiting review and approval ({pendingQuotes?.length || 0} pending)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!pendingQuotes || pendingQuotes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No pending quotes. Upload a supplier quote to get started.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingQuotes.map((quote: any) => (
                <div
                  key={quote.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                    <div className="flex-1">
                      <h3 className="font-medium">{quote.supplierName || "Unknown Supplier"}</h3>
                      <p className="text-sm text-muted-foreground">
                        {quote.supplierCountry} • {new Date(quote.quoteDate).toLocaleDateString()} •{" "}
                        {quote.lineItemCount} items
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
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
                    onClick={() => setLocation(`/admin/market-quotes/${quote.id}`)}
                    variant="outline"
                  >
                    Review
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
