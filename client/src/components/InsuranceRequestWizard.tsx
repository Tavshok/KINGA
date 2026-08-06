/**
 * Phase 10 — Insurance Request Wizard
 * Multi-step wizard for submitting insurance requests across all product lines.
 * Step 1: Product selection (via InsuranceCatalogue)
 * Step 2: Product-specific intake form
 * Step 3: Review + submit
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, Send } from "lucide-react";
import InsuranceCatalogue, { INSURANCE_PRODUCTS, InsuranceProduct } from "./InsuranceCatalogue";
import { toast } from "sonner";

interface InsuranceRequestWizardProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

type Step = "catalogue" | "intake" | "review" | "done";

export default function InsuranceRequestWizard({ onSuccess, onCancel }: InsuranceRequestWizardProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("catalogue");
  const [selectedProduct, setSelectedProduct] = useState<InsuranceProduct | null>(null);

  // Common fields
  const [fullName, setFullName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState("");

  // Motor fields
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleYear, setVehicleYear] = useState(String(new Date().getFullYear()));
  const [vehicleReg, setVehicleReg] = useState("");
  const [vehicleValue, setVehicleValue] = useState("");

  // Non-motor common fields
  const [assetDescription, setAssetDescription] = useState("");
  const [assetValue, setAssetValue] = useState("");
  const [coverageAddress, setCoverageAddress] = useState("");
  const [businessType, setBusinessType] = useState("");

  // Engineering-specific
  const [projectValue, setProjectValue] = useState("");
  const [projectDuration, setProjectDuration] = useState("");

  // Bond-specific
  const [bondType, setBondType] = useState("");
  const [bondAmount, setBondAmount] = useState("");
  const [bondBeneficiary, setBondBeneficiary] = useState("");

  // Additional notes
  const [additionalNotes, setAdditionalNotes] = useState("");

  const submitMutation = trpc.insuranceV2.submitRequest.useMutation({
    onSuccess: () => {
      setStep("done");
      toast.success("Insurance request submitted successfully!");
      setTimeout(() => onSuccess?.(), 1500);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleProductSelect = (product: InsuranceProduct) => {
    setSelectedProduct(product);
    setStep("intake");
  };

  const handleSubmit = () => {
    if (!selectedProduct || !fullName || !email) return;

    const isMotor = selectedProduct.fields === "motor";
    const isBond = selectedProduct.fields === "bonds";
    const isEngineering = selectedProduct.fields === "engineering";

    submitMutation.mutate({
      insuranceType: selectedProduct.id as any,
      productCategory: selectedProduct.category as any,
      fullName,
      email,
      phone: phone || undefined,
      // Motor fields
      vehicleMake: isMotor ? vehicleMake : "N/A",
      vehicleModel: isMotor ? vehicleModel : "N/A",
      vehicleYear: isMotor ? Number(vehicleYear) : 2024,
      vehicleRegistration: isMotor ? vehicleReg || undefined : undefined,
      vehicleValue: isMotor && vehicleValue ? Number(vehicleValue) : undefined,
      // Non-motor fields
      insuredAssetDescription: !isMotor ? assetDescription || undefined : undefined,
      insuredAssetValue: !isMotor && assetValue ? Number(assetValue) : undefined,
      coverageAddress: coverageAddress || undefined,
      businessType: businessType || undefined,
      projectValue: isEngineering && projectValue ? Number(projectValue) : undefined,
      projectDurationMonths: isEngineering && projectDuration ? Number(projectDuration) : undefined,
      bondType: isBond ? bondType || undefined : undefined,
      bondAmount: isBond && bondAmount ? Number(bondAmount) : undefined,
      bondBeneficiary: isBond ? bondBeneficiary || undefined : undefined,
      additionalCover: additionalNotes || undefined,
    });
  };

  // ── Step: Catalogue ──────────────────────────────────────────────────────────
  if (step === "catalogue") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">What would you like to insure?</h2>
            <p className="text-sm text-muted-foreground">Choose a product to get started with your insurance request.</p>
          </div>
          {onCancel && <Button variant="ghost" size="sm" onClick={onCancel}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>}
        </div>
        <InsuranceCatalogue onSelect={handleProductSelect} />
      </div>
    );
  }

  // ── Step: Done ───────────────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
        <div className="p-4 rounded-full bg-emerald-100">
          <CheckCircle2 className="h-10 w-10 text-emerald-600" />
        </div>
        <h2 className="text-xl font-bold">Request Submitted!</h2>
        <p className="text-muted-foreground max-w-sm">
          Your {selectedProduct?.name} insurance request has been received. An agent will review it and be in touch shortly.
        </p>
      </div>
    );
  }

  const isMotor = selectedProduct?.fields === "motor";
  const isBond = selectedProduct?.fields === "bonds";
  const isEngineering = selectedProduct?.fields === "engineering";
  const isProperty = selectedProduct?.fields === "property";
  const isLiability = selectedProduct?.fields === "liability";
  const isPersonal = selectedProduct?.fields === "personal";

  // ── Step: Intake ─────────────────────────────────────────────────────────────
  if (step === "intake") {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setStep("catalogue")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div>
            <h2 className="text-xl font-bold">{selectedProduct?.name}</h2>
            <p className="text-sm text-muted-foreground">Fill in the details for your insurance request.</p>
          </div>
        </div>

        {/* Contact details */}
        <div className="space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Your Details</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Full Name *</Label>
              <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" />
            </div>
            <div className="space-y-1">
              <Label>Email *</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" />
            </div>
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+263 77 123 4567" />
            </div>
          </div>
        </div>

        {/* Motor fields */}
        {isMotor && (
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Vehicle Details</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Make *</Label>
                <Input value={vehicleMake} onChange={e => setVehicleMake(e.target.value)} placeholder="Toyota" />
              </div>
              <div className="space-y-1">
                <Label>Model *</Label>
                <Input value={vehicleModel} onChange={e => setVehicleModel(e.target.value)} placeholder="Corolla" />
              </div>
              <div className="space-y-1">
                <Label>Year *</Label>
                <Input type="number" min="1970" max={new Date().getFullYear()+1} value={vehicleYear} onChange={e => setVehicleYear(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Registration</Label>
                <Input value={vehicleReg} onChange={e => setVehicleReg(e.target.value)} placeholder="ABC 1234" />
              </div>
              <div className="space-y-1">
                <Label>Estimated Value ($)</Label>
                <Input type="number" min="0" value={vehicleValue} onChange={e => setVehicleValue(e.target.value)} placeholder="15000" />
              </div>
            </div>
          </div>
        )}

        {/* Property / Assets fields */}
        {(isProperty || isLiability) && (
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Asset / Risk Details</h3>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Description of Asset / Risk *</Label>
                <Textarea value={assetDescription} onChange={e => setAssetDescription(e.target.value)} placeholder="Describe the property, assets, or business activity to be insured..." rows={3} />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Estimated Value / Sum Insured ($)</Label>
                  <Input type="number" min="0" value={assetValue} onChange={e => setAssetValue(e.target.value)} placeholder="500000" />
                </div>
                <div className="space-y-1">
                  <Label>Coverage Address / Location</Label>
                  <Input value={coverageAddress} onChange={e => setCoverageAddress(e.target.value)} placeholder="123 Main St, Harare" />
                </div>
                <div className="space-y-1">
                  <Label>Business / Industry Type</Label>
                  <Input value={businessType} onChange={e => setBusinessType(e.target.value)} placeholder="e.g. Retail, Manufacturing, Services" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Engineering fields */}
        {isEngineering && (
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Project / Equipment Details</h3>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Description of Plant / Project / Equipment *</Label>
                <Textarea value={assetDescription} onChange={e => setAssetDescription(e.target.value)} placeholder="Describe the plant, equipment, or construction project..." rows={3} />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Sum Insured / Contract Value ($)</Label>
                  <Input type="number" min="0" value={assetValue || projectValue} onChange={e => { setAssetValue(e.target.value); setProjectValue(e.target.value); }} placeholder="2000000" />
                </div>
                <div className="space-y-1">
                  <Label>Project Duration (months)</Label>
                  <Input type="number" min="1" value={projectDuration} onChange={e => setProjectDuration(e.target.value)} placeholder="18" />
                </div>
                <div className="space-y-1">
                  <Label>Project / Site Location</Label>
                  <Input value={coverageAddress} onChange={e => setCoverageAddress(e.target.value)} placeholder="Site address or location" />
                </div>
                <div className="space-y-1">
                  <Label>Contractor / Business Name</Label>
                  <Input value={businessType} onChange={e => setBusinessType(e.target.value)} placeholder="Your company name" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bond fields */}
        {isBond && (
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Bond Details</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Bond Type *</Label>
                <Select value={bondType} onValueChange={setBondType}>
                  <SelectTrigger><SelectValue placeholder="Select bond type" /></SelectTrigger>
                  <SelectContent>
                    {["Performance Bond","Advance Payment Bond","Bid / Tender Bond","Retention Bond","Customs Bond","Maintenance Bond","Fidelity Guarantee","Other"].map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Bond Amount ($) *</Label>
                <Input type="number" min="0" value={bondAmount} onChange={e => setBondAmount(e.target.value)} placeholder="100000" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Beneficiary (Obligee) *</Label>
                <Input value={bondBeneficiary} onChange={e => setBondBeneficiary(e.target.value)} placeholder="Name of the party requiring the bond" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Description / Purpose</Label>
                <Textarea value={assetDescription} onChange={e => setAssetDescription(e.target.value)} placeholder="Describe the purpose of the bond and the underlying contract..." rows={2} />
              </div>
            </div>
          </div>
        )}

        {/* Personal fields */}
        {isPersonal && (
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Coverage Details</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Sum Insured / Coverage Amount ($)</Label>
                <Input type="number" min="0" value={assetValue} onChange={e => setAssetValue(e.target.value)} placeholder="50000" />
              </div>
            </div>
          </div>
        )}

        {/* Additional notes */}
        <div className="space-y-1">
          <Label>Additional Information (optional)</Label>
          <Textarea value={additionalNotes} onChange={e => setAdditionalNotes(e.target.value)} placeholder="Any other details, special requirements, or questions for the agent..." rows={2} />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={() => setStep("catalogue")}>Back</Button>
          <Button
            onClick={() => setStep("review")}
            disabled={!fullName || !email || (isMotor && (!vehicleMake || !vehicleModel))}
          >
            Review Request <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    );
  }

  // ── Step: Review ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => setStep("intake")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div>
          <h2 className="text-xl font-bold">Review Your Request</h2>
          <p className="text-sm text-muted-foreground">Confirm the details before submitting.</p>
        </div>
      </div>

      <div className="rounded-xl border p-4 space-y-4 bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">{selectedProduct?.icon}</div>
          <div>
            <p className="font-bold">{selectedProduct?.name}</p>
            <Badge variant="outline" className="text-xs capitalize">{selectedProduct?.category}</Badge>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div><p className="text-xs text-muted-foreground">Name</p><p className="font-medium">{fullName}</p></div>
          <div><p className="text-xs text-muted-foreground">Email</p><p className="font-medium">{email}</p></div>
          {phone && <div><p className="text-xs text-muted-foreground">Phone</p><p className="font-medium">{phone}</p></div>}
          {isMotor && vehicleMake && <div><p className="text-xs text-muted-foreground">Vehicle</p><p className="font-medium">{vehicleYear} {vehicleMake} {vehicleModel}</p></div>}
          {isMotor && vehicleValue && <div><p className="text-xs text-muted-foreground">Vehicle Value</p><p className="font-medium">${Number(vehicleValue).toLocaleString()}</p></div>}
          {!isMotor && assetDescription && <div className="sm:col-span-2"><p className="text-xs text-muted-foreground">Asset / Risk Description</p><p className="font-medium">{assetDescription}</p></div>}
          {!isMotor && assetValue && <div><p className="text-xs text-muted-foreground">Sum Insured</p><p className="font-medium">${Number(assetValue).toLocaleString()}</p></div>}
          {isBond && bondType && <div><p className="text-xs text-muted-foreground">Bond Type</p><p className="font-medium">{bondType}</p></div>}
          {isBond && bondAmount && <div><p className="text-xs text-muted-foreground">Bond Amount</p><p className="font-medium">${Number(bondAmount).toLocaleString()}</p></div>}
          {isBond && bondBeneficiary && <div><p className="text-xs text-muted-foreground">Beneficiary</p><p className="font-medium">{bondBeneficiary}</p></div>}
          {additionalNotes && <div className="sm:col-span-2"><p className="text-xs text-muted-foreground">Additional Notes</p><p className="font-medium">{additionalNotes}</p></div>}
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => setStep("intake")}>Edit</Button>
        <Button onClick={handleSubmit} disabled={submitMutation.isPending}>
          {submitMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
          Submit Request
        </Button>
      </div>
    </div>
  );
}
