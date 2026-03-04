/**
 * Tenant Registration Page
 * 
 * Super-admin interface for creating new tenants and configuring initial settings.
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Loader2, Building2, ArrowLeft } from "lucide-react";

export default function TenantRegistration() {
  const [, setLocation] = useLocation();
  const [formData, setFormData] = useState({
    id: "",
    displayName: "",
    contactEmail: "",
    billingEmail: "",
    plan: "standard" as "free" | "standard" | "premium" | "enterprise",
    intakeEscalationHours: 6,
    aiRerunLimitPerHour: 10,
    intakeEscalationEnabled: false,
    intakeEscalationMode: "escalate_only" as "auto_assign" | "escalate_only",
  });

  const createTenant = trpc.admin.createTenant.useMutation({
    onSuccess: (data: any) => {
      toast.success("Tenant created successfully", {
        description: `${data.displayName} has been registered with ID: ${data.id}`,
      });
      setLocation("/admin/tenants");
    },
    onError: (error: any) => {
      toast.error("Failed to create tenant", {
        description: error.message,
      });
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    if (!formData.id || !formData.displayName || !formData.contactEmail) {
      toast.error("Please fill in all required fields");
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.contactEmail)) {
      toast.error("Please enter a valid contact email");
      return;
    }
    if (formData.billingEmail && !emailRegex.test(formData.billingEmail)) {
      toast.error("Please enter a valid billing email");
      return;
    }

    // Validate tenant ID format (lowercase alphanumeric with hyphens)
    const tenantIdRegex = /^[a-z0-9-]+$/;
    if (!tenantIdRegex.test(formData.id)) {
      toast.error("Tenant ID must contain only lowercase letters, numbers, and hyphens");
      return;
    }

    try {
      await createTenant.mutateAsync({
        id: formData.id,
        displayName: formData.displayName,
        contactEmail: formData.contactEmail,
        billingEmail: formData.billingEmail || formData.contactEmail,
        plan: formData.plan,
        workflowConfig: {
          intakeEscalationHours: formData.intakeEscalationHours,
          intakeEscalationEnabled: formData.intakeEscalationEnabled,
          intakeEscalationMode: formData.intakeEscalationMode,
        },
        aiRerunLimitPerHour: formData.aiRerunLimitPerHour,
      });
    } catch (error) {
      console.error("Error creating tenant:", error);
    }
  };

  return (
    <div className="container max-w-4xl py-8">
      <Button
        variant="ghost"
        onClick={() => setLocation("/admin/tenants")}
        className="mb-4"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Tenants
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 rounded-lg">
              <Building2 className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <CardTitle>Register New Tenant</CardTitle>
              <CardDescription>
                Create a new tenant organization with initial configuration
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-6">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Basic Information</h3>
              
              <div className="space-y-2">
                <Label htmlFor="id">Tenant ID *</Label>
                <Input
                  id="id"
                  placeholder="acme-insurance"
                  value={formData.id}
                  onChange={(e) =>
                    setFormData({ ...formData, id: e.target.value.toLowerCase() })
                  }
                  required
                />
                <p className="text-sm text-muted-foreground">
                  Unique identifier (lowercase, alphanumeric, hyphens only). Cannot be changed later.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name *</Label>
                <Input
                  id="displayName"
                  placeholder="ACME Insurance"
                  value={formData.displayName}
                  onChange={(e) =>
                    setFormData({ ...formData, displayName: e.target.value })
                  }
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contactEmail">Contact Email *</Label>
                  <Input
                    id="contactEmail"
                    type="email"
                    placeholder="contact@acme.com"
                    value={formData.contactEmail}
                    onChange={(e) =>
                      setFormData({ ...formData, contactEmail: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="billingEmail">Billing Email</Label>
                  <Input
                    id="billingEmail"
                    type="email"
                    placeholder="billing@acme.com (optional)"
                    value={formData.billingEmail}
                    onChange={(e) =>
                      setFormData({ ...formData, billingEmail: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="plan">Subscription Plan *</Label>
                <Select
                  value={formData.plan}
                  onValueChange={(value: any) =>
                    setFormData({ ...formData, plan: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Free - Trial (30 days)</SelectItem>
                    <SelectItem value="standard">Standard - $99/month</SelectItem>
                    <SelectItem value="premium">Premium - $299/month</SelectItem>
                    <SelectItem value="enterprise">Enterprise - Custom pricing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Workflow Configuration */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Workflow Configuration</h3>
              
              <div className="space-y-2">
                <Label htmlFor="intakeEscalationHours">Intake Escalation Threshold (hours)</Label>
                <Input
                  id="intakeEscalationHours"
                  type="number"
                  min="1"
                  max="168"
                  value={formData.intakeEscalationHours}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      intakeEscalationHours: parseInt(e.target.value) || 6,
                    })
                  }
                />
                <p className="text-sm text-muted-foreground">
                  Claims in intake queue longer than this will trigger escalation (default: 6 hours)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="intakeEscalationMode">Escalation Mode</Label>
                <Select
                  value={formData.intakeEscalationMode}
                  onValueChange={(value: any) =>
                    setFormData({ ...formData, intakeEscalationMode: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="escalate_only">Escalate Only - Notify managers</SelectItem>
                    <SelectItem value="auto_assign">Auto-Assign - Assign to processor automatically</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="intakeEscalationEnabled"
                  checked={formData.intakeEscalationEnabled}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      intakeEscalationEnabled: e.target.checked,
                    })
                  }
                  className="rounded border-gray-300"
                />
                <Label htmlFor="intakeEscalationEnabled" className="cursor-pointer">
                  Enable intake escalation on tenant creation
                </Label>
              </div>
            </div>

            <Separator />

            {/* AI Configuration */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">AI Configuration</h3>
              
              <div className="space-y-2">
                <Label htmlFor="aiRerunLimitPerHour">AI Rerun Limit (per user per hour)</Label>
                <Input
                  id="aiRerunLimitPerHour"
                  type="number"
                  min="1"
                  max="100"
                  value={formData.aiRerunLimitPerHour}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      aiRerunLimitPerHour: parseInt(e.target.value) || 10,
                    })
                  }
                />
                <p className="text-sm text-muted-foreground">
                  Maximum AI analysis reruns per user per hour (default: 10)
                </p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => setLocation("/admin/tenants")}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createTenant.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {createTenant.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating Tenant...
                </>
              ) : (
                "Create Tenant"
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
