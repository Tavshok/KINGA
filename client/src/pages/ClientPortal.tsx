/**
 * Phase 9 — Unified Client Portal
 * Single experience for all client journeys:
 *   Dashboard | My Vehicles | Valuations | Insurance | Claims
 *
 * Accessible to ALL authenticated users regardless of primary role.
 * Personal vehicles are distinct from corporate fleet vehicles.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Car, Shield, FileText, Tag, CheckCircle2, Clock, ArrowRight,
  Plus, Loader2, User, Bell, LogOut, Pencil, Trash2, Star,
  LayoutDashboard, Gauge, AlertCircle, ChevronRight, X
} from "lucide-react";
import { Truck, Building2 } from "lucide-react";
import KingaLogo from "@/components/KingaLogo";
import InsuranceRequestWizard from "@/components/InsuranceRequestWizard";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";

type Tab = "dashboard" | "vehicles" | "valuations" | "insurance" | "claims";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard",   label: "Dashboard",   icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: "vehicles",    label: "My Vehicles",  icon: <Car className="h-4 w-4" /> },
  { id: "valuations",  label: "Valuations",   icon: <Gauge className="h-4 w-4" /> },
  { id: "insurance",   label: "Insurance",    icon: <Shield className="h-4 w-4" /> },
  { id: "claims",      label: "Claims",       icon: <FileText className="h-4 w-4" /> },
];

export default function ClientPortal() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── Data queries ────────────────────────────────────────────────────────────
  const { data: myVehicles, refetch: refetchVehicles } = trpc.personalVehicles.listMyVehicles.useQuery(
    undefined, { enabled: !!user }
  );
  const { data: requests, refetch: refetchRequests } = trpc.insuranceV2.getMyRequests.useQuery(
    undefined, { enabled: !!user }
  );
  const { data: myClaims } = trpc.claims.myClaims.useQuery(
    undefined, { enabled: !!user }
  );
  const { data: myDocuments } = trpc.insuranceV2.getMyDocuments.useQuery(
    undefined, { enabled: !!user }
  );
  const { data: myFleets } = trpc.fleet.getMyFleets.useQuery(undefined, { enabled: !!user });
  const { data: myFleetVehicles } = trpc.fleet.getMyVehicles.useQuery(undefined, { enabled: !!user });

  // ── Derived data ────────────────────────────────────────────────────────────
  const pendingQuotes   = (requests ?? []).filter((r: any) => r.status === "quoted");
  const activePolicies  = (requests ?? []).filter((r: any) => r.status === "accepted");
  const valuationHistory = (requests ?? []).filter((r: any) => r.status !== "quoted" && r.status !== "accepted");
  const openClaims      = (myClaims ?? []).filter((c: any) => !["closed","completed"].includes(c.status));

  // ── Mutations ───────────────────────────────────────────────────────────────
  const utils = trpc.useUtils();
  const addVehicleMutation = trpc.personalVehicles.addVehicle.useMutation({
    onSuccess: () => { toast.success("Vehicle added"); setAddVehicleOpen(false); resetVehicleForm(); refetchVehicles(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteVehicleMutation = trpc.personalVehicles.deleteVehicle.useMutation({
    onSuccess: () => { toast.success("Vehicle removed"); refetchVehicles(); },
    onError: (e) => toast.error(e.message),
  });
  const acceptQuoteMutation = trpc.insuranceV2.acceptQuote.useMutation({
    onSuccess: () => { toast.success("Quote accepted! Your agent will be in touch."); utils.insuranceV2.getMyRequests.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const disputeMutation = trpc.claims.initiateDispute?.useMutation?.({
    onSuccess: () => { toast.success("Dispute submitted"); utils.claims.myClaims.invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  // ── Insurance wizard state ──────────────────────────────────────────────────
  const [showInsuranceWizard, setShowInsuranceWizard] = useState(false);

  // ── Vehicle form state ───────────────────────────────────────────────────────
  const [addVehicleOpen, setAddVehicleOpen] = useState(false);
  const [vMake, setVMake] = useState("");
  const [vModel, setVModel] = useState("");
  const [vYear, setVYear] = useState(String(new Date().getFullYear()));
  const [vReg, setVReg] = useState("");
  const [vVin, setVVin] = useState("");
  const [vColour, setVColour] = useState("");
  const [vFuel, setVFuel] = useState<"petrol"|"diesel"|"electric"|"hybrid"|"other">("petrol");
  const [vNotes, setVNotes] = useState("");
  const resetVehicleForm = () => { setVMake(""); setVModel(""); setVYear(String(new Date().getFullYear())); setVReg(""); setVVin(""); setVColour(""); setVFuel("petrol"); setVNotes(""); };

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
        <KingaLogo size="md" />
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <User className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <h2 className="text-lg font-semibold mb-2">Sign In to Your KINGA Portal</h2>
            <p className="text-sm text-muted-foreground mb-4">Manage your vehicles, valuations, insurance, and claims — all in one place.</p>
            <Button className="w-full" onClick={() => window.location.href = getLoginUrl("/client")}>
              Sign In to KINGA
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Sidebar ─────────────────────────────────────────────────────────────────
  const Sidebar = () => (
    <aside className="flex flex-col h-full bg-white border-r w-64 shrink-0">
      <div className="p-4 border-b flex items-center gap-3">
        <KingaLogo size="sm" />
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate">{user.name}</p>
          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.id === "insurance" && pendingQuotes.length > 0 && (
              <Badge className="ml-auto h-5 min-w-5 text-xs bg-amber-500 text-white">{pendingQuotes.length}</Badge>
            )}
            {tab.id === "claims" && openClaims.length > 0 && (
              <Badge className="ml-auto h-5 min-w-5 text-xs">{openClaims.length}</Badge>
            )}
          </button>
        ))}
      </nav>
      <div className="p-3 border-t space-y-1">
        <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={() => setLocation("/notifications")}>
          <Bell className="h-4 w-4 mr-2" /> Notifications
        </Button>
        <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={() => logout()}>
          <LogOut className="h-4 w-4 mr-2" /> Sign Out
        </Button>
      </div>
    </aside>
  );

  // ── Tab: Dashboard ───────────────────────────────────────────────────────────
  const DashboardTab = () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Welcome back, {user.name.split(" ")[0]}</h1>
        <p className="text-muted-foreground text-sm">Your KINGA client portal — everything in one place.</p>
      </div>
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "My Vehicles", value: myVehicles?.length ?? 0, icon: <Car className="h-5 w-5 text-primary" />, tab: "vehicles" as Tab },
          { label: "Pending Quotes", value: pendingQuotes.length, icon: <Tag className="h-5 w-5 text-amber-500" />, tab: "insurance" as Tab },
          { label: "Active Policies", value: activePolicies.length, icon: <Shield className="h-5 w-5 text-emerald-500" />, tab: "insurance" as Tab },
          { label: "Open Claims", value: openClaims.length, icon: <FileText className="h-5 w-5 text-blue-500" />, tab: "claims" as Tab },
        ].map(kpi => (
          <Card key={kpi.label} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab(kpi.tab)}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between mb-2">
                {kpi.icon}
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold">{kpi.value}</p>
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      {/* Pending quotes alert */}
      {pendingQuotes.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <Tag className="h-5 w-5 text-amber-600 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-sm text-amber-800">You have {pendingQuotes.length} quote{pendingQuotes.length > 1 ? "s" : ""} awaiting your acceptance</p>
              <p className="text-xs text-amber-700">Review your insurance quotes and accept to proceed with policy issuance.</p>
            </div>
            <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white shrink-0" onClick={() => setActiveTab("insurance")}>
              Review
            </Button>
          </CardContent>
        </Card>
      )}
      {/* Quick actions */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Quick Actions</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Button variant="outline" className="justify-start h-auto py-3" onClick={() => setLocation("/get-a-quote")}>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><Gauge className="h-4 w-4 text-primary" /></div>
              <div className="text-left">
                <p className="font-medium text-sm">Request Valuation</p>
                <p className="text-xs text-muted-foreground">Get a KINGA vehicle report</p>
              </div>
            </div>
          </Button>
          <Button variant="outline" className="justify-start h-auto py-3" onClick={() => setLocation("/claimant/submit")}>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50"><Shield className="h-4 w-4 text-blue-600" /></div>
              <div className="text-left">
                <p className="font-medium text-sm">Submit a Claim</p>
                <p className="text-xs text-muted-foreground">Report an accident or loss</p>
              </div>
            </div>
          </Button>
          <Button variant="outline" className="justify-start h-auto py-3" onClick={() => { setActiveTab("vehicles"); setAddVehicleOpen(true); }}>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-50"><Plus className="h-4 w-4 text-emerald-600" /></div>
              <div className="text-left">
                <p className="font-medium text-sm">Add a Vehicle</p>
                <p className="text-xs text-muted-foreground">Register your personal vehicle</p>
              </div>
            </div>
          </Button>
        </CardContent>
      </Card>
      {/* Recent claims */}
      {(myClaims?.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Claims</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setActiveTab("claims")}>View all <ArrowRight className="h-3 w-3 ml-1" /></Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {(myClaims ?? []).slice(0, 3).map((c: any) => (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/30 cursor-pointer" onClick={() => setLocation(`/claimant/claims/${c.id}`)}>
                <div>
                  <p className="text-sm font-mono font-medium">{c.claimNumber ?? `#${c.id}`}</p>
                  <p className="text-xs text-muted-foreground capitalize">{(c.workflowState ?? "pending").replace(/_/g, " ")}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );

  // ── Tab: My Vehicles ─────────────────────────────────────────────────────────
  const VehiclesTab = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">My Vehicles</h2>
          <p className="text-sm text-muted-foreground">Your personal and company vehicles.</p>
        </div>
        <Button onClick={() => setAddVehicleOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Add Vehicle
        </Button>
      </div>
      {/* Company fleet section */}
      {(myFleets as any[] | undefined)?.length ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 pt-1">
            <Building2 className="h-4 w-4 text-purple-600" />
            <h3 className="font-semibold text-sm text-purple-700">Company Fleet</h3>
          </div>
          {(myFleets as any[]).map((fleet: any) => {
            const fv = (myFleetVehicles as any[] ?? []).filter((v: any) => v.fleetId === fleet.id);
            return (
              <Card key={fleet.id} className="border-purple-100 bg-purple-50/30">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Truck className="h-4 w-4 text-purple-600" />
                      <p className="font-semibold text-sm">{fleet.accountName ?? "Fleet"}</p>
                    </div>
                    <Badge variant="outline" className="text-xs border-purple-200 text-purple-700 capitalize">{fleet.status ?? "active"}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">{fv.length} vehicle{fv.length !== 1 ? "s" : ""} registered</p>
                  {fv.length > 0 && (
                    <div className="grid grid-cols-2 gap-1.5 mb-3">
                      {fv.slice(0, 4).map((v: any) => (
                        <div key={v.id} className="flex items-center gap-1.5 p-1.5 rounded border bg-white text-xs">
                          <Car className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="truncate">{v.year} {v.make} {v.model}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => setLocation("/fleet")}>
                    <Truck className="h-3.5 w-3.5 mr-1.5" /> Manage in Fleet Portal <ArrowRight className="h-3.5 w-3.5 ml-auto" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
          <Separator />
          <div className="flex items-center gap-2">
            <Car className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm text-muted-foreground">Personal Vehicles</h3>
          </div>
        </div>
      ) : null}
     {!myVehicles || myVehicles.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Car className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="font-medium mb-1">No vehicles registered yet</p>
            <p className="text-sm text-muted-foreground mb-4">Add your personal vehicles to link them to your valuations, insurance, and claims.</p>
            <Button onClick={() => setAddVehicleOpen(true)}><Plus className="h-4 w-4 mr-2" /> Add Your First Vehicle</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {myVehicles.map((v: any) => {
            // Find linked valuation by registration
            const linkedValuation = (requests ?? []).find((r: any) =>
              r.vehicleRegistration && v.registration &&
              r.vehicleRegistration.toUpperCase().replace(/\s/g,"") === v.registration.toUpperCase().replace(/\s/g,"")
            );
            const linkedClaim = (myClaims ?? []).find((c: any) =>
              c.vehicleRegistration && v.registration &&
              c.vehicleRegistration.toUpperCase().replace(/\s/g,"") === v.registration.toUpperCase().replace(/\s/g,"")
            );
            return (
              <Card key={v.id} className={v.isPrimary ? "border-primary/50 bg-primary/5" : ""}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold">{v.year} {v.make} {v.model}</p>
                        {v.isPrimary === 1 && <Badge variant="secondary" className="text-xs"><Star className="h-3 w-3 mr-1" />Primary</Badge>}
                      </div>
                      {v.registration && <p className="text-sm font-mono text-muted-foreground">{v.registration}</p>}
                      <p className="text-xs text-muted-foreground capitalize">{v.colour && `${v.colour} · `}{v.fuelType}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => deleteVehicleMutation.mutate({ id: v.id })} disabled={deleteVehicleMutation.isPending}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1.5 p-2 rounded bg-muted/50">
                      <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{linkedValuation ? `$${linkedValuation.vehicleValue?.toLocaleString() ?? "—"} value` : "No valuation"}</span>
                    </div>
                    <div className="flex items-center gap-1.5 p-2 rounded bg-muted/50">
                      <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{linkedClaim ? `Claim ${linkedClaim.claimNumber ?? `#${linkedClaim.id}`}` : "No open claim"}</span>
                    </div>
                  </div>
                  {v.vin && <p className="text-xs text-muted-foreground mt-2">VIN: <span className="font-mono">{v.vin}</span></p>}
                  {v.notes && <p className="text-xs text-muted-foreground mt-1 italic">{v.notes}</p>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );

  // ── Tab: Valuations ──────────────────────────────────────────────────────────
  const ValuationsTab = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Valuations</h2>
          <p className="text-sm text-muted-foreground">KINGA vehicle valuation reports and pending quotes.</p>
        </div>
        <Button onClick={() => setLocation("/get-a-quote")}>
          <Plus className="h-4 w-4 mr-2" /> New Valuation
        </Button>
      </div>
      {/* Pending quotes in valuations tab */}
      {pendingQuotes.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-sm text-amber-700 flex items-center gap-2"><Tag className="h-4 w-4" /> Quotes Awaiting Acceptance</h3>
          {pendingQuotes.map((req: any) => (
            <Card key={req.id} className="border-amber-200 bg-amber-50/30">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="font-semibold">{req.vehicleYear} {req.vehicleMake} {req.vehicleModel}</p>
                    <p className="text-xs text-muted-foreground capitalize">{req.insuranceType?.replace(/_/g," ")} · Monthly: <strong>${req.quotedPremium?.toLocaleString()}</strong> · Excess: ${req.quotedExcess?.toLocaleString() ?? 0}</p>
                    {req.quoteNotes && <p className="text-xs italic text-muted-foreground mt-1">{req.quoteNotes}</p>}
                    <p className="text-xs text-muted-foreground mt-1">Valid until {req.quoteValidUntil ? new Date(req.quoteValidUntil).toLocaleDateString() : "—"}</p>
                  </div>
                  <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white shrink-0" disabled={acceptQuoteMutation.isPending} onClick={() => acceptQuoteMutation.mutate({ quotationRequestId: req.id })}>
                    {acceptQuoteMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />} Accept
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {/* Valuation history */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm text-muted-foreground">Valuation History</h3>
        {valuationHistory.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center">
              <Gauge className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-40" />
              <p className="text-sm text-muted-foreground">No valuations yet. Request one to get a KINGA vehicle report.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setLocation("/get-a-quote")}>Request Valuation</Button>
            </CardContent>
          </Card>
        ) : (
          valuationHistory.map((req: any) => (
            <Card key={req.id}>
              <CardContent className="pt-4 pb-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10"><Car className="h-4 w-4 text-primary" /></div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{req.vehicleYear} {req.vehicleMake} {req.vehicleModel}</p>
                  <p className="text-xs text-muted-foreground">
                    {req.vehicleRegistration && <span className="font-mono mr-2">{req.vehicleRegistration}</span>}
                    {req.vehicleValue ? <span className="font-semibold text-primary">${req.vehicleValue.toLocaleString()}</span> : "Valuation pending"}
                    {" · "}{new Date(req.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <Badge variant={req.reportGatingStatus === "full" || req.reportGatingStatus === "paid" ? "default" : "outline"} className="shrink-0">
                  {req.reportGatingStatus === "full" || req.reportGatingStatus === "paid" ? "Full Report" : "Teaser"}
                </Badge>
                {req.submissionToken && (
                  <Button variant="ghost" size="sm" onClick={() => setLocation(`/quote/result/${req.submissionToken}`)}>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );

  // ── Tab: Insurance ───────────────────────────────────────────────────────────
  const InsuranceTab = () => (
    <div className="space-y-4">
      {showInsuranceWizard ? (
        <InsuranceRequestWizard
          onSuccess={() => { setShowInsuranceWizard(false); refetchRequests(); }}
          onCancel={() => setShowInsuranceWizard(false)}
        />
      ) : (<>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Insurance</h2>
          <p className="text-sm text-muted-foreground">Your quotes, policies, and documents.</p>
        </div>
        <Button onClick={() => setShowInsuranceWizard(true)}>
          <Plus className="h-4 w-4 mr-2" /> New Request
        </Button>
      </div>
      {/* Pending quotes */}
      {pendingQuotes.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-sm flex items-center gap-2 text-amber-700"><Tag className="h-4 w-4" /> Pending Quotes ({pendingQuotes.length})</h3>
          {pendingQuotes.map((req: any) => (
            <Card key={req.id} className="border-amber-200 bg-amber-50/30">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{req.vehicleYear} {req.vehicleMake} {req.vehicleModel}</p>
                    <p className="text-xs text-muted-foreground capitalize">{req.insuranceType?.replace(/_/g," ")} insurance</p>
                    <div className="flex gap-4 mt-2 text-sm">
                      <div><p className="text-xs text-muted-foreground">Monthly</p><p className="font-bold text-primary">${req.quotedPremium?.toLocaleString()}</p></div>
                      <div><p className="text-xs text-muted-foreground">Annual</p><p className="font-medium">${req.quotedAnnualPremium?.toLocaleString() ?? (req.quotedPremium * 12).toLocaleString()}</p></div>
                      <div><p className="text-xs text-muted-foreground">Excess</p><p className="font-medium">${req.quotedExcess?.toLocaleString() ?? 0}</p></div>
                    </div>
                    {req.quoteNotes && <p className="text-xs italic text-muted-foreground mt-2 border-l-2 border-amber-300 pl-2">{req.quoteNotes}</p>}
                    <p className="text-xs text-muted-foreground mt-2">Valid until {req.quoteValidUntil ? new Date(req.quoteValidUntil).toLocaleDateString() : "—"}</p>
                  </div>
                  <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white shrink-0" disabled={acceptQuoteMutation.isPending} onClick={() => acceptQuoteMutation.mutate({ quotationRequestId: req.id })}>
                    {acceptQuoteMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />} Accept Quote
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {/* Active policies */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm flex items-center gap-2 text-emerald-700"><Shield className="h-4 w-4" /> Active Policies ({activePolicies.length})</h3>
        {activePolicies.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center">
              <Shield className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-40" />
              <p className="text-sm text-muted-foreground">No active policies yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Accept a quote to activate your policy, or request a new valuation.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setLocation("/get-a-quote")}>Get a Quote</Button>
            </CardContent>
          </Card>
        ) : (
          activePolicies.map((req: any) => (
            <Card key={req.id} className="border-emerald-200 bg-emerald-50/20">
              <CardContent className="pt-4 pb-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-100"><Shield className="h-4 w-4 text-emerald-600" /></div>
                <div className="flex-1">
                  <p className="font-semibold text-sm">{req.vehicleYear} {req.vehicleMake} {req.vehicleModel}</p>
                  <p className="text-xs text-muted-foreground capitalize">{req.insuranceType?.replace(/_/g," ")} · ${req.quotedPremium?.toLocaleString()}/month</p>
                </div>
                <Badge className="bg-emerald-100 text-emerald-800 shrink-0">Active</Badge>
              </CardContent>
            </Card>
          ))
        )}
      </div>
      {/* Documents */}
      {(myDocuments?.length ?? 0) > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-sm flex items-center gap-2 text-slate-600"><FileText className="h-4 w-4" /> Documents from Your Agent ({myDocuments?.length})</h3>
          {(myDocuments ?? []).map((doc: any) => (
            <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg border bg-white hover:shadow-sm transition-shadow">
              <div className="p-2 rounded-lg bg-slate-100"><FileText className="h-4 w-4 text-slate-600" /></div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{doc.title}</p>
                <p className="text-xs text-muted-foreground capitalize">{doc.documentType?.replace(/_/g,' ')} · {new Date(doc.createdAt).toLocaleDateString()}</p>
                {doc.notes && <p className="text-xs text-muted-foreground italic">{doc.notes}</p>}
              </div>
              <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm">Download</Button>
              </a>
            </div>
          ))}
        </div>
      )}
      </>)}
    </div>
  );

  // ── Tab: Claims ──────────────────────────────────────────────────────────────
  const ClaimsTab = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Claims</h2>
          <p className="text-sm text-muted-foreground">Track your motor insurance claims.</p>
        </div>
        <Button onClick={() => setLocation("/claimant/submit")}>
          <Plus className="h-4 w-4 mr-2" /> New Claim
        </Button>
      </div>
      {!myClaims || myClaims.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="font-medium mb-1">No claims yet</p>
            <p className="text-sm text-muted-foreground mb-4">Submit a claim if you have been involved in an accident or suffered a loss.</p>
            <Button onClick={() => setLocation("/claimant/submit")}><Plus className="h-4 w-4 mr-2" /> Submit a Claim</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {myClaims.map((c: any) => {
            const isClosed = ["closed","completed"].includes(c.status);
            const stateLabel = (c.workflowState ?? c.status ?? "pending").replace(/_/g," ");
            return (
              <Card key={c.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-mono font-semibold text-sm">{c.claimNumber ?? `#${c.id}`}</p>
                        <Badge variant={isClosed ? "secondary" : "default"} className="text-xs capitalize">{stateLabel}</Badge>
                      </div>
                      {(c.vehicleMake || c.vehicleModel) && (
                        <p className="text-xs text-muted-foreground mt-0.5">{c.vehicleYear} {c.vehicleMake} {c.vehicleModel}</p>
                      )}
                      <p className="text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button variant="outline" size="sm" onClick={() => setLocation(`/claimant/claims/${c.id}`)}>
                        View <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );

  const CONTENT: Record<Tab, React.ReactNode> = {
    dashboard: <DashboardTab />,
    vehicles: <VehiclesTab />,
    valuations: <ValuationsTab />,
    insurance: <InsuranceTab />,
    claims: <ClaimsTab />,
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Mobile header */}
      <header className="lg:hidden bg-white border-b px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1 rounded">
          <LayoutDashboard className="h-5 w-5" />
        </button>
        <KingaLogo size="sm" />
        <Button variant="ghost" size="sm" onClick={() => setLocation("/notifications")}>
          <Bell className="h-4 w-4" />
        </Button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <div className="hidden lg:block">
          <Sidebar />
        </div>
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div className="lg:hidden fixed inset-0 z-30 flex">
            <div className="w-64 h-full shadow-xl"><Sidebar /></div>
            <div className="flex-1 bg-black/40" onClick={() => setSidebarOpen(false)} />
          </div>
        )}
        {/* Main content */}
        <main className="flex-1 overflow-auto p-6">
          <div className="max-w-4xl mx-auto">
            {CONTENT[activeTab]}
          </div>
        </main>
      </div>

      {/* Add Vehicle Dialog */}
      <Dialog open={addVehicleOpen} onOpenChange={setAddVehicleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add a Personal Vehicle</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Make *</Label>
                <Input placeholder="Toyota" value={vMake} onChange={e => setVMake(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Model *</Label>
                <Input placeholder="Corolla" value={vModel} onChange={e => setVModel(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Year *</Label>
                <Input type="number" min="1970" max={new Date().getFullYear()+1} value={vYear} onChange={e => setVYear(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Registration</Label>
                <Input placeholder="ABC 1234" value={vReg} onChange={e => setVReg(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Colour</Label>
                <Input placeholder="Silver" value={vColour} onChange={e => setVColour(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Fuel Type</Label>
                <Select value={vFuel} onValueChange={(v: any) => setVFuel(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["petrol","diesel","electric","hybrid","other"].map(f => (
                      <SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>VIN (optional)</Label>
              <Input placeholder="17-character VIN" value={vVin} onChange={e => setVVin(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Notes (optional)</Label>
              <Input placeholder="Any notes about this vehicle..." value={vNotes} onChange={e => setVNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddVehicleOpen(false); resetVehicleForm(); }}>Cancel</Button>
            <Button
              disabled={!vMake || !vModel || !vYear || addVehicleMutation.isPending}
              onClick={() => addVehicleMutation.mutate({
                make: vMake, model: vModel, year: Number(vYear),
                registration: vReg || undefined, vin: vVin || undefined,
                colour: vColour || undefined, fuelType: vFuel,
                notes: vNotes || undefined,
              })}
            >
              {addVehicleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              Add Vehicle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
