import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Users,
  ArrowLeft,
  Save,
  Crown,
  UserCog,
  FileCheck,
  Search,
  ShieldAlert
} from "lucide-react";
import { useLocation, useParams } from "wouter";
// Toast functionality to be added later

export default function TenantRoleConfig() {
  const { tenantId } = useParams();
  const [, setLocation] = useLocation();
  // Toast hook to be added later

  // Mock role data (will be replaced with tRPC query)
  const [roles, setRoles] = useState([
    {
      roleKey: "executive",
      displayName: "Executive",
      description: "Strategic insights, KPIs, and high-value approvals",
      icon: Crown,
      enabled: true,
      permissions: ["view_all_claims", "approve_high_value", "view_analytics", "manage_users", "configure_workflows"]
    },
    {
      roleKey: "claims_manager",
      displayName: "Claims Manager",
      description: "Team oversight, claim assignment, and moderate-value approvals",
      icon: UserCog,
      enabled: true,
      permissions: ["view_assigned_claims", "approve_moderate_value", "assign_assessors", "view_team_analytics"]
    },
    {
      roleKey: "claims_processor",
      displayName: "Claims Processor",
      description: "Daily claim processing and document verification",
      icon: FileCheck,
      enabled: true,
      permissions: ["view_assigned_claims", "update_claim_status", "request_documents", "communicate_claimants"]
    },
    {
      roleKey: "internal_assessor",
      displayName: "Internal Assessor",
      description: "In-house damage assessment and report generation",
      icon: Search,
      enabled: true,
      permissions: ["view_assigned_claims", "submit_assessments", "upload_reports", "flag_fraud"]
    },
    {
      roleKey: "risk_manager",
      displayName: "Risk Manager",
      description: "Fraud investigation and technical approval",
      icon: ShieldAlert,
      enabled: true,
      permissions: ["view_all_claims", "review_fraud_flags", "approve_technical", "manage_risk_register"]
    }
  ]);

  const allPermissions = [
    { id: "view_all_claims", label: "View All Claims", description: "Access to all claims across the system" },
    { id: "view_assigned_claims", label: "View Assigned Claims", description: "Access to claims assigned to the user" },
    { id: "approve_high_value", label: "Approve High Value", description: "Approve claims above R50,000" },
    { id: "approve_moderate_value", label: "Approve Moderate Value", description: "Approve claims R10,000 - R50,000" },
    { id: "approve_technical", label: "Approve Technical", description: "Technical approval for complex claims" },
    { id: "update_claim_status", label: "Update Claim Status", description: "Change claim status and progress" },
    { id: "assign_assessors", label: "Assign Assessors", description: "Assign claims to assessors" },
    { id: "submit_assessments", label: "Submit Assessments", description: "Create and submit assessment reports" },
    { id: "upload_reports", label: "Upload Reports", description: "Upload assessment and damage reports" },
    { id: "request_documents", label: "Request Documents", description: "Request additional documents from claimants" },
    { id: "communicate_claimants", label: "Communicate with Claimants", description: "Send messages to claimants" },
    { id: "flag_fraud", label: "Flag Fraud", description: "Mark claims as potentially fraudulent" },
    { id: "review_fraud_flags", label: "Review Fraud Flags", description: "Investigate fraud-flagged claims" },
    { id: "view_analytics", label: "View Analytics", description: "Access to company-wide analytics" },
    { id: "view_team_analytics", label: "View Team Analytics", description: "Access to team performance metrics" },
    { id: "manage_users", label: "Manage Users", description: "Create, edit, and delete users" },
    { id: "configure_workflows", label: "Configure Workflows", description: "Modify approval thresholds and routing" },
    { id: "manage_risk_register", label: "Manage Risk Register", description: "Update and maintain risk register" }
  ];

  const handleToggleRole = (roleKey: string) => {
    setRoles(roles.map(role => 
      role.roleKey === roleKey ? { ...role, enabled: !role.enabled } : role
    ));
  };

  const handleTogglePermission = (roleKey: string, permissionId: string) => {
    setRoles(roles.map(role => {
      if (role.roleKey === roleKey) {
        const hasPermission = role.permissions.includes(permissionId);
        return {
          ...role,
          permissions: hasPermission
            ? role.permissions.filter(p => p !== permissionId)
            : [...role.permissions, permissionId]
        };
      }
      return role;
    }));
  };

  const handleUpdateDisplayName = (roleKey: string, displayName: string) => {
    setRoles(roles.map(role => 
      role.roleKey === roleKey ? { ...role, displayName } : role
    ));
  };

  const handleSave = () => {
    alert("Role configuration saved successfully");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-white to-accent/5">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">Role Configuration</h1>
                <p className="text-sm text-muted-foreground">Tenant: {tenantId}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => setLocation("/admin/tenants")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Tenants
              </Button>
              <Button size="sm" onClick={handleSave}>
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto space-y-6">
          {roles.map((role) => {
            const Icon = role.icon;
            return (
              <Card key={role.roleKey} className={!role.enabled ? "opacity-60" : ""}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Icon className="h-6 w-6 text-primary" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <Input
                            value={role.displayName}
                            onChange={(e) => handleUpdateDisplayName(role.roleKey, e.target.value)}
                            className="text-xl font-bold max-w-xs"
                          />
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={role.enabled}
                              onCheckedChange={() => handleToggleRole(role.roleKey)}
                            />
                            <Label className="text-sm text-muted-foreground">
                              {role.enabled ? "Enabled" : "Disabled"}
                            </Label>
                          </div>
                        </div>
                        <CardDescription className="text-base">
                          {role.description}
                        </CardDescription>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <h4 className="font-semibold text-sm text-gray-700">Permissions</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {allPermissions.map((permission) => (
                        <div key={permission.id} className="flex items-start space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                          <Checkbox
                            id={`${role.roleKey}-${permission.id}`}
                            checked={role.permissions.includes(permission.id)}
                            onCheckedChange={() => handleTogglePermission(role.roleKey, permission.id)}
                            disabled={!role.enabled}
                          />
                          <div className="flex-1">
                            <Label
                              htmlFor={`${role.roleKey}-${permission.id}`}
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                            >
                              {permission.label}
                            </Label>
                            <p className="text-xs text-muted-foreground mt-1">
                              {permission.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}
