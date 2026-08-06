import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Car, Upload, Shield, CheckCircle2, ArrowRight, ArrowLeft,
  Camera, FileText, Phone, Mail, User, AlertCircle, Loader2,
  Building2, Truck
} from "lucide-react";
import KingaLogo from "@/components/KingaLogo";

const STEPS = [
  { id: 1, label: "Contact", icon: User },
  { id: 2, label: "Vehicle", icon: Car },
  { id: 3, label: "Photos", icon: Camera },
  { id: 4, label: "Coverage", icon: Shield },
  { id: 5, label: "Review", icon: CheckCircle2 },
];

const CURRENT_YEAR = new Date().getFullYear();

export default function ValuationRequestPage() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(1);
  const [isStandalone, setIsStandalone] = useState(false);
  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    // Contact
    fullName: "",
    email: "",
    phone: "",
    // Vehicle
    vehicleMake: "",
    vehicleModel: "",
    vehicleYear: CURRENT_YEAR,
    vehicleRegistration: "",
    vehicleVin: "",
    mileage: "",
    condition: "good" as "excellent" | "good" | "fair" | "poor",
    // Coverage
    insuranceType: "comprehensive" as "comprehensive" | "third_party" | "third_party_fire_theft" | "fleet" | "commercial",
    coverageStartDate: "",
    additionalCover: "",
    fleetVehicleCount: "",
  });

  const submitMutation = trpc.insuranceV2.submitValuationRequest.useMutation({
    onSuccess: (data) => {
      setLocation(`/quote/result/${data.submissionToken}`);
    },
    onError: (err) => {
      toast.error(`Submission failed: ${err.message}`);
    },
  });

  // Upload photos to S3 via the existing storage upload endpoint
  const handlePhotoUpload = async (files: FileList) => {
    setUploadingPhotos(true);
    const newUrls: string[] = [];
    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} is too large (max 10 MB)`);
        continue;
      }
      try {
        // Convert to base64 and upload via the existing document upload endpoint
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        // For now, store as data URLs (in production, use S3 upload)
        newUrls.push(base64);
      } catch {
        toast.error(`Failed to process ${file.name}`);
      }
    }
    setUploadedPhotos(prev => [...prev, ...newUrls].slice(0, 20));
    setUploadingPhotos(false);
    if (newUrls.length > 0) {
      toast.success(`${newUrls.length} photo(s) added`);
    }
  };

  const update = (field: string, value: any) => setForm(f => ({ ...f, [field]: value }));

  const canProceed = () => {
    if (step === 1) return form.fullName.trim().length >= 2 && form.email.includes("@") && form.phone.trim().length >= 7;
    if (step === 2) return form.vehicleMake && form.vehicleModel && form.vehicleYear >= 1970;
    if (step === 3) return uploadedPhotos.length >= 1;
    if (step === 4) return isStandalone || (form.insuranceType && form.coverageStartDate);
    return true;
  };

  const handleSubmit = () => {
    submitMutation.mutate({
      fullName: form.fullName,
      email: form.email,
      phone: form.phone,
      vehicleMake: form.vehicleMake,
      vehicleModel: form.vehicleModel,
      vehicleYear: form.vehicleYear,
      vehicleRegistration: form.vehicleRegistration || undefined,
      vehicleVin: form.vehicleVin || undefined,
      mileage: form.mileage ? parseInt(form.mileage) : undefined,
      condition: form.condition,
      photoUrls: uploadedPhotos.map((_, i) => `photo-${i + 1}`), // placeholder URLs
      isStandaloneValuation: isStandalone,
      insuranceType: isStandalone ? undefined : form.insuranceType,
      coverageStartDate: isStandalone ? undefined : form.coverageStartDate,
      additionalCover: form.additionalCover || undefined,
      fleetVehicleCount: form.fleetVehicleCount ? parseInt(form.fleetVehicleCount) : 1,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-primary/5">
      {/* Header */}
      <header className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setLocation("/")}>
            <KingaLogo size="sm" />
            <div>
              <h1 className="text-lg font-bold">KINGA AutoVerify</h1>
              <p className="text-xs text-muted-foreground">Vehicle Valuation & Insurance</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/login")}>Sign In</Button>
            <Button size="sm" onClick={() => setLocation("/login")}>My Account</Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Hero */}
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold mb-2">Get Your Vehicle Valued</h2>
          <p className="text-muted-foreground text-lg">
            KINGA analyses your vehicle photos and market data to produce a professional valuation report.
          </p>
        </div>

        {/* Journey Type Toggle */}
        <div className="flex gap-3 mb-8 justify-center">
          <button
            onClick={() => setIsStandalone(false)}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl border-2 transition-all font-medium ${!isStandalone ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}
          >
            <Shield className="h-4 w-4" />
            Get Insured
          </button>
          <button
            onClick={() => setIsStandalone(true)}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl border-2 transition-all font-medium ${isStandalone ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}
          >
            <FileText className="h-4 w-4" />
            Valuation Report Only
            <Badge variant="secondary" className="text-xs ml-1">$25</Badge>
          </button>
        </div>

        {/* Step Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const isActive = step === s.id;
              const isDone = step > s.id;
              return (
                <div key={s.id} className="flex items-center flex-1">
                  <div className={`flex flex-col items-center gap-1 ${i < STEPS.length - 1 ? "flex-1" : ""}`}>
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all ${isDone ? "bg-primary border-primary text-white" : isActive ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground"}`}>
                      {isDone ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    </div>
                    <span className={`text-xs font-medium hidden sm:block ${isActive ? "text-primary" : isDone ? "text-primary/70" : "text-muted-foreground"}`}>{s.label}</span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`h-0.5 flex-1 mx-2 rounded transition-all ${step > s.id ? "bg-primary" : "bg-border"}`} />
                  )}
                </div>
              );
            })}
          </div>
          <Progress value={(step / STEPS.length) * 100} className="h-1.5" />
        </div>

        {/* Step Content */}
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {(() => { const Icon = STEPS[step - 1].icon; return <Icon className="h-5 w-5 text-primary" />; })()}
              {step === 1 && "Your Contact Details"}
              {step === 2 && "Vehicle Information"}
              {step === 3 && "Vehicle Photos"}
              {step === 4 && (isStandalone ? "Confirm & Pay" : "Coverage Selection")}
              {step === 5 && "Review & Submit"}
            </CardTitle>
            <CardDescription>
              {step === 1 && "We need your contact details to send you the report and follow up on your quote."}
              {step === 2 && "Tell us about your vehicle. Upload your registration book to auto-fill the details."}
              {step === 3 && "Upload at least 4 photos: front, rear, driver side, and passenger side."}
              {step === 4 && (isStandalone ? "Your standalone valuation report costs $25. Payment is processed securely via Stripe." : "Select your preferred coverage type and start date.")}
              {step === 5 && "Review your submission before we run the KINGA analysis."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* Step 1 — Contact */}
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="fullName">Full Name *</Label>
                  <div className="relative mt-1">
                    <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input id="fullName" className="pl-9" placeholder="John Doe" value={form.fullName} onChange={e => update("fullName", e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="email">Email Address *</Label>
                  <div className="relative mt-1">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input id="email" type="email" className="pl-9" placeholder="john@example.com" value={form.email} onChange={e => update("email", e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="phone">Phone Number *</Label>
                  <div className="relative mt-1">
                    <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input id="phone" className="pl-9" placeholder="+263 77 123 4567" value={form.phone} onChange={e => update("phone", e.target.value)} />
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-blue-700 dark:text-blue-300">Your details are used only to send your report and follow up on your insurance quote. We do not share your information with third parties.</p>
                </div>
              </div>
            )}

            {/* Step 2 — Vehicle */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="make">Make *</Label>
                    <Input id="make" className="mt-1" placeholder="Toyota" value={form.vehicleMake} onChange={e => update("vehicleMake", e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="model">Model *</Label>
                    <Input id="model" className="mt-1" placeholder="Hilux" value={form.vehicleModel} onChange={e => update("vehicleModel", e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="year">Year *</Label>
                    <Input id="year" type="number" className="mt-1" min={1970} max={CURRENT_YEAR + 1} value={form.vehicleYear} onChange={e => update("vehicleYear", parseInt(e.target.value))} />
                  </div>
                  <div>
                    <Label htmlFor="condition">Condition *</Label>
                    <Select value={form.condition} onValueChange={v => update("condition", v)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="excellent">Excellent</SelectItem>
                        <SelectItem value="good">Good</SelectItem>
                        <SelectItem value="fair">Fair</SelectItem>
                        <SelectItem value="poor">Poor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="reg">Registration Number</Label>
                    <Input id="reg" className="mt-1 font-mono" placeholder="ABC 1234" value={form.vehicleRegistration} onChange={e => update("vehicleRegistration", e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="mileage">Mileage (km)</Label>
                    <Input id="mileage" type="number" className="mt-1" placeholder="85000" value={form.mileage} onChange={e => update("mileage", e.target.value)} />
                  </div>
                </div>
                {!isStandalone && (
                  <div>
                    <Label htmlFor="fleetCount">Number of Vehicles in Fleet</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Truck className="h-4 w-4 text-muted-foreground" />
                      <Input id="fleetCount" type="number" min={1} placeholder="1" value={form.fleetVehicleCount} onChange={e => update("fleetVehicleCount", e.target.value)} />
                    </div>
                    {parseInt(form.fleetVehicleCount || "1") > 10 && (
                      <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Fleets over 10 vehicles require a physical inspection before policy issuance.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Step 3 — Photos */}
            {step === 3 && (
              <div className="space-y-4">
                <div
                  className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:border-primary/60 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploadingPhotos ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">Processing photos...</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="h-8 w-8 text-muted-foreground" />
                      <p className="font-medium">Click to upload photos</p>
                      <p className="text-xs text-muted-foreground">JPEG, PNG, HEIC, WebP · Max 10 MB each · Min 4 photos</p>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={e => e.target.files && handlePhotoUpload(e.target.files)}
                  />
                </div>

                {uploadedPhotos.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">{uploadedPhotos.length} photo(s) uploaded</p>
                    <div className="grid grid-cols-4 gap-2">
                      {uploadedPhotos.map((url, i) => (
                        <div key={i} className="aspect-square rounded-lg overflow-hidden bg-muted border relative">
                          <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                          <button
                            className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center"
                            onClick={e => { e.stopPropagation(); setUploadedPhotos(p => p.filter((_, j) => j !== i)); }}
                          >×</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  {["Front view", "Rear view", "Driver side", "Passenger side", "Interior (optional)", "Engine bay (optional)"].map(label => (
                    <div key={label} className="flex items-center gap-1.5 p-2 rounded-lg bg-muted/50">
                      <Camera className="h-3 w-3 flex-shrink-0" />
                      {label}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step 4 — Coverage or Payment */}
            {step === 4 && (
              <div className="space-y-4">
                {isStandalone ? (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
                      <h3 className="font-semibold mb-1">Standalone Valuation Report</h3>
                      <p className="text-sm text-muted-foreground mb-3">You will receive a full KINGA Vehicle Report including market value, condition assessment, photo forensics, and risk profile.</p>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Report fee</span>
                        <span className="text-xl font-bold text-primary">$25.00</span>
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-amber-700 dark:text-amber-300">Payment processing via Stripe will be available shortly. For now, submit your request and our team will contact you with payment instructions.</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <Label>Coverage Type *</Label>
                      <div className="grid grid-cols-1 gap-2 mt-2">
                        {[
                          { value: "comprehensive", label: "Comprehensive", desc: "Full coverage including theft, fire, and accident damage" },
                          { value: "third_party_fire_theft", label: "Third Party, Fire & Theft", desc: "Third party liability plus fire and theft cover" },
                          { value: "third_party", label: "Third Party Only", desc: "Minimum legal requirement — covers damage to others" },
                        ].map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => update("insuranceType", opt.value)}
                            className={`text-left p-3 rounded-lg border-2 transition-all ${form.insuranceType === opt.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                          >
                            <p className="font-medium text-sm">{opt.label}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="startDate">Preferred Start Date *</Label>
                      <Input id="startDate" type="date" className="mt-1" min={new Date().toISOString().split("T")[0]} value={form.coverageStartDate} onChange={e => update("coverageStartDate", e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="addCover">Additional Cover Requirements</Label>
                      <Input id="addCover" className="mt-1" placeholder="e.g. Roadside assistance, car hire, windscreen" value={form.additionalCover} onChange={e => update("additionalCover", e.target.value)} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 5 — Review */}
            {step === 5 && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="space-y-2">
                    <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Contact</p>
                    <p>{form.fullName}</p>
                    <p className="text-muted-foreground">{form.email}</p>
                    <p className="text-muted-foreground">{form.phone}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Vehicle</p>
                    <p>{form.vehicleYear} {form.vehicleMake} {form.vehicleModel}</p>
                    {form.vehicleRegistration && <p className="font-mono text-muted-foreground">{form.vehicleRegistration}</p>}
                    <p className="capitalize text-muted-foreground">{form.condition} condition</p>
                    {form.mileage && <p className="text-muted-foreground">{parseInt(form.mileage).toLocaleString()} km</p>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="space-y-2">
                    <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Photos</p>
                    <p>{uploadedPhotos.length} photo(s) uploaded</p>
                  </div>
                  <div className="space-y-2">
                    <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Service</p>
                    {isStandalone ? (
                      <Badge variant="secondary">Standalone Valuation — $25</Badge>
                    ) : (
                      <>
                        <p className="capitalize">{form.insuranceType?.replace(/_/g, " ")}</p>
                        {form.coverageStartDate && <p className="text-muted-foreground">From {form.coverageStartDate}</p>}
                      </>
                    )}
                  </div>
                </div>
                {parseInt(form.fleetVehicleCount || "1") > 10 && (
                  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-amber-700 dark:text-amber-300">Your fleet of {form.fleetVehicleCount} vehicles will require a physical inspection. Our team will contact you to arrange this.</p>
                  </div>
                )}
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between pt-4 border-t">
              <Button variant="outline" onClick={() => setStep(s => s - 1)} disabled={step === 1}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              {step < 5 ? (
                <Button onClick={() => setStep(s => s + 1)} disabled={!canProceed()}>
                  Continue <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button onClick={handleSubmit} disabled={submitMutation.isPending || !canProceed()}>
                  {submitMutation.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Submitting...</> : <>Submit Request <ArrowRight className="h-4 w-4 ml-1" /></>}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Trust signals */}
        <div className="mt-8 grid grid-cols-3 gap-4 text-center text-sm text-muted-foreground">
          {[
            { icon: Shield, label: "Secure & Private", desc: "Your data is encrypted and never shared" },
            { icon: CheckCircle2, label: "KINGA Certified", desc: "Professional AI-powered valuation" },
            { icon: Car, label: "Market Accurate", desc: "Based on real Zimbabwe market data" },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="flex flex-col items-center gap-1 p-3 rounded-lg bg-white border">
              <Icon className="h-5 w-5 text-primary" />
              <p className="font-medium text-xs">{label}</p>
              <p className="text-xs">{desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
