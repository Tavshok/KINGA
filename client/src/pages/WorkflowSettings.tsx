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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// Toast functionality commented out - implement when toast system is available
import { trpc } from "@/lib/trpc";
import { Loader2, Save, RotateCcw, Shield, Settings, AlertTriangle, Globe } from "lucide-react";
import { SUPPORTED_COUNTRIES } from "../../../shared/countryCurrency";
import { useAuth } from "@/_core/hooks/useAuth";

export default function WorkflowSettings() {
  // const { toast } = useToast();
  const { user } = useAuth();

  // Fetch current configuration
  const { data: config, isLoading, refetch } = trpc.workflow.getConfiguration.useQuery();

  // Fetch current tenant (for country/currency)
  const { data: tenant, refetch: refetchTenant } = trpc.tenant.getCurrent.useQuery();

  // Country/currency state
  const [countryForm, setCountryForm] = useState({ country: '', currencyCode: '', currencySymbol: '' });
  const [countrySaving, setCountrySaving] = useState(false);
  const updateCurrency = trpc.tenant.updateCurrency.useMutation({
    onSuccess: () => { refetchTenant(); setCountrySaving(false); alert('Region & currency updated.'); },
    onError: (err: any) => { setCountrySaving(false); alert(`Update failed: ${err.message}`); },
  });

  // Sync country form when tenant data loads
  useEffect(() => {
    if (tenant) {
      setCountryForm({
        country: (tenant as any).country ?? '',
        currencyCode: tenant.currencyCode ?? '',
        currencySymbol: tenant.currencySymbol ?? '',
      });
    }
  }, [tenant]);

  const handleCountrySave = () => {
    if (!user?.tenantId) return;
    setCountrySaving(true);
    // Auto-fill currency from country map if user changed country
    const selected = SUPPORTED_COUNTRIES.find(c => c.code === countryForm.country);
    updateCurrency.mutate({
      tenantId: user.tenantId,
      country: countryForm.country || null,
      currencyCode: countryForm.currencyCode || selected?.currencyCode || 'USD',
      currencySymbol: countryForm.currencySymbol || selected?.currencySymbol || '$',
    });
  };
  
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
        {/* Region & Currency */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Region &amp; Currency
            </CardTitle>
            <CardDescription>
              Set the operating country for this tenant. The pipeline uses this to determine the
              default currency when quotes do not explicitly state one. Currency detected from
              quote documents always takes priority over this default.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="country">Operating Country</Label>
                <Select
                  value={countryForm.country}
                  onValueChange={(val) => {
                    const c = SUPPORTED_COUNTRIES.find(x => x.code === val);
                    setCountryForm({
                      country: val,
                      currencyCode: c?.currencyCode ?? countryForm.currencyCode,
                      currencySymbol: c?.currencySymbol ?? countryForm.currencySymbol,
                    });
                  }}
                >
                  <SelectTrigger id="country">
                    <SelectValue placeholder="Select country..." />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_COUNTRIES.map(c => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.name} ({c.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Selecting a country auto-fills the default currency below.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Default Currency</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Code (e.g. USD)"
                    value={countryForm.currencyCode}
                    onChange={e => setCountryForm(f => ({ ...f, currencyCode: e.target.value.toUpperCase() }))}
                    maxLength={10}
                    className="w-32"
                  />
                  <Input
                    placeholder="Symbol (e.g. $)"
                    value={countryForm.currencySymbol}
                    onChange={e => setCountryForm(f => ({ ...f, currencySymbol: e.target.value }))}
                    maxLength={6}
                    className="w-24"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Override the currency code and symbol if needed (e.g. ZiG for Zimbabwe Gold).
                </p>
              </div>
            </div>
            <Button
              type="button"
              onClick={handleCountrySave}
              disabled={countrySaving}
              className="flex items-center gap-2"
            >
              {countrySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Region &amp; Currency
            </Button>
          </CardContent>
        </Card>
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
                value={formData.highValueThreshold}
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
                value={formData.executiveReviewThreshold}
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

            <div className="rounded-lg border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/30 p-4">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
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
