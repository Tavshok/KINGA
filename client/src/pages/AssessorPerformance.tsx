import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ClipboardCheck, TrendingDown, AlertTriangle, Clock, Award, DollarSign, ArrowLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";

export default function AssessorPerformance() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();

  // Get assessor performance metrics
  const { data: metrics, isLoading } = trpc.assessors.getPerformanceMetrics.useQuery(
    { assessorId: Number(user!.id) },
    { enabled: !!user }
  );

  if (isLoading || !metrics) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-accent/5">
        <div className="text-center">
          <Clock className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading performance metrics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-accent/5">
      {/* Header */}
      <header className="bg-white dark:bg-card border-b shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Award className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-2xl font-bold">Performance Dashboard</h1>
                <p className="text-sm text-muted-foreground">Track your assessment metrics and achievements</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setLocation("/assessor")}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Dashboard
              </Button>
              <div className="text-right">
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{user?.role?.replace("_", " ")}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => logout()}>
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          {/* Key Metrics */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {/* Average Turnaround Time */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg. Turnaround Time</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {metrics.avgTurnaroundHours.toFixed(1)} hrs
                </div>
                <p className="text-xs text-muted-foreground">
                  {metrics.avgTurnaroundHours < 24 ? (
                    <span className="text-green-600">✓ Excellent response time</span>
                  ) : metrics.avgTurnaroundHours < 48 ? (
                    <span className="text-yellow-600">⚠ Good response time</span>
                  ) : (
                    <span className="text-red-600">⚠ Needs improvement</span>
                  )}
                </p>
              </CardContent>
            </Card>

            {/* Total Savings */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Cost Savings Achieved</CardTitle>
                <TrendingDown className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  ${(metrics.totalSavings / 100).toFixed(2)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Reduced claim costs by {metrics.savingsPercentage.toFixed(1)}%
                </p>
              </CardContent>
            </Card>

            {/* Fraud Cases Detected */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Fraud Cases Detected</CardTitle>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {metrics.fraudCasesDetected}
                </div>
                <p className="text-xs text-muted-foreground">
                  {((metrics.fraudCasesDetected / metrics.totalAssessments) * 100).toFixed(1)}% of total assessments
                </p>
              </CardContent>
            </Card>

            {/* Assessments Completed */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Assessments Completed</CardTitle>
                <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {metrics.totalAssessments}
                </div>
                <p className="text-xs text-muted-foreground">
                  {metrics.assessmentsThisMonth} completed this month
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Breakdown */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Turnaround Time Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Turnaround Time Analysis</CardTitle>
                <CardDescription>Response time distribution across all assessments</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Under 24 hours</span>
                      <Badge variant="outline" className="bg-green-50 dark:bg-green-950/30">
                        {metrics.turnaroundBreakdown.under24} cases
                      </Badge>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-green-600 h-2 rounded-full" 
                        style={{ width: `${(metrics.turnaroundBreakdown.under24 / metrics.totalAssessments) * 100}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">24-48 hours</span>
                      <Badge variant="outline" className="bg-yellow-50 dark:bg-yellow-950/30">
                        {metrics.turnaroundBreakdown.under48} cases
                      </Badge>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-yellow-600 h-2 rounded-full" 
                        style={{ width: `${(metrics.turnaroundBreakdown.under48 / metrics.totalAssessments) * 100}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Over 48 hours</span>
                      <Badge variant="outline" className="bg-red-50 dark:bg-red-950/30">
                        {metrics.turnaroundBreakdown.over48} cases
                      </Badge>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-red-600 h-2 rounded-full" 
                        style={{ width: `${(metrics.turnaroundBreakdown.over48 / metrics.totalAssessments) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="text-sm text-muted-foreground">
                  <p>Target: Complete 80% of assessments within 24 hours</p>
                  <p className="mt-1">
                    Current: {((metrics.turnaroundBreakdown.under24 / metrics.totalAssessments) * 100).toFixed(1)}%
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Fraud Detection Performance */}
            <Card>
              <CardHeader>
                <CardTitle>Fraud Detection Performance</CardTitle>
                <CardDescription>Accuracy and impact of fraud identification</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">High Risk Cases</p>
                    <p className="text-2xl font-bold text-red-600">
                      {metrics.fraudBreakdown.high}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Medium Risk Cases</p>
                    <p className="text-2xl font-bold text-yellow-600">
                      {metrics.fraudBreakdown.medium}
                    </p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Fraud Detection Rate</span>
                    <span className="text-sm font-medium">
                      {((metrics.fraudCasesDetected / metrics.totalAssessments) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Prevented Fraudulent Payouts</span>
                    <span className="text-sm font-medium text-green-600">
                      ${(metrics.fraudPrevented / 100).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Accuracy Rate</span>
                    <span className="text-sm font-medium">
                      {metrics.accuracyRate.toFixed(1)}%
                    </span>
                  </div>
                </div>

                <Separator />

                <div className="text-sm text-muted-foreground">
                  <p>Your fraud detection has saved the company ${(metrics.fraudPrevented / 100).toFixed(2)} in potential losses.</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Cost Savings Impact */}
          <Card>
            <CardHeader>
              <CardTitle>Cost Savings Impact</CardTitle>
              <CardDescription>How your assessments have reduced claim costs</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm font-medium">Initial Claim Estimates</span>
                  </div>
                  <p className="text-2xl font-bold">
                    ${(metrics.initialEstimates / 100).toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Average: ${(metrics.initialEstimates / metrics.totalAssessments / 100).toFixed(2)} per claim
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="h-5 w-5 text-green-600" />
                    <span className="text-sm font-medium">After Assessment</span>
                  </div>
                  <p className="text-2xl font-bold text-green-600">
                    ${((metrics.initialEstimates - metrics.totalSavings) / 100).toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Average: ${((metrics.initialEstimates - metrics.totalSavings) / metrics.totalAssessments / 100).toFixed(2)} per claim
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Award className="h-5 w-5 text-primary" />
                    <span className="text-sm font-medium">Total Savings</span>
                  </div>
                  <p className="text-2xl font-bold text-primary">
                    ${(metrics.totalSavings / 100).toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {metrics.savingsPercentage.toFixed(1)}% reduction in costs
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Performance Badges */}
          <Card>
            <CardHeader>
              <CardTitle>Achievements & Recognition</CardTitle>
              <CardDescription>Milestones and performance badges earned</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                {metrics.avgTurnaroundHours < 24 && (
                  <Badge className="bg-green-600 text-white px-4 py-2">
                    ⚡ Speed Demon - Under 24hr turnaround
                  </Badge>
                )}
                {metrics.fraudCasesDetected >= 10 && (
                  <Badge className="bg-red-600 text-white px-4 py-2">
                    🔍 Fraud Hunter - 10+ cases detected
                  </Badge>
                )}
                {metrics.totalSavings >= 100000 && (
                  <Badge className="bg-primary text-white px-4 py-2">
                    💰 Cost Saver - $1000+ saved
                  </Badge>
                )}
                {metrics.totalAssessments >= 50 && (
                  <Badge className="bg-purple-600 text-white px-4 py-2">
                    📊 Expert Assessor - 50+ assessments
                  </Badge>
                )}
                {metrics.accuracyRate >= 95 && (
                  <Badge className="bg-yellow-600 text-white px-4 py-2">
                    🎯 Precision Master - 95%+ accuracy
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
