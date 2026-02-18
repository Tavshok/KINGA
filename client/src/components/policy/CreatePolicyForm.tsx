/**
 * Create Policy Form Component
 * 
 * Form to create a new automation policy from profile templates with customization options.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Shield, TrendingUp, AlertTriangle, Zap, Settings } from "lucide-react";

interface CreatePolicyFormProps {
  profiles: any[]; // PolicyProfileTemplate[]
  onPolicyCreated: () => void;
}

export function CreatePolicyForm({ profiles, onPolicyCreated }: CreatePolicyFormProps) {
  const { toast } = useToast();
  const [selectedProfileType, setSelectedProfileType] = useState<string>("balanced");
  const [customizations, setCustomizations] = useState<any>({});

  const createMutation = trpc.policyManagement.createFromProfile.useMutation({
    onSuccess: () => {
      toast({
        title: "Policy Created",
        description: "The policy has been successfully created. You can now activate it.",
      });
      onPolicyCreated();
    },
    onError: (error) => {
      toast({
        title: "Creation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const selectedProfile = profiles.find(p => p.profileType === selectedProfileType);

  const handleCreate = () => {
    createMutation.mutate({
      profileType: selectedProfileType as any,
      customizations: Object.keys(customizations).length > 0 ? customizations : undefined,
    });
  };

  const profileIcons = {
    conservative: <Shield className="h-5 w-5" />,
    balanced: <TrendingUp className="h-5 w-5" />,
    aggressive: <Zap className="h-5 w-5" />,
    fraud_sensitive: <AlertTriangle className="h-5 w-5" />,
    custom: <Settings className="h-5 w-5" />,
  };

  if (!selectedProfile) {
    return <div>Loading...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create New Policy</CardTitle>
        <CardDescription>
          Select a profile template and customize parameters as needed
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Profile Selection */}
        <div className="space-y-2">
          <Label>Policy Profile</Label>
          <Select value={selectedProfileType} onValueChange={setSelectedProfileType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {profiles.map((profile) => (
                <SelectItem key={profile.profileType} value={profile.profileType}>
                  <div className="flex items-center gap-2">
                    {profileIcons[profile.profileType as keyof typeof profileIcons]}
                    <span>{profile.policyName}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            {selectedProfile.description}
          </p>
        </div>

        {/* Profile Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-secondary rounded-lg">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Automation Threshold</p>
            <p className="text-lg font-bold">{selectedProfile.minAutomationConfidence}%</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Hybrid Threshold</p>
            <p className="text-lg font-bold">{selectedProfile.minHybridConfidence}%</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">AI Approval Limit</p>
            <p className="text-lg font-bold">
              ${(selectedProfile.maxAiOnlyApprovalAmount / 100).toLocaleString()}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Fraud Sensitivity</p>
            <p className="text-lg font-bold">{selectedProfile.fraudSensitivityMultiplier}x</p>
          </div>
        </div>

        {/* Customization Options */}
        <div className="space-y-4">
          <h4 className="font-semibold">Customize Parameters (Optional)</h4>

          {/* Policy Name */}
          <div className="space-y-2">
            <Label htmlFor="policyName">Policy Name</Label>
            <Input
              id="policyName"
              placeholder={selectedProfile.policyName}
              value={customizations.policyName || ""}
              onChange={(e) => setCustomizations({ ...customizations, policyName: e.target.value })}
            />
          </div>

          {/* Confidence Thresholds */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Automation Confidence: {customizations.minAutomationConfidence || selectedProfile.minAutomationConfidence}%</Label>
              <Slider
                value={[customizations.minAutomationConfidence || selectedProfile.minAutomationConfidence]}
                onValueChange={([value]) => setCustomizations({ ...customizations, minAutomationConfidence: value })}
                min={50}
                max={100}
                step={5}
              />
            </div>
            <div className="space-y-2">
              <Label>Hybrid Confidence: {customizations.minHybridConfidence || selectedProfile.minHybridConfidence}%</Label>
              <Slider
                value={[customizations.minHybridConfidence || selectedProfile.minHybridConfidence]}
                onValueChange={([value]) => setCustomizations({ ...customizations, minHybridConfidence: value })}
                min={40}
                max={90}
                step={5}
              />
            </div>
          </div>

          {/* Financial Limits */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="aiLimit">AI-Only Approval Limit ($)</Label>
              <Input
                id="aiLimit"
                type="number"
                placeholder={(selectedProfile.maxAiOnlyApprovalAmount / 100).toString()}
                value={customizations.maxAiOnlyApprovalAmount ? customizations.maxAiOnlyApprovalAmount / 100 : ""}
                onChange={(e) => setCustomizations({ 
                  ...customizations, 
                  maxAiOnlyApprovalAmount: Number(e.target.value) * 100 
                })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hybridLimit">Hybrid Approval Limit ($)</Label>
              <Input
                id="hybridLimit"
                type="number"
                placeholder={(selectedProfile.maxHybridApprovalAmount / 100).toString()}
                value={customizations.maxHybridApprovalAmount ? customizations.maxHybridApprovalAmount / 100 : ""}
                onChange={(e) => setCustomizations({ 
                  ...customizations, 
                  maxHybridApprovalAmount: Number(e.target.value) * 100 
                })}
              />
            </div>
          </div>

          {/* Fraud Controls */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Max Fraud Score: {customizations.maxFraudScoreForAutomation || selectedProfile.maxFraudScoreForAutomation}</Label>
              <Slider
                value={[customizations.maxFraudScoreForAutomation || selectedProfile.maxFraudScoreForAutomation]}
                onValueChange={([value]) => setCustomizations({ ...customizations, maxFraudScoreForAutomation: value })}
                min={10}
                max={50}
                step={5}
              />
            </div>
            <div className="space-y-2">
              <Label>Fraud Sensitivity: {customizations.fraudSensitivityMultiplier || selectedProfile.fraudSensitivityMultiplier}x</Label>
              <Slider
                value={[customizations.fraudSensitivityMultiplier || selectedProfile.fraudSensitivityMultiplier]}
                onValueChange={([value]) => setCustomizations({ ...customizations, fraudSensitivityMultiplier: value })}
                min={0.5}
                max={2.0}
                step={0.25}
              />
            </div>
          </div>
        </div>

        {/* Create Button */}
        <div className="flex justify-end gap-2 pt-4">
          <Button
            onClick={handleCreate}
            disabled={createMutation.isPending}
            size="lg"
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Policy"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
