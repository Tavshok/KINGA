/**
 * Policy Management Dashboard
 * 
 * Comprehensive policy management interface for insurer_admin and executive roles.
 * Features:
 * - View active policy
 * - Policy version history
 * - Create policy from profile templates
 * - Activate/deactivate policies
 * - Compare policy versions
 * 
 * Role-based access: insurer_admin, executive only
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Shield, TrendingUp, AlertTriangle, Zap, Settings } from "lucide-react";
import { ActivePolicyCard } from "@/components/policy/ActivePolicyCard";
import { PolicyVersionHistory } from "@/components/policy/PolicyVersionHistory";
import { CreatePolicyForm } from "@/components/policy/CreatePolicyForm";
import { PolicyComparisonView } from "@/components/policy/PolicyComparisonView";

export function PolicyManagementDashboard() {
  const [selectedTab, setSelectedTab] = useState("active");

  // Fetch active policy
  const { data: activePolicy, isLoading: loadingActive, refetch: refetchActive } = 
    trpc.policyManagement.getActivePolicy.useQuery({});

  // Fetch all policies
  const { data: allPolicies, isLoading: loadingAll, refetch: refetchAll } = 
    trpc.policyManagement.getAllPolicies.useQuery({});

  // Fetch policy profiles
  const { data: profiles, isLoading: loadingProfiles } = 
    trpc.policyManagement.getAllProfiles.useQuery();

  const isLoading = loadingActive || loadingAll || loadingProfiles;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const profileIcons = {
    conservative: <Shield className="h-5 w-5" />,
    balanced: <TrendingUp className="h-5 w-5" />,
    aggressive: <Zap className="h-5 w-5" />,
    fraud_sensitive: <AlertTriangle className="h-5 w-5" />,
    custom: <Settings className="h-5 w-5" />,
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Policy Management</h1>
        <p className="text-muted-foreground mt-2">
          Manage automation policies, view version history, and configure routing thresholds
        </p>
      </div>

      {/* Active Policy Alert */}
      {!activePolicy && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            No active policy found. Create and activate a policy to enable automated claim routing.
          </AlertDescription>
        </Alert>
      )}

      {/* Main Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="active">Active Policy</TabsTrigger>
          <TabsTrigger value="create">Create Policy</TabsTrigger>
          <TabsTrigger value="history">Version History</TabsTrigger>
          <TabsTrigger value="compare">Compare Versions</TabsTrigger>
        </TabsList>

        {/* Active Policy Tab */}
        <TabsContent value="active" className="space-y-6">
          {activePolicy ? (
            <ActivePolicyCard 
              policy={activePolicy} 
              onPolicyUpdated={() => {
                refetchActive();
                refetchAll();
              }}
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>No Active Policy</CardTitle>
                <CardDescription>
                  Create a policy from a profile template to get started
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => setSelectedTab("create")}>
                  Create Policy
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Policy Profile Templates Overview */}
          <Card>
            <CardHeader>
              <CardTitle>Policy Profile Templates</CardTitle>
              <CardDescription>
                Choose from preset configurations optimized for different risk appetites
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {profiles?.map((profile) => (
                  <Card key={profile.profileType} className="border-2">
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        {profileIcons[profile.profileType as keyof typeof profileIcons]}
                        <CardTitle className="text-lg">{profile.policyName}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <p className="text-muted-foreground">{profile.description}</p>
                      <div className="space-y-1 pt-2">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Automation:</span>
                          <Badge variant="outline">{profile.minAutomationConfidence}%</Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Hybrid:</span>
                          <Badge variant="outline">{profile.minHybridConfidence}%</Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">AI Limit:</span>
                          <Badge variant="outline">
                            ${(profile.maxAiOnlyApprovalAmount / 100).toLocaleString()}
                          </Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Fraud Sensitivity:</span>
                          <Badge variant="outline">{profile.fraudSensitivityMultiplier}x</Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Create Policy Tab */}
        <TabsContent value="create">
          <CreatePolicyForm 
            profiles={profiles || []}
            onPolicyCreated={() => {
              refetchActive();
              refetchAll();
              setSelectedTab("history");
            }}
          />
        </TabsContent>

        {/* Version History Tab */}
        <TabsContent value="history">
          <PolicyVersionHistory 
            policies={allPolicies || []}
            activePolicyId={activePolicy?.id}
            onPolicyActivated={() => {
              refetchActive();
              refetchAll();
            }}
          />
        </TabsContent>

        {/* Compare Versions Tab */}
        <TabsContent value="compare">
          <PolicyComparisonView 
            policies={allPolicies || []}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
