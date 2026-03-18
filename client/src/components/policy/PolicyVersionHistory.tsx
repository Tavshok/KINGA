/**
 * Policy Version History Component
 * 
 * Displays all policy versions in a timeline view with activation controls.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  CheckCircle2, Circle, Calendar, User, TrendingUp, DollarSign, 
  Shield, Play, Loader2 
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface PolicyVersionHistoryProps {
  policies: any[]; // AutomationPolicy[]
  activePolicyId?: number;
  onPolicyActivated: () => void;
}

export function PolicyVersionHistory({ 
  policies, 
  activePolicyId,
  onPolicyActivated 
}: PolicyVersionHistoryProps) {
  const { toast } = useToast();
  const [activatingPolicyId, setActivatingPolicyId] = useState<number | null>(null);
  const [showActivateDialog, setShowActivateDialog] = useState(false);
  const [selectedPolicyId, setSelectedPolicyId] = useState<number | null>(null);

  const activateMutation = trpc.policyManagement.activatePolicy.useMutation({
    onSuccess: () => {
      toast({
        title: "Policy Activated",
        description: "The policy has been successfully activated",
      });
      setActivatingPolicyId(null);
      setShowActivateDialog(false);
      onPolicyActivated();
    },
    onError: (error) => {
      toast({
        title: "Activation Failed",
        description: error.message,
        variant: "destructive",
      });
      setActivatingPolicyId(null);
    },
  });

  const handleActivate = (policyId: number) => {
    setSelectedPolicyId(policyId);
    setShowActivateDialog(true);
  };

  const confirmActivate = () => {
    if (selectedPolicyId) {
      setActivatingPolicyId(selectedPolicyId);
      activateMutation.mutate({ policyId: selectedPolicyId });
    }
  };

  // Sort policies by creation date (newest first)
  const sortedPolicies = [...policies].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Policy Version History</CardTitle>
          <CardDescription>
            All policy versions with activation timeline
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sortedPolicies.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No policies found. Create a policy to get started.
            </p>
          ) : (
            <div className="space-y-4">
              {sortedPolicies.map((policy, index) => {
                const isActive = policy.id === activePolicyId;
                const isActivating = policy.id === activatingPolicyId;

                return (
                  <Card 
                    key={policy.id} 
                    className={isActive ? "border-2 border-primary" : ""}
                  >
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-4">
                        {/* Timeline Icon */}
                        <div className="flex flex-col items-center">
                          {isActive ? (
                            <CheckCircle2 className="h-6 w-6 text-green-500" />
                          ) : (
                            <Circle className="h-6 w-6 text-muted-foreground" />
                          )}
                          {index < sortedPolicies.length - 1 && (
                            <div className="w-0.5 h-full bg-border mt-2" />
                          )}
                        </div>

                        {/* Policy Details */}
                        <div className="flex-1 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold">{policy.policyName}</h3>
                              <Badge variant="outline">v{policy.version}</Badge>
                              {isActive && <Badge variant="default">Active</Badge>}
                            </div>
                            {!isActive && (
                              <Button
                                size="sm"
                                onClick={() => handleActivate(policy.id)}
                                disabled={isActivating}
                              >
                                {isActivating ? (
                                  <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Activating...
                                  </>
                                ) : (
                                  <>
                                    <Play className="h-4 w-4 mr-2" />
                                    Activate
                                  </>
                                )}
                              </Button>
                            )}
                          </div>

                          {/* Metadata */}
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              <span className="text-muted-foreground">Created:</span>
                              <span>{new Date(policy.createdAt).toLocaleDateString()}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground" />
                              <span className="text-muted-foreground">By:</span>
                              <span>User #{policy.createdByUserId}</span>
                            </div>
                            {policy.effectiveFrom && (
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                <span className="text-muted-foreground">Effective From:</span>
                                <span>{new Date(policy.effectiveFrom).toLocaleDateString()}</span>
                              </div>
                            )}
                            {policy.effectiveUntil && (
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                <span className="text-muted-foreground">Effective Until:</span>
                                <span>{new Date(policy.effectiveUntil).toLocaleDateString()}</span>
                              </div>
                            )}
                          </div>

                          {/* Key Metrics */}
                          <div className="grid grid-cols-4 gap-4 pt-2">
                            <div className="space-y-1">
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <TrendingUp className="h-3 w-3" />
                                <span>Automation</span>
                              </div>
                              <p className="text-sm font-medium">{policy.minAutomationConfidence}%</p>
                            </div>
                            <div className="space-y-1">
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <DollarSign className="h-3 w-3" />
                                <span>AI Limit</span>
                              </div>
                              <p className="text-sm font-medium">
                                ${Number(policy.maxAiOnlyApprovalAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </p>
                            </div>
                            <div className="space-y-1">
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Shield className="h-3 w-3" />
                                <span>Fraud Score</span>
                              </div>
                              <p className="text-sm font-medium">{policy.maxFraudScoreForAutomation}</p>
                            </div>
                            <div className="space-y-1">
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Shield className="h-3 w-3" />
                                <span>Sensitivity</span>
                              </div>
                              <p className="text-sm font-medium">{policy.fraudSensitivityMultiplier}x</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activation Confirmation Dialog */}
      <AlertDialog open={showActivateDialog} onOpenChange={setShowActivateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Activate Policy?</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate the current active policy and activate the selected policy.
              All new claims will be routed using the new policy configuration.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmActivate}>
              Activate Policy
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
