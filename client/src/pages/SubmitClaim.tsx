import { useState, useCallback } from "react";
import { validateMileageInput } from "@shared/mileageValidation";
import { validateVehicleYear, vehicleYearMax, VEHICLE_YEAR_MIN } from "@shared/vehicleYearValidation";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  FileText, Upload, Loader2, CheckCircle, ArrowLeft, Sparkles,
  User, Car, AlertTriangle, Camera, Building2, FileUp, X, Eye,
  Shield, Phone, Mail, MapPin, Clock, Scale
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";

type LodgerType = "self" | "broker" | "agent" | "company_rep" | "family_member" | "legal_rep" | "other";
type IncidentType = "collision" | "theft" | "hail" | "fire" | "vandalism" | "flood" | "hijacking" | "other";

interface SupportingDoc {
  type: string;
  url: string;
  fileName: string;
}

const LODGER_LABELS: Record<LodgerType, string> = {
  self: "I am the insured claimant",
  broker: "Insurance Broker",
  agent: "Insurance Agent",
  company_rep: "Company Representative",
  family_member: "Family Member",
  legal_rep: "Legal Representative",
  other: "Other",
};

const INCIDENT_LABELS: Record<IncidentType, string> = {
  collision: "Collision / Accident",
  theft: "Theft",
  hail: "Hail Damage",
  fire: "Fire",
  vandalism: "Vandalism",
  flood: "Flood Damage",
  hijacking: "Hijacking",
  other: "Other",
};

const DOC_TYPE_LABELS: Record<string, string> = {
  claim_form: "Claim Form",
  registration_book: "Vehicle Registration Book (NaTIS)",
  licence_disc: "Licence Disc",
  id_document: "ID Document / Driver's Licence",
  police_report: "Police Report",
  accident_report: "Accident Report",
  other: "Other Document",
};

