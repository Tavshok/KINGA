/**
 * Replay Dashboard
 * 
 * Interactive dashboard for historical claim replay engine.
 * Enables re-processing historical claims through current KINGA AI system
 * to compare original decisions with AI-powered routing.
 * 
 * Access: insurer_admin, executive, claims_manager only
 */

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PlayCircle, BarChart3, History, GitCompare } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { ReplayTriggerForm } from "@/components/replay/ReplayTriggerForm";
import { ReplayResultsTable } from "@/components/replay/ReplayResultsTable";
import { ReplayStatisticsCards } from "@/components/replay/ReplayStatisticsCards";

export default function ReplayDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("trigger");
  
  // RBAC check
  const allowedRoles = ["insurer_admin", "executive", "claims_manager"];
  const hasAccess = user?.insurerRole && allowedRoles.includes(user.insurerRole);
  
  if (!hasAccess) {
    return (
      <div className="container mx-auto py-8">
        <Alert variant="destructive">
          <AlertDescription>
            Access denied. This feature requires insurer_admin, executive, or claims_manager role.
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Claim Replay Engine</h1>
        <p className="text-muted-foreground mt-2">
          Re-process historical claims through current KINGA AI to compare original decisions with AI-powered routing
        </p>
      </div>
      
      {/* Info Banner */}
      <Alert>
        <AlertDescription>
          <strong>Safe Simulation:</strong> All replay operations are read-only with <code>isReplay=true</code> and <code>noLiveMutation=true</code> flags. 
          No modifications will be made to live claims or workflows.
        </AlertDescription>
      </Alert>
      
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="trigger" className="flex items-center gap-2">
            <PlayCircle className="h-4 w-4" />
            Trigger Replay
          </TabsTrigger>
          <TabsTrigger value="results" className="flex items-center gap-2">
            <GitCompare className="h-4 w-4" />
            Comparison Results
          </TabsTrigger>
          <TabsTrigger value="statistics" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Statistics
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Replay History
          </TabsTrigger>
        </TabsList>
        
        {/* Trigger Tab */}
        <TabsContent value="trigger" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Trigger Claim Replay</CardTitle>
              <CardDescription>
                Select historical claims to re-process through current KINGA AI system
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ReplayTriggerForm />
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Results Tab */}
        <TabsContent value="results" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Comparison Results</CardTitle>
              <CardDescription>
                Side-by-side comparison of original decisions vs KINGA routing
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ReplayResultsTable />
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Statistics Tab */}
        <TabsContent value="statistics" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Replay Statistics</CardTitle>
              <CardDescription>
                Aggregate metrics and visualizations across all replays
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ReplayStatisticsCards />
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* History Tab */}
        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Replay History</CardTitle>
              <CardDescription>
                Timeline of all replay operations with results
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ReplayResultsTable />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
