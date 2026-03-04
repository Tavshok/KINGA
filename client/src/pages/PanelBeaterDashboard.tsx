import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, DollarSign, Clock, FileEdit } from "lucide-react";
import KingaLogo from "@/components/KingaLogo";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { NotificationBell } from "@/components/NotificationBell";
import RoleSwitcher from "@/components/RoleSwitcher";

export default function PanelBeaterDashboard() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();

  // Get panel beater ID from user (in a real system, this would be a separate table)
  // For now, we'll use the user ID as panel beater ID
  const panelBeaterId = user?.id || 0;

  // Get claims where this panel beater was selected
  const { data: quoteRequests = [] } = trpc.claims.byStatus.useQuery(
    { status: "submitted" },
    { enabled: !!user?.id }
  );

  // Filter claims where this panel beater was selected
  const myQuoteRequests = quoteRequests.filter(claim => {
    try {
      const selectedIds = JSON.parse(claim.selectedPanelBeaterIds || "[]");
      return selectedIds.includes(panelBeaterId);
    } catch {
      return false;
    }
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-accent/5">
      {/* Header */}
      <header className="bg-white border-b shadow-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <KingaLogo />
            <div>
              <p className="text-sm text-muted-foreground">Panel Beater Portal - Quote Submission & Repair Coordination</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <RoleSwitcher />
            <NotificationBell />
            <div className="text-right">
              <p className="text-sm font-medium">{user?.name}</p>
              <p className="text-xs text-muted-foreground capitalize">{user?.role?.replace('_', ' ')}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => logout()}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card className="bg-gradient-to-br from-teal-500 to-teal-700 text-white border-0">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-white/90">Quote Requests</CardTitle>
              <FileText className="h-4 w-4 text-white/70" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0</div>
              <p className="text-xs text-white/70">Awaiting quotes</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-400 to-orange-600 text-white border-0">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-white/90">Pending Approval</CardTitle>
              <Clock className="h-4 w-4 text-white/70" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0</div>
              <p className="text-xs text-white/70">Quotes submitted</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-emerald-500 to-emerald-700 text-white border-0">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-white/90">Active Repairs</CardTitle>
              <FileEdit className="h-4 w-4 text-white/70" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0</div>
              <p className="text-xs text-white/70">In progress</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500 to-purple-700 text-white border-0">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-white/90">Revenue This Month</CardTitle>
              <DollarSign className="h-4 w-4 text-white/70" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">$0</div>
              <p className="text-xs text-white/70">From completed repairs</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Quote Requests</CardTitle>
            <CardDescription>
              Submit quotes for claims where you were selected by claimants
            </CardDescription>
          </CardHeader>
          <CardContent>
            {myQuoteRequests.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No quote requests</p>
                <p className="text-sm mt-2">Claims where you were selected will appear here</p>
              </div>
            ) : (
              <div className="space-y-3">
                {myQuoteRequests.map((claim: any) => (
                  <div
                    key={claim.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="space-y-1">
                      <p className="font-medium font-mono text-sm">{claim.claimNumber}</p>
                      <p className="text-sm text-muted-foreground">
                        {claim.vehicleMake} {claim.vehicleModel} ({claim.vehicleYear})
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {claim.incidentLocation}
                      </p>
                      <div className="flex gap-2 mt-2">
                        <Badge variant="outline">{claim.status?.replace(/_/g, " ") || "unknown"}</Badge>
                        {claim.policyVerified && (
                          <Badge variant="default" className="bg-green-600">Verified</Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => setLocation(`/panel-beater/claims/${claim.id}/quote`)}
                    >
                      <FileEdit className="mr-2 h-4 w-4" />
                      Submit Quote
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