export default function SubmitClaim() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [claimNumber, setClaimNumber] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractedDocs, setExtractedDocs] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState(1);
  const [mileageError, setMileageError] = useState<string | null>(null);
  const [yearWarning, setYearWarning] = useState<string | null>(null);

  // Form state - comprehensive
  const [formData, setFormData] = useState({
    // Lodger info
    lodgedBy: "self" as LodgerType,
    lodgerName: "",
    lodgerPhone: "",
    lodgerEmail: "",
    lodgerCompany: "",
    lodgerReference: "",
    lodgerRelationship: "",

    // Claimant personal details
    claimantName: user?.name || "",
    claimantIdNumber: "",
    claimantPhone: "",
    claimantEmail: user?.email || "",
    claimantAddress: "",

    // Vehicle info
    vehicleMake: "",
    vehicleModel: "",
    vehicleYear: new Date().getFullYear(),
    vehicleRegistration: "",
    vehicleVin: "",
    vehicleColor: "",
    vehicleMileage: "",

    // Reg book details
    vehicleEngineNumber: "",
    vehicleGvm: "",
    vehicleTareWeight: "",
    vehicleEngineCapacity: "",
    vehicleFuelType: "",
    vehicleFirstRegistrationDate: "",
    vehicleOwnerName: "",
    vehicleLicenceExpiryDate: "",

    // Policy
    policyNumber: "",

    // Incident
    incidentDate: "",
    incidentTime: "",
    incidentLocation: "",
    incidentDescription: "",
    incidentType: "" as IncidentType | "",

    // Third party
    thirdPartyName: "",
    thirdPartyVehicle: "",
    thirdPartyRegistration: "",
    thirdPartyInsurer: "",

    // Police
    policeReportNumber: "",
    policeStation: "",

    // Witness
    witnessName: "",
    witnessPhone: "",

    // Photos & docs
    damagePhotos: [] as string[],
    supportingDocuments: [] as SupportingDoc[],
    // Structured 3-choice panel beater selection (marketplace_profile UUIDs)
    panelBeaterChoice1: "",
    panelBeaterChoice2: "",
    panelBeaterChoice3: "",
    // Keep legacy array for UI toggle helper
    selectedPanelBeaterIds: [] as string[],
  });

  // Governance-aware panel beater query:
  // Only loads panel beaters that are:
  //   1. Platform-approved (marketplace_profiles.approval_status = 'approved')
  //   2. Insurer SLA-approved (insurer_marketplace_relationships.relationship_status = 'approved')
  const insurerTenantId = user?.tenantId ?? "";
  const { data: panelBeatersData, isLoading: panelBeatersLoading } = trpc.marketplace.getApprovedPanelBeaters.useQuery(
    { insurerTenantId },
    { enabled: !!insurerTenantId }
  );
  const panelBeaters = panelBeatersData?.panelBeaters ?? [];
  const uploadImage = trpc.storage.uploadImage.useMutation();
  const extractFromDoc = trpc.claims.extractFromDocument.useMutation();

  const submitClaim = trpc.claims.submit.useMutation({
    onSuccess: (data) => {
      setClaimNumber(data.claimNumber);
      setSubmitted(true);
      toast.success("Claim submitted successfully!");
    },
    onError: (error) => {
      // Surface exact governance rejection messages from the server
      const msg = error.message;
      if (
        msg.includes("not approved by your insurer") ||
        msg.includes("distinct repairers") ||
        msg.includes("insurer for exception")
      ) {
        toast.error(msg, { duration: 8000 });
      } else {
        toast.error(`Failed to submit claim: ${msg}`);
      }
    },
  });

  const updateField = useCallback((field: string, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  // Handle document upload for AI extraction
  const handleDocumentExtract = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setExtracting(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        toast.info(`Analyzing ${file.name}...`);

        const reader = new FileReader();
        const fileData = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const extracted = await extractFromDoc.mutateAsync({
          fileData,
          fileName: file.name,
          mimeType: file.type,
        });

        // Auto-fill form fields from extracted data (only fill empty fields)
        setFormData(prev => {
          const updated = { ...prev };

          // Vehicle info
          if (extracted.vehicleMake && !prev.vehicleMake) updated.vehicleMake = extracted.vehicleMake;
          if (extracted.vehicleModel && !prev.vehicleModel) updated.vehicleModel = extracted.vehicleModel;
          if (extracted.vehicleYear && !prev.vehicleYear) updated.vehicleYear = extracted.vehicleYear;
          if (extracted.vehicleRegistration && !prev.vehicleRegistration) updated.vehicleRegistration = extracted.vehicleRegistration;
          if (extracted.vehicleVin && !prev.vehicleVin) updated.vehicleVin = extracted.vehicleVin;
          if (extracted.vehicleColor && !prev.vehicleColor) updated.vehicleColor = extracted.vehicleColor;
          if (extracted.vehicleMileage && !prev.vehicleMileage) updated.vehicleMileage = extracted.vehicleMileage;

          // Reg book details
          if (extracted.vehicleEngineNumber && !prev.vehicleEngineNumber) updated.vehicleEngineNumber = extracted.vehicleEngineNumber;
          if (extracted.vehicleGvm && !prev.vehicleGvm) updated.vehicleGvm = extracted.vehicleGvm;
          if (extracted.vehicleTareWeight && !prev.vehicleTareWeight) updated.vehicleTareWeight = extracted.vehicleTareWeight;
          if (extracted.vehicleEngineCapacity && !prev.vehicleEngineCapacity) updated.vehicleEngineCapacity = extracted.vehicleEngineCapacity;
          if (extracted.vehicleFuelType && !prev.vehicleFuelType) updated.vehicleFuelType = extracted.vehicleFuelType;
          if (extracted.vehicleFirstRegistrationDate && !prev.vehicleFirstRegistrationDate) updated.vehicleFirstRegistrationDate = extracted.vehicleFirstRegistrationDate;
          if (extracted.vehicleOwnerName && !prev.vehicleOwnerName) updated.vehicleOwnerName = extracted.vehicleOwnerName;
          if (extracted.vehicleLicenceExpiryDate && !prev.vehicleLicenceExpiryDate) updated.vehicleLicenceExpiryDate = extracted.vehicleLicenceExpiryDate;

          // Claimant info
          if (extracted.claimantName && !prev.claimantName) updated.claimantName = extracted.claimantName;
          if (extracted.claimantIdNumber && !prev.claimantIdNumber) updated.claimantIdNumber = extracted.claimantIdNumber;
          if (extracted.claimantPhone && !prev.claimantPhone) updated.claimantPhone = extracted.claimantPhone;
          if (extracted.claimantEmail && !prev.claimantEmail) updated.claimantEmail = extracted.claimantEmail;
          if (extracted.claimantAddress && !prev.claimantAddress) updated.claimantAddress = extracted.claimantAddress;

          // Policy
          if (extracted.policyNumber && !prev.policyNumber) updated.policyNumber = extracted.policyNumber;

          // Incident
          if (extracted.incidentDate && !prev.incidentDate) updated.incidentDate = extracted.incidentDate;
          if (extracted.incidentTime && !prev.incidentTime) updated.incidentTime = extracted.incidentTime;
          if (extracted.incidentLocation && !prev.incidentLocation) updated.incidentLocation = extracted.incidentLocation;
          if (extracted.incidentDescription && !prev.incidentDescription) updated.incidentDescription = extracted.incidentDescription;
          if (extracted.incidentType && !prev.incidentType) updated.incidentType = extracted.incidentType as IncidentType;

          // Third party
          if (extracted.thirdPartyName && !prev.thirdPartyName) updated.thirdPartyName = extracted.thirdPartyName;
          if (extracted.thirdPartyVehicle && !prev.thirdPartyVehicle) updated.thirdPartyVehicle = extracted.thirdPartyVehicle;
          if (extracted.thirdPartyRegistration && !prev.thirdPartyRegistration) updated.thirdPartyRegistration = extracted.thirdPartyRegistration;
          if (extracted.thirdPartyInsurer && !prev.thirdPartyInsurer) updated.thirdPartyInsurer = extracted.thirdPartyInsurer;

          // Police
          if (extracted.policeReportNumber && !prev.policeReportNumber) updated.policeReportNumber = extracted.policeReportNumber;
          if (extracted.policeStation && !prev.policeStation) updated.policeStation = extracted.policeStation;

          // Witness
          if (extracted.witnessName && !prev.witnessName) updated.witnessName = extracted.witnessName;
          if (extracted.witnessPhone && !prev.witnessPhone) updated.witnessPhone = extracted.witnessPhone;

          // Store the document URL
          if (extracted.rawDocumentUrl) {
            updated.supportingDocuments = [
              ...prev.supportingDocuments,
              { type: extracted.documentType, url: extracted.rawDocumentUrl, fileName: file.name }
            ];
          }

          return updated;
        });

        setExtractedDocs(prev => [...prev, `${file.name} (${extracted.documentType}, ${extracted.confidence}% confidence)`]);

        const filledCount = Object.entries(extracted)
          .filter(([k, v]) => v !== null && !["extractionNotes", "rawDocumentUrl", "confidence", "documentType", "uploadedDocumentTypes"].includes(k))
          .length;

        toast.success(`Extracted ${filledCount} fields from ${file.name}`);

        if (extracted.extractionNotes?.length > 0) {
          extracted.extractionNotes.forEach((note: string) => {
            toast.info(note, { duration: 5000 });
          });
        }
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Failed to extract document data: ${errMsg}`);
    } finally {
      setExtracting(false);
      // Reset file input
      e.target.value = "";
    }
  };

  // Handle damage photo upload
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const uploadedUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const reader = new FileReader();
        const fileData = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const result = await uploadImage.mutateAsync({
          fileName: file.name,
          fileData,
          contentType: file.type,
        });
        uploadedUrls.push(result.url);
      }
      setFormData(prev => ({
        ...prev,
        damagePhotos: [...prev.damagePhotos, ...uploadedUrls],
      }));
      toast.success(`${files.length} photo(s) uploaded`);
    } catch {
      toast.error("Failed to upload photos");
    } finally {
      setUploading(false);
    }
  };

  // Handle supporting document upload (no AI extraction, just storage)
  const handleSupportingDocUpload = async (e: React.ChangeEvent<HTMLInputElement>, docType: string) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const reader = new FileReader();
        const fileData = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const result = await uploadImage.mutateAsync({
          fileName: file.name,
          fileData,
          contentType: file.type,
        });

        setFormData(prev => ({
          ...prev,
          supportingDocuments: [...prev.supportingDocuments, { type: docType, url: result.url, fileName: file.name }],
        }));
      }
      toast.success("Document uploaded");
    } catch {
      toast.error("Failed to upload document");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handlePanelBeaterToggle = (id: string) => {
    setFormData(prev => {
      const current = prev.selectedPanelBeaterIds;
      let next: string[];
      if (current.includes(id)) {
        next = current.filter(pbId => pbId !== id);
      } else if (current.length < 3) {
        next = [...current, id];
      } else {
        toast.error("You can only select up to 3 panel beaters");
        return prev;
      }
      return {
        ...prev,
        selectedPanelBeaterIds: next,
        panelBeaterChoice1: next[0] ?? "",
        panelBeaterChoice2: next[1] ?? "",
        panelBeaterChoice3: next[2] ?? "",
      };
    });
  };

  const removePhoto = (index: number) => {
    setFormData(prev => ({
      ...prev,
      damagePhotos: prev.damagePhotos.filter((_, i) => i !== index),
    }));
  };

  const removeDoc = (index: number) => {
    setFormData(prev => ({
      ...prev,
      supportingDocuments: prev.supportingDocuments.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.damagePhotos.length === 0) {
      toast.error("Please upload at least one damage photo");
      return;
    }
    if (formData.selectedPanelBeaterIds.length !== 3) {
      toast.error("Please select exactly 3 panel beaters");
      return;
    }
    // Client-side duplicate guard (server also validates)
    const uniqueChoices = new Set(formData.selectedPanelBeaterIds);
    if (uniqueChoices.size !== 3) {
      toast.error("All three panel beater selections must be different. Please choose 3 distinct repairers.");
      return;
    }
    if (!formData.vehicleMake || !formData.vehicleModel || !formData.vehicleRegistration) {
      toast.error("Please fill in all required vehicle information");
      return;
    }
    if (!formData.incidentDate || !formData.incidentDescription || !formData.incidentLocation) {
      toast.error("Please fill in all required incident details");
      return;
    }

    // Mileage validation — must be numeric or blank
    const mileageResult = validateMileageInput(formData.vehicleMileage);
    if (!mileageResult.ok) {
      setMileageError(mileageResult.reason);
      toast.error(mileageResult.reason);
      return;
    }
    setMileageError(null);

    submitClaim.mutate({
      vehicleMake: formData.vehicleMake,
      vehicleModel: formData.vehicleModel,
      vehicleYear: formData.vehicleYear,
      vehicleRegistration: formData.vehicleRegistration,
      incidentDate: formData.incidentDate,
      incidentDescription: formData.incidentDescription,
      incidentLocation: formData.incidentLocation,
      policyNumber: formData.policyNumber,
      damagePhotos: formData.damagePhotos,
      vehicleMileage: formData.vehicleMileage.trim() || undefined,
      panelBeaterChoice1: formData.panelBeaterChoice1,
      panelBeaterChoice2: formData.panelBeaterChoice2,
      panelBeaterChoice3: formData.panelBeaterChoice3,
    });
  };

  const totalSteps = 6;

  // Success screen
  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50">
        <header className="bg-white dark:bg-card border-b shadow-sm">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center gap-3">
              <Shield className="h-8 w-8 text-emerald-600" />
              <div>
                <h1 className="text-2xl font-bold">KINGA AI</h1>
                <p className="text-sm text-muted-foreground">Claim Submitted Successfully</p>
              </div>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8">
          <Card className="max-w-2xl mx-auto">
            <CardHeader className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center">
                <CheckCircle className="h-8 w-8 text-emerald-600" />
              </div>
              <CardTitle className="text-2xl">Claim Submitted Successfully!</CardTitle>
              <CardDescription>Your claim has been received and is being processed</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-4 rounded-lg text-center">
                <p className="text-sm text-muted-foreground mb-1">Claim Number</p>
                <p className="text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-300">{claimNumber}</p>
              </div>

              <div className="space-y-2 text-sm text-muted-foreground">
                <p>&#10003; Your claim has been submitted to the insurer for triage</p>
                <p>&#10003; AI fraud detection and physics validation will be performed</p>
                <p>&#10003; Selected panel beaters will be notified for quotes</p>
                <p>&#10003; You will receive updates on your dashboard</p>
              </div>

              <div className="flex gap-3">
                <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => setLocation("/claimant/dashboard")}>
                  View My Claims
                </Button>
                <Button variant="outline" onClick={() => window.location.reload()}>
                  Submit Another Claim
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50">
      <header className="bg-white dark:bg-card border-b shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="h-8 w-8 text-emerald-600" />
              <div>
                <h1 className="text-2xl font-bold">KINGA - Submit New Claim</h1>
                <p className="text-sm text-muted-foreground">File an insurance claim for vehicle damage</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setLocation("/claimant/dashboard")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-1 mt-4">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i + 1 <= currentStep ? "bg-emerald-500" : "bg-gray-200"
                }`}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Step {currentStep} of {totalSteps}</p>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-6">

          {/* STEP 0: AI Document Upload (always visible) */}
          <Card className="border-emerald-200 dark:border-emerald-800 bg-gradient-to-r from-emerald-50 to-teal-50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-emerald-600" />
                <CardTitle className="text-emerald-800 dark:text-emerald-200">Quick Fill with AI</CardTitle>
              </div>
              <CardDescription>
                Upload your claim form, vehicle registration book, licence disc, or ID document.
                Our AI will extract the details and auto-fill the form for you.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border-2 border-dashed border-emerald-300 dark:border-emerald-700 rounded-lg p-6 text-center bg-white/50 dark:bg-card/50">
                <FileUp className="h-10 w-10 mx-auto mb-3 text-emerald-500" />
                <Label htmlFor="docExtract" className="cursor-pointer">
                  <span className="text-emerald-600 font-medium hover:underline">Upload documents for AI extraction</span>
                </Label>
                <Input
                  id="docExtract"
                  type="file"
                  multiple
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={handleDocumentExtract}
                  disabled={extracting}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Supports: Claim forms, Registration books, Licence discs, ID documents, Police reports
                </p>
              </div>

              {extracting && (
                <div className="flex items-center justify-center gap-2 p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                  <span className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">AI is analyzing your document...</span>
                </div>
              )}

              {extractedDocs.length > 0 && (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Extracted documents:</p>
                  {extractedDocs.map((doc, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-emerald-600">
                      <CheckCircle className="h-3 w-3" />
                      <span>{doc}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* STEP 1: Who is filing? */}
          <Card className={currentStep >= 1 ? "" : "opacity-50"}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-emerald-600" />
                <CardTitle>Step 1: Who is Filing This Claim?</CardTitle>
              </div>
              <CardDescription>
                A broker, agent, company representative, or family member can file on behalf of the insured
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Filing as *</Label>
                <Select
                  value={formData.lodgedBy}
                  onValueChange={(v) => {
                    updateField("lodgedBy", v);
                    if (currentStep < 2) setCurrentStep(2);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select who is filing" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(LODGER_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {formData.lodgedBy !== "self" && (
                <div className="space-y-4 p-4 bg-primary/5 rounded-lg border border-primary/20">
                  <p className="text-sm font-medium text-secondary">
                    Representative Details ({LODGER_LABELS[formData.lodgedBy]})
                  </p>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Representative Name *</Label>
                      <Input
                        value={formData.lodgerName}
                        onChange={(e) => updateField("lodgerName", e.target.value)}
                        placeholder="Full name"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone Number</Label>
                      <Input
                        value={formData.lodgerPhone}
                        onChange={(e) => updateField("lodgerPhone", e.target.value)}
                        placeholder="e.g., 011 123 4567"
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={formData.lodgerEmail}
                        onChange={(e) => updateField("lodgerEmail", e.target.value)}
                        placeholder="email@example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{formData.lodgedBy === "broker" ? "Brokerage Firm" : formData.lodgedBy === "company_rep" ? "Company Name" : formData.lodgedBy === "legal_rep" ? "Law Firm" : "Organization"}</Label>
                      <Input
                        value={formData.lodgerCompany}
                        onChange={(e) => updateField("lodgerCompany", e.target.value)}
                        placeholder="Company / firm name"
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{formData.lodgedBy === "broker" ? "Broker Reference" : formData.lodgedBy === "agent" ? "Agent Code" : "Reference Number"}</Label>
                      <Input
                        value={formData.lodgerReference}
                        onChange={(e) => updateField("lodgerReference", e.target.value)}
                        placeholder="Reference / code"
                      />
                    </div>
                    {formData.lodgedBy === "other" && (
                      <div className="space-y-2">
                        <Label>Relationship to Claimant *</Label>
                        <Input
                          value={formData.lodgerRelationship}
                          onChange={(e) => updateField("lodgerRelationship", e.target.value)}
                          placeholder="e.g., Neighbour, Employer"
                          required
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              <Separator />

              <p className="text-sm font-medium">Insured Claimant Details</p>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Full Name *</Label>
                  <Input
                    required
                    value={formData.claimantName}
                    onChange={(e) => updateField("claimantName", e.target.value)}
                    placeholder="Full name of insured person"
                  />
                </div>
                <div className="space-y-2">
                  <Label>National ID / Passport Number</Label>
                  <Input
                    value={formData.claimantIdNumber}
                    onChange={(e) => updateField("claimantIdNumber", e.target.value)}
                    placeholder="13-digit ID number"
                    maxLength={13}
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label><Phone className="inline h-3 w-3 mr-1" />Phone</Label>
                  <Input
                    value={formData.claimantPhone}
                    onChange={(e) => updateField("claimantPhone", e.target.value)}
                    placeholder="e.g., 082 123 4567"
                  />
                </div>
                <div className="space-y-2">
                  <Label><Mail className="inline h-3 w-3 mr-1" />Email</Label>
                  <Input
                    type="email"
                    value={formData.claimantEmail}
                    onChange={(e) => updateField("claimantEmail", e.target.value)}
                    placeholder="email@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label><MapPin className="inline h-3 w-3 mr-1" />Address</Label>
                  <Input
                    value={formData.claimantAddress}
                    onChange={(e) => updateField("claimantAddress", e.target.value)}
                    placeholder="Physical address"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* STEP 2: Vehicle Information */}
          <Card className={currentStep >= 2 ? "" : "opacity-50"}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Car className="h-5 w-5 text-emerald-600" />
                <CardTitle>Step 2: Vehicle Information</CardTitle>
              </div>
              <CardDescription>
                Vehicle details and registration book information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Make *</Label>
                  <Input
                    required
                    value={formData.vehicleMake}
                    onChange={(e) => { updateField("vehicleMake", e.target.value); if (currentStep < 3) setCurrentStep(3); }}
                    placeholder="e.g., Toyota"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Model *</Label>
                  <Input
                    required
                    value={formData.vehicleModel}
                    onChange={(e) => updateField("vehicleModel", e.target.value)}
                    placeholder="e.g., Hilux"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Year *</Label>
                  <Input
                    type="number"
                    required
                    value={formData.vehicleYear || ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const parsed = parseInt(raw) || 0;
                      updateField("vehicleYear", parsed);
                      if (raw === "" || raw === "0") {
                        setYearWarning(null);
                      } else {
                        const result = validateVehicleYear(parsed);
                        if (!result.valid) {
                          setYearWarning(result.reason);
                        } else {
                          setYearWarning(null);
                        }
                      }
                    }}
                    min={VEHICLE_YEAR_MIN}
                    max={vehicleYearMax()}
                    className={yearWarning ? "border-amber-500 focus-visible:ring-amber-500" : ""}
                  />
                  {yearWarning ? (
                    <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      {yearWarning}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Model year ({VEHICLE_YEAR_MIN}–{vehicleYearMax()})
                    </p>
                  )}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Registration Number *</Label>
                  <Input
                    required
                    value={formData.vehicleRegistration}
                    onChange={(e) => updateField("vehicleRegistration", e.target.value)}
                    placeholder="e.g., ABC 123 GP"
                  />
                </div>
                <div className="space-y-2">
                  <Label>VIN / Chassis Number</Label>
                  <Input
                    value={formData.vehicleVin}
                    onChange={(e) => updateField("vehicleVin", e.target.value)}
                    placeholder="17-character VIN"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Colour</Label>
                  <Input
                    value={formData.vehicleColor}
                    onChange={(e) => updateField("vehicleColor", e.target.value)}
                    placeholder="e.g., White"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Odometer Reading (km)</Label>
                  <Input
                    value={formData.vehicleMileage}
                    onChange={(e) => {
                      updateField("vehicleMileage", e.target.value);
                      // Clear error as user types
                      if (mileageError) setMileageError(null);
                    }}
                    placeholder="e.g., 85000"
                    className={mileageError ? "border-destructive focus-visible:ring-destructive" : ""}
                  />
                  {mileageError ? (
                    <p className="text-xs text-destructive">{mileageError}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Numbers only, in km (e.g. 85000). Leave blank if unknown — the system will estimate.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Policy Number *</Label>
                  <Input
                    required
                    value={formData.policyNumber}
                    onChange={(e) => updateField("policyNumber", e.target.value)}
                    placeholder="Insurance policy number"
                  />
                </div>
              </div>

              {/* Registration Book Details */}
              <Separator />
              <div className="flex items-center gap-2 mb-2">
                <Scale className="h-4 w-4 text-emerald-600" />
                <p className="text-sm font-medium">Vehicle Registration Book Details (NaTIS)</p>
                <Badge variant="outline" className="text-xs">Optional</Badge>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Engine Number</Label>
                  <Input
                    value={formData.vehicleEngineNumber}
                    onChange={(e) => updateField("vehicleEngineNumber", e.target.value)}
                    placeholder="Engine number"
                  />
                </div>
                <div className="space-y-2">
                  <Label>GVM (Gross Vehicle Mass)</Label>
                  <Input
                    value={formData.vehicleGvm}
                    onChange={(e) => updateField("vehicleGvm", e.target.value)}
                    placeholder="e.g., 2850 kg"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tare Weight</Label>
                  <Input
                    value={formData.vehicleTareWeight}
                    onChange={(e) => updateField("vehicleTareWeight", e.target.value)}
                    placeholder="e.g., 1850 kg"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Engine Capacity</Label>
                  <Input
                    value={formData.vehicleEngineCapacity}
                    onChange={(e) => updateField("vehicleEngineCapacity", e.target.value)}
                    placeholder="e.g., 2400cc"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Fuel Type</Label>
                  <Select
                    value={formData.vehicleFuelType || "none"}
                    onValueChange={(v) => updateField("vehicleFuelType", v === "none" ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select fuel type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not specified</SelectItem>
                      <SelectItem value="petrol">Petrol</SelectItem>
                      <SelectItem value="diesel">Diesel</SelectItem>
                      <SelectItem value="hybrid">Hybrid</SelectItem>
                      <SelectItem value="electric">Electric</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>First Registration Date</Label>
                  <Input
                    type="date"
                    value={formData.vehicleFirstRegistrationDate}
                    onChange={(e) => updateField("vehicleFirstRegistrationDate", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Registered Owner (from reg book)</Label>
                  <Input
                    value={formData.vehicleOwnerName}
                    onChange={(e) => updateField("vehicleOwnerName", e.target.value)}
                    placeholder="Name on registration"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Licence Expiry Date</Label>
                  <Input
                    type="date"
                    value={formData.vehicleLicenceExpiryDate}
                    onChange={(e) => updateField("vehicleLicenceExpiryDate", e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* STEP 3: Incident Details */}
          <Card className={currentStep >= 3 ? "" : "opacity-50"}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-emerald-600" />
                <CardTitle>Step 3: Incident Details</CardTitle>
              </div>
              <CardDescription>What happened and when</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Incident Type *</Label>
                  <Select
                    value={formData.incidentType || "none"}
                    onValueChange={(v) => { updateField("incidentType", v === "none" ? "" : v); if (currentStep < 4) setCurrentStep(4); }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select type...</SelectItem>
                      {Object.entries(INCIDENT_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Date of Incident *</Label>
                  <Input
                    type="date"
                    required
                    value={formData.incidentDate}
                    onChange={(e) => updateField("incidentDate", e.target.value)}
                    max={new Date().toISOString().split("T")[0]}
                  />
                </div>
                <div className="space-y-2">
                  <Label><Clock className="inline h-3 w-3 mr-1" />Time of Incident</Label>
                  <Input
                    type="time"
                    value={formData.incidentTime}
                    onChange={(e) => updateField("incidentTime", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label><MapPin className="inline h-3 w-3 mr-1" />Location *</Label>
                <Input
                  required
                  value={formData.incidentLocation}
                  onChange={(e) => updateField("incidentLocation", e.target.value)}
                  placeholder="Where did the incident occur? (street, suburb, city)"
                />
              </div>

              <div className="space-y-2">
                <Label>Description *</Label>
                <Textarea
                  required
                  value={formData.incidentDescription}
                  onChange={(e) => updateField("incidentDescription", e.target.value)}
                  placeholder="Please describe in detail what happened..."
                  rows={4}
                />
              </div>

              {/* Third Party */}
              {(formData.incidentType === "collision" || formData.incidentType === "") && (
                <>
                  <Separator />
                  <p className="text-sm font-medium">Third Party Details (if applicable)</p>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Third Party Name</Label>
                      <Input
                        value={formData.thirdPartyName}
                        onChange={(e) => updateField("thirdPartyName", e.target.value)}
                        placeholder="Other driver's name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Third Party Vehicle</Label>
                      <Input
                        value={formData.thirdPartyVehicle}
                        onChange={(e) => updateField("thirdPartyVehicle", e.target.value)}
                        placeholder="e.g., White Toyota Corolla"
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Third Party Registration</Label>
                      <Input
                        value={formData.thirdPartyRegistration}
                        onChange={(e) => updateField("thirdPartyRegistration", e.target.value)}
                        placeholder="e.g., XYZ 789 GP"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Third Party Insurer</Label>
                      <Input
                        value={formData.thirdPartyInsurer}
                        onChange={(e) => updateField("thirdPartyInsurer", e.target.value)}
                        placeholder="Their insurance company"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Police Report */}
              <Separator />
              <p className="text-sm font-medium">Police Report</p>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Case / Report Number</Label>
                  <Input
                    value={formData.policeReportNumber}
                    onChange={(e) => updateField("policeReportNumber", e.target.value)}
                    placeholder="SAPS case number"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Police Station</Label>
                  <Input
                    value={formData.policeStation}
                    onChange={(e) => updateField("policeStation", e.target.value)}
                    placeholder="Station name"
                  />
                </div>
              </div>

              {/* Witness */}
              <Separator />
              <p className="text-sm font-medium">Witness Details</p>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Witness Name</Label>
                  <Input
                    value={formData.witnessName}
                    onChange={(e) => updateField("witnessName", e.target.value)}
                    placeholder="Witness full name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Witness Phone</Label>
                  <Input
                    value={formData.witnessPhone}
                    onChange={(e) => updateField("witnessPhone", e.target.value)}
                    placeholder="Witness contact number"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* STEP 4: Damage Photos */}
          <Card className={currentStep >= 4 ? "" : "opacity-50"}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Camera className="h-5 w-5 text-emerald-600" />
                <CardTitle>Step 4: Damage Photos *</CardTitle>
              </div>
              <CardDescription>Upload clear photos of all damage (at least 1 required)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
                <Camera className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                <Label htmlFor="photoUpload" className="cursor-pointer">
                  <span className="text-emerald-600 font-medium hover:underline">Upload damage photos</span>
                </Label>
                <Input
                  id="photoUpload"
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoUpload}
                  disabled={uploading}
                />
                <p className="text-xs text-muted-foreground mt-2">PNG, JPG up to 10MB each. Include all angles of damage.</p>
              </div>

              {uploading && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading photos...
                </div>
              )}

              {formData.damagePhotos.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{formData.damagePhotos.length} photo(s) uploaded</p>
                  <div className="grid grid-cols-4 gap-2">
                    {formData.damagePhotos.map((url, index) => (
                      <div key={index} className="relative aspect-square bg-muted rounded-lg overflow-hidden group">
                        <img src={url} alt={`Damage ${index + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removePhoto(index)}
                          className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* STEP 5: Supporting Documents */}
          <Card className={currentStep >= 4 ? "" : "opacity-50"}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-emerald-600" />
                <CardTitle>Step 5: Supporting Documents</CardTitle>
              </div>
              <CardDescription>Upload additional supporting documents (optional but recommended)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                {Object.entries(DOC_TYPE_LABELS).map(([key, label]) => {
                  const uploaded = formData.supportingDocuments.filter(d => d.type === key);
                  return (
                    <div key={key} className="p-3 border rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{label}</span>
                        {uploaded.length > 0 && (
                          <Badge variant="outline" className="text-emerald-600 border-emerald-300 dark:border-emerald-700 text-xs">
                            {uploaded.length} uploaded
                          </Badge>
                        )}
                      </div>
                      <Label htmlFor={`doc-${key}`} className="cursor-pointer">
                        <div className="flex items-center gap-2 text-xs text-emerald-600 hover:underline">
                          <Upload className="h-3 w-3" />
                          Upload {label}
                        </div>
                      </Label>
                      <Input
                        id={`doc-${key}`}
                        type="file"
                        accept="application/pdf,image/*"
                        className="hidden"
                        onChange={(e) => handleSupportingDocUpload(e, key)}
                        disabled={uploading}
                      />
                      {uploaded.map((doc, i) => (
                        <div key={i} className="flex items-center justify-between text-xs bg-muted p-1.5 rounded">
                          <span className="truncate flex-1">{doc.fileName}</span>
                          <div className="flex items-center gap-1 ml-2">
                            <a href={doc.url} target="_blank" rel="noopener noreferrer">
                              <Eye className="h-3 w-3 text-primary/80" />
                            </a>
                            <button type="button" onClick={() => removeDoc(formData.supportingDocuments.indexOf(doc))}>
                              <X className="h-3 w-3 text-red-500" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* STEP 6: Panel Beater Selection */}
          <Card className={currentStep >= 4 ? "" : "opacity-50"}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-emerald-600" />
                <CardTitle>Step 6: Select Panel Beaters *</CardTitle>
              </div>
              <CardDescription>Choose exactly 3 panel beaters to provide quotes for repairs</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {panelBeatersLoading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading approved panel beaters...
                  </div>
                )}
                {!panelBeatersLoading && panelBeaters.length === 0 && (
                  <div className="text-sm text-muted-foreground py-4 text-center border rounded-lg bg-muted/30">
                    <Building2 className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                    <p className="font-medium">No approved panel beaters available</p>
                    <p className="text-xs mt-1">Your insurer has not yet approved any panel beaters. Please contact your insurer.</p>
                  </div>
                )}
                {panelBeaters.map((pb) => (
                  <div
                    key={pb.profileId}
                    className={`flex items-start space-x-3 p-3 rounded-lg border transition-colors ${
                      formData.selectedPanelBeaterIds.includes(pb.profileId)
                        ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <Checkbox
                      id={`pb-${pb.profileId}`}
                      checked={formData.selectedPanelBeaterIds.includes(pb.profileId)}
                      onCheckedChange={() => { handlePanelBeaterToggle(pb.profileId); if (currentStep < 6) setCurrentStep(6); }}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`pb-${pb.profileId}`} className="font-medium cursor-pointer">
                          {pb.companyName}
                        </Label>
                        {!!pb.preferred && (
                          <Badge variant="secondary" className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800">
                            Preferred
                          </Badge>
                        )}
                        {!!pb.slaSigned && (
                          <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-300 dark:border-emerald-700">
                            SLA Signed
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{pb.address}</p>
                      {pb.contactPhone && <p className="text-xs text-muted-foreground">{pb.contactPhone}</p>}
                      {pb.contactEmail && <p className="text-xs text-muted-foreground">{pb.contactEmail}</p>}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-sm text-muted-foreground mt-4">
                Selected: <span className={formData.selectedPanelBeaterIds.length === 3 ? "text-emerald-600 font-medium" : ""}>
                  {formData.selectedPanelBeaterIds.length} / 3
                </span>
              </p>
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex gap-3 pb-8">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setLocation("/claimant/dashboard")}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              disabled={submitClaim.isPending || uploading || extracting}
            >
              {submitClaim.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting Claim...
                </>
              ) : (
                <>
                  <Shield className="mr-2 h-4 w-4" />
                  Submit Claim
                </>
              )}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
