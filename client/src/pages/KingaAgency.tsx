import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Loader2, Plus, FileText, Shield, Clock, CheckCircle, XCircle,
  Upload, Car, DollarSign, RefreshCw, ArrowLeft, Search, Eye,
  Trash2, Download, Calendar, Phone, Mail, User, Building2,
  AlertTriangle, ShieldCheck, ScanLine
} from "lucide-react";
import { TimelineIntelligenceTab } from "@/components/TimelineIntelligenceTab";

export default function KingaAgency() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("quotations");
  const [showNewQuoteForm, setShowNewQuoteForm] = useState(false);

  const tabs = [
    { id: 'quotations', label: 'Quotations' },
    { id: 'policies', label: 'Policies' },
    { id: 'documents', label: 'Documents' },
    { id: 'vehicle-valuation', label: '🚗 Vehicle Valuation' },
    { id: 'timeline-intelligence', label: '📅 Timeline Intelligence' },
  ];

  return (
    <div style={{ background: 'var(--body-bg)', fontFamily: 'Inter, sans-serif', minHeight: '100vh' }}>
      {/* ── IDENTITY STRIP ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 24px', background:'#FFFFFF', borderBottom:'1px solid #E7E2D6', position:'sticky', top:0, zIndex:100, height:'52px', fontFamily:'Inter, sans-serif' }}>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <img src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/dOfoldGKvKSMqKYG.png" alt="KINGA" style={{ height:28, width:'auto', objectFit:'contain', flexShrink:0 }} />
          <div style={{ width:1, height:22, background:'#C8C4BA' }} />
          <span style={{ fontSize:13, fontWeight:600, color:'#15201A', letterSpacing:'-0.01em' }}>KINGA Agency</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button title="Notifications" style={{ width:32, height:32, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:6, cursor:'pointer', color:'#6B7568', background:'none', border:'none' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          </button>
        </div>
      </div>

      {/* ── HERO BAND ── */}
      <div className="p11-hero">
        <div className="p11-hero-top">
          <div>
            <div className="p11-breadcrumb">KINGA · Agency</div>
            <div className="p11-hero-title">Agency Portal</div>
            <div className="p11-hero-subtitle">Insurance Quotations &amp; Policy Renewals</div>
          </div>
          <div className="p11-hero-actions">
            <button className="p11-btn-ghost" onClick={() => setLocation('/portal')}>
              <ArrowLeft style={{ width:13, height:13 }} />
              Portal Hub
            </button>
            <button className="p11-btn-gold" onClick={() => setShowNewQuoteForm(true)}>
              <Plus style={{ width:13, height:13 }} />
              Request Quote
            </button>
          </div>
        </div>
        {/* KPI Strip */}
        <div className="p11-kpi-grid">
          <div className="p11-kpi-tile headline">
            <div className="p11-kpi-label">My Quotations</div>
            <div className="p11-kpi-value num">—</div>
            <div className="p11-kpi-delta">Total submitted</div>
          </div>
          <div className="p11-kpi-tile">
            <div className="p11-kpi-label">Active Policies</div>
            <div className="p11-kpi-value num">—</div>
            <div className="p11-kpi-delta">In force</div>
          </div>
          <div className="p11-kpi-tile">
            <div className="p11-kpi-label">Pending Review</div>
            <div className="p11-kpi-value num">—</div>
            <div className="p11-kpi-delta">Awaiting response</div>
          </div>
          <div className="p11-kpi-tile">
            <div className="p11-kpi-label">Documents</div>
            <div className="p11-kpi-value num">—</div>
            <div className="p11-kpi-delta">Uploaded</div>
          </div>
        </div>
      </div>

      {/* ── TAB BAR ── */}
      <nav className="p11-tab-bar">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`p11-tab-item${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </div>
        ))}
      </nav>

      {/* ── BODY ── */}
      <div className="p11-body">
        <div className="p11-body-2col">
          {/* ── MAIN COLUMN ── */}
          <div>
            {activeTab === 'quotations' && <QuotationsTab />}
            {activeTab === 'policies' && <PoliciesTab />}
            {activeTab === 'documents' && <DocumentsTab />}
            {activeTab === 'vehicle-valuation' && <VehicleValuationTab />}
            {activeTab === 'timeline-intelligence' && <TimelineIntelligenceTab />}
          </div>
          {/* ── SIDEBAR ── */}
          <div className="p11-sidebar">
            <div className="p11-card">
              <div className="p11-card-header">
                <div className="p11-card-title">
                  <FileText style={{ width:14, height:14, color:'var(--g-600)' }} />
                  Quick Actions
                </div>
              </div>
              <div className="p11-card-body">
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  <button className="p11-btn-gold" style={{ width:'100%', justifyContent:'center' }} onClick={() => setShowNewQuoteForm(true)}>
                    <Plus style={{ width:13, height:13 }} />
                    Request New Quote
                  </button>
                  <button className="p11-btn-outline" style={{ width:'100%', justifyContent:'center' }} onClick={() => setActiveTab('documents')}>
                    <Upload style={{ width:13, height:13 }} />
                    Upload Document
                  </button>
                </div>
              </div>
            </div>
            <div className="p11-card">
              <div className="p11-card-header">
                <div className="p11-card-title">
                  <Shield style={{ width:14, height:14, color:'var(--g-600)' }} />
                  Coverage Types
                </div>
              </div>
              <div className="p11-card-body">
                {[
                  { label: 'Comprehensive', desc: 'Full vehicle cover' },
                  { label: 'Third Party', desc: 'Liability only' },
                  { label: 'Third Party Fire & Theft', desc: 'Extended liability' },
                ].map(item => (
                  <div key={item.label} style={{ padding:'7px 0', borderBottom:'1px solid var(--line)' }}>
                    <div style={{ fontSize:12, fontWeight:600, color:'var(--ink)' }}>{item.label}</div>
                    <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{item.desc}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="p11-card">
              <div className="p11-card-header">
                <div className="p11-card-title">
                  <Phone style={{ width:14, height:14, color:'var(--g-600)' }} />
                  Support
                </div>
              </div>
              <div className="p11-card-body">
                <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.6 }}>
                  Need help with your quotation or policy? Contact our agency support team.
                </div>
                <div style={{ marginTop:10, fontSize:12, fontWeight:600, color:'var(--g-700)' }}>agency@kinga.co.zw</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* New Quote Dialog */}
      <NewQuoteDialog open={showNewQuoteForm} onOpenChange={setShowNewQuoteForm} />
    </div>
  );
}

// ========== QUOTATIONS TAB ==========
function QuotationsTab() {
  const { data: quotations, isLoading } = trpc.agency.myQuotations.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      pending: { label: "Pending", variant: "secondary" },
      under_review: { label: "Under Review", variant: "default" },
      quoted: { label: "Quoted", variant: "default" },
      accepted: { label: "Accepted", variant: "default" },
      rejected: { label: "Rejected", variant: "destructive" },
      expired: { label: "Expired", variant: "outline" },
    };
    const info = map[status] || { label: status, variant: "outline" as const };
    return <Badge variant={info.variant}>{info.label}</Badge>;
  };

  if (!quotations || quotations.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <FileText className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Quotation Requests</h3>
          <p className="text-muted-foreground text-center max-w-md">
            You haven't submitted any insurance quotation requests yet. Click "Request Quote" to get started.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Your Quotation Requests</h2>
        <Badge variant="outline">{quotations.length} total</Badge>
      </div>
      {quotations.map((q: any) => (
        <Card key={q.id} className="hover:shadow-md transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-semibold">{q.requestNumber}</span>
                  {getStatusBadge(q.status)}
                </div>
                <p className="text-sm text-muted-foreground">
                  {q.vehicleYear} {q.vehicleMake} {q.vehicleModel}
                  {q.vehicleRegistration && ` • ${q.vehicleRegistration}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {q.insuranceType.replace(/_/g, " ")} cover • Submitted {new Date(q.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="text-right">
                {q.quotedPremium ? (
                  <div>
                    <p className="text-lg font-bold text-emerald-600">
                      ${q.quotedPremium.toFixed(2)}/mo
                    </p>
                    {q.quotedAnnualPremium && (
                      <p className="text-xs text-muted-foreground">
                        ${q.quotedAnnualPremium.toFixed(2)}/year
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Awaiting quote</p>
                )}
              </div>
            </div>
            {q.quoteNotes && (
              <div className="mt-3 p-3 bg-primary/5 rounded-lg">
                <p className="text-sm text-secondary">{q.quoteNotes}</p>
              </div>
            )}
            {/* H-01: Vehicle history risk intelligence from KINGA registry */}
            <VehicleRiskIntelligencePanel registrationNumber={q.vehicleRegistration} />
            {/* C-02: Show vehicle forensics analysis if vehicle photos were uploaded */}
            <VehicleForensicsPanel quotationRequestId={q.id} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ========== VEHICLE RISK INTELLIGENCE PANEL (H-01) ==========
function VehicleRiskIntelligencePanel({ registrationNumber }: { registrationNumber?: string | null }) {
  const { data, isLoading } = trpc.agency.getVehicleRiskIntelligence.useQuery(
    { registrationNumber: registrationNumber! },
    { enabled: !!registrationNumber }
  );
  if (!registrationNumber || isLoading || !data || !data.found) return null;
  const risk = data as Extract<typeof data, { found: true }>;
  const riskScore = risk.vehicleRiskScore ?? 0;
  const riskColor = riskScore >= 70 ? 'text-red-600' : riskScore >= 40 ? 'text-amber-600' : 'text-emerald-600';
  const riskBg = riskScore >= 70 ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800' : riskScore >= 40 ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800' : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800';
  const flags = [
    risk.isRepeatClaimer && 'Repeat Claimant',
    risk.isSalvageTitle && 'Salvage Title',
    risk.isStolen && 'Reported Stolen',
    risk.isWrittenOff && 'Written Off',
    risk.hasSuspiciousDamagePattern && 'Suspicious Damage Pattern',
  ].filter(Boolean);
  return (
    <div className={`mt-2 p-3 border rounded-lg ${riskBg}`}>
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck className={`h-4 w-4 ${riskColor}`} />
        <span className="text-sm font-semibold">KINGA Vehicle History Intelligence</span>
        <Badge variant="outline" className={`ml-auto text-xs ${riskColor}`}>Risk {riskScore}/100</Badge>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="text-center">
          <p className="text-muted-foreground">Prior Claims</p>
          <p className={`font-semibold ${risk.totalClaimsCount > 2 ? 'text-red-600' : 'text-foreground'}`}>{risk.totalClaimsCount}</p>
        </div>
        <div className="text-center">
          <p className="text-muted-foreground">Total Repair Cost</p>
          <p className="font-semibold">${((risk.totalRepairCostCents ?? 0) / 100).toLocaleString()}</p>
        </div>
        <div className="text-center">
          <p className="text-muted-foreground">Last Claim</p>
          <p className="font-semibold">{risk.lastClaimDate ? new Date(risk.lastClaimDate).toLocaleDateString() : 'None'}</p>
        </div>
      </div>
      {flags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {flags.map((flag, i) => (
            <Badge key={i} variant="destructive" className="text-xs">{flag}</Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ========== VEHICLE FORENSICS PANEL (C-02) ==========
function VehicleForensicsPanel({ quotationRequestId }: { quotationRequestId: number }) {
  const { data, isLoading } = trpc.agency.getVehicleForensics.useQuery(
    { quotationRequestId },
    { refetchInterval: (query) => (query.state.data?.status === 'processing' ? 3000 : false) }
  );

  if (isLoading) return null;
  if (!data || data.status === 'not_started') return null;

  if (data.status === 'processing') {
    return (
      <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center gap-3">
        <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
        <p className="text-sm text-amber-800 dark:text-amber-200">KINGA is analysing your vehicle photos...</p>
      </div>
    );
  }

  if (data.status === 'failed') {
    return (
      <div className="mt-3 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-3">
        <AlertTriangle className="h-4 w-4 text-red-600" />
        <p className="text-sm text-red-800 dark:text-red-200">Photo analysis failed. Please re-upload your vehicle photos.</p>
      </div>
    );
  }

  if (data.status !== 'complete' || !data.result) return null;

  const result = data.result as any;
  const riskScore = data.riskScore ?? 50;
  const riskColor = riskScore >= 70 ? 'text-red-600' : riskScore >= 40 ? 'text-amber-600' : 'text-emerald-600';
  const riskBg = riskScore >= 70 ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800' : riskScore >= 40 ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800' : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800';
  const riskLabel = riskScore >= 70 ? 'High Risk' : riskScore >= 40 ? 'Moderate Risk' : 'Low Risk';

  return (
    <div className={`mt-3 p-3 border rounded-lg ${riskBg}`}>
      <div className="flex items-center gap-2 mb-2">
        <ScanLine className={`h-4 w-4 ${riskColor}`} />
        <span className="text-sm font-semibold">KINGA Vehicle Photo Analysis</span>
        <Badge variant="outline" className={`ml-auto text-xs ${riskColor}`}>{riskLabel} ({riskScore}/100)</Badge>
      </div>
      <div className="grid grid-cols-3 gap-3 text-xs">
        <div className="text-center">
          <p className="text-muted-foreground">Photos Analysed</p>
          <p className="font-semibold">{result.analysedCount ?? 0}</p>
        </div>
        <div className="text-center">
          <p className="text-muted-foreground">Suspicious Flags</p>
          <p className={`font-semibold ${result.anySuspicious ? 'text-red-600' : 'text-emerald-600'}`}>
            {result.anySuspicious ? 'Detected' : 'None'}
          </p>
        </div>
        <div className="text-center">
          <p className="text-muted-foreground">AI Generation</p>
          <p className={`font-semibold ${result.aiGenerationFlag ? 'text-red-600' : 'text-emerald-600'}`}>
            {result.aiGenerationFlag ? 'Suspected' : 'Not Detected'}
          </p>
        </div>
      </div>
      {result.indicators?.length > 0 && (
        <div className="mt-2 pt-2 border-t border-current/10">
          <p className="text-xs text-muted-foreground mb-1">Forensic Indicators:</p>
          <div className="flex flex-wrap gap-1">
            {result.indicators.slice(0, 3).map((ind: any, i: number) => (
              <Badge key={i} variant="outline" className="text-xs">{ind.type?.replace(/_/g, ' ')}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ========== POLICIES TAB ==========
function PoliciesTab() {
  const { data: policies, isLoading } = trpc.agency.myPolicies.useQuery();
  const renewalMutation = trpc.agency.requestRenewal.useMutation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  const handleRenewal = async (policyId: number) => {
    try {
      await renewalMutation.mutateAsync({ policyId });
      toast.success("Renewal request submitted successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to request renewal");
    }
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      active: { label: "Active", variant: "default" },
      pending: { label: "Pending", variant: "secondary" },
      expired: { label: "Expired", variant: "destructive" },
      cancelled: { label: "Cancelled", variant: "outline" },
      endorsed: { label: "Endorsed", variant: "default" },
      renewed: { label: "Renewed", variant: "default" },
    };
    const info = map[status] || { label: status, variant: "outline" as const };
    return <Badge variant={info.variant}>{info.label}</Badge>;
  };

  if (!policies || policies.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Shield className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Insurance Policies</h3>
          <p className="text-muted-foreground text-center max-w-md">
            You don't have any insurance policies yet. Submit a quotation request to get started.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Your Insurance Policies</h2>
        <Badge variant="outline">{policies.length} total</Badge>
      </div>
      {policies.map((p: any) => (
        <Card key={p.id} className="hover:shadow-md transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-semibold">{p.policyNumber}</span>
                  {getStatusBadge(p.status)}
                </div>
                <p className="text-sm text-muted-foreground">
                  Premium: ${p.premiumAmount.toFixed(2)}/{p.premiumFrequency}
                </p>
                <p className="text-xs text-muted-foreground">
                  Coverage: {new Date(p.coverageStartDate).toLocaleDateString()} - {new Date(p.coverageEndDate).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {p.status === "active" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRenewal(p.id)}
                    disabled={renewalMutation.isPending}
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Request Renewal
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ========== DOCUMENTS TAB ==========
function DocumentsTab() {
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Your Documents</h2>
        <Button onClick={() => setUploadDialogOpen(true)} variant="outline">
          <Upload className="h-4 w-4 mr-2" />
          Upload Document
        </Button>
      </div>

      <DocumentUploadDialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen} />

      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Upload className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Upload Supporting Documents</h3>
          <p className="text-muted-foreground text-center max-w-md">
            Upload your ID, driver's license, vehicle registration, proof of address, and other documents required for your quotation or policy.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ========== NEW QUOTE DIALOG ==========
function NewQuoteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [step, setStep] = useState(1);

  // Form state
  const [fullName, setFullName] = useState(user?.name || "");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [insuranceType, setInsuranceType] = useState<string>("");
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleYear, setVehicleYear] = useState("");
  const [vehicleRegistration, setVehicleRegistration] = useState("");
  const [vehicleValue, setVehicleValue] = useState("");
  const [vehicleUsage, setVehicleUsage] = useState("private");
  const [driverAge, setDriverAge] = useState("");
  const [driverLicenseYears, setDriverLicenseYears] = useState("");

  const submitMutation = trpc.agency.submitQuotation.useMutation({
    onSuccess: (data) => {
      toast.success(`Quotation request ${data.requestNumber} submitted successfully!`);
      utils.agency.myQuotations.invalidate();
      onOpenChange(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to submit quotation request");
    },
  });

  const resetForm = () => {
    setStep(1);
    setFullName(user?.name || "");
    setEmail("");
    setPhone("");
    setIdNumber("");
    setInsuranceType("");
    setVehicleMake("");
    setVehicleModel("");
    setVehicleYear("");
    setVehicleRegistration("");
    setVehicleValue("");
    setVehicleUsage("private");
    setDriverAge("");
    setDriverLicenseYears("");
  };

  const handleSubmit = () => {
    if (!fullName || !email || !insuranceType || !vehicleMake || !vehicleModel || !vehicleYear) {
      toast.error("Please fill in all required fields");
      return;
    }
    submitMutation.mutate({
      fullName,
      email,
      phone: phone || undefined,
      idNumber: idNumber || undefined,
      insuranceType: insuranceType as any,
      vehicleMake,
      vehicleModel,
      vehicleYear: parseInt(vehicleYear),
      vehicleRegistration: vehicleRegistration || undefined,
      vehicleValue: vehicleValue ? parseInt(vehicleValue) * 100 : undefined,
      vehicleUsage: vehicleUsage as any,
      driverAge: driverAge ? parseInt(driverAge) : undefined,
      driverLicenseYears: driverLicenseYears ? parseInt(driverLicenseYears) : undefined,
    });
  };

  const commonMakes = [
    "Toyota", "Honda", "Nissan", "Mazda", "BMW", "Mercedes-Benz",
    "Volkswagen", "Ford", "Chevrolet", "Hyundai", "Kia", "Isuzu",
    "Mitsubishi", "Subaru", "Audi", "Land Rover", "Jeep", "Peugeot"
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Request Insurance Quote</DialogTitle>
          <DialogDescription>
            Step {step} of 3 — {step === 1 ? "Personal Details" : step === 2 ? "Vehicle Details" : "Review & Submit"}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center gap-2 mb-4">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                s <= step ? "bg-emerald-600 text-white" : "bg-gray-200 text-gray-700 dark:text-gray-400 dark:text-muted-foreground"
              }`}>
                {s}
              </div>
              {s < 3 && <div className={`flex-1 h-1 rounded ${s < step ? "bg-emerald-600" : "bg-gray-200"}`} />}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="fullName">Full Name *</Label>
                <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Doe" />
              </div>
              <div>
                <Label htmlFor="email">Email Address *</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john@example.com" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="phone">Phone Number</Label>
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+263 77 123 4567" />
              </div>
              <div>
                <Label htmlFor="idNumber">ID Number</Label>
                <Input id="idNumber" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} placeholder="63-123456A78" />
              </div>
            </div>
            <div>
              <Label htmlFor="insuranceType">Insurance Type *</Label>
              <Select value={insuranceType} onValueChange={setInsuranceType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select insurance type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="comprehensive">Comprehensive</SelectItem>
                  <SelectItem value="third_party">Third Party Only</SelectItem>
                  <SelectItem value="third_party_fire_theft">Third Party, Fire & Theft</SelectItem>
                  <SelectItem value="fleet">Fleet Insurance</SelectItem>
                  <SelectItem value="commercial">Commercial Vehicle</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => {
                if (!fullName || !email || !insuranceType) {
                  toast.error("Please fill in all required fields");
                  return;
                }
                setStep(2);
              }}>
                Next: Vehicle Details
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="vehicleMake">Vehicle Make *</Label>
                <Input
                  id="vehicleMake"
                  value={vehicleMake}
                  onChange={(e) => setVehicleMake(e.target.value)}
                  placeholder="Toyota"
                  list="makes-list"
                />
                <datalist id="makes-list">
                  {commonMakes.map((m) => <option key={m} value={m} />)}
                </datalist>
              </div>
              <div>
                <Label htmlFor="vehicleModel">Vehicle Model *</Label>
                <Input id="vehicleModel" value={vehicleModel} onChange={(e) => setVehicleModel(e.target.value)} placeholder="Hilux" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="vehicleYear">Year of Manufacture *</Label>
                <Input id="vehicleYear" type="number" value={vehicleYear} onChange={(e) => setVehicleYear(e.target.value)} placeholder="2022" min="1990" max="2030" />
              </div>
              <div>
                <Label htmlFor="vehicleRegistration">Registration Number</Label>
                <Input id="vehicleRegistration" value={vehicleRegistration} onChange={(e) => setVehicleRegistration(e.target.value)} placeholder="ABC 1234" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="vehicleValue">Estimated Value (USD)</Label>
                <Input id="vehicleValue" type="number" value={vehicleValue} onChange={(e) => setVehicleValue(e.target.value)} placeholder="15000" />
              </div>
              <div>
                <Label htmlFor="vehicleUsage">Vehicle Usage</Label>
                <Select value={vehicleUsage} onValueChange={setVehicleUsage}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">Private Use</SelectItem>
                    <SelectItem value="business">Business Use</SelectItem>
                    <SelectItem value="both">Private & Business</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="driverAge">Primary Driver Age</Label>
                <Input id="driverAge" type="number" value={driverAge} onChange={(e) => setDriverAge(e.target.value)} placeholder="35" min="18" max="99" />
              </div>
              <div>
                <Label htmlFor="driverLicenseYears">Years Holding License</Label>
                <Input id="driverLicenseYears" type="number" value={driverLicenseYears} onChange={(e) => setDriverLicenseYears(e.target.value)} placeholder="10" min="0" max="60" />
              </div>
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={() => {
                if (!vehicleMake || !vehicleModel || !vehicleYear) {
                  toast.error("Please fill in all required vehicle fields");
                  return;
                }
                setStep(3);
              }}>
                Next: Review
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Review Your Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                  <div><span className="text-muted-foreground">Name:</span> {fullName}</div>
                  <div><span className="text-muted-foreground">Email:</span> {email}</div>
                  {phone && <div><span className="text-muted-foreground">Phone:</span> {phone}</div>}
                  {idNumber && <div><span className="text-muted-foreground">ID:</span> {idNumber}</div>}
                  <div><span className="text-muted-foreground">Type:</span> {insuranceType.replace(/_/g, " ")}</div>
                  <div><span className="text-muted-foreground">Vehicle:</span> {vehicleYear} {vehicleMake} {vehicleModel}</div>
                  {vehicleRegistration && <div><span className="text-muted-foreground">Reg:</span> {vehicleRegistration}</div>}
                  {vehicleValue && <div><span className="text-muted-foreground">Value:</span> ${parseInt(vehicleValue).toLocaleString()}</div>}
                  <div><span className="text-muted-foreground">Usage:</span> {vehicleUsage}</div>
                  {driverAge && <div><span className="text-muted-foreground">Driver Age:</span> {driverAge}</div>}
                  {driverLicenseYears && <div><span className="text-muted-foreground">License Years:</span> {driverLicenseYears}</div>}
                </div>
              </CardContent>
            </Card>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
              <Button
                onClick={handleSubmit}
                disabled={submitMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {submitMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting...</>
                ) : (
                  <><CheckCircle className="h-4 w-4 mr-2" /> Submit Quotation Request</>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ========== DOCUMENT UPLOAD DIALOG ==========
function DocumentUploadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [documentType, setDocumentType] = useState("");
  const [title, setTitle] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const uploadMutation = trpc.agency.uploadDocument.useMutation({
    onSuccess: () => {
      toast.success("Document uploaded successfully");
      onOpenChange(false);
      setDocumentType("");
      setTitle("");
      setSelectedFile(null);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to upload document");
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error("File size must be less than 10MB");
        return;
      }
      setSelectedFile(file);
      if (!title) setTitle(file.name.replace(/\.[^/.]+$/, ""));
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !documentType || !title) {
      toast.error("Please fill in all fields and select a file");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadMutation.mutate({
        documentType: documentType as any,
        title,
        fileName: selectedFile.name,
        fileData: base64,
        mimeType: selectedFile.type,
      });
    };
    reader.readAsDataURL(selectedFile);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
          <DialogDescription>
            Upload supporting documents for your insurance application.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Document Type *</Label>
            <Select value={documentType} onValueChange={setDocumentType}>
              <SelectTrigger>
                <SelectValue placeholder="Select document type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="id_document">ID Document</SelectItem>
                <SelectItem value="drivers_license">Driver's License</SelectItem>
                <SelectItem value="vehicle_registration">Vehicle Registration</SelectItem>
                <SelectItem value="proof_of_address">Proof of Address</SelectItem>
                <SelectItem value="bank_statement">Bank Statement</SelectItem>
                <SelectItem value="vehicle_photos">Vehicle Photos</SelectItem>
                <SelectItem value="previous_policy">Previous Policy</SelectItem>
                <SelectItem value="claims_history">Claims History</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Document title" />
          </div>
          <div>
            <Label>File *</Label>
            <div
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-emerald-400 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              {selectedFile ? (
                <div className="flex items-center justify-center gap-2">
                  <FileText className="h-5 w-5 text-emerald-600" />
                  <span className="text-sm font-medium">{selectedFile.name}</span>
                  <span className="text-xs text-muted-foreground">({(selectedFile.size / 1024).toFixed(0)} KB)</span>
                </div>
              ) : (
                <div>
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Click to select a file (max 10MB)</p>
                  <p className="text-xs text-muted-foreground mt-1">PDF, JPG, PNG, DOC supported</p>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              onChange={handleFileSelect}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              onClick={handleUpload}
              disabled={uploadMutation.isPending || !selectedFile || !documentType || !title}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {uploadMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading...</>
              ) : (
                <><Upload className="h-4 w-4 mr-2" /> Upload</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ========== VEHICLE VALUATION TAB (Epic 4.5: D-7) ==========
function VehicleValuationTab() {
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState<number>(new Date().getFullYear() - 3);
  const [condition, setCondition] = useState<"excellent" | "good" | "fair" | "poor">("good");
  const [mileage, setMileage] = useState<number | undefined>(undefined);
  const [regNumber, setRegNumber] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const { data, isFetching, refetch } = trpc.agency.getValuation.useQuery(
    { make, model, year, condition, mileage, registrationNumber: regNumber || undefined },
    { enabled: submitted && !!make && !!model && !!year }
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!make || !model || !year) return;
    setSubmitted(true);
    refetch();
  };

  return (
    <div className="space-y-6">
      <div className="p11-card">
        <div className="p11-card-header">
          <div className="p11-card-title">
            <Car style={{ width: 14, height: 14, color: 'var(--g-600)' }} />
            Vehicle Valuation Request
          </div>
        </div>
        <div className="p11-card-body">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1 block">Make *</Label>
                <Input value={make} onChange={e => setMake(e.target.value)} placeholder="e.g. Toyota" required />
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1 block">Model *</Label>
                <Input value={model} onChange={e => setModel(e.target.value)} placeholder="e.g. Corolla" required />
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1 block">Year *</Label>
                <Input type="number" value={year} onChange={e => setYear(Number(e.target.value))} min={1950} max={new Date().getFullYear() + 1} required />
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1 block">Condition</Label>
                <select
                  value={condition}
                  onChange={e => setCondition(e.target.value as "excellent" | "good" | "fair" | "poor")}
                  style={{ width: '100%', height: 36, border: '1px solid var(--line)', borderRadius: 6, padding: '0 10px', fontSize: 13, background: '#fff', color: 'var(--ink)' }}
                >
                  <option value="excellent">Excellent</option>
                  <option value="good">Good</option>
                  <option value="fair">Fair</option>
                  <option value="poor">Poor</option>
                </select>
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1 block">Mileage (km)</Label>
                <Input type="number" value={mileage ?? ""} onChange={e => setMileage(e.target.value ? Number(e.target.value) : undefined)} placeholder="Optional" min={0} />
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1 block">Registration Number</Label>
                <Input value={regNumber} onChange={e => setRegNumber(e.target.value)} placeholder="Optional" />
              </div>
            </div>
            <button type="submit" className="p11-btn-gold" disabled={isFetching || !make || !model}>
              {isFetching ? <><Loader2 style={{ width: 13, height: 13 }} className="animate-spin" /> Valuing...</> : <><Search style={{ width: 13, height: 13 }} /> Get Valuation</>}
            </button>
          </form>
        </div>
      </div>

      {data && (
        <div className="p11-card">
          <div className="p11-card-header">
            <div className="p11-card-title">
              <DollarSign style={{ width: 14, height: 14, color: 'var(--g-600)' }} />
              Valuation Result — {make} {model} ({year})
            </div>
          </div>
          <div className="p11-card-body">
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div style={{ padding: '12px', background: 'var(--g-50)', borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Estimated Value</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>
                  USD {(data.estimatedValue / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <div style={{ padding: '12px', background: 'var(--g-50)', borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Confidence</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--g-700)' }}>
                  {data.confidence}%
                </div>
              </div>
              <div style={{ padding: '12px', background: 'var(--g-50)', borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Source</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                  {data.source}
                </div>
              </div>
            </div>
            {data.factors && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                Base value: <strong>USD {(data.factors.baseValue / 100).toLocaleString()}</strong>
                {data.factors.conditionAdjustment !== 0 && <> · Condition adj: {data.factors.conditionAdjustment > 0 ? '+' : ''}{(data.factors.conditionAdjustment / 100).toLocaleString()}</>}
                {data.factors.ageAdjustment !== 0 && <> · Age adj: {data.factors.ageAdjustment > 0 ? '+' : ''}{(data.factors.ageAdjustment / 100).toLocaleString()}</>}
              </div>
            )}
            {data.comparables && data.comparables.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 12px', background: 'var(--g-50)', borderRadius: 6 }}>
                Based on {data.comparables.length} comparable{data.comparables.length !== 1 ? 's' : ''} · Valuation date: {new Date(data.valuationDate).toLocaleDateString()}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
