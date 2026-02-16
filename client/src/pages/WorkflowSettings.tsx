/**
 * Workflow Settings Page
 * 
 * Allows insurer admins to configure workflow governance rules,
 * thresholds, and routing logic for their tenant.
 */

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
// Toast functionality commented out - implement when toast system is available
import { trpc } from "@/lib/trpc";
import { Loader2, Save, RotateCcw, Shield, Settings, AlertTriangle } from "lucide-react";

export default function WorkflowSettings() {
  // const { toast } = useToast();
  
  // Fetch current configuration
  const { data: config, isLoading, refetch } = trpc.workflow.getConfiguration.useQuery();
  
  // Update configuration mutation
  const updateConfig = trpc.workflow.updateConfiguration.useMutation({
    onSuccess: () => {
      // toast({ title: "Configuration Updated", description: "Workflow settings have been saved successfully." });
      alert("Configuration updated successfully!");
      refetch();
    },
    onError: (error: any) => {
      // toast({ variant: "destructive", title: "Update Failed", description: error.message });
      alert(`Update failed: ${error.message}`);
    },
  });

  // Local state for form
  const [formData, setFormData] = useState({
    riskManagerEnabled: true,
    highValueThreshold: 1000000, // $10,000 in cents
    executiveReviewThreshold: 5000000, // $50,000 in cents
    aiFastTrackEnabled: false,
    externalAssessorEnabled: false,
    maxSequentialStagesByUser: 2,
  });

  // Initialize form with fetched config
  useEffect(() => {
    if (config) {
      setFormData({
        riskManagerEnabled: config.riskManagerEnabled,
        highValueThreshold: config.highValueThreshold,
        executiveReviewThreshold: config.executiveReviewThreshold,
        aiFastTrackEnabled: config.aiFastTrackEnabled,
        externalAssessorEnabled: config.externalAssessorEnabled,
        maxSequentialStagesByUser: config.maxSequentialStagesByUser,
      });
    }
  }, [config]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateConfig.mutate(formData);
  };

  const handleReset = () => {
    if (config) {
      setFormData({
        riskManagerEnabled: config.riskManagerEnabled,
        highValueThreshold: config.highValueThreshold,
        executiveReviewThreshold: config.executiveReviewThreshold,
        aiFastTrackEnabled: config.aiFastTrackEnabled,
        externalAssessorEnabled: config.externalAssessorEnabled,
        maxSequentialStagesByUser: config.maxSequentialStagesByUser,
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Settings className="h-8 w-8" />
          Workflow Governance Settings
        </h1>
        <p className="text-muted-foreground mt-2">
          Configure workflow routing, thresholds, and governance rules for your organization.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Workflow Routing */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Workflow Routing
            </CardTitle>
            <CardDescription>
              Control which roles are involved in the claims approval process
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="riskManagerEnabled">Risk Manager Review</Label>
                <p className="text-sm text-muted-foreground">
                  Require Risk Manager approval before financial decision
                </p>
              </div>
              <Switch
                id="riskManagerEnabled"
                checked={formData.riskManagerEnabled}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, riskManagerEnabled: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="externalAssessorEnabled">External Assessors</Label>
                <p className="text-sm text-muted-foreground">
                  Allow routing claims to external assessment partners
                </p>
              </div>
              <Switch
                id="externalAssessorEnabled"
                checked={formData.externalAssessorEnabled}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, externalAssessorEnabled: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="aiFastTrackEnabled">AI Fast-Track</Label>
                <p className="text-sm text-muted-foreground">
                  Skip human assessment for low-risk, low-value claims
                </p>
              </div>
              <Switch
                id="aiFastTrackEnabled"
                checked={formData.aiFastTrackEnabled}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, aiFastTrackEnabled: checked })
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Thresholds */}
        <Card>
          <CardHeader>
            <CardTitle>Value Thresholds</CardTitle>
            <CardDescription>
              Set claim value thresholds for escalation and routing decisions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="highValueThreshold">High-Value Threshold ($)</Label>
              <Input
                id="highValueThreshold"
                type="number"
                value={formData.highValueThreshold / 100}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    highValueThreshold: Math.round(parseFloat(e.target.value) * 100),
                  })
                }
                step="100"
                min="0"
              />
              <p className="text-sm text-muted-foreground">
                Claims above this amount require additional approvals
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="executiveReviewThreshold">Executive Review Threshold ($)</Label>
              <Input
                id="executiveReviewThreshold"
                type="number"
                value={formData.executiveReviewThreshold / 100}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    executiveReviewThreshold: Math.round(parseFloat(e.target.value) * 100),
                  })
                }
                step="1000"
                min="0"
              />
              <p className="text-sm text-muted-foreground">
                Claims above this amount are flagged for executive oversight
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Segregation of Duties */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Segregation of Duties
            </CardTitle>
            <CardDescription>
              Prevent single-user end-to-end claim control
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="maxSequentialStagesByUser">
                Maximum Sequential Stages per User
              </Label>
              <Input
                id="maxSequentialStagesByUser"
                type="number"
                value={formData.maxSequentialStagesByUser}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    maxSequentialStagesByUser: parseInt(e.target.value),
                  })
                }
                min="1"
                max="5"
              />
              <p className="text-sm text-muted-foreground">
                Maximum number of consecutive workflow stages a single user can handle (recommended: 2)
              </p>
            </div>

            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
              <p className="text-sm text-yellow-800">
                <strong>Note:</strong> Setting this value too low may cause workflow bottlenecks.
                Setting it too high reduces fraud prevention effectiveness.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-4">
          <Button
            type="submit"
            disabled={updateConfig.isPending}
            className="flex items-center gap-2"
          >
            {updateConfig.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save Configuration
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            className="flex items-center gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </Button>
        </div>
      </form>
    </div>
  );
}
