import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TrendingUp,
  TrendingDown,
  Award,
  Clock,
  DollarSign,
  Lock,
  Crown,
  CheckCircle2,
  AlertTriangle,
  Eye,
  EyeOff,
} from "lucide-react";
import { useState } from "react";

export default function AssessorPerformanceDashboard() {
  const { data: dashboard, isLoading } = trpc.assessors.getPerformanceDashboard.useQuery();
  const [showBlurred, setShowBlurred] = useState(true);

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="container mx-auto py-8">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Unable to load performance dashboard. Please try again later.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const {
    tier,
    tierActivatedAt,
    tierExpiresAt,
    performanceScore,
    totalAssessmentsCompleted,
    averageVarianceFromFinal,
    recentAssessments,
    assignedClaims,
  } = dashboard;

  const isFree = tier === "free";
  const isPremium = tier === "premium" || tier === "enterprise";

  const getTierBadge = () => {
    if (tier === "free") return <Badge variant="outline">Free Tier</Badge>;
    if (tier === "premium") return <Badge className="bg-primary"><Crown className="h-3 w-3 mr-1" />Premium</Badge>;
    return <Badge className="bg-purple-600"><Crown className="h-3 w-3 mr-1" />Enterprise</Badge>;
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const getScoreRating = (score: number) => {
    if (score >= 90) return "Excellent";
    if (score >= 80) return "Good";
    if (score >= 60) return "Fair";
    return "Needs Improvement";
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Performance Dashboard</h1>
          <p className="text-muted-foreground">
            Track your assessment accuracy and improve your performance
          </p>
        </div>
        <div className="flex items-center gap-3">
          {getTierBadge()}
          {isFree && (
            <Button className="bg-primary hover:bg-primary/90">
              <Crown className="h-4 w-4 mr-2" />
              Upgrade to Premium
            </Button>
          )}
        </div>
      </div>

      {/* Upgrade Prompt for Free Tier */}
      {isFree && (
        <Alert className="border-primary bg-primary/5">
          <Crown className="h-4 w-4 text-primary" />
          <AlertDescription>
            <strong className="text-secondary">Unlock Full Performance Insights</strong>
            <p className="text-secondary mt-1">
              Upgrade to Premium ($50/month) to see component-level breakdowns, improvement suggestions, 
              and priority claim assignments. Limited-time offer: First month 50% off!
            </p>
            <Button className="mt-3 bg-primary hover:bg-primary/90" size="sm">
              Upgrade Now
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Performance Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Award className="h-4 w-4" />
              Performance Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${getScoreColor(performanceScore)}`}>
              {performanceScore}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {getScoreRating(performanceScore)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Total Assessments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalAssessmentsCompleted}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Completed claims
            </p>
          </CardContent>
        </Card>

        <Card className={isFree ? "relative" : ""}>
          {isFree && showBlurred && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm rounded-lg flex items-center justify-center z-10">
              <div className="text-center">
                <Lock className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                <p className="text-sm font-medium text-gray-600">Premium Feature</p>
                <Button size="sm" variant="outline" className="mt-2" onClick={() => setShowBlurred(false)}>
                  <Eye className="h-3 w-3 mr-1" />
                  Preview
                </Button>
              </div>
            </div>
          )}
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="h-4 w-4" />
              Avg Variance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {averageVarianceFromFinal !== null && averageVarianceFromFinal !== undefined
                ? `${averageVarianceFromFinal.toFixed(1)}%`
                : "N/A"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              From final approved cost
            </p>
          </CardContent>
        </Card>

        <Card className={isFree ? "relative" : ""}>
          {isFree && showBlurred && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm rounded-lg flex items-center justify-center z-10">
              <div className="text-center">
                <Lock className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                <p className="text-sm font-medium text-gray-600">Premium Feature</p>
              </div>
            </div>
          )}
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Priority Queue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {isPremium ? assignedClaims.length : "0"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {isPremium ? "Active assignments" : "Upgrade for priority"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Assessments */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Assessments</CardTitle>
          <CardDescription>
            Your last 10 completed claim evaluations
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentAssessments.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No assessments completed yet. Start evaluating claims to see your performance here.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Claim ID</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Your Estimate</TableHead>
                  <TableHead>Status</TableHead>
                  {isPremium && <TableHead>Variance</TableHead>}
                  {isPremium && <TableHead>Score</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentAssessments.map((assessment: any) => (
                  <TableRow key={assessment.id}>
                    <TableCell className="font-medium">#{assessment.claimId}</TableCell>
                    <TableCell>
                      {new Date(assessment.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      ${(assessment.estimatedRepairCost / 100).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {assessment.fraudRiskLevel || "pending"}
                      </Badge>
                    </TableCell>
                    {isPremium && (
                      <TableCell>
                        {assessment.variance !== undefined ? (
                          <span className={assessment.variance <= 15 ? "text-green-600" : "text-yellow-600"}>
                            {assessment.variance.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Pending</span>
                        )}
                      </TableCell>
                    )}
                    {isPremium && (
                      <TableCell>
                        {assessment.score !== undefined ? (
                          <span className={getScoreColor(assessment.score)}>
                            {assessment.score}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Pending</span>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Assigned Claims */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Assigned Claims
            {isPremium && <Badge className="bg-primary">Priority Access</Badge>}
          </CardTitle>
          <CardDescription>
            {isPremium
              ? "Claims assigned to you for evaluation"
              : "Upgrade to Premium for priority claim assignments"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!isPremium ? (
            <div className="text-center py-12 space-y-4">
              <Lock className="h-16 w-16 mx-auto text-gray-300" />
              <div>
                <h3 className="font-semibold text-lg mb-2">Premium Feature</h3>
                <p className="text-muted-foreground mb-4">
                  Get priority access to high-value claims and earn more with Premium tier
                </p>
                <Button className="bg-primary hover:bg-primary/90">
                  <Crown className="h-4 w-4 mr-2" />
                  Upgrade to Premium
                </Button>
              </div>
            </div>
          ) : assignedClaims.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No claims currently assigned. New assignments will appear here.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Claim ID</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assigned Date</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignedClaims.map((claim: any) => (
                  <TableRow key={claim.id}>
                    <TableCell className="font-medium">#{claim.id}</TableCell>
                    <TableCell>
                      {claim.vehicleMake} {claim.vehicleModel}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{claim.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(claim.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline">
                        View Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Tier Comparison (for Free users) */}
      {isFree && (
        <Card className="border-2 border-primary">
          <CardHeader>
            <CardTitle>Unlock Your Full Potential</CardTitle>
            <CardDescription>
              See what you're missing with Premium tier
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <EyeOff className="h-4 w-4 text-gray-400" />
                  Free Tier (Current)
                </h3>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5" />
                    <span>Basic performance score</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5" />
                    <span>Total assessments count</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Lock className="h-4 w-4 text-gray-400 mt-0.5" />
                    <span className="text-muted-foreground">Limited variance insights</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Lock className="h-4 w-4 text-gray-400 mt-0.5" />
                    <span className="text-muted-foreground">No priority assignments</span>
                  </li>
                </ul>
              </div>

              <div className="bg-primary/5 p-4 rounded-lg">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Crown className="h-4 w-4 text-primary" />
                  Premium Tier
                </h3>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5" />
                    <span className="font-medium">Component-level variance breakdown</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5" />
                    <span className="font-medium">Detailed improvement suggestions</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5" />
                    <span className="font-medium">Priority claim assignments</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5" />
                    <span className="font-medium">Performance analytics & trends</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5" />
                    <span className="font-medium">Earn 20-30% more per month</span>
                  </li>
                </ul>

                <div className="mt-4 pt-4 border-t border-primary/20">
                  <p className="text-2xl font-bold text-secondary mb-1">$50/month</p>
                  <p className="text-xs text-primary/90 mb-3">First month 50% off - Only $25!</p>
                  <Button className="w-full bg-primary hover:bg-primary/90">
                    <Crown className="h-4 w-4 mr-2" />
                    Upgrade Now
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
