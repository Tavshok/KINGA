import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Car, AlertTriangle, Wrench, FileText, Bell, LogOut, Loader2, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import KingaLogo from "@/components/KingaLogo";

export default function FleetDriverDashboard() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();

  // Get fleet account for this driver's company
  const { data: accounts, isLoading: accountsLoading } = trpc.fleetAccounts.listMyAccounts.useQuery();
  const account = accounts?.[0];

  // Get claims for this fleet account
  const { data: claimsData, isLoading: claimsLoading } = trpc.fleetAccounts.getClaimsForAccount.useQuery(
    { fleetAccountId: account?.id ?? 0 },
    { enabled: !!account?.id }
  );

  // Get maintenance alerts
  const { data: maintenanceAlerts, isLoading: alertsLoading } = trpc.fleetAccounts.getMaintenanceAlerts.useQuery(
    undefined,
    { enabled: !!account?.id }
  );

  // Get expiring licenses
  const { data: expiringLicenses } = trpc.fleetAccounts.getExpiringLicenses.useQuery(
    undefined,
    { enabled: !!account?.id }
  );

  const isLoading = accountsLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const recentClaims = (claimsData?.claims ?? []).slice(0, 5);
  const overdueAlerts = (maintenanceAlerts ?? []).filter((a: any) => a.status === "overdue");
  const upcomingAlerts = (maintenanceAlerts ?? []).filter((a: any) => a.status === "upcoming");
  const expiringDocs = (expiringLicenses ?? []).slice(0, 3);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <header className="bg-white dark:bg-card border-b shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <KingaLogo size="sm" />
              <div>
                <h1 className="text-xl font-bold">Driver Workspace</h1>
                <p className="text-xs text-muted-foreground">Fleet Driver Portal</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-medium">{user?.name}</p>
                <Badge variant="outline" className="text-xs">Fleet Driver</Badge>
              </div>
              <Button variant="outline" size="sm" onClick={() => logout()}>
                <LogOut className="h-4 w-4 mr-1" /> Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Welcome Banner */}
        <div className="mb-6 p-4 rounded-xl bg-primary/5 border border-primary/20">
          <h2 className="text-lg font-semibold">Welcome back, {user?.name?.split(" ")[0]}</h2>
          {account ? (
            <p className="text-sm text-muted-foreground mt-1">
              Fleet: <span className="font-medium">{account.companyName}</span>
              {account.registrationNumber && <> · Reg: <span className="font-mono">{account.registrationNumber}</span></>}
            </p>
          ) : (
            <p className="text-sm text-amber-600 mt-1">No fleet account linked. Contact your fleet manager.</p>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">

            {/* Maintenance Alerts */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wrench className="h-4 w-4 text-amber-500" />
                  Maintenance Alerts
                  {overdueAlerts.length > 0 && (
                    <Badge variant="destructive" className="ml-auto">{overdueAlerts.length} Overdue</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {alertsLoading ? (
                  <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
                ) : (overdueAlerts.length + upcomingAlerts.length) === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-emerald-600 py-2">
                    <CheckCircle2 className="h-4 w-4" />
                    No maintenance alerts. All vehicles up to date.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {[...overdueAlerts, ...upcomingAlerts].slice(0, 5).map((alert: any, i: number) => (
                      <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${alert.status === "overdue" ? "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800" : "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800"}`}>
                        <AlertTriangle className={`h-4 w-4 mt-0.5 flex-shrink-0 ${alert.status === "overdue" ? "text-red-500" : "text-amber-500"}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{alert.maintenanceType ?? "Maintenance required"}</p>
                          <p className="text-xs text-muted-foreground">
                            {alert.status === "overdue" ? "Overdue" : "Due soon"}
                            {alert.dueDate && ` · ${new Date(alert.dueDate).toLocaleDateString()}`}
                          </p>
                        </div>
                        <Badge variant={alert.status === "overdue" ? "destructive" : "secondary"} className="text-xs flex-shrink-0">
                          {alert.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Claims */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4 text-blue-500" />
                  Recent Claims
                </CardTitle>
              </CardHeader>
              <CardContent>
                {claimsLoading ? (
                  <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
                ) : recentClaims.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">No claims on record for your fleet.</p>
                ) : (
                  <div className="space-y-2">
                    {recentClaims.map((claim: any) => (
                      <div key={claim.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors">
                        <div>
                          <p className="text-sm font-medium font-mono">{claim.claimNumber ?? `#${claim.id}`}</p>
                          <p className="text-xs text-muted-foreground">
                            {claim.vehicleMake} {claim.vehicleModel}
                            {claim.incidentDate && ` · ${new Date(claim.incidentDate).toLocaleDateString()}`}
                          </p>
                        </div>
                        <Badge variant={
                          claim.workflowState === "closed" ? "secondary" :
                          claim.workflowState === "ai_assessment_completed" ? "default" :
                          "outline"
                        } className="text-xs capitalize">
                          {(claim.workflowState ?? "pending").replace(/_/g, " ")}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column */}
          <div className="space-y-6">

            {/* Quick Actions */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  onClick={() => setLocation("/claimant/submit")}
                >
                  <Car className="h-4 w-4 mr-2 text-primary" />
                  Report an Incident
                </Button>
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  onClick={() => setLocation("/claimant/claims")}
                >
                  <FileText className="h-4 w-4 mr-2 text-blue-500" />
                  View My Claims
                </Button>
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  onClick={() => setLocation("/notifications")}
                >
                  <Bell className="h-4 w-4 mr-2 text-amber-500" />
                  Notifications
                </Button>
              </CardContent>
            </Card>

            {/* Document Expiry Alerts */}
            {expiringDocs.length > 0 && (
              <Card className="border-amber-200 dark:border-amber-800">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base text-amber-700 dark:text-amber-400">
                    <Clock className="h-4 w-4" />
                    Documents Expiring Soon
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {expiringDocs.map((doc: any, i: number) => (
                    <div key={i} className="text-sm">
                      <p className="font-medium">{doc.licenseType ?? "Document"}</p>
                      <p className="text-xs text-muted-foreground">
                        Expires: {doc.expiryDate ? new Date(doc.expiryDate).toLocaleDateString() : "Unknown"}
                      </p>
                      <Separator className="mt-2" />
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Fleet Info */}
            {account && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Fleet Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Company</span>
                    <span className="font-medium">{account.companyName}</span>
                  </div>
                  {account.registrationNumber && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Reg Number</span>
                      <span className="font-mono text-xs">{account.registrationNumber}</span>
                    </div>
                  )}
                  {account.contactEmail && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Contact</span>
                      <span className="text-xs">{account.contactEmail}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
