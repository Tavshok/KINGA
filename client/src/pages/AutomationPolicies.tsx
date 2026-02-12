/**
 * KINGA - Automation Policy Configuration
 * 
 * Allows insurer administrators to configure confidence-governed automation policies.
 * Controls AI-only approval thresholds, claim type eligibility, max amounts, fraud cutoffs,
 * and vehicle category rules.
 */

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Save, CheckCircle2, Info } from "lucide-react";
import { toast } from "sonner";

type ClaimType = "collision" | "theft" | "fire" | "vandalism" | "hail" | "flood" | "other";
type VehicleCategory = "sedan" | "suv" | "truck" | "luxury" | "sports" | "commercial";

const CLAIM_TYPES: { value: ClaimType; label: string }[] = [
  { value: "collision", label: "Collision" },
  { value: "theft", label: "Theft" },
  { value: "fire", label: "Fire" },
  { value: "vandalism", label: "Vandalism" },
  { value: "hail", label: "Hail Damage" },
  { value: "flood", label: "Flood" },
  { value: "other", label: "Other" },
];

const VEHICLE_CATEGORIES: { value: VehicleCategory; label: string }[] = [
  { value: "sedan", label: "Sedan" },
  { value: "suv", label: "SUV" },
  { value: "truck", label: "Truck" },
  { value: "luxury", label: "Luxury" },
  { value: "sports", label: "Sports Car" },
  { value: "commercial", label: "Commercial" },
];

