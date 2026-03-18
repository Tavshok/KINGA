import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, Loader2, Upload, Edit } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface LineItem {
  description: string;
  partNumber: string;
  quantity: number;
  unitPrice: number;
  category: "mechanical" | "body" | "interior" | "electrical" | "paint" | "labor";
  isOEM: boolean;
}

interface PanelBeaterQuoteFormProps {
  claimId: number;
  panelBeaterId: number;
  onSuccess?: () => void;
}

export default function PanelBeaterQuoteForm({ claimId, panelBeaterId, onSuccess }: PanelBeaterQuoteFormProps) {
  const { currencySymbol } = useTenantCurrency();
  const [lineItems, setLineItems] = useState<LineItem[]>([
    {
      description: "",
      partNumber: "",
      quantity: 1,
      unitPrice: 0,
      category: "body",
      isOEM: true
    }
  ]);
  const [estimatedDuration, setEstimatedDuration] = useState(5);
  const [notes, setNotes] = useState("");
  const [inputMethod, setInputMethod] = useState<"manual" | "ocr">("manual");
  const [ocrImage, setOcrImage] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);

  const extractQuoteMutation = trpc.quotes.extractFromImage.useMutation({
    onSuccess: (data: { lineItems: any[] }) => {
      const mappedItems: LineItem[] = data.lineItems.map(item => ({
        description: item.description,
        partNumber: item.partNumber || "",
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        category: "body" as const, // Default category
        isOEM: true // Default OEM
      }));
      setLineItems(mappedItems);
      setExtracting(false);
      setInputMethod("manual"); // Switch to manual mode to review/edit
      toast.success(`Extracted ${mappedItems.length} line items. Please review and edit as needed.`);
    },
    onError: (error: any) => {
      setExtracting(false);
      toast.error(`OCR extraction failed: ${error.message}`);
    }
  });

  const createQuoteMutation = trpc.quotes.submit.useMutation({
    onSuccess: () => {
      toast.success("Quote submitted successfully");
      onSuccess?.();
    },
    onError: (error: any) => {
      toast.error(`Failed to submit quote: ${error.message}`);
    }
  });

  const addLineItem = () => {
    setLineItems([
      ...lineItems,
      {
        description: "",
        partNumber: "",
        quantity: 1,
        unitPrice: 0,
        category: "body",
        isOEM: true
      }
    ]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length === 1) {
      toast.error("At least one line item is required");
      return;
    }
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: any) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    setLineItems(updated);
  };

  const calculateSubtotal = () => {
    return lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  };

  const calculateVAT = () => {
    return calculateSubtotal() * 0.15; // 15% VAT for Zimbabwe
  };

  const calculateTotal = () => {
    return calculateSubtotal() + calculateVAT();
  };

  const handleOCRUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file (JPG, PNG, etc.)");
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be less than 10MB");
      return;
    }

    setExtracting(true);

    // Convert to base64
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setOcrImage(base64);
      extractQuoteMutation.mutate({ claimId, imageBase64: base64 });
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (lineItems.some(item => !item.description || item.unitPrice <= 0)) {
      toast.error("Please fill in all line items with valid prices");
      return;
    }

    try {
      await createQuoteMutation.mutateAsync({
        claimId,
        panelBeaterId,
        quotedAmount: Math.round(calculateTotal()), // Store in whole dollars
        estimatedDuration,
        itemizedBreakdown: lineItems.map(item => ({
          item: `${item.description} (${item.partNumber || 'N/A'}) - ${item.category}`,
          cost: Math.round(item.quantity * item.unitPrice) // whole dollars
        })),
        laborCost: Math.round(lineItems.filter(i => i.category === "labor").reduce((sum, i) => sum + i.quantity * i.unitPrice, 0) * 100),
        partsCost: Math.round(lineItems.filter(i => i.category !== "labor").reduce((sum, i) => sum + i.quantity * i.unitPrice, 0) * 100),
        notes: notes || undefined
      });
    } catch (error) {
      // Error handled by mutation
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Submit Repair Quote</CardTitle>
        <CardDescription>Provide detailed line-item breakdown for accurate comparison</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={inputMethod} onValueChange={(v) => setInputMethod(v as "manual" | "ocr")} className="mb-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="manual" className="flex items-center gap-2">
              <Edit className="h-4 w-4" />
              Manual Entry
            </TabsTrigger>
            <TabsTrigger value="ocr" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Upload Quote (OCR)
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ocr" className="space-y-4 mt-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center space-y-4">
              <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
              <div>
                <h3 className="font-semibold mb-2">Upload Handwritten or Printed Quote</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Take a photo of your quotation and our AI will automatically extract all line items
                </p>
              </div>
              <Input
                type="file"
                accept="image/*"
                onChange={handleOCRUpload}
                disabled={extracting}
                className="max-w-md mx-auto"
              />
              {extracting && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Extracting line items from image...
                </div>
              )}
              {ocrImage && !extracting && (
                <div className="text-sm text-green-600">
                  ✓ Image uploaded successfully. Line items extracted. Switch to Manual Entry tab to review.
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="manual" className="mt-4">
            {/* Manual entry form content will go here */}
          </TabsContent>
        </Tabs>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Line Items */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Line Items</Label>
              <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                <Plus className="mr-2 h-4 w-4" />
                Add Item
              </Button>
            </div>

            {lineItems.map((item, index) => (
              <Card key={index} className="p-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">Item {index + 1}</Badge>
                    {lineItems.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeLineItem(index)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <Label htmlFor={`description-${index}`}>Description *</Label>
                      <Input
                        id={`description-${index}`}
                        value={item.description}
                        onChange={(e) => updateLineItem(index, "description", e.target.value)}
                        placeholder="e.g., Front bumper assembly"
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor={`partNumber-${index}`}>Part Number</Label>
                      <Input
                        id={`partNumber-${index}`}
                        value={item.partNumber}
                        onChange={(e) => updateLineItem(index, "partNumber", e.target.value)}
                        placeholder="e.g., 52119-0K912"
                      />
                    </div>

                    <div>
                      <Label htmlFor={`category-${index}`}>Category *</Label>
                      <select
                        id={`category-${index}`}
                        value={item.category}
                        onChange={(e) => updateLineItem(index, "category", e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        required
                      >
                        <option value="body">Body Parts</option>
                        <option value="mechanical">Mechanical</option>
                        <option value="electrical">Electrical</option>
                        <option value="interior">Interior</option>
                        <option value="paint">Paint & Finishing</option>
                        <option value="labor">Labor</option>
                      </select>
                    </div>

                    <div>
                      <Label htmlFor={`quantity-${index}`}>Quantity *</Label>
                      <Input
                        id={`quantity-${index}`}
                        type="number"
                        min="1"
                        step="1"
                        value={item.quantity}
                        onChange={(e) => updateLineItem(index, "quantity", parseInt(e.target.value) || 1)}
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor={`unitPrice-${index}`}>Unit Price (USD) *</Label>
                      <Input
                        id={`unitPrice-${index}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(e) => updateLineItem(index, "unitPrice", parseFloat(e.target.value) || 0)}
                        required
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`isOEM-${index}`}
                        checked={item.isOEM}
                        onChange={(e) => updateLineItem(index, "isOEM", e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 dark:border-border"
                      />
                      <Label htmlFor={`isOEM-${index}`} className="font-normal">
                        OEM Part
                      </Label>
                    </div>

                    <div className="md:col-span-2 flex justify-end">
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Line Total</p>
                        <p className="text-lg font-semibold">
                          ${(item.quantity * item.unitPrice).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <Separator />

          {/* Cost Summary */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium">{currencySymbol}{calculateSubtotal().toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">VAT (15%)</span>
              <span className="font-medium">{currencySymbol}{calculateVAT().toFixed(2)}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-lg font-bold">
              <span>Total Quote</span>
              <span className="text-primary">{currencySymbol}{calculateTotal().toFixed(2)}</span>
            </div>
          </div>

          <Separator />

          {/* Additional Details */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="estimatedDuration">Estimated Repair Duration (days) *</Label>
              <Input
                id="estimatedDuration"
                type="number"
                min="1"
                step="1"
                value={estimatedDuration}
                onChange={(e) => setEstimatedDuration(parseInt(e.target.value) || 1)}
                required
              />
            </div>

            <div>
              <Label htmlFor="notes">Additional Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional information about the quote, parts availability, warranty, etc."
                rows={4}
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={createQuoteMutation.isPending}
          >
            {createQuoteMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting Quote...
              </>
            ) : (
              "Submit Quote"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
