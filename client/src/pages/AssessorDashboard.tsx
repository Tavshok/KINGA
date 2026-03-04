import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, FileText, Clock, Eye, ClipboardCheck, Award } from "lucide-react";
import KingaLogo from "@/components/KingaLogo";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { NotificationBell } from "@/components/NotificationBell";
import RoleSwitcher from "@/components/RoleSwitcher";
import { getLoginUrl } from "@/const";
import { AssessorSubscriptionBanner } from "@/components/AssessorSubscriptionBanner";

export default function AssessorDashboard() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();

  // Get assigned claims
  const { data: claims = [] } = trpc.claims.byAssessor.useQuery(
    { assessorId: user?.id || 0 },
    { enabled: !!user?.id }
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-accent/5">
      {/* Header */}
      <header className="bg-gradient-to-r from-teal-600 via-teal-700 to-teal-800 text-white shadow-lg">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <KingaLogo />
            <div>
              <p className="text-sm text-teal-100">Assessor Portal - Claim Assessment & Inspections</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setLocation("/assessor/performance")}
            >
              <Award className="mr-2 h-4 w-4" />
              Performance
            </Button>
            <RoleSwitcher />
            <NotificationBell />
            <div className="text-right">
              <p className="text-sm font-medium">{user?.name}</p>
              <p className="text-xs text-teal-100 capitalize">{user?.role}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => logout()}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Subscription tier banner — shows free/pro status and upgrade CTA */}
        <AssessorSubscriptionBanner />

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card className="bg-gradient-to-br from-primary to-secondary text-white shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-white">Assigned Claims</CardTitle>
              <FileText className="h-6 w-6 text-white" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{claims.length}</div>
              <p className="text-xs text-primary-foreground/80">Active assignments</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-white">Pending Assessments</CardTitle>
              <Clock className="h-6 w-6 text-white" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{claims.filter(c => c.workflowState === 'assigned' || c.workflowState === 'under_assessment').length}</div>
              <p className="text-xs text-orange-100">Awaiting evaluation</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-white">Upcoming Appointments</CardTitle>
              <Calendar className="h-6 w-6 text-white" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">0</div>
              <p className="text-xs text-purple-100">Next 7 days</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-500 to-emerald-600 text-white shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-white">Completed This Month</CardTitle>
              <ClipboardCheck className="h-6 w-6 text-white" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{claims.filter(c => c.workflowState === 'completed').length}</div>
              <p className="text-xs text-green-100">Assessments completed</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>My Assigned Claims</CardTitle>
            <CardDescription>
              Review and assess claims assigned to you
            </CardDescription>
          </CardHeader>
          <CardContent>
            {claims.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No assigned claims</p>
                <p className="text-sm mt-2">Claims assigned by insurers will appear here</p>
              </div>
            ) : (
              <div className="space-y-3">
                {claims.map((claim) => (
                  <div
                    key={claim.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="space-y-1">
                      <p className="font-medium font-mono text-sm">{claim.claimNumber}</p>
                      <p className="text-sm text-muted-foreground">
                        {claim.vehicleMake} {claim.vehicleModel} ({claim.vehicleYear})
                      </p>
                      <div className="flex gap-2 mt-2">
                        <Badge variant="outline">{claim.workflowState?.replace(/_/g, " ") || "unknown"}</Badge>
                        {claim.policyVerified && (
                          <Badge variant="default" className="bg-green-600">Verified</Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => setLocation(`/assessor/claims/${claim.id}`)}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      View & Assess
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
