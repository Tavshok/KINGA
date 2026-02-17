import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { UserCog, RefreshCw, CheckCircle } from "lucide-react";

/**
 * Role Setup Page
 * 
 * Quick configuration page for setting up user roles.
 * Allows users to set themselves as insurer with a specific insurerRole.
 */
export default function RoleSetup() {
  const [selectedRole, setSelectedRole] = useState<string>("");
  
  const { data: currentUser, refetch: refetchUser } = trpc.auth.me.useQuery();
  
  const setInsurerRole = trpc.auth.setInsurerRole.useMutation({
    onSuccess: (data) => {
      toast.success("Role Updated", {
        description: data.message,
      });
      // Refresh user data
      refetchUser();
      // Suggest page reload
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    },
    onError: (error) => {
      toast.error("Error", {
        description: error.message,
      });
    },
  });
  
  const handleSetRole = () => {
    if (!selectedRole) {
      toast.error("No Role Selected", {
        description: "Please select an insurer role before continuing.",
      });
      return;
    }
    
    setInsurerRole.mutate({
      insurerRole: selectedRole as any,
    });
  };
  
  const roleDescriptions: Record<string, string> = {
    claims_processor: "Process claims, upload documents, and assign assessors",
    assessor_internal: "Internal assessor - evaluate claims and provide technical assessments",
    assessor_external: "External assessor - evaluate claims independently",
    risk_manager: "Analyze fraud risk and technical validation",
    claims_manager: "Manage claims workflow and make financial decisions",
    executive: "Executive oversight with full dashboard access",
    insurer_admin: "Administrator with full system access",
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-6">
      <Card className="w-full max-w-2xl shadow-xl">
        <CardHeader className="bg-gradient-to-r from-teal-600 to-teal-700 text-white rounded-t-lg">
          <div className="flex items-center gap-3">
            <UserCog className="h-8 w-8" />
            <div>
              <CardTitle className="text-2xl">Role Setup</CardTitle>
              <CardDescription className="text-teal-100">
                Configure your user role to access the appropriate dashboard
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6 pt-6">
          {/* Current User Info */}
          {currentUser && (
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <h3 className="font-semibold text-sm text-slate-600 mb-2">Current User</h3>
              <div className="space-y-1 text-sm">
                <div><span className="font-medium">Name:</span> {currentUser.name}</div>
                <div><span className="font-medium">Email:</span> {currentUser.email}</div>
                <div><span className="font-medium">Current Role:</span> {currentUser.role || "Not set"}</div>
                <div><span className="font-medium">Insurer Role:</span> {currentUser.insurerRole || "Not set"}</div>
              </div>
            </div>
          )}
          
          {/* Role Selection */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-slate-700">
              Select Insurer Role
            </label>
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a role..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="claims_processor">Claims Processor</SelectItem>
                <SelectItem value="assessor_internal">Internal Assessor</SelectItem>
                <SelectItem value="assessor_external">External Assessor</SelectItem>
                <SelectItem value="risk_manager">Risk Manager</SelectItem>
                <SelectItem value="claims_manager">Claims Manager</SelectItem>
                <SelectItem value="executive">Executive</SelectItem>
                <SelectItem value="insurer_admin">Insurer Admin</SelectItem>
              </SelectContent>
            </Select>
            
            {selectedRole && (
              <p className="text-sm text-slate-600 bg-blue-50 p-3 rounded border border-blue-200">
                <CheckCircle className="h-4 w-4 inline mr-2 text-blue-600" />
                {roleDescriptions[selectedRole]}
              </p>
            )}
          </div>
          
          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              onClick={handleSetRole}
              disabled={!selectedRole || setInsurerRole.isPending}
              className="flex-1"
            >
              {setInsurerRole.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <UserCog className="h-4 w-4 mr-2" />
                  Set Role & Reload
                </>
              )}
            </Button>
            
            <Button
              variant="outline"
              onClick={() => window.location.href = '/portal-hub'}
            >
              Back to Portal Hub
            </Button>
          </div>
          
          {/* Help Text */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm text-amber-800">
              <strong>Note:</strong> After setting your role, the page will automatically reload to apply the changes.
              You can then access the appropriate dashboard from the Portal Hub.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
