/**
 * Executive Dashboard - Command Center for Decision Making
 * 
 * Provides comprehensive analytics, search capabilities, and critical alerts
 * for executives to make informed decisions.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { 
  Search, TrendingUp, DollarSign, AlertTriangle, CheckCircle, 
  Clock, Users, Wrench, BarChart3, FileText, Activity,
  ArrowUpRight, ArrowDownRight, Shield, TrendingDown, Download,
  MessageSquare, Eye, AlertCircle
} from "lucide-react";
import { Link } from "wouter";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import ExecutiveAnalyticsCharts from "@/components/ExecutiveAnalyticsCharts";
import ExecutiveKPICards from "@/components/ExecutiveKPICards";
import {
  exportKPIsToPDF,
  exportAlertsToPDF,
  exportAssessorPerformanceToExcel,
  exportPanelBeaterAnalyticsToExcel,
  exportCostSavingsTrendsToExcel,
  exportFinancialOverviewToPDF,
} from "@/lib/exportUtils";

export default function ExecutiveDashboard() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  
  // Comment & Review Request state
  const [selectedClaim, setSelectedClaim] = useState<any>(null);
  const [showCommentDialog, setShowCommentDialog] = useState(false);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [commentContent, setCommentContent] = useState("");
  const [commentType, setCommentType] = useState("general");
  const [reviewRole, setReviewRole] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");

  // Fetch data
  const { data: kpis, isLoading: kpisLoading } = trpc.executive.getKPIs.useQuery();
  const { data: alerts, isLoading: alertsLoading } = trpc.executive.getCriticalAlerts.useQuery();
  const { data: assessorPerf, isLoading: assessorLoading } = trpc.executive.getAssessorPerformance.useQuery();
  const { data: panelBeaterAnalytics, isLoading: panelBeaterLoading } = trpc.executive.getPanelBeaterAnalytics.useQuery();
  const { data: savingsTrends, isLoading: savingsLoading } = trpc.executive.getCostSavingsTrends.useQuery();
  const { data: bottlenecks, isLoading: bottlenecksLoading } = trpc.executive.getWorkflowBottlenecks.useQuery();
  const { data: financials, isLoading: financialsLoading } = trpc.executive.getFinancialOverview.useQuery();

  // Search query - only execute when searchQuery has value
  const { data: searchResults, isLoading: searchLoading, refetch: executeSearch } = trpc.executive.globalSearch.useQuery(
    { query: searchQuery },
    { enabled: false } // Don't auto-execute
  );

  const handleSearch = async () => {
    if (searchQuery.trim()) {
      await executeSearch();
    }
  };

  // Add comment mutation
  const addComment = trpc.workflow.addComment.useMutation({
    onSuccess: () => {
      toast.success("Comment Added", {
        description: "Your comment has been added to the claim.",
      });
      setShowCommentDialog(false);
      setSelectedClaim(null);
      setCommentContent("");
      setCommentType("general");
    },
    onError: (error: any) => {
      toast.error("Error", {
        description: error.message,
      });
    },
  });

  const handleAddComment = (claim: any) => {
    setSelectedClaim(claim);
    setShowCommentDialog(true);
  };

  const handleSubmitComment = () => {
    if (!selectedClaim || !commentContent.trim()) {
      toast.error("Validation Error", {
        description: "Please enter a comment.",
      });
      return;
    }

    addComment.mutate({
      claimId: selectedClaim.id,
      commentType: commentType as any,
      content: commentContent,
    });
  };

  const handleRequestReview = (claim: any) => {
    setSelectedClaim(claim);
    setShowReviewDialog(true);
  };

  const handleSubmitReviewRequest = () => {
    if (!selectedClaim || !reviewRole || !reviewNotes.trim()) {
      toast.error("Validation Error", {
        description: "Please select a role and provide review notes.",
      });
      return;
    }

    // Add comment with review request
    addComment.mutate({
      claimId: selectedClaim.id,
      commentType: "flag",
      content: `EXECUTIVE REVIEW REQUEST for ${reviewRole}: ${reviewNotes}`,
    });

    setShowReviewDialog(false);
    setSelectedClaim(null);
    setReviewRole("");
    setReviewNotes("");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Executive Command Center
            </h1>
            <p className="text-slate-600 mt-2">Real-time insights and decision-making tools</p>
          </div>
          <Link href="/portal-hub">
            <Button variant="outline">Switch Portal</Button>
          </Link>
        </div>

        {/* Global Search */}
        <Card className="border-2 border-blue-200 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5 text-blue-600" />
              Global Search
            </CardTitle>
            <CardDescription>
              Search by vehicle registration, claim number, policy number, or insured name
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="Enter search query..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="flex-1"
              />
              <Button onClick={handleSearch} disabled={!searchQuery.trim() || searchLoading}>
                {searchLoading ? "Searching..." : "Search"}
              </Button>
            </div>
            
            {/* Search Results */}
            {searchResults && searchResults.length > 0 && (
              <div className="mt-4 space-y-2 max-h-96 overflow-y-auto">
                {searchResults.map((claim: any) => (
                  <div key={claim.id} className="p-4 bg-white rounded-lg border hover:border-blue-500 hover:shadow-md transition-all">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="font-semibold">{claim.claimNumber}</p>
                        <p className="text-sm text-slate-600">
                          {claim.vehicleMake} {claim.vehicleModel} - {claim.vehicleRegistration}
                        </p>
                        <p className="text-xs text-slate-500">{claim.claimantName}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={claim.status === "completed" ? "default" : "secondary"}>
                          {claim.status}
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAddComment(claim)}
                        >
                          <MessageSquare className="h-4 w-4 mr-1" />
                          Comment
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-orange-500 text-orange-700"
                          onClick={() => handleRequestReview(claim)}
                        >
                          <AlertCircle className="h-4 w-4 mr-1" />
                          Request Review
                        </Button>
                        <Link href={`/insurer/claims/${claim.id}/comparison`}>
                          <Button size="sm" variant="ghost">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {searchResults && searchResults.length === 0 && (
              <p className="text-center text-slate-500 mt-4">No results found</p>
            )}
          </CardContent>
        </Card>

        {/* KPI Cards */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-slate-800">Key Performance Indicators</h2>
          <Button
            size="sm"
            variant="outline"
            onClick={() => kpis && exportKPIsToPDF(kpis)}
            disabled={!kpis}
          >
            <Download className="h-4 w-4 mr-2" />
            Export KPIs
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">      <Card className="border-l-4 border-l-blue-500 shadow-md hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Total Claims
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">
                {kpisLoading ? "..." : kpis?.totalClaims || 0}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {kpis?.activeClaims || 0} active • {kpis?.completedClaims || 0} completed
              </p>
              <div className="mt-2 flex items-center gap-1 text-xs text-green-600">
                <ArrowUpRight className="h-3 w-3" />
                {kpis?.completionRate || 0}% completion rate
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-green-500 shadow-md hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Total Savings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">
                ${kpisLoading ? "..." : (kpis?.totalSavings || 0).toLocaleString()}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                AI-driven cost optimization
              </p>
              <div className="mt-2 flex items-center gap-1 text-xs text-green-600">
                <TrendingDown className="h-3 w-3" />
                Reduced claim costs
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-red-500 shadow-md hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Fraud Detected
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600">
                {kpisLoading ? "..." : kpis?.fraudDetected || 0}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                High-risk claims flagged
              </p>
              <div className="mt-2 flex items-center gap-1 text-xs text-red-600">
                <AlertTriangle className="h-3 w-3" />
                Requires investigation
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-purple-500 shadow-md hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Avg Processing Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-purple-600">
                {kpisLoading ? "..." : kpis?.avgProcessingTime || 0}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Days from submission to closure
              </p>
              <div className="mt-2 flex items-center gap-1 text-xs text-purple-600">
                <Activity className="h-3 w-3" />
                Workflow efficiency
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs for Different Dashboards */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-6 bg-white shadow-md">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="alerts">Critical Alerts</TabsTrigger>
            <TabsTrigger value="assessors">Assessors</TabsTrigger>
            <TabsTrigger value="panel-beaters">Panel Beaters</TabsTrigger>
            <TabsTrigger value="financials">Financials</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Cost Savings Trends */}
              <Card className="shadow-md">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-green-600" />
                        Cost Savings Trends
                      </CardTitle>
                      <CardDescription>Last 6 months</CardDescription>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => savingsTrends && exportCostSavingsTrendsToExcel(savingsTrends)}
                      disabled={!savingsTrends || savingsTrends.length === 0}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Export
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {savingsLoading ? (
                    <p className="text-center text-slate-500">Loading...</p>
                  ) : savingsTrends && savingsTrends.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={savingsTrends.map((t: any) => ({ month: t.month, savings: t.savings }))}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <Tooltip formatter={(value: number) => [`$${value.toLocaleString()}`, 'Savings']} />
                        <Line type="monotone" dataKey="savings" stroke="#2563eb" strokeWidth={3} dot={{ r: 5, fill: "#2563eb" }} fill="rgba(37, 99, 235, 0.1)" />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-center text-slate-500">No data available</p>
                  )}
                </CardContent>
              </Card>

              {/* Workflow Bottlenecks */}
              <Card className="shadow-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-orange-600" />
                    Workflow Bottlenecks
                  </CardTitle>
                  <CardDescription>Average days in each state</CardDescription>
                </CardHeader>
                <CardContent>
                  {bottlenecksLoading ? (
                    <p className="text-center text-slate-500">Loading...</p>
                  ) : bottlenecks && bottlenecks.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={bottlenecks.map((b: any) => ({ state: b.state?.replace(/_/g, " ") || "", days: b.avgDaysInState }))} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" />
                        <YAxis dataKey="state" type="category" width={150} />
                        <Tooltip formatter={(value: number) => [`${value.toFixed(1)} days`, 'Avg Duration']} />
                        <Bar dataKey="days">
                          {bottlenecks.map((b: any, i: number) => (
                            <Cell key={i} fill={b.avgDaysInState > 7 ? '#ef4444' : b.avgDaysInState > 3 ? '#f97316' : '#2563eb'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-center text-slate-500">No bottlenecks detected</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-4">
            <ExecutiveAnalyticsCharts />
          </TabsContent>

          {/* Critical Alerts Tab */}
          <TabsContent value="alerts" className="space-y-4">
            <div className="flex justify-end mb-4">
              <Button
                size="sm"
                variant="outline"
                onClick={() => alerts && exportAlertsToPDF(alerts)}
                disabled={!alerts}
              >
                <Download className="h-4 w-4 mr-2" />
                Export Alerts Report
              </Button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* High-Value Claims */}
              <Card className="shadow-md border-l-4 border-l-yellow-500">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-yellow-600" />
                    High-Value Claims Pending
                  </CardTitle>
                  <CardDescription>Claims over $10,000 requiring approval</CardDescription>
                </CardHeader>
                <CardContent>
                  {alertsLoading ? (
                    <p className="text-center text-slate-500">Loading...</p>
                  ) : alerts?.highValuePending && alerts.highValuePending.length > 0 ? (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {alerts.highValuePending.map((claim: any) => (
                        <Link key={claim.id} href={`/insurer/claims/${claim.id}/comparison`}>
                          <div className="p-3 bg-yellow-50 rounded border border-yellow-200 hover:border-yellow-400 cursor-pointer transition-colors">
                            <p className="font-semibold text-sm">{claim.claimNumber}</p>
                            <p className="text-xs text-slate-600">{claim.vehicleRegistration}</p>
                            <p className="text-xs font-bold text-yellow-700 mt-1">
                              ${((claim.estimatedCost || 0) / 100).toLocaleString()}
                            </p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-slate-500">No high-value claims pending</p>
                  )}
                </CardContent>
              </Card>

              {/* High Fraud Risk */}
              <Card className="shadow-md border-l-4 border-l-red-500">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-red-600" />
                    High Fraud Risk
                  </CardTitle>
                  <CardDescription>Claims flagged for investigation</CardDescription>
                </CardHeader>
                <CardContent>
                  {alertsLoading ? (
                    <p className="text-center text-slate-500">Loading...</p>
                  ) : alerts?.highFraudRisk && alerts.highFraudRisk.length > 0 ? (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {alerts.highFraudRisk.map((claim: any) => (
                        <Link key={claim.id} href={`/insurer/claims/${claim.id}/comparison`}>
                          <div className="p-3 bg-red-50 rounded border border-red-200 hover:border-red-400 cursor-pointer transition-colors">
                            <p className="font-semibold text-sm">{claim.claimNumber}</p>
                            <p className="text-xs text-slate-600">{claim.vehicleRegistration}</p>
                            <Badge variant="destructive" className="mt-1 text-xs">
                              High Risk
                            </Badge>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-slate-500">No high fraud risk claims</p>
                  )}
                </CardContent>
              </Card>

              {/* Disputed Claims */}
              <Card className="shadow-md border-l-4 border-l-purple-500">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-purple-600" />
                    Disputed Claims
                  </CardTitle>
                  <CardDescription>Claims requiring resolution</CardDescription>
                </CardHeader>
                <CardContent>
                  {alertsLoading ? (
                    <p className="text-center text-slate-500">Loading...</p>
                  ) : alerts?.disputedClaims && alerts.disputedClaims.length > 0 ? (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {alerts.disputedClaims.map((claim: any) => (
                        <Link key={claim.id} href={`/insurer/claims/${claim.id}/comparison`}>
                          <div className="p-3 bg-purple-50 rounded border border-purple-200 hover:border-purple-400 cursor-pointer transition-colors">
                            <p className="font-semibold text-sm">{claim.claimNumber}</p>
                            <p className="text-xs text-slate-600">{claim.vehicleRegistration}</p>
                            <Badge variant="outline" className="mt-1 text-xs border-purple-500 text-purple-700">
                              Disputed
                            </Badge>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-slate-500">No disputed claims</p>
                  )}
                </CardContent>
              </Card>

              {/* Stuck Claims */}
              <Card className="shadow-md border-l-4 border-l-orange-500">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-orange-600" />
                    Stuck Claims
                  </CardTitle>
                  <CardDescription>Claims delayed over 7 days</CardDescription>
                </CardHeader>
                <CardContent>
                  {alertsLoading ? (
                    <p className="text-center text-slate-500">Loading...</p>
                  ) : alerts?.stuckClaims && alerts.stuckClaims.length > 0 ? (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {alerts.stuckClaims.map((claim: any) => (
                        <Link key={claim.id} href={`/insurer/claims/${claim.id}/comparison`}>
                          <div className="p-3 bg-orange-50 rounded border border-orange-200 hover:border-orange-400 cursor-pointer transition-colors">
                            <p className="font-semibold text-sm">{claim.claimNumber}</p>
                            <p className="text-xs text-slate-600">{claim.vehicleRegistration}</p>
                            <Badge variant="outline" className="mt-1 text-xs border-orange-500 text-orange-700">
                              Delayed
                            </Badge>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-slate-500">No stuck claims</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Assessors Tab */}
          <TabsContent value="assessors">
            <Card className="shadow-md">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-blue-600" />
                      Assessor Performance Leaderboard
                    </CardTitle>
                    <CardDescription>Ranked by performance score</CardDescription>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => assessorPerf && exportAssessorPerformanceToExcel(assessorPerf)}
                    disabled={!assessorPerf || assessorPerf.length === 0}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {assessorLoading ? (
                  <p className="text-center text-slate-500">Loading...</p>
                ) : assessorPerf && assessorPerf.length > 0 ? (
                  <div className="space-y-2">
                    {assessorPerf.map((assessor: any, index: number) => (
                      <div key={assessor.id} className="flex items-center justify-between p-3 bg-slate-50 rounded hover:bg-slate-100 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                            index === 0 ? "bg-yellow-400 text-yellow-900" :
                            index === 1 ? "bg-slate-300 text-slate-700" :
                            index === 2 ? "bg-orange-400 text-orange-900" :
                            "bg-slate-200 text-slate-600"
                          }`}>
                            {index + 1}
                          </div>
                          <div>
                            <p className="font-semibold">{assessor.name}</p>
                            <p className="text-xs text-slate-500">{assessor.email}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-blue-600">{assessor.performanceScore || 0}</p>
                          <p className="text-xs text-slate-500">{assessor.totalAssessments || 0} assessments</p>
                          <Badge variant={assessor.tier === "premium" ? "default" : "secondary"} className="mt-1 text-xs">
                            {assessor.tier || "free"}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-slate-500">No assessor data available</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Panel Beaters Tab */}
          <TabsContent value="panel-beaters">
            <Card className="shadow-md">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Wrench className="h-5 w-5 text-green-600" />
                      Panel Beater Analytics
                    </CardTitle>
                    <CardDescription>Quote accuracy and performance metrics</CardDescription>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => panelBeaterAnalytics && exportPanelBeaterAnalyticsToExcel(panelBeaterAnalytics)}
                    disabled={!panelBeaterAnalytics || panelBeaterAnalytics.length === 0}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {panelBeaterLoading ? (
                  <p className="text-center text-slate-500">Loading...</p>
                ) : panelBeaterAnalytics && panelBeaterAnalytics.length > 0 ? (
                  <div className="space-y-2">
                    {panelBeaterAnalytics.map((beater: any) => (
                      <div key={beater.id} className="p-3 bg-slate-50 rounded hover:bg-slate-100 transition-colors">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold">{beater.name}</p>
                            <p className="text-xs text-slate-500">
                              {beater.totalQuotes} quotes • ${beater.avgQuoteAmount.toLocaleString()} avg
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-green-600">{beater.acceptanceRate}%</p>
                            <p className="text-xs text-slate-500">acceptance rate</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-slate-500">No panel beater data available</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Financials Tab */}
          <TabsContent value="financials">
            <div className="flex justify-end mb-4">
              <Button
                size="sm"
                variant="outline"
                onClick={() => financials && exportFinancialOverviewToPDF(financials)}
                disabled={!financials}
              >
                <Download className="h-4 w-4 mr-2" />
                Export Financial Report
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="shadow-md border-l-4 border-l-blue-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-600">Total Payouts</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">
                    ${financialsLoading ? "..." : (financials?.totalPayouts || 0).toLocaleString()}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Completed claims</p>
                </CardContent>
              </Card>

              <Card className="shadow-md border-l-4 border-l-yellow-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-600">Total Reserves</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-yellow-600">
                    ${financialsLoading ? "..." : (financials?.totalReserves || 0).toLocaleString()}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Pending claims</p>
                </CardContent>
              </Card>

              <Card className="shadow-md border-l-4 border-l-red-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-600">Fraud Prevented</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">
                    ${financialsLoading ? "..." : (financials?.fraudPrevented || 0).toLocaleString()}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Rejected high-risk claims</p>
                </CardContent>
              </Card>

              <Card className="shadow-md border-l-4 border-l-purple-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-600">Net Exposure</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-purple-600">
                    ${financialsLoading ? "..." : (financials?.netExposure || 0).toLocaleString()}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Total liability</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Add Comment Dialog */}
        <Dialog open={showCommentDialog} onOpenChange={setShowCommentDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Executive Comment</DialogTitle>
              <DialogDescription>
                {selectedClaim && `Claim: ${selectedClaim.claimNumber} - ${selectedClaim.vehicleRegistration}`}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="commentType">Comment Type</Label>
                <Select value={commentType} onValueChange={setCommentType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select comment type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General Comment</SelectItem>
                    <SelectItem value="flag">Flag for Attention</SelectItem>
                    <SelectItem value="technical_note">Technical Note</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="commentContent">Comment *</Label>
                <Textarea
                  id="commentContent"
                  value={commentContent}
                  onChange={(e) => setCommentContent(e.target.value)}
                  placeholder="Enter your executive comment or guidance..."
                  rows={6}
                />
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                <p className="text-sm text-blue-700">
                  <strong>Note:</strong> Your comment will be visible to all roles involved in this claim for transparency.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCommentDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleSubmitComment} 
                disabled={addComment.isPending || !commentContent.trim()}
              >
                {addComment.isPending ? "Adding..." : "Add Comment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Request Review Dialog */}
        <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Request Further Review</DialogTitle>
              <DialogDescription>
                {selectedClaim && `Claim: ${selectedClaim.claimNumber} - ${selectedClaim.vehicleRegistration}`}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="p-3 bg-orange-50 border border-orange-200 rounded">
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle className="h-5 w-5 text-orange-600" />
                  <span className="text-sm font-medium text-orange-700">Executive Review Request</span>
                </div>
                <p className="text-sm text-orange-700">
                  This claim will be flagged for immediate attention by the selected role.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reviewRole">Request Review From *</Label>
                <Select value={reviewRole} onValueChange={setReviewRole}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Risk Manager">Risk Manager</SelectItem>
                    <SelectItem value="Claims Manager">Claims Manager</SelectItem>
                    <SelectItem value="Internal Assessor">Internal Assessor</SelectItem>
                    <SelectItem value="Claims Processor">Claims Processor</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reviewNotes">Review Notes *</Label>
                <Textarea
                  id="reviewNotes"
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Explain what needs to be reviewed or validated (e.g., 'Please verify fraud risk assessment - pattern matches previous suspicious claims')..."
                  rows={6}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowReviewDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleSubmitReviewRequest} 
                disabled={addComment.isPending || !reviewRole || !reviewNotes.trim()}
                variant="outline"
                className="border-orange-500 text-orange-700 hover:bg-orange-50"
              >
                {addComment.isPending ? "Requesting..." : "Request Review"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