export default function AutomationPolicies() {
  
  // Form state
  const [minAutomationConfidence, setMinAutomationConfidence] = useState(85);
  const [minHybridConfidence, setMinHybridConfidence] = useState(70);
  const [maxAiOnlyApprovalAmount, setMaxAiOnlyApprovalAmount] = useState("10000");
  const [maxHybridApprovalAmount, setMaxHybridApprovalAmount] = useState("50000");
  const [maxFraudScoreForAutomation, setMaxFraudScoreForAutomation] = useState(30);
  const [eligibleClaimTypes, setEligibleClaimTypes] = useState<ClaimType[]>(["collision", "hail", "vandalism"]);
  const [excludedClaimTypes, setExcludedClaimTypes] = useState<ClaimType[]>(["theft", "fire"]);
  const [eligibleVehicleCategories, setEligibleVehicleCategories] = useState<VehicleCategory[]>(["sedan", "suv", "truck"]);
  const [excludedVehicleMakes, setExcludedVehicleMakes] = useState<string[]>([]);
  const [maxVehicleAge, setMaxVehicleAge] = useState("15");
  const [requireManagerApprovalAbove, setRequireManagerApprovalAbove] = useState("25000");

  // Queries
  const { data: activePolicy, isLoading: loadingPolicy } = trpc.automationPolicies.getActivePolicy.useQuery();
  const { data: policyHistory, isLoading: loadingHistory } = trpc.automationPolicies.getPolicyHistory.useQuery();

  // Mutations
  const createPolicy = trpc.automationPolicies.createPolicy.useMutation({
    onSuccess: () => {
      toast.success("Automation policy has been successfully created and activated.");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updatePolicy = trpc.automationPolicies.updatePolicy.useMutation({
    onSuccess: () => {
      toast.success("Automation policy has been successfully updated.");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Load active policy into form
  useEffect(() => {
    if (activePolicy) {
      setMinAutomationConfidence(activePolicy.minAutomationConfidence);
      setMinHybridConfidence(activePolicy.minHybridConfidence);
      setMaxAiOnlyApprovalAmount(activePolicy.maxAiOnlyApprovalAmount.toString());
      setMaxHybridApprovalAmount(activePolicy.maxHybridApprovalAmount.toString());
      setMaxFraudScoreForAutomation(activePolicy.maxFraudScoreForAutomation);
      setEligibleClaimTypes(activePolicy.eligibleClaimTypes as ClaimType[]);
      setExcludedClaimTypes(activePolicy.excludedClaimTypes as ClaimType[]);
      setEligibleVehicleCategories(activePolicy.eligibleVehicleCategories as VehicleCategory[]);
      setExcludedVehicleMakes(activePolicy.excludedVehicleMakes as string[]);
      setMaxVehicleAge(activePolicy.maxVehicleAge?.toString() || "15");
      setRequireManagerApprovalAbove(activePolicy.requireManagerApprovalAbove.toString());
    }
  }, [activePolicy]);

  const handleSavePolicy = async () => {
    const policyData = {
      minAutomationConfidence,
      minHybridConfidence,
      maxAiOnlyApprovalAmount: parseInt(maxAiOnlyApprovalAmount),
      maxHybridApprovalAmount: parseInt(maxHybridApprovalAmount),
      maxFraudScoreForAutomation,
      eligibleClaimTypes,
      excludedClaimTypes,
      eligibleVehicleCategories,
      excludedVehicleMakes,
      maxVehicleAge: parseInt(maxVehicleAge),
      requireManagerApprovalAbove: parseInt(requireManagerApprovalAbove),
    };

    if (activePolicy) {
      await updatePolicy.mutateAsync({
        policyId: activePolicy.id,
        ...policyData,
      });
    } else {
      await createPolicy.mutateAsync(policyData);
    }
  };

  const toggleClaimType = (type: ClaimType, list: "eligible" | "excluded") => {
    if (list === "eligible") {
      setEligibleClaimTypes((prev) =>
        prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
      );
    } else {
      setExcludedClaimTypes((prev) =>
        prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
      );
    }
  };

  const toggleVehicleCategory = (category: VehicleCategory) => {
    setEligibleVehicleCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  };

  if (loadingPolicy) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-5xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Automation Policy Configuration</h1>
        <p className="text-muted-foreground">
          Configure confidence thresholds and eligibility rules for AI-powered claim automation.
        </p>
      </div>

      <Alert className="mb-6">
        <Info className="h-4 w-4" />
        <AlertDescription>
          These settings control when claims are automatically processed by AI versus requiring human review.
          Higher confidence thresholds mean more conservative automation with fewer false approvals.
        </AlertDescription>
      </Alert>

      <div className="space-y-6">
        {/* Confidence Thresholds */}
        <Card>
          <CardHeader>
            <CardTitle>Confidence Thresholds</CardTitle>
            <CardDescription>
              Set minimum AI confidence scores required for automated claim processing
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="flex justify-between items-center mb-2">
                <Label>AI-Only Approval Threshold</Label>
                <span className="text-sm font-medium">{minAutomationConfidence}%</span>
              </div>
              <Slider
                value={[minAutomationConfidence]}
                onValueChange={([value]) => setMinAutomationConfidence(value)}
                min={50}
                max={100}
                step={5}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Claims with confidence above this threshold will be auto-approved without human review
              </p>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <Label>Hybrid Workflow Threshold</Label>
                <span className="text-sm font-medium">{minHybridConfidence}%</span>
              </div>
              <Slider
                value={[minHybridConfidence]}
                onValueChange={([value]) => setMinHybridConfidence(value)}
                min={50}
                max={100}
                step={5}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Claims between this threshold and AI-only threshold will use hybrid workflow (AI + human review)
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Approval Amounts */}
        <Card>
          <CardHeader>
            <CardTitle>Approval Amount Limits</CardTitle>
            <CardDescription>
              Maximum claim amounts for automated processing (in local currency)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="maxAiOnly">Max AI-Only Approval Amount</Label>
              <Input
                id="maxAiOnly"
                type="number"
                value={maxAiOnlyApprovalAmount}
                onChange={(e) => setMaxAiOnlyApprovalAmount(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Claims above this amount require human review even with high confidence
              </p>
            </div>

            <div>
              <Label htmlFor="maxHybrid">Max Hybrid Approval Amount</Label>
              <Input
                id="maxHybrid"
                type="number"
                value={maxHybridApprovalAmount}
                onChange={(e) => setMaxHybridApprovalAmount(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Maximum amount for hybrid workflow processing
              </p>
            </div>

            <div>
              <Label htmlFor="managerApproval">Require Manager Approval Above</Label>
              <Input
                id="managerApproval"
                type="number"
                value={requireManagerApprovalAbove}
                onChange={(e) => setRequireManagerApprovalAbove(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Claims above this amount require manager approval
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Fraud & Risk Controls */}
        <Card>
          <CardHeader>
            <CardTitle>Fraud & Risk Controls</CardTitle>
            <CardDescription>
              Configure fraud detection and risk management thresholds
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <Label>Max Fraud Score for Automation</Label>
                <span className="text-sm font-medium">{maxFraudScoreForAutomation}%</span>
              </div>
              <Slider
                value={[maxFraudScoreForAutomation]}
                onValueChange={([value]) => setMaxFraudScoreForAutomation(value)}
                min={0}
                max={100}
                step={5}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Claims with fraud scores above this threshold will be routed to manual review
              </p>
            </div>

            <div>
              <Label htmlFor="maxAge">Max Vehicle Age (years)</Label>
              <Input
                id="maxAge"
                type="number"
                value={maxVehicleAge}
                onChange={(e) => setMaxVehicleAge(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Vehicles older than this will require manual assessment
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Claim Type Eligibility */}
        <Card>
          <CardHeader>
            <CardTitle>Claim Type Eligibility</CardTitle>
            <CardDescription>
              Select which claim types are eligible for automated processing
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="font-medium mb-3">Eligible for Automation</h4>
                <div className="space-y-2">
                  {CLAIM_TYPES.map((type) => (
                    <div key={type.value} className="flex items-center space-x-2">
                      <Checkbox
                        id={`eligible-${type.value}`}
                        checked={eligibleClaimTypes.includes(type.value)}
                        onCheckedChange={() => toggleClaimType(type.value, "eligible")}
                      />
                      <label
                        htmlFor={`eligible-${type.value}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        {type.label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-3">Excluded from Automation</h4>
                <div className="space-y-2">
                  {CLAIM_TYPES.map((type) => (
                    <div key={type.value} className="flex items-center space-x-2">
                      <Checkbox
                        id={`excluded-${type.value}`}
                        checked={excludedClaimTypes.includes(type.value)}
                        onCheckedChange={() => toggleClaimType(type.value, "excluded")}
                      />
                      <label
                        htmlFor={`excluded-${type.value}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        {type.label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Vehicle Category Rules */}
        <Card>
          <CardHeader>
            <CardTitle>Vehicle Category Rules</CardTitle>
            <CardDescription>
              Select vehicle categories that are eligible for automation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              {VEHICLE_CATEGORIES.map((category) => (
                <div key={category.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`vehicle-${category.value}`}
                    checked={eligibleVehicleCategories.includes(category.value)}
                    onCheckedChange={() => toggleVehicleCategory(category.value)}
                  />
                  <label
                    htmlFor={`vehicle-${category.value}`}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {category.label}
                  </label>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Selected categories are eligible for automated processing
            </p>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button
            onClick={handleSavePolicy}
            disabled={createPolicy.isPending || updatePolicy.isPending}
            size="lg"
          >
            {(createPolicy.isPending || updatePolicy.isPending) && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            <Save className="mr-2 h-4 w-4" />
            {activePolicy ? "Update Policy" : "Create Policy"}
          </Button>
        </div>

        {/* Policy History */}
        {policyHistory && policyHistory.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Policy History</CardTitle>
              <CardDescription>
                Previous automation policy configurations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {policyHistory.map((policy) => (
                  <div
                    key={policy.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div>
                      <p className="font-medium">{policy.policyName}</p>
                      <p className="text-sm text-muted-foreground">
                        Created: {new Date(policy.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {policy.isActive ? (
                        <span className="flex items-center text-sm text-green-600">
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Active
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Inactive</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
