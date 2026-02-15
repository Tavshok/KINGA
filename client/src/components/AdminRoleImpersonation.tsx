import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UserCog, RotateCcw } from "lucide-react";
import { toast } from "sonner";

/**
 * Admin Role Impersonation Component
 * 
 * Allows admins to temporarily impersonate different roles for testing purposes.
 * Changes are session-only and don't modify the database.
 * Only visible to users with admin role.
 */
export default function AdminRoleImpersonation() {
  const { user } = useAuth();
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [selectedInsurerRole, setSelectedInsurerRole] = useState<string>("");

  // Only show for admin users
  if (!user || user.role !== "admin") {
    return null;
  }

  const mainRoles = [
    { value: "admin", label: "Admin" },
    { value: "insurer", label: "Insurer (General)" },
    { value: "assessor", label: "Assessor" },
    { value: "panel_beater", label: "Panel Beater" },
    { value: "claimant", label: "Claimant" },
    { value: "fleet_manager", label: "Fleet Manager" },
    { value: "insurance_agent", label: "Insurance Agent (KINGA Agency)" },
  ];

  const insurerSubRoles = [
    { value: "", label: "None (General Insurer)" },
    { value: "executive", label: "Executive" },
    { value: "claims_manager", label: "Claims Manager" },
    { value: "claims_processor", label: "Claims Processor" },
    { value: "internal_assessor", label: "Internal Assessor" },
    { value: "risk_manager", label: "Risk Manager" },
  ];

  const handleImpersonate = () => {
    if (!selectedRole) {
      toast.error("Please select a role to impersonate");
      return;
    }

    // Store impersonation in sessionStorage
    sessionStorage.setItem("impersonatedRole", selectedRole);
    if (selectedRole === "insurer" && selectedInsurerRole) {
      sessionStorage.setItem("impersonatedInsurerRole", selectedInsurerRole);
    } else {
      sessionStorage.removeItem("impersonatedInsurerRole");
    }

    toast.success(`Now impersonating: ${mainRoles.find(r => r.value === selectedRole)?.label}${selectedRole === "insurer" && selectedInsurerRole ? ` (${insurerSubRoles.find(r => r.value === selectedInsurerRole)?.label})` : ""}`);
    
    // Reload to apply changes
    window.location.href = "/portal-hub";
  };

  const handleReset = () => {
    sessionStorage.removeItem("impersonatedRole");
    sessionStorage.removeItem("impersonatedInsurerRole");
    toast.success("Impersonation cleared - back to admin role");
    window.location.href = "/portal-hub";
  };

  const isImpersonating = sessionStorage.getItem("impersonatedRole") !== null;

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCog className="h-5 w-5" />
          Admin Role Impersonation
        </CardTitle>
        <CardDescription>
          Temporarily switch to any role to test portal access and functionality. Changes are session-only and don't affect your actual account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isImpersonating && (
          <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                Currently Impersonating
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {mainRoles.find(r => r.value === sessionStorage.getItem("impersonatedRole"))?.label}
                {sessionStorage.getItem("impersonatedRole") === "insurer" && sessionStorage.getItem("impersonatedInsurerRole") && 
                  ` (${insurerSubRoles.find(r => r.value === sessionStorage.getItem("impersonatedInsurerRole"))?.label})`
                }
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleReset} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Reset to Admin
            </Button>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="role-select">Select Role</Label>
          <Select value={selectedRole} onValueChange={setSelectedRole}>
            <SelectTrigger id="role-select">
              <SelectValue placeholder="Choose a role to impersonate" />
            </SelectTrigger>
            <SelectContent>
              {mainRoles.map((role) => (
                <SelectItem key={role.value} value={role.value}>
                  {role.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedRole === "insurer" && (
          <div className="space-y-2">
            <Label htmlFor="insurer-role-select">Insurer Sub-Role (Optional)</Label>
            <Select value={selectedInsurerRole} onValueChange={setSelectedInsurerRole}>
              <SelectTrigger id="insurer-role-select">
                <SelectValue placeholder="Choose insurer sub-role" />
              </SelectTrigger>
              <SelectContent>
                {insurerSubRoles.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    {role.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Leave empty for general insurer portal, or select a specific sub-role to test that dashboard.
            </p>
          </div>
        )}

        <Button onClick={handleImpersonate} disabled={!selectedRole} className="w-full">
          <UserCog className="h-4 w-4 mr-2" />
          Impersonate Role
        </Button>

        <p className="text-xs text-muted-foreground">
          💡 After impersonating, you'll be redirected to the Portal Hub to see the filtered portals for that role. 
          Click "Reset to Admin" to return to your admin account.
        </p>
      </CardContent>
    </Card>
  );
}
