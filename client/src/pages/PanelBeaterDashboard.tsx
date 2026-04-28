import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  FileText, Clock, CheckCircle, DollarSign, FileEdit, Star,
  TrendingUp, AlertTriangle, BarChart3, Wrench, Award, RefreshCw,
  ChevronRight, Eye, Phone, MapPin, Calendar, Hammer
} from "lucide-react";
import { useLocation } from "wouter";
import KingaLogo from "@/components/KingaLogo";
import { NotificationBell } from "@/components/NotificationBell";
import RoleSwitcher from "@/components/RoleSwitcher";

function PerformanceTierBadge({ tier }: { tier: string | null | undefined }) {
  const config: Record<string, { label: string; className: string }> = {
    A: { label: "Tier A — Excellent", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    B: { label: "Tier B — Good", className: "bg-blue-100 text-blue-800 border-blue-200" },
    C: { label: "Tier C — Average", className: "bg-amber-100 text-amber-800 border-amber-200" },
    D: { label: "Tier D — Needs Improvement", className: "bg-red-100 text-red-800 border-red-200" },
  };
  const t = tier || "B";
  const c = config[t] || config["B"];
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${c.className}`}>
      <Award className="h-3 w-3" />
      {c.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    submitted: "bg-blue-100 text-blue-800",
    approved: "bg-emerald-100 text-emerald-800",
    rejected: "bg-red-100 text-red-800",
    pending: "bg-amber-100 text-amber-800",
    comparison: "bg-purple-100 text-purple-800",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${map[status] || "bg-gray-100 text-gray-800"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export default function PanelBeaterDashboard() {
  const { user, logout } = useAuth();
  const { fmt } = useTenantCurrency();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("queue");

  // Real data from server
  const { data: profile } = trpc.claims.myPanelBeaterProfile.useQuery();
  const { data: quoteRequests = [], isLoading: requestsLoading, refetch: refetchRequests } =
    trpc.claims.myQuoteRequests.useQuery();
  const { data: quoteHistory = [], isLoading: historyLoading } =
    trpc.claims.myQuoteHistory.useQuery();

  // Derived stats
  const pendingRequests = quoteRequests.filter((c: any) =>
    !["completed", "rejected", "cancelled"].includes(c.status)
  );
  const submittedQuotes = quoteHistory.filter((q: any) => q.status === "submitted").length;
  const approvedQuotes = quoteHistory.filter((q: any) => q.status === "approved").length;
  const totalRevenue = quoteHistory
    .filter((q: any) => q.status === "approved")
    .reduce((sum: number, q: any) => sum + (q.quotedAmount || 0), 0);

  const avgCostRatio = profile?.avgCostRatio ? parseFloat(String(profile.avgCostRatio)) : null;
  const avgQualityScore = profile?.avgQualityScore ? parseFloat(String(profile.avgQualityScore)) : null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <KingaLogo showText size="sm" />
            <Separator orientation="vertical" className="h-6" />
            <div>
              <h1 className="text-sm font-semibold text-gray-900">Panel Beater Portal</h1>
              {profile && (
                <p className="text-xs text-gray-500">{profile.businessName}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <RoleSwitcher />
            <NotificationBell />
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-gray-900">{user?.name}</p>
              <p className="text-xs text-gray-500 capitalize">Panel Beater</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => logout()}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Performance Profile Banner */}
        {profile && (
          <Card className="border-0 bg-gradient-to-r from-slate-800 to-slate-900 text-white">
            <CardContent className="pt-5 pb-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-white/10 flex items-center justify-center">
                    <Hammer className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">{profile.businessName}</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <PerformanceTierBadge tier={profile.performanceTier} />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-6 text-center">
                  <div>
                    <p className="text-2xl font-bold">{profile.totalRepairs || 0}</p>
                    <p className="text-xs text-white/60">Total Repairs</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {avgQualityScore !== null ? avgQualityScore.toFixed(1) : "—"}
                    </p>
                    <p className="text-xs text-white/60">Avg Quality</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {avgCostRatio !== null ? `${(avgCostRatio * 100).toFixed(0)}%` : "—"}
                    </p>
                    <p className="text-xs text-white/60">Cost Ratio</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* KPI Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Quote Requests</CardTitle>
              <FileText className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{pendingRequests.length}</div>
              <p className="text-xs text-gray-500 mt-1">Awaiting your quote</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Quotes Submitted</CardTitle>
              <Clock className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{submittedQuotes}</div>
              <p className="text-xs text-gray-500 mt-1">Pending insurer review</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Approved</CardTitle>
              <CheckCircle className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">{approvedQuotes}</div>
              <p className="text-xs text-gray-500 mt-1">Quotes accepted</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{fmt(totalRevenue)}</div>
              <p className="text-xs text-gray-500 mt-1">From approved quotes</p>
            </CardContent>
          </Card>
        </div>

        {/* Performance Metrics */}
        {profile && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                  <Star className="h-4 w-4 text-amber-500" />
                  Quality Score
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-2 mb-2">
                  <span className="text-3xl font-bold text-gray-900">
                    {avgQualityScore !== null ? avgQualityScore.toFixed(1) : "—"}
                  </span>
                  <span className="text-sm text-gray-500 mb-1">/ 100</span>
                </div>
                {avgQualityScore !== null && (
                  <Progress value={avgQualityScore} className="h-2" />
                )}
                <p className="text-xs text-gray-500 mt-2">Based on {profile.totalRepairs} completed repairs</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-500" />
                  Cost Accuracy
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-2 mb-2">
                  <span className="text-3xl font-bold text-gray-900">
                    {avgCostRatio !== null ? `${(avgCostRatio * 100).toFixed(0)}%` : "—"}
                  </span>
                </div>
                {avgCostRatio !== null && (
                  <Progress value={Math.min(avgCostRatio * 100, 100)} className="h-2" />
                )}
                <p className="text-xs text-gray-500 mt-2">Quote vs KINGA benchmark ratio</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  Fraud Flags
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-2 mb-2">
                  <span className="text-3xl font-bold text-gray-900">
                    {profile.fraudFlagCount || 0}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {(profile.fraudFlagCount || 0) === 0
                    ? "Clean record — no flags raised"
                    : "Flags raised on your quotes"}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-flex">
            <TabsTrigger value="queue" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Quote Queue
              {pendingRequests.length > 0 && (
                <Badge className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs bg-red-500 text-white">
                  {pendingRequests.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Quote History
            </TabsTrigger>
          </TabsList>

          {/* Quote Queue Tab */}
          <TabsContent value="queue" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Active Quote Requests</CardTitle>
                  <CardDescription>
                    Claims where you were selected — submit your quote to proceed
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchRequests()}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </Button>
              </CardHeader>
              <CardContent>
                {requestsLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : pendingRequests.length === 0 ? (
                  <div className="text-center py-12">
                    <Wrench className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No active quote requests</p>
                    <p className="text-sm text-gray-400 mt-1">
                      When claimants select you, their claims will appear here
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pendingRequests.map((claim: any) => (
                      <div
                        key={claim.id}
                        className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-all"
                      >
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sm font-semibold text-gray-900">
                              {claim.claimNumber}
                            </span>
                            <StatusBadge status={claim.status} />
                            {claim.policyVerified && (
                              <Badge variant="outline" className="text-xs border-emerald-300 text-emerald-700">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Policy Verified
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-700">
                            {[claim.vehicleMake, claim.vehicleModel, claim.vehicleYear]
                              .filter(Boolean).join(" ")}
                          </p>
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            {claim.incidentLocation && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {claim.incidentLocation}
                              </span>
                            )}
                            {claim.incidentDate && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {new Date(claim.incidentDate).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setLocation(`/panel-beater/claims/${claim.id}/quote`)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => setLocation(`/panel-beater/claims/${claim.id}/quote`)}
                          >
                            <FileEdit className="h-4 w-4 mr-1" />
                            Submit Quote
                            <ChevronRight className="h-4 w-4 ml-1" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Quote History Tab */}
          <TabsContent value="history" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Quote History</CardTitle>
                <CardDescription>
                  All quotes you have submitted — with status and outcome
                </CardDescription>
              </CardHeader>
              <CardContent>
                {historyLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : quoteHistory.length === 0 ? (
                  <div className="text-center py-12">
                    <BarChart3 className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No quotes submitted yet</p>
                    <p className="text-sm text-gray-400 mt-1">
                      Your submitted quotes and their outcomes will appear here
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-2 font-medium text-gray-600">Claim #</th>
                          <th className="text-right py-3 px-2 font-medium text-gray-600">Your Quote</th>
                          <th className="text-right py-3 px-2 font-medium text-gray-600">Labour</th>
                          <th className="text-right py-3 px-2 font-medium text-gray-600">Parts</th>
                          <th className="text-center py-3 px-2 font-medium text-gray-600">Status</th>
                          <th className="text-left py-3 px-2 font-medium text-gray-600">Submitted</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {quoteHistory.map((quote: any) => (
                          <tr key={quote.id} className="hover:bg-gray-50 transition-colors">
                            <td className="py-3 px-2">
                              <span className="font-mono text-xs text-gray-700">
                                #{quote.claimId}
                              </span>
                            </td>
                            <td className="py-3 px-2 text-right font-semibold text-gray-900">
                              {fmt(quote.quotedAmount || 0)}
                            </td>
                            <td className="py-3 px-2 text-right text-gray-600">
                              {quote.laborCost ? fmt(quote.laborCost) : "—"}
                            </td>
                            <td className="py-3 px-2 text-right text-gray-600">
                              {quote.partsCost ? fmt(quote.partsCost) : "—"}
                            </td>
                            <td className="py-3 px-2 text-center">
                              <StatusBadge status={quote.status || "submitted"} />
                            </td>
                            <td className="py-3 px-2 text-gray-500 text-xs">
                              {quote.createdAt
                                ? new Date(quote.createdAt).toLocaleDateString()
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Workshop Details */}
        {profile && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Workshop Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-3 gap-4 text-sm">
                {profile.address && (
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium text-gray-700">Address</p>
                      <p className="text-gray-500">{profile.address}</p>
                    </div>
                  </div>
                )}
                {profile.phone && (
                  <div className="flex items-start gap-2">
                    <Phone className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium text-gray-700">Phone</p>
                      <p className="text-gray-500">{profile.phone}</p>
                    </div>
                  </div>
                )}
                {profile.avgRepairDurationDays && (
                  <div className="flex items-start gap-2">
                    <Clock className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium text-gray-700">Avg Repair Time</p>
                      <p className="text-gray-500">
                        {parseFloat(String(profile.avgRepairDurationDays)).toFixed(1)} days
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
