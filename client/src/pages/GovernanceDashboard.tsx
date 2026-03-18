/**
 * Governance Dashboard Module
 * 
 * Dedicated governance portal for executives and insurer admins
 * Route: /insurer-portal/governance
 * 
 * Sections:
 * 1. Override Oversight - Track executive interventions
 * 2. Segregation Monitoring - Monitor access control violations
 * 3. Role Change Oversight - Track permission changes
 * 4. Governance Risk Score - Composite risk assessment (0-100)
 * 5. Export Capability - PDF and CSV reports
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Shield, AlertTriangle, Users, FileText, Download, TrendingUp, TrendingDown,
  Activity, Eye, Clock, DollarSign, UserCheck, AlertCircle, BarChart3, PieChart as PieChartIcon,
  Radio, RefreshCw
} from "lucide-react";
import { 
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend 
} from "recharts";
import { toast } from "sonner";

export default function GovernanceDashboard() {
  const [selectedPeriod, setSelectedPeriod] = useState<"7d" | "30d" | "90d">("30d");
  const [shadowScanning, setShadowScanning] = useState(false);

  // Fetch all governance data
  const { data: overrideByUserResponse, isLoading: overrideByUserLoading } = 
    trpc.governanceDashboard.getOverrideRateByUser.useQuery();
  
  const { data: overrideByValueResponse, isLoading: overrideByValueLoading } = 
    trpc.governanceDashboard.getOverrideRateByValueBand.useQuery();
  
  const { data: topOverrideActorsResponse, isLoading: topActorsLoading } = 
    trpc.governanceDashboard.getTopOverrideActors.useQuery();
  
  const { data: overridePatternsResponse, isLoading: patternsLoading } = 
    trpc.governanceDashboard.getExecutiveOverridePatterns.useQuery();
  
  const { data: violationsPreventedResponse, isLoading: violationsLoading } = 
    trpc.governanceDashboard.getSegregationViolationsPrevented.useQuery();
  
  const { data: monopolizationResponse, isLoading: monopolizationLoading } = 
    trpc.governanceDashboard.getLifecycleMonopolizationAttempts.useQuery();
  
  const { data: involvementClustersResponse, isLoading: clustersLoading } = 
    trpc.governanceDashboard.getHighRiskInvolvementClusters.useQuery();
  
  const { data: roleChangesByActorResponse, isLoading: roleActorLoading } = 
    trpc.governanceDashboard.getRoleChangesByActor.useQuery();
  
  const { data: roleChangesByDeptResponse, isLoading: roleDeptLoading } = 
    trpc.governanceDashboard.getRoleChangesByDepartment.useQuery();
  
  const { data: roleElevationResponse, isLoading: elevationLoading } = 
    trpc.governanceDashboard.getRoleElevationPatterns.useQuery();
  
  const { data: riskScoreResponse, isLoading: riskScoreLoading } = 
    trpc.governanceDashboard.getGovernanceRiskScore.useQuery();

  const overrideByUser = overrideByUserResponse?.data || [];
  const overrideByValue = overrideByValueResponse?.data || [];
  const topOverrideActors = topOverrideActorsResponse?.data || [];
  const overridePatterns = overridePatternsResponse?.data;
  const violationsPrevented = violationsPreventedResponse?.data;
  const monopolizationAttempts = monopolizationResponse?.data || [];
  const involvementClusters = involvementClustersResponse?.data || [];
  const roleChangesByActor = roleChangesByActorResponse?.data || [];
  const roleChangesByDept = roleChangesByDeptResponse?.data || [];
  const roleElevation = roleElevationResponse?.data;
  const riskScore = riskScoreResponse?.data;

  // Shadow override monitor
  const { data: shadowObservations = [], refetch: refetchShadow, isLoading: shadowLoading } =
    trpc.aiAssessments.getAllShadowObservations.useQuery();
  const runShadowScanMutation = trpc.aiAssessments.runShadowScan.useMutation({
    onSuccess: () => {
      refetchShadow();
      setShadowScanning(false);
      toast.success("Shadow scan complete", { description: "Observations updated. No actions were taken." });
    },
    onError: () => {
      setShadowScanning(false);
      toast.error("Shadow scan failed");
    },
  });

  const exportPDFMutation = trpc.governanceDashboard.exportGovernancePDF.useMutation({
    onSuccess: (response) => {
      if (response.success && response.data) {
        // Create download link
        const link = document.createElement("a");
        link.href = `data:${response.data.contentType};base64,${response.data.content}`;
        link.download = response.data.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        toast.success("PDF Export Complete", {
          description: `Downloaded ${response.data.filename}`,
        });
      }
    },
    onError: (error) => {
      toast.error("PDF Export Failed", {
        description: error.message,
      });
    },
  });

  const exportCSVMutation = trpc.governanceDashboard.exportGovernanceCSV.useMutation({
    onSuccess: (response) => {
      if (response.success && response.data) {
        // Create download link
        const link = document.createElement("a");
        link.href = `data:${response.data.contentType};charset=utf-8,${encodeURIComponent(response.data.content)}`;
        link.download = response.data.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        toast.success("CSV Export Complete", {
          description: `Downloaded ${response.data.filename}`,
        });
      }
    },
    onError: (error) => {
      toast.error("CSV Export Failed", {
        description: error.message,
      });
    },
  });

  const handleExportPDF = () => {
    exportPDFMutation.mutate();
  };

  const handleExportCSV = () => {
    exportCSVMutation.mutate();
  };

  const getRiskScoreColor = (score: number) => {
    if (score <= 30) return "text-green-600 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800";
    if (score <= 60) return "text-amber-600 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800";
    return "text-red-600 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800";
  };

  const getRiskScoreLabel = (score: number) => {
    if (score <= 30) return "Low Risk";
    if (score <= 60) return "Medium Risk";
    return "High Risk";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white shadow-xl">
        <div className="max-w-[1600px] mx-auto px-8 py-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Shield className="h-10 w-10" />
                <h1 className="text-4xl font-bold">Governance Dashboard</h1>
              </div>
              <p className="text-blue-100 text-lg">
                Comprehensive oversight of executive interventions, segregation controls, and role management
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="bg-white/10 dark:bg-card/10 border-white/30 text-white hover:bg-white/20 dark:bg-card/20"
                onClick={handleExportPDF}
              >
                <FileText className="h-4 w-4 mr-2" />
                Export PDF
              </Button>
              <Button
                variant="outline"
                className="bg-white/10 dark:bg-card/10 border-white/30 text-white hover:bg-white/20 dark:bg-card/20"
                onClick={handleExportCSV}
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-8 py-8 space-y-8">
        {/* 4️⃣ GOVERNANCE RISK SCORE - Prominent placement at top */}
        {riskScore && (
          <Card className="border-2 shadow-2xl">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Activity className="h-7 w-7 text-primary" />
                Composite Governance Risk Score
              </CardTitle>
              <CardDescription>
                Real-time risk assessment based on override frequency, violations, role volatility, and fast-track anomalies
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Risk Score Gauge */}
                <div className="flex flex-col items-center justify-center p-8 bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl">
                  <div className={`text-7xl font-bold mb-4 ${getRiskScoreColor(riskScore.score).split(' ')[0]}`}>
                    {riskScore.score}
                  </div>
                  <Badge className={`text-lg px-6 py-2 ${getRiskScoreColor(riskScore.score)}`}>
                    {getRiskScoreLabel(riskScore.score)}
                  </Badge>
                  <p className="text-sm text-slate-500 dark:text-muted-foreground mt-4">
                    Last updated: {new Date(riskScore.lastUpdated).toLocaleString()}
                  </p>
                </div>

                {/* Risk Score Breakdown */}
                <div className="lg:col-span-2 space-y-4">
                  <h4 className="font-semibold text-slate-900 dark:text-foreground mb-4">Risk Score Breakdown</h4>
                  
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-slate-700 dark:text-foreground/80">Override Risk</span>
                        <span className="text-sm font-bold text-slate-900 dark:text-foreground">{riskScore.breakdown.overrideRisk}/30</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div
                          className="bg-amber-500 h-2 rounded-full transition-all"
                          style={{ width: `${(riskScore.breakdown.overrideRisk / 30) * 100}%` }}
                        ></div>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-slate-700 dark:text-foreground/80">Segregation Risk</span>
                        <span className="text-sm font-bold text-slate-900 dark:text-foreground">{riskScore.breakdown.segregationRisk}/25</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div
                          className="bg-red-500 h-2 rounded-full transition-all"
                          style={{ width: `${(riskScore.breakdown.segregationRisk / 25) * 100}%` }}
                        ></div>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-slate-700 dark:text-foreground/80">Role Volatility Risk</span>
                        <span className="text-sm font-bold text-slate-900 dark:text-foreground">{riskScore.breakdown.roleVolatilityRisk}/25</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div
                          className="bg-purple-500 h-2 rounded-full transition-all"
                          style={{ width: `${(riskScore.breakdown.roleVolatilityRisk / 25) * 100}%` }}
                        ></div>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-slate-700 dark:text-foreground/80">Fast-Track Risk</span>
                        <span className="text-sm font-bold text-slate-900 dark:text-foreground">{riskScore.breakdown.fastTrackRisk}/20</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full transition-all"
                          style={{ width: `${(riskScore.breakdown.fastTrackRisk / 20) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>

                  {/* Risk Score Trend */}
                  <div className="mt-6">
                    <h4 className="font-semibold text-slate-900 dark:text-foreground mb-3">30-Day Trend</h4>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={riskScore.trend}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 11 }} />
                          <YAxis stroke="#64748b" tick={{ fontSize: 11 }} domain={[0, 100]} />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: "white", 
                              border: "1px solid #e2e8f0",
                              borderRadius: "8px"
                            }}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="score" 
                            stroke="#3b82f6" 
                            strokeWidth={3}
                            dot={{ fill: "#3b82f6", r: 4 }}
                            name="Risk Score"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Dashboard Tabs */}
        <Tabs defaultValue="overrides" className="w-full">
          <TabsList className="grid w-full grid-cols-4 h-14">
            <TabsTrigger value="overrides" className="text-base">
              <Shield className="h-5 w-5 mr-2" />
              Override Oversight
            </TabsTrigger>
            <TabsTrigger value="segregation" className="text-base">
              <AlertTriangle className="h-5 w-5 mr-2" />
              Segregation Monitoring
            </TabsTrigger>
            <TabsTrigger value="roles" className="text-base">
              <Users className="h-5 w-5 mr-2" />
              Role Change Oversight
            </TabsTrigger>
            <TabsTrigger value="shadow" className="text-base">
              <Radio className="h-5 w-5 mr-2" />
              Shadow Monitor
            </TabsTrigger>
          </TabsList>

          {/* 1️⃣ OVERRIDE OVERSIGHT TAB */}
          <TabsContent value="overrides" className="space-y-6 mt-6">
            {/* Override Rate by User */}
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserCheck className="h-5 w-5 text-amber-600" />
                  Override Rate by User
                </CardTitle>
                <CardDescription>
                  Executive intervention frequency per user (Last 30 days)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={overrideByUser} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" stroke="#64748b" tick={{ fontSize: 12 }} />
                      <YAxis 
                        type="category" 
                        dataKey="userName" 
                        stroke="#64748b" 
                        tick={{ fontSize: 12 }}
                        width={150}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: "white", 
                          border: "1px solid #e2e8f0",
                          borderRadius: "8px"
                        }}
                      />
                      <Bar dataKey="overrideRate" fill="#f59e0b" name="Override Rate %" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Override Rate by Claim Value Band */}
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-green-600" />
                  Override Rate by Claim Value Band
                </CardTitle>
                <CardDescription>
                  Intervention patterns across different claim value ranges
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={overrideByValue}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="band" stroke="#64748b" tick={{ fontSize: 12 }} />
                      <YAxis stroke="#64748b" tick={{ fontSize: 12 }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: "white", 
                          border: "1px solid #e2e8f0",
                          borderRadius: "8px"
                        }}
                      />
                      <Bar dataKey="overrideRate" fill="#10b981" name="Override Rate %" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Top Override Actors */}
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-blue-600" />
                  Top Override Actors
                </CardTitle>
                <CardDescription>
                  Users with highest override frequency and patterns
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {topOverrideActors.map((actor, index) => (
                    <div key={actor.userId} className="p-4 bg-slate-50 dark:bg-muted/50 rounded-lg border border-slate-200 dark:border-border">
                      <div className="flex items-start justify-between">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="bg-white dark:bg-card">
                              #{index + 1}
                            </Badge>
                            <span className="font-semibold text-slate-900 dark:text-foreground">{actor.userName}</span>
                            <Badge className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800">
                              {actor.overrideCount} overrides
                            </Badge>
                          </div>
                          <p className="text-sm text-slate-600 dark:text-muted-foreground">
                            <span className="font-medium">Most common reason:</span> {actor.mostCommonReason}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-muted-foreground">
                            Avg justification length: {actor.avgJustificationLength} characters
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Executive Override Patterns */}
            {overridePatterns && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="border-0 shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-base">By Day of Week</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={overridePatterns.byDayOfWeek}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="day" stroke="#64748b" tick={{ fontSize: 11 }} />
                          <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Bar dataKey="count" fill="#8b5cf6" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-base">By Time of Day</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={overridePatterns.byTimeOfDay}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="hour" stroke="#64748b" tick={{ fontSize: 11 }} />
                          <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Bar dataKey="count" fill="#06b6d4" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-base">By Claim Type</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={overridePatterns.byClaimType}
                            dataKey="count"
                            nameKey="type"
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            label={(entry) => entry.type}
                          >
                            {overridePatterns.byClaimType.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={["#3b82f6", "#10b981", "#f59e0b", "#ef4444"][index % 4]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* 2️⃣ SEGREGATION MONITORING TAB */}
          <TabsContent value="segregation" className="space-y-6 mt-6">
            {/* Violations Prevented */}
            {violationsPrevented && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="border-0 shadow-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-red-600" />
                      Violations Prevented
                    </CardTitle>
                    <CardDescription>
                      Segregation of duties enforcement (Last 30 days)
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center p-6 bg-red-50 dark:bg-red-950/30 rounded-xl mb-6">
                      <p className="text-5xl font-bold text-red-600">
                        {violationsPrevented.totalViolationsPrevented}
                      </p>
                      <p className="text-sm text-slate-600 dark:text-muted-foreground mt-2">Total Violations Blocked</p>
                    </div>

                    <div className="space-y-3">
                      {violationsPrevented.byViolationType.map((violation) => (
                        <div key={violation.type} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-muted/50 rounded-lg">
                          <span className="text-sm font-medium text-slate-700 dark:text-foreground/80">{violation.type}</span>
                          <Badge variant="outline" className="bg-white dark:bg-card">
                            {violation.count} blocked
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-lg">
                  <CardHeader>
                    <CardTitle>Violation Trend</CardTitle>
                    <CardDescription>
                      Weekly violation attempts over last 30 days
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={violationsPrevented.trend}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 12 }} />
                          <YAxis stroke="#64748b" tick={{ fontSize: 12 }} />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: "white", 
                              border: "1px solid #e2e8f0",
                              borderRadius: "8px"
                            }}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="count" 
                            stroke="#ef4444" 
                            strokeWidth={2}
                            dot={{ fill: "#ef4444", r: 4 }}
                            name="Violations"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Lifecycle Monopolization Attempts */}
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-600" />
                  Attempted Lifecycle Monopolization
                </CardTitle>
                <CardDescription>
                  Users attempting to control entire claim lifecycle
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {monopolizationAttempts.length > 0 ? (
                    monopolizationAttempts.map((attempt) => (
                      <div key={attempt.userId} className={`p-4 rounded-lg border-2 ${
                        attempt.severity === "high" ? "bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-700" : "bg-orange-50 dark:bg-orange-950/30 border-orange-300 dark:border-orange-700"
                      }`}>
                        <div className="flex items-start justify-between">
                          <div className="space-y-2 flex-1">
                            <div className="flex items-center gap-3">
                              <Badge className={attempt.severity === "high" ? "bg-red-600" : "bg-orange-600"}>
                                {attempt.severity.toUpperCase()} SEVERITY
                              </Badge>
                              <span className="font-semibold text-slate-900 dark:text-foreground">{attempt.userName}</span>
                            </div>
                            <p className="text-sm text-slate-700 dark:text-foreground/80">
                              <span className="font-medium">Attempted roles:</span> {attempt.attemptedRoles.join(" → ")}
                            </p>
                            <p className="text-sm text-slate-600 dark:text-muted-foreground">
                              <span className="font-medium">Claim:</span> {attempt.claimId}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-muted-foreground">
                              Blocked at: {new Date(attempt.blockedAt).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-slate-500 dark:text-muted-foreground">
                      No monopolization attempts detected
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* High-Risk Involvement Clusters */}
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-purple-600" />
                  High-Risk Involvement Clusters
                </CardTitle>
                <CardDescription>
                  Users frequently involved in same claims (potential collusion risk)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {involvementClusters.length > 0 ? (
                    involvementClusters.map((cluster, index) => (
                      <div key={index} className="p-4 bg-purple-50 dark:bg-purple-950/30 rounded-lg border border-purple-200 dark:border-purple-800">
                        <div className="flex items-start justify-between">
                          <div className="space-y-2 flex-1">
                            <div className="flex items-center gap-3">
                              <Badge className="bg-purple-600">
                                Risk Score: {cluster.riskScore}
                              </Badge>
                              <span className="font-semibold text-slate-900 dark:text-foreground">
                                {cluster.users.join(" + ")}
                              </span>
                            </div>
                            <p className="text-sm text-slate-700 dark:text-foreground/80">
                              <span className="font-medium">Shared claims:</span> {cluster.sharedClaimCount}
                            </p>
                            <p className="text-sm text-slate-600 dark:text-muted-foreground">
                              <span className="font-medium">Pattern:</span> {cluster.pattern}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-slate-500 dark:text-muted-foreground">
                      No high-risk involvement clusters detected
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 3️⃣ ROLE CHANGE OVERSIGHT TAB - Will be implemented in Phase 4 */}
          <TabsContent value="roles" className="space-y-6 mt-6">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle>Role Change Oversight</CardTitle>
                <CardDescription>
                  Coming in Phase 4: Role changes by actor, by department, and elevation patterns
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-slate-500 dark:text-muted-foreground">
                  Role change oversight section will be implemented in the next phase
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* SHADOW OVERRIDE MONITOR TAB — observation only, no blocking */}
          <TabsContent value="shadow" className="space-y-6 mt-6">
            {/* Header banner */}
            <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: "oklch(0.20 0.06 260 / 0.6)", border: "1px solid oklch(0.45 0.18 260)" }}>
              <Radio className="h-5 w-5 mt-0.5 shrink-0" style={{ color: "oklch(0.75 0.18 260)" }} />
              <div>
                <p className="font-bold text-sm" style={{ color: "oklch(0.85 0.12 260)" }}>Shadow Mode — Observation Only</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                  This panel tracks override frequency per user for baseline building. It does not block actions, trigger escalations, or notify users.
                  Recommended action is always <strong>none</strong>.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto shrink-0"
                disabled={shadowScanning}
                onClick={() => { setShadowScanning(true); runShadowScanMutation.mutate(); }}
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${shadowScanning ? 'animate-spin' : ''}`} />
                {shadowScanning ? 'Scanning…' : 'Run Scan'}
              </Button>
            </div>

            {/* Observations table */}
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Override Observations
                </CardTitle>
                <CardDescription>
                  Latest per-user override metrics. Scan to refresh.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {shadowLoading ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">Loading observations…</div>
                ) : shadowObservations.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No override observations yet. Click <strong>Run Scan</strong> to populate.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b" style={{ color: "var(--muted-foreground)" }}>
                          <th className="text-left py-2 pr-4 font-semibold">User</th>
                          <th className="text-right py-2 px-3 font-semibold">24h</th>
                          <th className="text-right py-2 px-3 font-semibold">7d</th>
                          <th className="text-right py-2 px-3 font-semibold">30d</th>
                          <th className="text-right py-2 px-3 font-semibold">Total</th>
                          <th className="text-left py-2 pl-3 font-semibold">Pattern</th>
                          <th className="text-right py-2 pl-3 font-semibold">Mode</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shadowObservations.map((obs, i) => (
                          <tr key={i} className="border-b last:border-0" style={{ background: obs.pattern.unusual_detected ? "oklch(0.22 0.08 30 / 0.3)" : "transparent" }}>
                            <td className="py-2.5 pr-4">
                              <div className="font-medium" style={{ color: "var(--foreground)" }}>{obs.user_name ?? obs.user_id}</div>
                              <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{obs.user_id}</div>
                            </td>
                            <td className="text-right py-2.5 px-3 font-mono" style={{ color: obs.metrics.overrides_24h >= 5 ? "#fca5a5" : "var(--foreground)" }}>{obs.metrics.overrides_24h}</td>
                            <td className="text-right py-2.5 px-3 font-mono" style={{ color: obs.metrics.overrides_7d >= 15 ? "#fca5a5" : "var(--foreground)" }}>{obs.metrics.overrides_7d}</td>
                            <td className="text-right py-2.5 px-3 font-mono" style={{ color: "var(--foreground)" }}>{obs.metrics.overrides_30d}</td>
                            <td className="text-right py-2.5 px-3 font-mono font-bold" style={{ color: "var(--foreground)" }}>{obs.metrics.total_overrides}</td>
                            <td className="py-2.5 pl-3">
                              {obs.pattern.unusual_detected ? (
                                <Badge variant="destructive" className="text-xs">⚠ Unusual</Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs">Normal</Badge>
                              )}
                            </td>
                            <td className="text-right py-2.5 pl-3">
                              <Badge variant="secondary" className="text-xs font-mono">shadow</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Spec JSON preview */}
            {shadowObservations.length > 0 && (
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4" />
                    Spec Output — First User
                  </CardTitle>
                  <CardDescription>Verbatim spec-compliant output for the first observed user.</CardDescription>
                </CardHeader>
                <CardContent>
                  <pre className="text-xs rounded-lg p-3 overflow-x-auto" style={{ background: "var(--muted)", color: "var(--foreground)" }}>
                    {JSON.stringify({
                      override_activity_detected: shadowObservations[0].override_activity_detected,
                      user_id: shadowObservations[0].user_id,
                      metrics: {
                        overrides_24h: shadowObservations[0].metrics.overrides_24h,
                        overrides_7d: shadowObservations[0].metrics.overrides_7d,
                      },
                      recommended_action: shadowObservations[0].recommended_action,
                      mode: shadowObservations[0].mode,
                    }, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
