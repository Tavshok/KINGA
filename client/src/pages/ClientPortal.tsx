/**
 * My Portal — KINGA Client Experience
 *
 * A premium, client-first portal. Every word, every colour, every interaction
 * is designed to make the client feel guided, valued, and in control.
 *
 * Design principles:
 *  - Warm and personal: use the client's first name everywhere
 *  - Journey-oriented: show "what to do next", not raw data
 *  - Zero technical jargon: plain English status labels
 *  - Visual hierarchy: important actions are prominent, secondary info is quiet
 *  - Feels like a premium financial services app
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
import {
  Car, Shield, FileText, Tag, CheckCircle2, Clock, ArrowRight,
  Plus, Loader2, User, Bell, LogOut, Trash2,
  LayoutDashboard, Gauge, AlertCircle, ChevronRight, X,
  Sparkles, Download, Phone, HelpCircle, Home, Menu,
  TrendingUp, Calendar, MapPin, Wrench
} from "lucide-react";
import KingaLogo from "@/components/KingaLogo";
import InsuranceRequestWizard from "@/components/InsuranceRequestWizard";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";

type Tab = "home" | "vehicles" | "valuations" | "insurance" | "claims";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "home",       label: "Home",         icon: <Home className="h-4 w-4" /> },
  { id: "vehicles",   label: "My Vehicles",  icon: <Car className="h-4 w-4" /> },
  { id: "valuations", label: "Valuations",   icon: <Gauge className="h-4 w-4" /> },
  { id: "insurance",  label: "Insurance",    icon: <Shield className="h-4 w-4" /> },
  { id: "claims",     label: "My Claims",    icon: <FileText className="h-4 w-4" /> },
];

// Human-readable claim status labels — no internal codes exposed to client
const CLAIM_STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  submitted:              { label: "Received",              color: "#1D4ED8", bg: "#EFF6FF" },
  intake_pending:         { label: "Being Processed",       color: "#1D4ED8", bg: "#EFF6FF" },
  triage:                 { label: "Under Review",          color: "#92400E", bg: "#FFFBEB" },
  assessment_pending:     { label: "Awaiting Assessment",   color: "#92400E", bg: "#FFFBEB" },
  assessment_in_progress: { label: "Being Assessed",        color: "#6D28D9", bg: "#F5F3FF" },
  assessment_complete:    { label: "Assessment Complete",   color: "#065F46", bg: "#ECFDF5" },
  quotes_pending:         { label: "Getting Repair Quotes", color: "#92400E", bg: "#FFFBEB" },
  comparison:             { label: "Reviewing Quotes",      color: "#92400E", bg: "#FFFBEB" },
  repair_assigned:        { label: "Repair Authorised",     color: "#065F46", bg: "#ECFDF5" },
  repair_in_progress:     { label: "Repair In Progress",    color: "#065F46", bg: "#ECFDF5" },
  financial_decision:     { label: "Financial Settlement",  color: "#92400E", bg: "#FFFBEB" },
  completed:              { label: "Resolved",              color: "#065F46", bg: "#ECFDF5" },
  closed:                 { label: "Closed",                color: "#374151", bg: "#F9FAFB" },
  rejected:               { label: "Not Approved",          color: "#991B1B", bg: "#FEF2F2" },
};

// Human-readable insurance request status
const INSURANCE_STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  pending:   { label: "Request Received",    color: "#1D4ED8", bg: "#EFF6FF" },
  reviewing: { label: "Being Reviewed",      color: "#92400E", bg: "#FFFBEB" },
  quoted:    { label: "Quote Ready",         color: "#92400E", bg: "#FFFBEB" },
  accepted:  { label: "Policy Active",       color: "#065F46", bg: "#ECFDF5" },
  declined:  { label: "Not Available",       color: "#991B1B", bg: "#FEF2F2" },
};

export default function ClientPortal() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── Data queries ─────────────────────────────────────────────────────────────
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

  // ── Derived data ─────────────────────────────────────────────────────────────
  const pendingQuotes   = (requests ?? []).filter((r: any) => r.status === "quoted");
  const activePolicies  = (requests ?? []).filter((r: any) => r.status === "accepted");
  const allRequests     = (requests ?? []).filter((r: any) => r.status !== "accepted");
  const openClaims      = (myClaims ?? []).filter((c: any) => !["closed","completed"].includes(c.status));
  const firstName       = user?.name?.split(" ")[0] ?? "there";

  // ── Mutations ────────────────────────────────────────────────────────────────
  const utils = trpc.useUtils();
  const addVehicleMutation = trpc.personalVehicles.addVehicle.useMutation({
    onSuccess: () => { toast.success("Vehicle added to your profile"); setAddVehicleOpen(false); resetVehicleForm(); refetchVehicles(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteVehicleMutation = trpc.personalVehicles.deleteVehicle.useMutation({
    onSuccess: () => { toast.success("Vehicle removed"); refetchVehicles(); },
    onError: (e) => toast.error(e.message),
  });
  const acceptQuoteMutation = trpc.insuranceV2.acceptQuote.useMutation({
    onSuccess: () => { toast.success("Quote accepted! Your agent will be in touch shortly."); utils.insuranceV2.getMyRequests.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  // ── Insurance wizard state ────────────────────────────────────────────────────
  const [showInsuranceWizard, setShowInsuranceWizard] = useState(false);

  // ── Vehicle form state ────────────────────────────────────────────────────────
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-slate-100">
        <div className="text-center max-w-sm mx-auto px-6">
          <KingaLogo size="lg" className="mx-auto mb-6" />
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Welcome to KINGA</h1>
          <p className="text-slate-500 mb-6">Sign in to access your personal portal — your vehicles, insurance, and claims all in one place.</p>
          <Button className="w-full" onClick={() => setLocation(getLoginUrl())}>Sign In to My Portal</Button>
        </div>
      </div>
    );
  }

  // ── Sidebar ───────────────────────────────────────────────────────────────────
  const Sidebar = () => (
    <aside className="w-64 h-full bg-white border-r flex flex-col" style={{ minHeight: "100vh" }}>
      {/* Brand */}
      <div className="px-5 py-5 border-b">
        <KingaLogo size="sm" />
        <p className="text-xs text-muted-foreground mt-1">My Portal</p>
      </div>
      {/* User identity */}
      <div className="px-4 py-4 border-b bg-gradient-to-r from-teal-50 to-slate-50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <User className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{user.name}</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
        </div>
      </div>
      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-primary text-primary-foreground"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.id === "insurance" && pendingQuotes.length > 0 && (
              <span className="ml-auto bg-amber-500 text-white text-xs rounded-full h-5 min-w-5 flex items-center justify-center px-1">{pendingQuotes.length}</span>
            )}
            {tab.id === "claims" && openClaims.length > 0 && (
              <span className="ml-auto bg-blue-500 text-white text-xs rounded-full h-5 min-w-5 flex items-center justify-center px-1">{openClaims.length}</span>
            )}
          </button>
        ))}
      </nav>
      {/* Footer actions */}
      <div className="px-3 py-4 border-t space-y-1">
        <button
          onClick={() => setLocation("/notifications")}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
        >
          <Bell className="h-4 w-4" /> Notifications
        </button>
        <button
          onClick={() => setLocation("/portal-hub")}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
        >
          <LayoutDashboard className="h-4 w-4" /> All Portals
        </button>
        <button
          onClick={() => logout()}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
        >
          <LogOut className="h-4 w-4" /> Sign Out
        </button>
      </div>
    </aside>
  );

  // ── Tab: Home ─────────────────────────────────────────────────────────────────
  const HomeTab = () => (
    <div className="space-y-8">
      {/* Personal greeting */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "linear-gradient(135deg, #0F766E 0%, #1D4ED8 100%)" }}>
        <div className="px-6 py-8 text-white">
          <p className="text-teal-200 text-sm font-medium mb-1">Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"},</p>
          <h1 className="text-3xl font-bold mb-2">{firstName}</h1>
          <p className="text-teal-100 text-sm">
            {pendingQuotes.length > 0
              ? `You have ${pendingQuotes.length} insurance quote${pendingQuotes.length > 1 ? "s" : ""} ready for your review.`
              : openClaims.length > 0
              ? `You have ${openClaims.length} active claim${openClaims.length > 1 ? "s" : ""} in progress.`
              : "Everything looks good. Your KINGA portal is up to date."}
          </p>
        </div>
        {/* Summary strip */}
        <div className="grid grid-cols-4 divide-x divide-white/20 bg-black/10">
          {[
            { label: "Vehicles",       value: myVehicles?.length ?? 0,  icon: <Car className="h-4 w-4" />,     tab: "vehicles" as Tab },
            { label: "Quotes Ready",   value: pendingQuotes.length,      icon: <Tag className="h-4 w-4" />,     tab: "insurance" as Tab },
            { label: "Active Policies",value: activePolicies.length,     icon: <Shield className="h-4 w-4" />,  tab: "insurance" as Tab },
            { label: "Open Claims",    value: openClaims.length,         icon: <FileText className="h-4 w-4" />,tab: "claims" as Tab },
          ].map(kpi => (
            <button key={kpi.label} onClick={() => setActiveTab(kpi.tab)} className="px-4 py-3 text-center hover:bg-white/10 transition-colors">
              <div className="flex justify-center text-teal-200 mb-1">{kpi.icon}</div>
              <p className="text-xl font-bold text-white">{kpi.value}</p>
              <p className="text-xs text-teal-200">{kpi.label}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Urgent: pending quotes */}
      {pendingQuotes.length > 0 && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-amber-100 shrink-0"><Tag className="h-5 w-5 text-amber-700" /></div>
            <div className="flex-1">
              <h3 className="font-bold text-amber-900">Your insurance quote is ready</h3>
              <p className="text-sm text-amber-800 mt-0.5">
                {pendingQuotes.length === 1
                  ? `Your agent has prepared a quote for your ${pendingQuotes[0].vehicleYear} ${pendingQuotes[0].vehicleMake} ${pendingQuotes[0].vehicleModel}. Review and accept to activate your cover.`
                  : `You have ${pendingQuotes.length} quotes ready for review. Accept to activate your cover.`}
              </p>
            </div>
            <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white shrink-0" onClick={() => setActiveTab("insurance")}>
              Review Quote <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* What would you like to do? */}
      <div>
        <h2 className="text-lg font-bold text-slate-800 mb-4">What would you like to do?</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              icon: <Gauge className="h-6 w-6 text-teal-600" />,
              bg: "bg-teal-50",
              title: "Get a Vehicle Valuation",
              desc: "Find out what your vehicle is worth with a professional KINGA report.",
              action: () => setLocation("/get-a-quote"),
              cta: "Start Valuation",
            },
            {
              icon: <Shield className="h-6 w-6 text-blue-600" />,
              bg: "bg-blue-50",
              title: "Request Insurance",
              desc: "Motor, home, engineering, bonds and more — get a quote tailored to you.",
              action: () => setShowInsuranceWizard(true),
              cta: "Get a Quote",
            },
            {
              icon: <FileText className="h-6 w-6 text-purple-600" />,
              bg: "bg-purple-50",
              title: "Submit a Claim",
              desc: "Been in an accident or suffered a loss? Start your claim here.",
              action: () => setLocation("/client/submit-claim"),
              cta: "Submit Claim",
            },
            {
              icon: <Car className="h-6 w-6 text-emerald-600" />,
              bg: "bg-emerald-50",
              title: "Add a Vehicle",
              desc: "Register your personal vehicle to link it to your valuations and policies.",
              action: () => { setActiveTab("vehicles"); setAddVehicleOpen(true); },
              cta: "Add Vehicle",
            },
          ].map(item => (
            <div key={item.title} className="rounded-xl border bg-white p-5 hover:shadow-md transition-shadow cursor-pointer group" onClick={item.action}>
              <div className={`w-12 h-12 rounded-xl ${item.bg} flex items-center justify-center mb-4 group-hover:scale-105 transition-transform`}>
                {item.icon}
              </div>
              <h3 className="font-semibold text-slate-800 mb-1">{item.title}</h3>
              <p className="text-sm text-slate-500 mb-3">{item.desc}</p>
              <span className="text-sm font-medium text-primary flex items-center gap-1">
                {item.cta} <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent activity */}
      {(myClaims?.length ?? 0) > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-800">Recent Claims</h2>
            <button onClick={() => setActiveTab("claims")} className="text-sm text-primary font-medium flex items-center gap-1 hover:underline">
              View all <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-2">
            {(myClaims ?? []).slice(0, 3).map((c: any) => {
              const s = CLAIM_STATUS_LABELS[c.workflowState ?? c.status] ?? { label: "In Progress", color: "#374151", bg: "#F9FAFB" };
              return (
                <div key={c.id} className="flex items-center gap-3 p-4 rounded-xl border bg-white hover:shadow-sm transition-shadow cursor-pointer" onClick={() => setLocation(`/client/claims/${c.id}`)}>
                  <div className="p-2 rounded-lg bg-slate-100 shrink-0"><FileText className="h-4 w-4 text-slate-500" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{c.vehicleYear} {c.vehicleMake} {c.vehicleModel || "Vehicle"}</p>
                    <p className="text-xs text-muted-foreground">{c.claimNumber ?? `Claim #${c.id}`} · {new Date(c.createdAt).toLocaleDateString()}</p>
                  </div>
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full shrink-0" style={{ color: s.color, background: s.bg }}>{s.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  // ── Tab: My Vehicles ──────────────────────────────────────────────────────────
  const VehiclesTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">My Vehicles</h2>
          <p className="text-sm text-slate-500">Your personal vehicle registry — linked to your valuations and policies.</p>
        </div>
        <Button onClick={() => setAddVehicleOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Add Vehicle
        </Button>
      </div>
      {!myVehicles?.length ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <Car className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="font-semibold text-slate-700 mb-1">No vehicles yet</h3>
          <p className="text-sm text-slate-500 mb-5 max-w-xs mx-auto">Add your personal vehicles to link them to your valuations, insurance policies, and claims.</p>
          <Button onClick={() => setAddVehicleOpen(true)}><Plus className="h-4 w-4 mr-2" /> Register My Vehicle</Button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {myVehicles.map((v: any) => {
            const linkedValuation = (requests ?? []).find((r: any) =>
              r.vehicleMake?.toLowerCase() === v.make?.toLowerCase() &&
              r.vehicleModel?.toLowerCase() === v.model?.toLowerCase()
            );
            const linkedClaim = (myClaims ?? []).find((c: any) =>
              c.vehicleMake?.toLowerCase() === v.make?.toLowerCase() &&
              c.vehicleModel?.toLowerCase() === v.model?.toLowerCase() &&
              !["closed","completed"].includes(c.status)
            );
            return (
              <div key={v.id} className="rounded-xl border bg-white overflow-hidden hover:shadow-md transition-shadow">
                {/* Vehicle header */}
                <div className="px-5 py-4 bg-gradient-to-r from-slate-50 to-white border-b">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-slate-800">{v.year} {v.make} {v.model}</h3>
                      {v.registration && <p className="text-sm font-mono text-slate-500 mt-0.5">{v.registration}</p>}
                      <p className="text-xs text-slate-400 mt-0.5 capitalize">{v.colour && `${v.colour} · `}{v.fuelType}</p>
                    </div>
                    <button onClick={() => deleteVehicleMutation.mutate({ id: v.id })} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {/* Linked info */}
                <div className="px-5 py-3 grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-2 text-xs">
                    <Gauge className="h-3.5 w-3.5 text-teal-500 shrink-0" />
                    <span className="text-slate-600">{linkedValuation ? `Valued at $${linkedValuation.vehicleValue?.toLocaleString() ?? "—"}` : "No valuation yet"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Shield className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                    <span className="text-slate-600">{linkedClaim ? `Claim in progress` : "No open claim"}</span>
                  </div>
                </div>
                {/* Quick actions */}
                <div className="px-5 pb-4 flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => setLocation("/get-a-quote")}>
                    <Gauge className="h-3 w-3 mr-1" /> Get Valuation
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => setShowInsuranceWizard(true)}>
                    <Shield className="h-3 w-3 mr-1" /> Get Insurance
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ── Tab: Valuations ───────────────────────────────────────────────────────────
  const ValuationsTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Valuations</h2>
          <p className="text-sm text-slate-500">Professional KINGA vehicle valuation reports.</p>
        </div>
        <Button onClick={() => setLocation("/get-a-quote")}>
          <Plus className="h-4 w-4 mr-2" /> New Valuation
        </Button>
      </div>
      {allRequests.filter((r: any) => r.productCategory === "motor" || !r.productCategory).length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-teal-50 flex items-center justify-center mx-auto mb-4">
            <Gauge className="h-8 w-8 text-teal-500" />
          </div>
          <h3 className="font-semibold text-slate-700 mb-1">No valuations yet</h3>
          <p className="text-sm text-slate-500 mb-5 max-w-xs mx-auto">Get a professional KINGA valuation report to know your vehicle's true market value.</p>
          <Button onClick={() => setLocation("/get-a-quote")}><Sparkles className="h-4 w-4 mr-2" /> Request a Valuation</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {allRequests.map((req: any) => {
            const s = INSURANCE_STATUS_LABELS[req.status] ?? { label: req.status, color: "#374151", bg: "#F9FAFB" };
            return (
              <div key={req.id} className="rounded-xl border bg-white p-5 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-semibold text-slate-800">{req.vehicleYear} {req.vehicleMake} {req.vehicleModel}</h3>
                      <span className="text-xs font-medium px-2.5 py-0.5 rounded-full" style={{ color: s.color, background: s.bg }}>{s.label}</span>
                    </div>
                    <p className="text-xs text-slate-500 capitalize">{req.insuranceType?.replace(/_/g," ")} · Requested {new Date(req.createdAt).toLocaleDateString()}</p>
                    {req.vehicleValue && <p className="text-sm font-semibold text-teal-700 mt-1">Estimated value: ${req.vehicleValue.toLocaleString()}</p>}
                  </div>
                  {req.status === "quoted" && (
                    <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white shrink-0" onClick={() => { setActiveTab("insurance"); }}>
                      View Quote <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ── Tab: Insurance ────────────────────────────────────────────────────────────
  const InsuranceTab = () => (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Insurance</h2>
          <p className="text-sm text-slate-500">Your quotes, policies, and documents from your KINGA agent.</p>
        </div>
        <Button onClick={() => setShowInsuranceWizard(true)}>
          <Plus className="h-4 w-4 mr-2" /> New Request
        </Button>
      </div>

      {/* Quotes awaiting acceptance */}
      {pendingQuotes.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-amber-800 flex items-center gap-2">
            <Tag className="h-4 w-4" /> Quotes Ready for You ({pendingQuotes.length})
          </h3>
          {pendingQuotes.map((req: any) => (
            <div key={req.id} className="rounded-xl border-2 border-amber-300 bg-amber-50 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h4 className="font-bold text-slate-800 mb-1">{req.vehicleYear} {req.vehicleMake} {req.vehicleModel}</h4>
                  <p className="text-sm text-slate-600 capitalize mb-3">{req.insuranceType?.replace(/_/g," ")} cover</p>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div className="bg-white rounded-lg p-3 text-center">
                      <p className="text-xs text-slate-500 mb-0.5">Monthly Premium</p>
                      <p className="font-bold text-lg text-slate-800">${req.quotedPremium?.toLocaleString()}</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center">
                      <p className="text-xs text-slate-500 mb-0.5">Annual Premium</p>
                      <p className="font-bold text-slate-800">${(req.quotedAnnualPremium ?? req.quotedPremium * 12)?.toLocaleString()}</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center">
                      <p className="text-xs text-slate-500 mb-0.5">Excess</p>
                      <p className="font-bold text-slate-800">${(req.quotedExcess ?? 0)?.toLocaleString()}</p>
                    </div>
                  </div>
                  {req.quoteNotes && (
                    <div className="bg-white rounded-lg p-3 border-l-4 border-amber-400 mb-3">
                      <p className="text-xs text-slate-600 italic">{req.quoteNotes}</p>
                    </div>
                  )}
                  <p className="text-xs text-slate-500">
                    <Calendar className="h-3 w-3 inline mr-1" />
                    Quote valid until {req.quoteValidUntil ? new Date(req.quoteValidUntil).toLocaleDateString() : "—"}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Button
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                  disabled={acceptQuoteMutation.isPending}
                  onClick={() => acceptQuoteMutation.mutate({ quotationRequestId: req.id })}
                >
                  {acceptQuoteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                  Accept This Quote
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Active policies */}
      <div className="space-y-3">
        <h3 className="font-semibold text-emerald-800 flex items-center gap-2">
          <Shield className="h-4 w-4" /> Active Policies ({activePolicies.length})
        </h3>
        {activePolicies.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 py-10 text-center">
            <Shield className="h-8 w-8 mx-auto mb-2 text-slate-300" />
            <p className="text-sm text-slate-500">No active policies yet.</p>
            <p className="text-xs text-slate-400 mt-1">Accept a quote above, or request a new insurance quote.</p>
          </div>
        ) : (
          activePolicies.map((req: any) => (
            <div key={req.id} className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-emerald-100 shrink-0"><Shield className="h-5 w-5 text-emerald-700" /></div>
              <div className="flex-1">
                <h4 className="font-semibold text-slate-800">{req.vehicleYear} {req.vehicleMake} {req.vehicleModel}</h4>
                <p className="text-sm text-slate-500 capitalize">{req.insuranceType?.replace(/_/g," ")} · ${req.quotedPremium?.toLocaleString()}/month</p>
              </div>
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-100 text-emerald-800">Active</span>
            </div>
          ))
        )}
      </div>

      {/* Requests in progress */}
      {allRequests.filter((r: any) => r.status !== "quoted").length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-slate-600 flex items-center gap-2">
            <Clock className="h-4 w-4" /> Requests in Progress
          </h3>
          {allRequests.filter((r: any) => r.status !== "quoted").map((req: any) => {
            const s = INSURANCE_STATUS_LABELS[req.status] ?? { label: req.status, color: "#374151", bg: "#F9FAFB" };
            return (
              <div key={req.id} className="rounded-xl border bg-white p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-slate-100 shrink-0"><Clock className="h-4 w-4 text-slate-500" /></div>
                <div className="flex-1">
                  <p className="font-medium text-sm text-slate-800">{req.vehicleYear} {req.vehicleMake} {req.vehicleModel}</p>
                  <p className="text-xs text-slate-500 capitalize">{req.insuranceType?.replace(/_/g," ")} · {new Date(req.createdAt).toLocaleDateString()}</p>
                </div>
                <span className="text-xs font-medium px-2.5 py-1 rounded-full shrink-0" style={{ color: s.color, background: s.bg }}>{s.label}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Documents from agent */}
      {(myDocuments?.length ?? 0) > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-slate-600 flex items-center gap-2">
            <FileText className="h-4 w-4" /> Documents from Your Agent
          </h3>
          {(myDocuments ?? []).map((doc: any) => (
            <div key={doc.id} className="rounded-xl border bg-white p-4 flex items-center gap-3 hover:shadow-sm transition-shadow">
              <div className="p-2 rounded-lg bg-blue-50 shrink-0"><FileText className="h-4 w-4 text-blue-600" /></div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-slate-800 truncate">{doc.title}</p>
                <p className="text-xs text-slate-500 capitalize">{doc.documentType?.replace(/_/g," ")} · {new Date(doc.createdAt).toLocaleDateString()}</p>
                {doc.notes && <p className="text-xs text-slate-400 italic mt-0.5">{doc.notes}</p>}
              </div>
              <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="shrink-0">
                  <Download className="h-3.5 w-3.5 mr-1" /> Open
                </Button>
              </a>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {pendingQuotes.length === 0 && activePolicies.length === 0 && allRequests.length === 0 && (myDocuments?.length ?? 0) === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
            <Shield className="h-8 w-8 text-blue-400" />
          </div>
          <h3 className="font-semibold text-slate-700 mb-1">No insurance requests yet</h3>
          <p className="text-sm text-slate-500 mb-5 max-w-xs mx-auto">Request a quote for motor, home, engineering, bonds, or any other cover — your agent will respond promptly.</p>
          <Button onClick={() => setShowInsuranceWizard(true)}><Plus className="h-4 w-4 mr-2" /> Request Insurance</Button>
        </div>
      )}
    </div>
  );

  // ── Tab: My Claims ────────────────────────────────────────────────────────────
  const ClaimsTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">My Claims</h2>
          <p className="text-sm text-slate-500">Track the progress of your insurance claims.</p>
        </div>
        <Button onClick={() => setLocation("/client/submit-claim")}>
          <Plus className="h-4 w-4 mr-2" /> Submit a Claim
        </Button>
      </div>

      {!myClaims || myClaims.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-purple-50 flex items-center justify-center mx-auto mb-4">
            <FileText className="h-8 w-8 text-purple-400" />
          </div>
          <h3 className="font-semibold text-slate-700 mb-1">No claims on record</h3>
          <p className="text-sm text-slate-500 mb-5 max-w-xs mx-auto">If you have been involved in an accident or suffered a loss, submit a claim and we will guide you through the process.</p>
          <Button onClick={() => setLocation("/client/submit-claim")}><Plus className="h-4 w-4 mr-2" /> Submit a Claim</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {myClaims.map((c: any) => {
            const s = CLAIM_STATUS_LABELS[c.workflowState ?? c.status] ?? { label: "In Progress", color: "#374151", bg: "#F9FAFB" };
            const isClosed = ["closed","completed"].includes(c.status);
            return (
              <div
                key={c.id}
                className="rounded-xl border bg-white p-5 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setLocation(`/client/claims/${c.id}`)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-semibold text-slate-800">{c.vehicleYear} {c.vehicleMake} {c.vehicleModel || "Vehicle"}</h3>
                      <span className="text-xs font-medium px-2.5 py-0.5 rounded-full" style={{ color: s.color, background: s.bg }}>{s.label}</span>
                    </div>
                    <p className="text-xs text-slate-500">{c.claimNumber ?? `Claim #${c.id}`} · Submitted {new Date(c.createdAt).toLocaleDateString()}</p>
                    {c.incidentDate && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        <Calendar className="h-3 w-3 inline mr-1" />
                        Incident: {new Date(c.incidentDate).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="ghost" size="sm" className="text-primary">
                      View <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                    </Button>
                  </div>
                </div>
                {/* Progress indicator for open claims */}
                {!isClosed && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-xs text-slate-500 mb-1.5">Claim progress</p>
                    <div className="flex gap-1">
                      {["Received","Under Review","Assessment","Decision","Resolved"].map((step, i) => {
                        const currentStep = ["submitted","intake_pending","triage"].includes(c.workflowState ?? c.status) ? 0
                          : ["assessment_pending","assessment_in_progress","assessment_complete"].includes(c.workflowState ?? c.status) ? 2
                          : ["quotes_pending","comparison","repair_assigned"].includes(c.workflowState ?? c.status) ? 3
                          : ["repair_in_progress","financial_decision"].includes(c.workflowState ?? c.status) ? 3
                          : ["completed","closed"].includes(c.workflowState ?? c.status) ? 4 : 1;
                        return (
                          <div key={step} className="flex-1">
                            <div className={`h-1.5 rounded-full ${i <= currentStep ? "bg-primary" : "bg-slate-200"}`} />
                            {i === currentStep && <p className="text-xs text-primary font-medium mt-1 truncate">{step}</p>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const CONTENT: Record<Tab, React.ReactNode> = {
    home: <HomeTab />,
    vehicles: <VehiclesTab />,
    valuations: <ValuationsTab />,
    insurance: <InsuranceTab />,
    claims: <ClaimsTab />,
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Mobile header */}
      <header className="lg:hidden bg-white border-b px-4 py-3 flex items-center justify-between sticky top-0 z-20 shadow-sm">
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 rounded-lg hover:bg-slate-100">
          <Menu className="h-5 w-5" />
        </button>
        <KingaLogo size="sm" />
        <Button variant="ghost" size="sm" onClick={() => setLocation("/notifications")}>
          <Bell className="h-4 w-4" />
        </Button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <div className="hidden lg:block shrink-0">
          <Sidebar />
        </div>
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div className="lg:hidden fixed inset-0 z-30 flex">
            <div className="w-64 h-full shadow-2xl"><Sidebar /></div>
            <div className="flex-1 bg-black/40" onClick={() => setSidebarOpen(false)} />
          </div>
        )}
        {/* Main content */}
        <main className="flex-1 overflow-auto">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
            {CONTENT[activeTab]}
          </div>
        </main>
      </div>

      {/* Insurance Request Wizard */}
      {showInsuranceWizard && (
        <InsuranceRequestWizard
          onClose={() => setShowInsuranceWizard(false)}
          onSuccess={() => { setShowInsuranceWizard(false); refetchRequests(); setActiveTab("insurance"); toast.success("Your insurance request has been submitted. Your agent will be in touch shortly."); }}
        />
      )}

      {/* Add Vehicle Dialog */}
      <Dialog open={addVehicleOpen} onOpenChange={setAddVehicleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Register a Vehicle</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Make *</Label>
                <Input placeholder="e.g. Toyota" value={vMake} onChange={e => setVMake(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Model *</Label>
                <Input placeholder="e.g. Corolla" value={vModel} onChange={e => setVModel(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Year *</Label>
                <Input type="number" min="1970" max={new Date().getFullYear()+1} value={vYear} onChange={e => setVYear(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Registration Plate</Label>
                <Input placeholder="e.g. ABC 1234" value={vReg} onChange={e => setVReg(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Colour</Label>
                <Input placeholder="e.g. Silver" value={vColour} onChange={e => setVColour(e.target.value)} />
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
              <Input placeholder="17-character vehicle identification number" value={vVin} onChange={e => setVVin(e.target.value)} />
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
              Add to My Profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
