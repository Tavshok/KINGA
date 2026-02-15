import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trophy, Medal, Award, TrendingUp, Target, Zap, Crown } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function AssessorLeaderboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  // Fetch all assessors with performance data
  const { data: leaderboard, isLoading } = trpc.assessors.getLeaderboard.useQuery();

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="h-5 w-5 text-yellow-500" />;
    if (rank === 2) return <Medal className="h-5 w-5 text-gray-400" />;
    if (rank === 3) return <Award className="h-5 w-5 text-orange-600" />;
    return <span className="text-muted-foreground font-semibold">#{rank}</span>;
  };

  const getTierBadge = (tier: string) => {
    if (tier === "enterprise") return <Badge className="bg-purple-600">Enterprise</Badge>;
    if (tier === "premium") return <Badge className="bg-primary">Premium</Badge>;
    return <Badge variant="outline">Free</Badge>;
  };

  const getPerformanceBadge = (score: number) => {
    if (score >= 90) return <Badge className="bg-green-600">Excellent</Badge>;
    if (score >= 75) return <Badge className="bg-primary">Good</Badge>;
    if (score >= 60) return <Badge className="bg-yellow-600">Average</Badge>;
    return <Badge className="bg-red-600">Needs Improvement</Badge>;
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Trophy className="h-8 w-8 text-yellow-500" />
            Assessor Leaderboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Top-performing assessors ranked by accuracy, speed, and quality
          </p>
        </div>
        {user?.role === "assessor" && (
          <Button onClick={() => setLocation("/assessor/performance")}>
            View My Performance
          </Button>
        )}
      </div>

      {/* Top 3 Podium */}
      {leaderboard && leaderboard.length >= 3 && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          {/* 2nd Place */}
          <Card className="border-gray-300">
            <CardHeader className="text-center pb-3">
              <div className="flex justify-center mb-2">
                <Medal className="h-12 w-12 text-gray-400" />
              </div>
              <CardTitle className="text-lg">{leaderboard[1].name || "Assessor"}</CardTitle>
              <CardDescription>{getTierBadge(leaderboard[1].tier || "free")}</CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <div className="text-3xl font-bold text-gray-600 mb-2">
                {(leaderboard[1].performanceScore || 0).toFixed(1)}
              </div>
              <p className="text-xs text-muted-foreground">
                {leaderboard[1].totalAssessments} assessments
              </p>
            </CardContent>
          </Card>

          {/* 1st Place */}
          <Card className="border-yellow-500 border-2 relative -mt-4">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-yellow-500 rounded-full p-2">
              <Crown className="h-6 w-6 text-white" />
            </div>
            <CardHeader className="text-center pb-3 pt-8">
              <CardTitle className="text-xl">{leaderboard[0].name || "Assessor"}</CardTitle>
              <CardDescription>{getTierBadge(leaderboard[0].tier || "free")}</CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <div className="text-4xl font-bold text-yellow-600 mb-2">
                {(leaderboard[0].performanceScore || 0).toFixed(1)}
              </div>
              <p className="text-xs text-muted-foreground">
                {leaderboard[0].totalAssessments} assessments
              </p>
            </CardContent>
          </Card>

          {/* 3rd Place */}
          <Card className="border-orange-300">
            <CardHeader className="text-center pb-3">
              <div className="flex justify-center mb-2">
                <Award className="h-12 w-12 text-orange-600" />
              </div>
              <CardTitle className="text-lg">{leaderboard[2].name || "Assessor"}</CardTitle>
              <CardDescription>{getTierBadge(leaderboard[2].tier || "free")}</CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <div className="text-3xl font-bold text-orange-600 mb-2">
                {(leaderboard[2].performanceScore || 0).toFixed(1)}
              </div>
              <p className="text-xs text-muted-foreground">
                {leaderboard[2].totalAssessments} assessments
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Full Leaderboard Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Assessors</CardTitle>
          <CardDescription>
            Complete rankings with detailed performance metrics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Rank</TableHead>
                <TableHead>Assessor</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead className="text-right">Performance Score</TableHead>
                <TableHead className="text-right">Accuracy</TableHead>
                <TableHead className="text-right">Avg. Completion</TableHead>
                <TableHead className="text-right">Total Assessments</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaderboard?.map((assessor: any, index: number) => {
                const rank = index + 1;
                const isCurrentUser = user?.id === assessor.id;

                return (
                  <TableRow
                    key={assessor.id}
                    className={`${
                      isCurrentUser ? "bg-primary/5 border-primary/20" : ""
                    } ${rank <= 3 ? "font-semibold" : ""}`}
                  >
                    <TableCell>
                      <div className="flex items-center justify-center">
                        {getRankIcon(rank)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {assessor.name || "Assessor"}
                        {isCurrentUser && (
                          <Badge variant="outline" className="text-xs">
                            You
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{getTierBadge(assessor.tier || "free")}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-lg font-bold">
                          {(assessor.performanceScore || 0).toFixed(1)}
                        </span>
                        {getPerformanceBadge(assessor.performanceScore)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {(Number(assessor.accuracyScore) || 0).toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right">
                      {(Number(assessor.avgCompletionTime) || 0).toFixed(1)}h
                    </TableCell>
                    <TableCell className="text-right">
                      {assessor.totalAssessments}
                    </TableCell>
                    <TableCell>
                      {assessor.tier === "free" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toast.info("Premium subscriptions coming soon! We're still determining pricing for your market.")}
                        >
                          <Zap className="h-3 w-3 mr-1" />
                          Upgrade
                        </Button>
                      ) : (
                        <Badge className="bg-green-600">
                          <TrendingUp className="h-3 w-3 mr-1" />
                          Active
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Upgrade CTA for Free Tier Users */}
      {user?.role === "assessor" && user?.assessorTier === "free" && (
        <Card className="border-primary/80 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Climb the Leaderboard with Premium
            </CardTitle>
            <CardDescription>
              Premium assessors get priority assignments, detailed feedback, and advanced tools to improve their rankings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              onClick={() => toast.info("Premium subscriptions coming soon! We're still determining pricing for your market.")}
            >
              <Zap className="h-4 w-4 mr-2" />
              Upgrade to Premium - $50/month
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
