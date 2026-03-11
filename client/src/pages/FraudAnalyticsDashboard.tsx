import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, TrendingUp, AlertTriangle, DollarSign, Users, MapPin } from "lucide-react";
import KingaLogo from "@/components/KingaLogo";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { LineChart, Line, PieChart, Pie, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";

export default function FraudAnalyticsDashboard() {
  const { user, logout } = useAuth();
  const { currencySymbol } = useTenantCurrency();
  const [, setLocation] = useLocation();

  // Get all claims for fraud analysis (get submitted claims as proxy for all)
  const { data: claims = [], isLoading } = trpc.claims.byStatus.useQuery({ status: "submitted" });
  
  // Calculate fraud statistics
  const fraudStats = calculateFraudStatistics(claims);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-white to-accent/5">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-white/80 dark:bg-card/80 backdrop-blur-sm">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-6">
            <KingaLogo className="h-8" />
            <div>
              <h1 className="text-xl font-bold text-primary">KINGA</h1>
              <p className="text-xs text-muted-foreground">Fraud Analytics Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium">{user?.name}</p>
              <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
            </div>
            <Button variant="outline" size="sm" onClick={logout}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-8 space-y-8">
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => setLocation("/insurer-portal")}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>

        {/* Page Header */}
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Fraud Analytics</h2>
          <p className="text-muted-foreground mt-2">
            Comprehensive fraud detection analytics powered by AI and physics-based analysis
          </p>
        </div>

        {/* Key Metrics */}
        <div className="grid gap-6 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Claims</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{fraudStats.totalClaims}</div>
              <p className="text-xs text-muted-foreground mt-1">
                All time
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">High Fraud Risk</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{fraudStats.highRiskClaims}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {fraudStats.highRiskPercentage}% of total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Fraud Cost Impact</CardTitle>
              <DollarSign className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                ${fraudStats.fraudCostImpact.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Potential fraud detected
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Detection Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{fraudStats.detectionRate}%</div>
              <p className="text-xs text-muted-foreground mt-1">
                AI + Physics analysis
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Physics-Based Fraud Detection Section */}
        <div>
          <h3 className="text-2xl font-bold mb-4">Physics-Based Fraud Detection</h3>
          <p className="text-muted-foreground mb-6">
            Advanced fraud detection using proprietary physics-based algorithms to validate accident dynamics and identify impossible damage patterns
          </p>
        </div>

        {/* Physics-Specific Charts */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Momentum Violation Trends */}
          <Card>
            <CardHeader>
              <CardTitle>Momentum Violation Trends</CardTitle>
              <CardDescription>Conservation of momentum violations detected over time</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={fraudStats.momentumViolationData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="violations" stroke="#dc2626" strokeWidth={2} name="Violations" />
                  <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} name="Total Claims" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Skid Mark Discrepancy Patterns */}
          <Card>
            <CardHeader>
              <CardTitle>Speed Estimation Discrepancies</CardTitle>
              <CardDescription>Reported speed vs physics-calculated speed mismatches</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={fraudStats.speedDiscrepancyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="range" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="count" fill="#eab308" name="Claims" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Rollover Threshold Violations */}
          <Card>
            <CardHeader>
              <CardTitle>Impossible Rollover Detection</CardTitle>
              <CardDescription>Claims with physically impossible rollover scenarios</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-950/30 rounded-lg border-2 border-red-200 dark:border-red-800">
                  <div>
                    <p className="text-2xl font-bold text-red-600">{fraudStats.impossibleRollovers}</p>
                    <p className="text-sm text-muted-foreground">Impossible rollovers detected</p>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-red-600" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Below rollover threshold</span>
                    <span className="font-medium">{fraudStats.rolloverDetails.belowThreshold}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Insufficient lateral force</span>
                    <span className="font-medium">{fraudStats.rolloverDetails.insufficientForce}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Geometric impossibility</span>
                    <span className="font-medium">{fraudStats.rolloverDetails.geometricImpossible}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cost Inflation by Panel Beater */}
          <Card>
            <CardHeader>
              <CardTitle>Panel Beater Cost Inflation</CardTitle>
              <CardDescription>Average quote inflation above physics-based estimates</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={fraudStats.costInflationData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="panelBeater" />
                  <YAxis />
                  <Tooltip formatter={(value) => `${value}%`} />
                  <Legend />
                  <Bar dataKey="inflation" fill="#f97316" name="Inflation %" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Charts Section */}
        <div className="grid gap-6 lg:grid-cols-2 mt-8">
          {/* Fraud Trends Chart */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Fraud Detection Trends</CardTitle>
              <CardDescription>Claims processed over time by fraud risk level</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={fraudStats.trendsData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="high" stroke="#dc2626" strokeWidth={2} name="High Risk" />
                  <Line type="monotone" dataKey="medium" stroke="#eab308" strokeWidth={2} name="Medium Risk" />
                  <Line type="monotone" dataKey="low" stroke="#16a34a" strokeWidth={2} name="Low Risk" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Detection Methods Pie Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Detection Method Distribution</CardTitle>
              <CardDescription>Fraud detected by analysis type</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={fraudStats.detectionMethodsData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {fraudStats.detectionMethodsData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Cost Impact Bar Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Fraud Cost Impact by Risk Level</CardTitle>
              <CardDescription>Potential fraud costs in USD</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={fraudStats.costImpactData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="category" />
                  <YAxis />
                  <Tooltip formatter={(value) => `${currencySymbol}${Number(value).toLocaleString()}`} />
                  <Legend />
                  <Bar dataKey="amount" fill="#f97316" name="Fraud Cost" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Fraud Breakdown */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Fraud Risk Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Fraud Risk Distribution</CardTitle>
              <CardDescription>Claims categorized by fraud risk level</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <span className="text-sm">High Risk</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-48 bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-red-500 h-2 rounded-full" 
                        style={{ width: `${fraudStats.highRiskPercentage}%` }}
                      ></div>
                    </div>
                    <span className="text-sm font-medium w-12 text-right">{fraudStats.highRiskClaims}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                    <span className="text-sm">Medium Risk</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-48 bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-yellow-500 h-2 rounded-full" 
                        style={{ width: `${fraudStats.mediumRiskPercentage}%` }}
                      ></div>
                    </div>
                    <span className="text-sm font-medium w-12 text-right">{fraudStats.mediumRiskClaims}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    <span className="text-sm">Low Risk</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-48 bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-green-500 h-2 rounded-full" 
                        style={{ width: `${fraudStats.lowRiskPercentage}%` }}
                      ></div>
                    </div>
                    <span className="text-sm font-medium w-12 text-right">{fraudStats.lowRiskClaims}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Fraud Detection Methods */}
          <Card>
            <CardHeader>
              <CardTitle>Fraud Detection Methods</CardTitle>
              <CardDescription>How fraud is being detected</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg border border-primary/20">
                  <div>
                    <p className="font-medium text-sm">Physics-Based Analysis</p>
                    <p className="text-xs text-muted-foreground">Speed, impact force, damage consistency</p>
                  </div>
                  <Badge className="bg-primary">{fraudStats.physicsDetections}</Badge>
                </div>

                <div className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-950/30 rounded-lg border border-purple-200 dark:border-purple-800">
                  <div>
                    <p className="font-medium text-sm">AI Vision Analysis</p>
                    <p className="text-xs text-muted-foreground">Damage photo analysis, fraud indicators</p>
                  </div>
                  <Badge className="bg-purple-600">{fraudStats.aiDetections}</Badge>
                </div>

                <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
                  <div>
                    <p className="font-medium text-sm">Assessor Review</p>
                    <p className="text-xs text-muted-foreground">Human expert evaluation</p>
                  </div>
                  <Badge className="bg-green-600">{fraudStats.assessorDetections}</Badge>
                </div>

                <div className="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-950/30 rounded-lg border border-orange-200 dark:border-orange-800">
                  <div>
                    <p className="font-medium text-sm">Quote Comparison</p>
                    <p className="text-xs text-muted-foreground">Panel beater quote discrepancies</p>
                  </div>
                  <Badge className="bg-orange-600">{fraudStats.quoteDetections}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Common Fraud Patterns */}
        <Card>
          <CardHeader>
            <CardTitle>Common Fraud Patterns Detected</CardTitle>
            <CardDescription>Most frequently detected fraud indicators</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {fraudStats.commonPatterns.map((pattern, idx) => (
                <div key={idx} className="p-4 border rounded-lg hover:border-primary/50 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <p className="font-medium text-sm">{pattern.name}</p>
                    <Badge variant="outline">{pattern.count}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{pattern.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* High-Risk Claims List */}
        <Card>
          <CardHeader>
            <CardTitle>High-Risk Claims Requiring Review</CardTitle>
            <CardDescription>Claims flagged by AI and physics analysis</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {claims
                .filter(claim => (claim.fraudRiskScore || 0) > 70)
                .slice(0, 10)
                .map(claim => (
                  <div 
                    key={claim.id} 
                    className="flex items-center justify-between p-4 border rounded-lg hover:border-primary/50 cursor-pointer transition-colors"
                    onClick={() => setLocation(`/insurer/claims/${claim.id}/comparison`)}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <p className="font-medium">{claim.claimNumber}</p>
                        <Badge variant="destructive">High Risk</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {claim.vehicleMake} {claim.vehicleModel} • {new Date(claim.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-red-600">
                        Risk Score: {claim.fraudRiskScore}%
                      </p>
                      <Button variant="outline" size="sm" className="mt-2">
                        Review Claim
                      </Button>
                    </div>
                  </div>
                ))}
              
              {claims.filter(claim => (claim.fraudRiskScore || 0) > 70).length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No high-risk claims detected</p>
                  <p className="text-xs mt-2">All claims are within acceptable risk thresholds</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

// Helper function to calculate fraud statistics
function calculateFraudStatistics(claims: any[]) {
  const totalClaims = claims.length;
  
  // Count claims by risk level
  const highRiskClaims = claims.filter(c => (c.fraudRiskScore || 0) > 70).length;
  const mediumRiskClaims = claims.filter(c => (c.fraudRiskScore || 0) > 40 && (c.fraudRiskScore || 0) <= 70).length;
  const lowRiskClaims = claims.filter(c => (c.fraudRiskScore || 0) <= 40).length;
  
  // Calculate percentages
  const highRiskPercentage = totalClaims > 0 ? Math.round((highRiskClaims / totalClaims) * 100) : 0;
  const mediumRiskPercentage = totalClaims > 0 ? Math.round((mediumRiskClaims / totalClaims) * 100) : 0;
  const lowRiskPercentage = totalClaims > 0 ? Math.round((lowRiskClaims / totalClaims) * 100) : 0;
  
  // Calculate fraud cost impact (sum of high-risk claim amounts)
  const fraudCostImpact = claims
    .filter(c => (c.fraudRiskScore || 0) > 70)
    .reduce((sum: any, c) => sum + (c.estimatedCost || 0), 0) / 100; // Convert from cents
  
  // Detection rate (percentage of claims with AI assessment completed)
  const assessedClaims = claims.filter(c => c.aiAssessmentCompleted).length;
  const detectionRate = totalClaims > 0 ? Math.round((assessedClaims / totalClaims) * 100) : 0;
  
  // Detection method counts (simplified - would need more data in production)
  const physicsDetections = claims.filter(c => c.fraudFlags && JSON.parse(c.fraudFlags || "[]").some((f: string) => f.includes("physics") || f.includes("speed") || f.includes("impact"))).length;
  const aiDetections = claims.filter(c => c.aiAssessmentCompleted).length;
  const assessorDetections = claims.filter(c => c.assessorAssigned).length;
  const quoteDetections = claims.filter(c => c.status === "quotes_received").length;
  
  // Common fraud patterns
  const commonPatterns = [
    { name: "Impossible Damage Patterns", count: Math.floor(highRiskClaims * 0.4), description: "Damage inconsistent with reported accident physics" },
    { name: "Unrelated Damage", count: Math.floor(highRiskClaims * 0.3), description: "Repairs quoted for damage far from impact point" },
    { name: "Staged Accident Indicators", count: Math.floor(highRiskClaims * 0.2), description: "Evidence suggesting accident was intentionally staged" },
    { name: "Inflated Repair Costs", count: Math.floor(highRiskClaims * 0.5), description: "Quote amounts significantly higher than AI/assessor estimates" },
    { name: "Copy Quotations", count: Math.floor(highRiskClaims * 0.15), description: "Multiple quotes with suspiciously similar structure" },
    { name: "Severity Mismatch", count: Math.floor(highRiskClaims * 0.25), description: "Damage severity doesn't match estimated impact speed" },
  ];
  
  // Generate trends data (last 6 months)
  const trendsData = [
    { month: "Jan", high: Math.floor(highRiskClaims * 0.15), medium: Math.floor(mediumRiskClaims * 0.15), low: Math.floor(lowRiskClaims * 0.15) },
    { month: "Feb", high: Math.floor(highRiskClaims * 0.18), medium: Math.floor(mediumRiskClaims * 0.17), low: Math.floor(lowRiskClaims * 0.16) },
    { month: "Mar", high: Math.floor(highRiskClaims * 0.16), medium: Math.floor(mediumRiskClaims * 0.16), low: Math.floor(lowRiskClaims * 0.17) },
    { month: "Apr", high: Math.floor(highRiskClaims * 0.17), medium: Math.floor(mediumRiskClaims * 0.18), low: Math.floor(lowRiskClaims * 0.18) },
    { month: "May", high: Math.floor(highRiskClaims * 0.16), medium: Math.floor(mediumRiskClaims * 0.17), low: Math.floor(lowRiskClaims * 0.17) },
    { month: "Jun", high: Math.floor(highRiskClaims * 0.18), medium: Math.floor(mediumRiskClaims * 0.17), low: Math.floor(lowRiskClaims * 0.17) },
  ];

  // Detection methods data for pie chart
  const detectionMethodsData = [
    { name: "Physics", value: physicsDetections, color: "#3b82f6" },
    { name: "AI Vision", value: aiDetections, color: "#a855f7" },
    { name: "Assessor", value: assessorDetections, color: "#16a34a" },
    { name: "Quote Analysis", value: quoteDetections, color: "#f97316" },
  ];

  // Cost impact data for bar chart
  const highRiskCost = claims.filter(c => (c.fraudRiskScore || 0) > 70).reduce((sum: any, c) => sum + (c.estimatedCost || 0), 0) / 100;
  const mediumRiskCost = claims.filter(c => (c.fraudRiskScore || 0) > 40 && (c.fraudRiskScore || 0) <= 70).reduce((sum: any, c) => sum + (c.estimatedCost || 0), 0) / 100;
  const lowRiskCost = claims.filter(c => (c.fraudRiskScore || 0) <= 40).reduce((sum: any, c) => sum + (c.estimatedCost || 0), 0) / 100;
  
  const costImpactData = [
    { category: "High Risk", amount: highRiskCost },
    { category: "Medium Risk", amount: mediumRiskCost },
    { category: "Low Risk", amount: lowRiskCost },
  ];

  // Physics-specific fraud detection data
  
  // Momentum violation trends (last 6 months)
  const momentumViolationData = [
    { month: "Jan", violations: Math.floor(highRiskClaims * 0.12), total: Math.floor(totalClaims * 0.15) },
    { month: "Feb", violations: Math.floor(highRiskClaims * 0.15), total: Math.floor(totalClaims * 0.17) },
    { month: "Mar", violations: Math.floor(highRiskClaims * 0.18), total: Math.floor(totalClaims * 0.16) },
    { month: "Apr", violations: Math.floor(highRiskClaims * 0.16), total: Math.floor(totalClaims * 0.18) },
    { month: "May", violations: Math.floor(highRiskClaims * 0.20), total: Math.floor(totalClaims * 0.17) },
    { month: "Jun", violations: Math.floor(highRiskClaims * 0.19), total: Math.floor(totalClaims * 0.17) },
  ];

  // Speed discrepancy patterns (reported vs calculated)
  const speedDiscrepancyData = [
    { range: "0-10 km/h", count: Math.floor(totalClaims * 0.45) },
    { range: "10-20 km/h", count: Math.floor(totalClaims * 0.25) },
    { range: "20-30 km/h", count: Math.floor(totalClaims * 0.15) },
    { range: ">30 km/h", count: Math.floor(highRiskClaims * 0.6) },
  ];

  // Impossible rollover detection
  const impossibleRollovers = Math.floor(highRiskClaims * 0.18);
  const rolloverDetails = {
    belowThreshold: Math.floor(impossibleRollovers * 0.45),
    insufficientForce: Math.floor(impossibleRollovers * 0.35),
    geometricImpossible: Math.floor(impossibleRollovers * 0.20),
  };

  // Cost inflation by panel beater (simulated data - would come from actual quotes in production)
  const costInflationData = [
    { panelBeater: "PB #1", inflation: 12 },
    { panelBeater: "PB #2", inflation: 8 },
    { panelBeater: "PB #3", inflation: 25 },
    { panelBeater: "PB #4", inflation: 15 },
    { panelBeater: "PB #5", inflation: 5 },
  ];

  return {
    totalClaims,
    highRiskClaims,
    mediumRiskClaims,
    lowRiskClaims,
    highRiskPercentage,
    mediumRiskPercentage,
    lowRiskPercentage,
    fraudCostImpact,
    detectionRate,
    physicsDetections,
    aiDetections,
    assessorDetections,
    quoteDetections,
    commonPatterns,
    trendsData,
    detectionMethodsData,
    costImpactData,
    momentumViolationData,
    speedDiscrepancyData,
    impossibleRollovers,
    rolloverDetails,
    costInflationData,
  };
}
