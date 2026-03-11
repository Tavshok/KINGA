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
  Trash2, Download, Calendar, Phone, Mail, User, Building2
} from "lucide-react";

export default function KingaAgency() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("quotations");
  const [showNewQuoteForm, setShowNewQuoteForm] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-white to-accent/5">
      {/* Header */}
      <header className="bg-white/80 dark:bg-card/80 backdrop-blur-sm border-b shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setLocation("/portal")}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Portal Hub
              </Button>
              <div className="h-6 w-px bg-gray-300" />
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-gray-900 dark:text-foreground">KINGA Agency</h1>
                  <p className="text-xs text-muted-foreground">Insurance Quotations & Renewals</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={() => setShowNewQuoteForm(true)} className="bg-emerald-600 hover:bg-emerald-700">
                <Plus className="h-4 w-4 mr-2" />
                Request Quote
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full max-w-md grid-cols-3 mb-8">
            <TabsTrigger value="quotations">
              <FileText className="h-4 w-4 mr-2" />
              Quotations
            </TabsTrigger>
            <TabsTrigger value="policies">
              <Shield className="h-4 w-4 mr-2" />
              Policies
            </TabsTrigger>
            <TabsTrigger value="documents">
              <Upload className="h-4 w-4 mr-2" />
              Documents
            </TabsTrigger>
          </TabsList>

          <TabsContent value="quotations">
            <QuotationsTab />
          </TabsContent>

          <TabsContent value="policies">
            <PoliciesTab />
          </TabsContent>

          <TabsContent value="documents">
            <DocumentsTab />
          </TabsContent>
        </Tabs>
      </main>

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
                      ${(q.quotedPremium / 100).toFixed(2)}/mo
                    </p>
                    {q.quotedAnnualPremium && (
                      <p className="text-xs text-muted-foreground">
                        ${(q.quotedAnnualPremium / 100).toFixed(2)}/year
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
          </CardContent>
        </Card>
      ))}
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
                  Premium: ${(p.premiumAmount / 100).toFixed(2)}/{p.premiumFrequency}
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
                s <= step ? "bg-emerald-600 text-white" : "bg-gray-200 text-gray-500 dark:text-muted-foreground"
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
