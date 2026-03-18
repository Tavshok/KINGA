import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, DollarSign, Loader2, TrendingUp, AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";

interface VehicleValuationCardProps {
  claimId: number;
  /** Pre-populated mileage from the claim form (vehicleMileage field) */
  vehicleMileage?: string | null;
  /** Vehicle year for year-only valuation fallback when mileage is missing */
  vehicleYear?: string | number | null;
}

export default function VehicleValuationCard({ claimId, vehicleMileage, vehicleYear }: VehicleValuationCardProps) {
  const { fmt } = useTenantCurrency();
  // Auto-populate mileage from claim form if available
  const [mileage, setMileage] = useState(() => {
    if (vehicleMileage) {
      const parsed = parseInt(vehicleMileage.replace(/[^0-9]/g, ''));
      return isNaN(parsed) ? '' : String(parsed);
    }
    return '';
  });
  const [condition, setCondition] = useState<"excellent" | "good" | "fair" | "poor">("good");
  const isMileageMissing = !vehicleMileage || vehicleMileage.trim() === '';

  // Get existing valuation
  const { data: valuation, refetch } = trpc.vehicleValuation.byClaim.useQuery({ claimId });

  // Trigger valuation mutation
  const triggerValuation = trpc.vehicleValuation.trigger.useMutation({
    onSuccess: (data) => {
      if (data.isTotalLoss) {
        toast.warning("Total Loss Detected!", {
          description: `Repair cost exceeds ${data.totalLossThreshold}% of vehicle value`,
        });
      } else {
        toast.success("Vehicle valuation completed successfully");
      }
      refetch();
    },
    onError: (error) => {
      toast.error(`Valuation failed: ${error.message}`);
    },
  });

  const handleTriggerValuation = () => {
    if (!mileage || isNaN(parseInt(mileage))) {
      toast.error("Please enter a valid mileage");
      return;
    }

    triggerValuation.mutate({
      claimId,
      mileage: parseInt(mileage),
      condition,
    });
  };

  if (valuation) {
    const priceRange = valuation.priceRange;
    const notes = valuation.notes || [];

    return (
      <Card className={valuation.isTotalLoss ? "border-red-500 border-2" : ""}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Vehicle Market Valuation
              </CardTitle>
              <CardDescription>AI-powered market value assessment</CardDescription>
            </div>
            {valuation.isTotalLoss && (
              <Badge variant="destructive" className="text-sm">
                <AlertTriangle className="h-3 w-3 mr-1" />
                TOTAL LOSS
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Market Value Summary */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-primary/5 rounded-lg p-4">
              <Label className="text-muted-foreground text-sm">Estimated Market Value</Label>
              <p className="text-2xl font-bold text-primary/90">
                ${valuation.estimatedMarketValue.toFixed(2)}
              </p>
            </div>
            <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-4">
              <Label className="text-muted-foreground text-sm">Final Adjusted Value</Label>
              <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                ${(valuation.finalAdjustedValue ?? 0).toFixed(2)}
              </p>
            </div>
          </div>

          {/* Price Range */}
          {priceRange && (
            <div>
              <Label className="text-muted-foreground">Market Price Range</Label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                <div className="text-center p-2 bg-gray-50 dark:bg-muted/50 rounded">
                  <p className="text-xs text-muted-foreground">Min</p>
                  <p className="font-medium">{fmt(priceRange.min)}</p>
                </div>
                <div className="text-center p-2 bg-gray-50 dark:bg-muted/50 rounded">
                  <p className="text-xs text-muted-foreground">Median</p>
                  <p className="font-medium">{fmt(priceRange.median)}</p>
                </div>
                <div className="text-center p-2 bg-gray-50 dark:bg-muted/50 rounded">
                  <p className="text-xs text-muted-foreground">Max</p>
                  <p className="font-medium">{fmt(priceRange.max)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Adjustments */}
          <div>
            <Label className="text-muted-foreground">Valuation Adjustments</Label>
            <div className="space-y-2 mt-2">
              {(valuation.conditionAdjustment ?? 0) !== 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span>Condition Adjustment ({valuation.condition})</span>
                  <span className={(valuation.conditionAdjustment ?? 0) > 0 ? "text-green-600" : "text-red-600"}>
                    {(valuation.conditionAdjustment ?? 0) > 0 ? "+" : ""}
                    ${(valuation.conditionAdjustment ?? 0).toFixed(2)}
                  </span>
                </div>
              )}
              {(valuation.mileageAdjustment ?? 0) !== 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span>Mileage Adjustment ({valuation.mileage?.toLocaleString()} km)</span>
                  <span className={(valuation.mileageAdjustment ?? 0) > 0 ? "text-green-600" : "text-red-600"}>
                    {(valuation.mileageAdjustment ?? 0) > 0 ? "+" : ""}
                    ${(valuation.mileageAdjustment ?? 0).toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Valuation Metadata */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <Label className="text-muted-foreground">Valuation Method</Label>
              <p className="capitalize">{valuation.valuationMethod.replace(/_/g, " ")}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Confidence Score</Label>
              <div className="flex items-center gap-2">
                <p>{valuation.confidenceScore ?? 0}%</p>
                <Badge variant={(valuation.confidenceScore ?? 0) >= 70 ? "default" : "outline"}>
                  {(valuation.confidenceScore ?? 0) >= 70 ? "High" : "Medium"}
                </Badge>
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground">Data Points</Label>
              <p>{valuation.dataPointsCount} sources</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Valuation Date</Label>
              <p>
                {valuation.valuationDate
                  ? new Date(valuation.valuationDate).toLocaleDateString()
                  : "N/A"}
              </p>
            </div>
          </div>

          {/* Total Loss Analysis */}
          {valuation.repairCostToValueRatio && (
            <div className={`rounded-lg p-4 ${valuation.isTotalLoss ? "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800" : "bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800"}`}>
              <div className="flex items-center gap-2 mb-2">
                {valuation.isTotalLoss ? (
                  <AlertCircle className="h-4 w-4 text-red-600" />
                ) : (
                  <TrendingUp className="h-4 w-4 text-green-600" />
                )}
                <Label className={valuation.isTotalLoss ? "text-red-800 dark:text-red-200" : "text-green-800 dark:text-green-200"}>
                  Total Loss Analysis
                </Label>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Repair Cost to Value Ratio</span>
                  <span className="font-medium">
                    {parseFloat(valuation.repairCostToValueRatio || "0").toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Loss Threshold</span>
                  <span className="font-medium">
                    {parseFloat(valuation.totalLossThreshold || "60").toFixed(0)}%
                  </span>
                </div>
                {valuation.isTotalLoss && (
                  <p className="text-red-700 dark:text-red-300 font-medium mt-2">
                    ⚠️ Recommend cash settlement instead of repair
                  </p>
                )}
              </div>
            </div>
          )}

          {/* AI Reasoning */}
          {notes.length > 0 && (
            <div>
              <Label className="text-muted-foreground">Valuation Notes</Label>
              <div className="mt-2 space-y-1">
                {notes.map((note, idx) => (
                  <p key={idx} className="text-sm text-gray-700 dark:text-foreground/80">
                    • {note}
                  </p>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Vehicle Market Valuation
        </CardTitle>
        <CardDescription>
          Trigger AI-powered market valuation to determine total loss status
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Missing mileage flag */}
        {isMileageMissing && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 rounded-lg">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-amber-800 dark:text-amber-200">Mileage not recorded on claim form</p>
              <p className="text-amber-700 dark:text-amber-300 text-xs mt-0.5">
                Enter mileage manually below for accurate valuation.
                {vehicleYear ? ` Year-based estimate available using ${vehicleYear} model year.` : ''}
              </p>
            </div>
          </div>
        )}
        <div>
          <Label htmlFor="mileage">
            Current Mileage (km) <span className="text-red-500">*</span>
          </Label>
          <Input
            id="mileage"
            type="number"
            value={mileage}
            onChange={(e) => setMileage(e.target.value)}
            placeholder="e.g., 120000"
            required
          />
          {mileage && vehicleMileage && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
              <span>✓</span> Auto-populated from claim form
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="condition">
            Vehicle Condition <span className="text-red-500">*</span>
          </Label>
          <Select value={condition} onValueChange={(v: any) => setCondition(v)}>
            <SelectTrigger id="condition">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="excellent">Excellent</SelectItem>
              <SelectItem value="good">Good</SelectItem>
              <SelectItem value="fair">Fair</SelectItem>
              <SelectItem value="poor">Poor</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            Excellent (+15%), Good (0%), Fair (-15%), Poor (-30%)
          </p>
        </div>

        <Button
          onClick={handleTriggerValuation}
          disabled={triggerValuation.isPending}
          className="w-full"
        >
          {triggerValuation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Calculating Valuation...
            </>
          ) : (
            <>
              <TrendingUp className="mr-2 h-4 w-4" />
              Trigger AI Valuation
            </>
          )}
        </Button>

        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-sm text-secondary">
          <p className="font-medium mb-1">How it works:</p>
          <ul className="space-y-1 text-xs">
            <li>• AI analyzes Zimbabwe, Zambia, and SA markets</li>
            <li>• Calculates import costs from SA (40% duty + transport)</li>
            <li>• Applies condition and mileage adjustments</li>
            <li>• Determines total loss if repair cost &gt; 60% of value</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
