import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { FileText, Upload, Loader2, CheckCircle, ArrowLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function SubmitClaim() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [claimNumber, setClaimNumber] = useState("");

  // Form state
  const [formData, setFormData] = useState({
    vehicleMake: "",
    vehicleModel: "",
    vehicleYear: new Date().getFullYear(),
    vehicleRegistration: "",
    incidentDate: "",
    incidentDescription: "",
    incidentLocation: "",
    policyNumber: "",
    damagePhotos: [] as string[],
    selectedPanelBeaterIds: [] as number[],
  });

  // Get panel beaters list
  const { data: panelBeaters = [] } = trpc.panelBeaters.list.useQuery();

  // Upload image mutation
  const uploadImage = trpc.storage.uploadImage.useMutation();

  // Submit claim mutation
  const submitClaim = trpc.claims.submit.useMutation({
    onSuccess: (data) => {
      setClaimNumber(data.claimNumber);
      setSubmitted(true);
      toast.success("Claim submitted successfully!");
    },
    onError: (error) => {
      toast.error(`Failed to submit claim: ${error.message}`);
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const uploadedUrls: string[] = [];
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Read file as base64
        const reader = new FileReader();
        const fileData = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        // Upload to S3 via tRPC
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
      
      toast.success(`${files.length} photo(s) uploaded successfully`);
    } catch (error) {
      toast.error("Failed to upload photos");
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  const handlePanelBeaterToggle = (id: number) => {
    setFormData(prev => {
      const current = prev.selectedPanelBeaterIds;
      if (current.includes(id)) {
        return {
          ...prev,
          selectedPanelBeaterIds: current.filter(pbId => pbId !== id),
        };
      } else if (current.length < 3) {
        return {
          ...prev,
          selectedPanelBeaterIds: [...current, id],
        };
      } else {
        toast.error("You can only select up to 3 panel beaters");
        return prev;
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (formData.damagePhotos.length === 0) {
      toast.error("Please upload at least one damage photo");
      return;
    }

    if (formData.selectedPanelBeaterIds.length !== 3) {
      toast.error("Please select exactly 3 panel beaters");
      return;
    }

    submitClaim.mutate(formData);
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50">
        <header className="bg-white border-b shadow-sm">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-2xl font-bold">KINGA - Claimant Portal</h1>
                <p className="text-sm text-muted-foreground">Claim Submitted Successfully</p>
              </div>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8">
          <Card className="max-w-2xl mx-auto">
            <CardHeader className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <CardTitle className="text-2xl">Claim Submitted Successfully!</CardTitle>
              <CardDescription>
                Your claim has been received and is being processed
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-muted p-4 rounded-lg text-center">
                <p className="text-sm text-muted-foreground mb-1">Claim Number</p>
                <p className="text-2xl font-bold font-mono">{claimNumber}</p>
              </div>

              <div className="space-y-2 text-sm text-muted-foreground">
                <p>✓ Your claim has been submitted to the insurer</p>
                <p>✓ Selected panel beaters have been notified</p>
                <p>✓ You will receive updates via email</p>
              </div>

              <div className="flex gap-3">
                <Button 
                  className="flex-1"
                  onClick={() => setLocation("/claimant/dashboard")}
                >
                  View My Claims
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => {
                    setSubmitted(false);
                    setFormData({
                      vehicleMake: "",
                      vehicleModel: "",
                      vehicleYear: new Date().getFullYear(),
                      vehicleRegistration: "",
                      incidentDate: "",
                      incidentDescription: "",
                      incidentLocation: "",
                      policyNumber: "",
                      damagePhotos: [],
                      selectedPanelBeaterIds: [],
                    });
                  }}
                >
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50">
      <header className="bg-white border-b shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-2xl font-bold">KINGA - Submit New Claim</h1>
                <p className="text-sm text-muted-foreground">File an insurance claim for vehicle damage</p>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setLocation("/claimant/dashboard")}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-6">
          {/* Vehicle Information */}
          <Card>
            <CardHeader>
              <CardTitle>Vehicle Information</CardTitle>
              <CardDescription>Details about the damaged vehicle</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="vehicleMake">Make *</Label>
                  <Input
                    id="vehicleMake"
                    required
                    value={formData.vehicleMake}
                    onChange={(e) => setFormData(prev => ({ ...prev, vehicleMake: e.target.value }))}
                    placeholder="e.g., Toyota"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vehicleModel">Model *</Label>
                  <Input
                    id="vehicleModel"
                    required
                    value={formData.vehicleModel}
                    onChange={(e) => setFormData(prev => ({ ...prev, vehicleModel: e.target.value }))}
                    placeholder="e.g., Camry"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="vehicleYear">Year *</Label>
                  <Input
                    id="vehicleYear"
                    type="number"
                    required
                    value={formData.vehicleYear}
                    onChange={(e) => setFormData(prev => ({ ...prev, vehicleYear: parseInt(e.target.value) }))}
                    min="1900"
                    max={new Date().getFullYear() + 1}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vehicleRegistration">Registration Number *</Label>
                  <Input
                    id="vehicleRegistration"
                    required
                    value={formData.vehicleRegistration}
                    onChange={(e) => setFormData(prev => ({ ...prev, vehicleRegistration: e.target.value }))}
                    placeholder="e.g., ABC-1234"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="policyNumber">Policy Number *</Label>
                <Input
                  id="policyNumber"
                  required
                  value={formData.policyNumber}
                  onChange={(e) => setFormData(prev => ({ ...prev, policyNumber: e.target.value }))}
                  placeholder="Your insurance policy number"
                />
              </div>
            </CardContent>
          </Card>

          {/* Incident Details */}
          <Card>
            <CardHeader>
              <CardTitle>Incident Details</CardTitle>
              <CardDescription>Information about the damage incident</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="incidentDate">Date of Incident *</Label>
                <Input
                  id="incidentDate"
                  type="date"
                  required
                  value={formData.incidentDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, incidentDate: e.target.value }))}
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="incidentLocation">Location *</Label>
                <Input
                  id="incidentLocation"
                  required
                  value={formData.incidentLocation}
                  onChange={(e) => setFormData(prev => ({ ...prev, incidentLocation: e.target.value }))}
                  placeholder="Where did the incident occur?"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="incidentDescription">Description *</Label>
                <Textarea
                  id="incidentDescription"
                  required
                  value={formData.incidentDescription}
                  onChange={(e) => setFormData(prev => ({ ...prev, incidentDescription: e.target.value }))}
                  placeholder="Please describe what happened..."
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>

          {/* Damage Photos */}
          <Card>
            <CardHeader>
              <CardTitle>Damage Photos</CardTitle>
              <CardDescription>Upload clear photos of the damage (at least 1 required)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
                <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <Label htmlFor="photoUpload" className="cursor-pointer">
                  <span className="text-primary hover:underline">Click to upload</span>
                  <span className="text-muted-foreground"> or drag and drop</span>
                </Label>
                <Input
                  id="photoUpload"
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={uploading}
                />
                <p className="text-xs text-muted-foreground mt-2">PNG, JPG up to 10MB each</p>
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
                  <div className="grid grid-cols-3 gap-2">
                    {formData.damagePhotos.map((url, index) => (
                      <div key={index} className="aspect-square bg-muted rounded-lg flex items-center justify-center">
                        <FileText className="h-8 w-8 text-muted-foreground" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Panel Beater Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Select Panel Beaters</CardTitle>
              <CardDescription>Choose exactly 3 panel beaters to provide quotes for repairs</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {panelBeaters.map((pb) => (
                  <div
                    key={pb.id}
                    className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <Checkbox
                      id={`pb-${pb.id}`}
                      checked={formData.selectedPanelBeaterIds.includes(pb.id)}
                      onCheckedChange={() => handlePanelBeaterToggle(pb.id)}
                    />
                    <div className="flex-1">
                      <Label
                        htmlFor={`pb-${pb.id}`}
                        className="font-medium cursor-pointer"
                      >
                        {pb.businessName}
                      </Label>
                      <p className="text-sm text-muted-foreground">{pb.city}</p>
                      {pb.phone && (
                        <p className="text-xs text-muted-foreground">{pb.phone}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-sm text-muted-foreground mt-4">
                Selected: {formData.selectedPanelBeaterIds.length} / 3
              </p>
            </CardContent>
          </Card>

          {/* Submit Button */}
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setLocation("/claimant/dashboard")}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={submitClaim.isPending || uploading}
            >
              {submitClaim.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Claim"
              )}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
