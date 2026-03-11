import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Wrench, ArrowLeft, Plus, Trash2, Save, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocation, useRoute } from "wouter";
import { toast } from "sonner";
import { useState } from "react";
import { PdfQuoteUpload } from "@/components/PdfQuoteUpload";

interface LineItem {
  id: string;
  item: string;
  cost: string;
}

export default function PanelBeaterQuoteSubmission() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/panel-beater/claims/:id/quote");
  const claimId = params?.id ? parseInt(params.id) : 0;

  // Form state
  const [laborCost, setLaborCost] = useState("");
  const [partsCost, setPartsCost] = useState("");
  const [estimatedDuration, setEstimatedDuration] = useState("");
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: "1", item: "", cost: "" }
  ]);
  const [laborHours, setLaborHours] = useState("");
  const [vatRate, setVatRate] = useState("15"); // Default 15% VAT for Zimbabwe
  const [includeVat, setIncludeVat] = useState(false);
  const [uploadMethod, setUploadMethod] = useState<"manual" | "pdf">("manual");

  // Get claim details
  const { data: claim, isLoading } = trpc.claims.getById.useQuery({ id: claimId });

  // Submit quote mutation
  const submitQuote = trpc.quotes.submit.useMutation({
    onSuccess: () => {
      toast.success("Quote submitted successfully");
      setLocation("/panel-beater/dashboard");
    },
    onError: (error) => {
      toast.error(`Failed to submit quote: ${error.message}`);
    },
  });

  const addLineItem = () => {
    setLineItems([...lineItems, { id: Date.now().toString(), item: "", cost: "" }]);
  };

  const removeLineItem = (id: string) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter(item => item.id !== id));
    }
  };

  const updateLineItem = (id: string, field: "item" | "cost", value: string) => {
    setLineItems(lineItems.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const calculateTotal = () => {
    const labor = parseFloat(laborCost) || 0;
    const parts = parseFloat(partsCost) || 0;
    const items = lineItems.reduce((sum, item) => sum + (parseFloat(item.cost) || 0), 0);
    const subtotal = labor + parts + items;
    const vat = includeVat ? subtotal * (parseFloat(vatRate) / 100) : 0;
    return subtotal + vat;
  };

  const calculateSubtotal = () => {
    const labor = parseFloat(laborCost) || 0;
    const parts = parseFloat(partsCost) || 0;
    const items = lineItems.reduce((sum, item) => sum + (parseFloat(item.cost) || 0), 0);
    return labor + parts + items;
  };

  const calculateVat = () => {
    return includeVat ? calculateSubtotal() * (parseFloat(vatRate) / 100) : 0;
  };

  const handlePdfExtracted = (data: any) => {
    // Populate form with extracted data
    setLaborCost((data.laborCost / 100).toFixed(2));
    setPartsCost((data.partsCost / 100).toFixed(2));
    setLaborHours(data.laborHours.toString());
    setEstimatedDuration(data.estimatedDuration.toString());
    setNotes(data.notes || "");
    
    // Populate line items
    if (data.components && data.components.length > 0) {
      const newLineItems = data.components.map((comp: any, index: number) => ({
        id: Date.now().toString() + index,
        item: comp.name,
        cost: ((comp.partCost + comp.laborCost) / 100).toFixed(2)
      }));
      setLineItems(newLineItems);
    }
    
    toast.success("Quote data extracted successfully!");
    setUploadMethod("manual"); // Switch to manual mode to review/edit
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const total = calculateTotal();
    if (total <= 0) {
      toast.error("Total quote amount must be greater than zero");
      return;
    }

    const itemizedBreakdown = lineItems
      .filter(item => item.item && item.cost)
      .map(item => ({
        item: item.item,
        cost: Math.round(parseFloat(item.cost) * 100), // Convert to cents
      }));

    submitQuote.mutate({
      claimId,
      panelBeaterId: Number(user!.id),
      quotedAmount: Math.round(total * 100), // Convert to cents
      laborCost: laborCost ? Math.round(parseFloat(laborCost) * 100) : undefined,
      partsCost: partsCost ? Math.round(parseFloat(partsCost) * 100) : undefined,
      laborHours: laborHours ? parseFloat(laborHours) : undefined,
      estimatedDuration: parseInt(estimatedDuration) || 7,
      itemizedBreakdown,
      notes: notes || undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-accent/5">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!claim) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-accent/5">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Claim Not Found</CardTitle>
            <CardDescription>The requested claim could not be found</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setLocation("/panel-beater/dashboard")}>
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-accent/5">
      {/* Header */}
      <header className="bg-white dark:bg-card border-b shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Wrench className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-2xl font-bold">Submit Quote</h1>
                <p className="text-sm text-muted-foreground font-mono">{claim.claimNumber}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setLocation("/panel-beater/dashboard")}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Dashboard
              </Button>
              <div className="text-right">
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{user?.role?.replace("_", " ")}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => logout()}>
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Quote Form - Left Column */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Repair Quote</CardTitle>
                <CardDescription>
                  Provide a detailed breakdown of repair costs
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Upload Method Toggle */}
                <div className="mb-6 flex gap-2">
                  <Button
                    type="button"
                    variant={uploadMethod === "manual" ? "default" : "outline"}
                    onClick={() => setUploadMethod("manual")}
                  >
                    Manual Entry
                  </Button>
                  <Button
                    type="button"
                    variant={uploadMethod === "pdf" ? "default" : "outline"}
                    onClick={() => setUploadMethod("pdf")}
                  >
                    Upload PDF/Image
                  </Button>
                </div>

                {uploadMethod === "pdf" ? (
                  <PdfQuoteUpload
                    claimId={claimId}
                    onExtracted={handlePdfExtracted}
                  />
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Cost Summary */}
                    <div className="grid gap-4 md:grid-cols-4">
                    <div className="space-y-2">
                      <Label htmlFor="laborCost">Labor Cost ($)</Label>
                      <Input
                        id="laborCost"
                        type="number"
                        step="0.01"
                        value={laborCost}
                        onChange={(e) => setLaborCost(e.target.value)}
                        placeholder="1500.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="partsCost">Parts Cost ($)</Label>
                      <Input
                        id="partsCost"
                        type="number"
                        step="0.01"
                        value={partsCost}
                        onChange={(e) => setPartsCost(e.target.value)}
                        placeholder="2500.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="laborHours">Labor Hours</Label>
                      <Input
                        id="laborHours"
                        type="number"
                        step="0.5"
                        value={laborHours}
                        onChange={(e) => setLaborHours(e.target.value)}
                        placeholder="40"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="estimatedDuration">Duration (days) *</Label>
                      <Input
                        id="estimatedDuration"
                        type="number"
                        required
                        value={estimatedDuration}
                        onChange={(e) => setEstimatedDuration(e.target.value)}
                        placeholder="7"
                      />
                    </div>
                  </div>

                  <Separator />

                  {/* Itemized Breakdown */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label>Itemized Breakdown</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addLineItem}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Add Item
                      </Button>
                    </div>

                    {lineItems.map((lineItem, index) => (
                      <div key={lineItem.id} className="flex gap-2">
                        <div className="flex-1">
                          <Input
                            placeholder="Item description"
                            value={lineItem.item}
                            onChange={(e) => updateLineItem(lineItem.id, "item", e.target.value)}
                          />
                        </div>
                        <div className="w-32">
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="Cost"
                            value={lineItem.cost}
                            onChange={(e) => updateLineItem(lineItem.id, "cost", e.target.value)}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => removeLineItem(lineItem.id)}
                          disabled={lineItems.length === 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <Separator />

                  {/* Notes */}
                  <div className="space-y-2">
                    <Label htmlFor="notes">Additional Notes</Label>
                    <Textarea
                      id="notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Any additional information about the repair..."
                      rows={4}
                    />
                  </div>

                  <Separator />

                  {/* VAT Calculation */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="includeVat"
                        checked={includeVat}
                        onChange={(e) => setIncludeVat(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 dark:border-border"
                      />
                      <Label htmlFor="includeVat" className="cursor-pointer">
                        Include VAT
                      </Label>
                    </div>
                    {includeVat && (
                      <div className="space-y-2">
                        <Label htmlFor="vatRate">VAT Rate (%)</Label>
                        <Input
                          id="vatRate"
                          type="number"
                          step="0.01"
                          value={vatRate}
                          onChange={(e) => setVatRate(e.target.value)}
                          placeholder="15"
                          className="w-32"
                        />
                      </div>
                    )}
                  </div>

                  {/* Total */}
                  <div className="bg-muted p-4 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Subtotal:</span>
                      <span className="font-medium">
                        ${calculateSubtotal().toFixed(2)}
                      </span>
                    </div>
                    {includeVat && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">VAT ({vatRate}%):</span>
                        <span className="font-medium">
                          ${calculateVat().toFixed(2)}
                        </span>
                      </div>
                    )}
                    <Separator />
                    <div className="flex items-center justify-between text-lg font-bold">
                      <span>Total Quote Amount:</span>
                      <span className="text-2xl text-primary">
                        ${calculateTotal().toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Submit */}
                  <div className="flex gap-3 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={() => setLocation("/panel-beater/dashboard")}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1"
                      disabled={submitQuote.isPending}
                    >
                      {submitQuote.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          Submit Quote
                        </>
                      )}
                    </Button>
                  </div>
                </form>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Claim Details - Right Column */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle>Claim Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-muted-foreground">Vehicle</Label>
                  <p className="font-medium">
                    {claim.vehicleMake} {claim.vehicleModel} ({claim.vehicleYear})
                  </p>
                </div>

                <Separator />

                <div>
                  <Label className="text-muted-foreground">Registration</Label>
                  <p className="font-medium">{claim.vehicleRegistration}</p>
                </div>

                <Separator />

                <div>
                  <Label className="text-muted-foreground">Incident Description</Label>
                  <p className="text-sm">{claim.incidentDescription}</p>
                </div>

                <Separator />

                <div>
                  <Label className="text-muted-foreground">Location</Label>
                  <p className="text-sm">{claim.incidentLocation}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
