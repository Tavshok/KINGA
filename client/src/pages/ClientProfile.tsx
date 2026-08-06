import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Car, FileText, Shield, Lock, CheckCircle2, Clock, ArrowRight,
  Download, LogOut, Loader2, User, Bell
} from "lucide-react";
import KingaLogo from "@/components/KingaLogo";
import { getLoginUrl } from "@/const";

export default function ClientProfile() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();

  const { data: requests, isLoading } = trpc.insuranceV2.getMyRequests.useQuery(
    undefined,
    { enabled: !!user }
  );

  const { data: myClaims } = trpc.claims.myClaims.useQuery(
    undefined,
    { enabled: !!user }
  );

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
        <KingaLogo size="md" />
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <User className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <h2 className="text-lg font-semibold mb-2">Sign In to View Your Profile</h2>
            <p className="text-sm text-muted-foreground mb-4">Your KINGA profile contains your valuation reports, policy documents, and claim history.</p>
            <Button className="w-full" onClick={() => window.location.href = getLoginUrl("/my-profile")}>
              Sign In to KINGA
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const unlockedReports = (requests ?? []).filter((r: any) => r.reportGatingStatus === "full" || r.reportGatingStatus === "paid");
  const pendingReports = (requests ?? []).filter((r: any) => r.reportGatingStatus === "teaser");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-primary/5">
      {/* Header */}
      <header className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setLocation("/")}>
            <KingaLogo size="sm" />
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/notifications")}>
              <Bell className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => logout()}>
              <LogOut className="h-4 w-4 mr-1" /> Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Profile Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{user.name}</h1>
            <p className="text-muted-foreground">{user.email}</p>
            <Badge variant="outline" className="mt-1">KINGA Member</Badge>
          </div>
          <Button variant="outline" className="ml-auto" onClick={() => setLocation("/get-a-quote")}>
            <Car className="h-4 w-4 mr-1" /> New Valuation
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left — Reports */}
          <div className="lg:col-span-2 space-y-6">

            {/* Unlocked Reports */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  KINGA Vehicle Reports
                  {unlockedReports.length > 0 && (
                    <Badge className="ml-auto bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">{unlockedReports.length} available</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
                ) : unlockedReports.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No reports available yet.</p>
                    <p className="text-xs mt-1">Reports are unlocked when your policy is issued, or when you purchase a standalone valuation.</p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => setLocation("/get-a-quote")}>
                      Request a Valuation
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {unlockedReports.map((req: any) => (
                      <div key={req.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors">
                        <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                          <Car className="h-4 w-4 text-emerald-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{req.vehicleYear} {req.vehicleMake} {req.vehicleModel}</p>
                          <p className="text-xs text-muted-foreground">
                            {req.vehicleRegistration && <span className="font-mono mr-2">{req.vehicleRegistration}</span>}
                            {req.reportUnlockedAt && `Unlocked ${new Date(req.reportUnlockedAt).toLocaleDateString()}`}
                          </p>
                        </div>
                        {req.vehicleValue && (
                          <div className="text-right">
                            <p className="text-sm font-semibold">${req.vehicleValue.toLocaleString()}</p>
                            <p className="text-xs text-muted-foreground">Market value</p>
                          </div>
                        )}
                        <Button variant="ghost" size="sm">
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Pending Reports */}
            {pendingReports.length > 0 && (
              <Card className="border-dashed">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base text-muted-foreground">
                    <Lock className="h-4 w-4" />
                    Pending Reports
                    <Badge variant="outline" className="ml-auto">{pendingReports.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {pendingReports.map((req: any) => (
                    <div key={req.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                      <Lock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{req.vehicleYear} {req.vehicleMake} {req.vehicleModel}</p>
                        <p className="text-xs text-muted-foreground">Submitted {new Date(req.createdAt).toLocaleDateString()} · Awaiting policy issuance</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setLocation(`/quote/result/${req.submissionToken}`)}>
                        View <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Claims */}
            {(myClaims?.length ?? 0) > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Shield className="h-4 w-4 text-blue-600" />
                    My Claims
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(myClaims ?? []).slice(0, 5).map((claim: any) => (
                    <div key={claim.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/30 transition-colors cursor-pointer" onClick={() => setLocation(`/claimant/claims/${claim.id}`)}>
                      <div>
                        <p className="text-sm font-medium font-mono">{claim.claimNumber ?? `#${claim.id}`}</p>
                        <p className="text-xs text-muted-foreground capitalize">{(claim.workflowState ?? "pending").replace(/_/g, " ")}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  ))}
                  <Button variant="outline" className="w-full mt-1" onClick={() => setLocation("/claimant/claims")}>
                    View All Claims
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right — Quick Actions */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button className="w-full justify-start" variant="outline" onClick={() => setLocation("/get-a-quote")}>
                  <Car className="h-4 w-4 mr-2 text-primary" /> New Valuation
                </Button>
                <Button className="w-full justify-start" variant="outline" onClick={() => setLocation("/claimant/submit")}>
                  <Shield className="h-4 w-4 mr-2 text-blue-500" /> Submit a Claim
                </Button>
                <Button className="w-full justify-start" variant="outline" onClick={() => setLocation("/claimant/claims")}>
                  <FileText className="h-4 w-4 mr-2 text-muted-foreground" /> My Claims
                </Button>
                <Button className="w-full justify-start" variant="outline" onClick={() => setLocation("/notifications")}>
                  <Bell className="h-4 w-4 mr-2 text-amber-500" /> Notifications
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Account</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Name</span>
                  <span className="font-medium">{user.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email</span>
                  <span className="text-xs">{user.email}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reports</span>
                  <span className="font-medium">{unlockedReports.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Claims</span>
                  <span className="font-medium">{myClaims?.length ?? 0}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
