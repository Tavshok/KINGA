import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";

interface ExtractedLineItem {
  description: string;
  partNumber?: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface QuoteOCRUploadProps {
  claimId: number;
  onSuccess?: () => void;
}

export default function QuoteOCRUpload({ claimId, onSuccess }: QuoteOCRUploadProps) {
  const { currencySymbol } = useTenantCurrency();
  const [uploading, setUploading] = useState(false);
  const [extractedItems, setExtractedItems] = useState<ExtractedLineItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const extractQuote = trpc.quotes.extractFromImage.useMutation({
    onSuccess: (data: { lineItems: ExtractedLineItem[] }) => {
      setExtractedItems(data.lineItems);
      setUploading(false);
    },
    onError: (err: any) => {
      setError(err.message);
      setUploading(false);
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file (JPG, PNG, etc.)");
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError("File size must be less than 10MB");
      return;
    }

    setUploading(true);
    setError(null);

    // Convert to base64
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      extractQuote.mutate({ claimId, imageBase64: base64 });
    };
    reader.readAsDataURL(file);
  };

  const calculateTotal = () => {
    return extractedItems.reduce((sum, item) => sum + item.lineTotal, 0);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Upload Handwritten Quote (OCR)
        </CardTitle>
        <CardDescription>
          Take a photo of your handwritten quotation and our AI will automatically extract the line items
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="quote-image">Quote Image</Label>
          <Input
            id="quote-image"
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            disabled={uploading}
          />
          <p className="text-xs text-muted-foreground">
            Supported formats: JPG, PNG, HEIC. Max size: 10MB
          </p>
        </div>

        {uploading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Extracting line items from image...
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {extractedItems.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <p className="text-sm text-green-600">
                Successfully extracted {extractedItems.length} line items
              </p>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-3 text-sm font-medium">Description</th>
                    <th className="text-right p-3 text-sm font-medium">Qty</th>
                    <th className="text-right p-3 text-sm font-medium">Unit Price</th>
                    <th className="text-right p-3 text-sm font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {extractedItems.map((item, index) => (
                    <tr key={index} className="border-t">
                      <td className="p-3 text-sm">
                        {item.description}
                        {item.partNumber && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            {item.partNumber}
                          </Badge>
                        )}
                      </td>
                      <td className="p-3 text-sm text-right">{item.quantity}</td>
                      <td className="p-3 text-sm text-right">{currencySymbol}{item.unitPrice.toFixed(2)}</td>
                      <td className="p-3 text-sm text-right font-medium">
                        {currencySymbol}{item.lineTotal.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t bg-muted/50">
                    <td colSpan={3} className="p-3 text-sm font-medium text-right">
                      Total
                    </td>
                    <td className="p-3 text-sm font-bold text-right">
                      ${calculateTotal().toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => {
                  if (onSuccess) onSuccess();
                }}
                className="flex-1"
              >
                Confirm & Submit Quote
              </Button>
              <Button
                variant="outline"
                onClick={() => setExtractedItems([])}
              >
                Clear
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
