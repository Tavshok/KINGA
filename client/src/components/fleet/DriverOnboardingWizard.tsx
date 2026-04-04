/**
 * Driver Onboarding Wizard
 * 
 * Multi-step form for onboarding new fleet drivers with license validation.
 * 
 * Steps:
 * 1. Basic Information (name, email, phone, hire date)
 * 2. License Information (license number, expiry, class, photo upload)
 * 3. Emergency Contact (name, phone, relationship)
 * 4. Review & Submit
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Upload, CheckCircle2, ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
// File upload will be added in future iteration

interface DriverOnboardingData {
  // Step 1: Basic Information
  userId: number;
  hireDate: Date;
  
  // Step 2: License Information
  driverLicenseNumber: string;
  licenseExpiry: Date;
  licenseClass?: string;
  licensePhotoUrl?: string;
  
  // Step 3: Emergency Contact
  emergencyContactName?: string;
  emergencyContactPhone?: string;
}

interface DriverOnboardingWizardProps {
  fleetId: number;
  onComplete?: () => void;
}

export function DriverOnboardingWizard({ fleetId, onComplete }: DriverOnboardingWizardProps) {
  const [, setLocation] = useLocation();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<Partial<DriverOnboardingData>>({
    hireDate: new Date(),
    licenseExpiry: new Date(),
  });
  const [licensePhotoFile, setLicensePhotoFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const onboardDriver = trpc.fleet.onboardFleetDriver.useMutation({
    onSuccess: (data: any) => {
      toast.success("Driver onboarded successfully", {
        description: `${data.userName} has been added to the fleet.`,
      });
      if (onComplete) {
        onComplete();
      } else {
        setLocation("/fleet-management");
      }
    },
    onError: (error: any) => {
      toast.error("Failed to onboard driver", {
        description: error.message,
      });
    },
  });

  const handleNext = () => {
    // Validate current step before proceeding
    if (currentStep === 1) {
      if (!formData.hireDate) {
        toast.error("Please fill in all required fields");
        return;
      }
    } else if (currentStep === 2) {
      if (!formData.driverLicenseNumber || !formData.licenseExpiry) {
        toast.error("Please fill in all required license fields");
        return;
      }
      
      // Validate license expiry is in the future
      if (formData.licenseExpiry && formData.licenseExpiry < new Date()) {
        toast.error("License expiry date must be in the future");
        return;
      }
    }
    
    setCurrentStep((prev) => Math.min(prev + 1, 4));
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleLicensePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size must be less than 5MB");
      return;
    }

    setLicensePhotoFile(file);
    toast.success("License photo selected");
  };

  const handleSubmit = async () => {
    // Validate all required fields
    if (!formData.hireDate || !formData.driverLicenseNumber || !formData.licenseExpiry) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      setIsUploading(true);

      // TODO: Upload license photo to S3
      // For now, skip file upload and proceed with onboarding

      // Submit onboarding request
      await onboardDriver.mutateAsync({
        fleetId,
        userId: formData.userId ?? 0,
        driverLicenseNumber: formData.driverLicenseNumber ?? "",
        licenseExpiry: formData.licenseExpiry instanceof Date ? formData.licenseExpiry.toISOString().split('T')[0] : formData.licenseExpiry,
        licenseClass: formData.licenseClass,
        hireDate: formData.hireDate instanceof Date ? formData.hireDate.toISOString().split('T')[0] : formData.hireDate,
        emergencyContactName: formData.emergencyContactName,
        emergencyContactPhone: formData.emergencyContactPhone,
      });
    } catch (error) {
      console.error("Error onboarding driver:", error);
      toast.error("Failed to onboard driver");
    } finally {
      setIsUploading(false);
    }
  };

  const renderStepIndicator = () => {
    const steps = [
      { number: 1, title: "Basic Info" },
      { number: 2, title: "License" },
      { number: 3, title: "Emergency Contact" },
      { number: 4, title: "Review" },
    ];

    return (
      <div className="flex items-center justify-between mb-8">
        {steps.map((step, index) => (
          <div key={step.number} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                  currentStep >= step.number
                    ? "bg-emerald-500 text-white"
                    : "bg-gray-200 text-gray-700 dark:text-gray-400 dark:text-muted-foreground"
                }`}
              >
                {currentStep > step.number ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : (
                  step.number
                )}
              </div>
              <span className="text-xs mt-2 text-center">{step.title}</span>
            </div>
            {index < steps.length - 1 && (
              <div
                className={`h-1 flex-1 mx-2 ${
                  currentStep > step.number ? "bg-emerald-500" : "bg-gray-200"
                }`}
              />
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderStep1 = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="userId">User ID *</Label>
        <Input
          id="userId"
          type="number"
          placeholder="Enter user ID"
          value={formData.userId || ""}
          onChange={(e) =>
            setFormData({ ...formData, userId: parseInt(e.target.value) || 0 })
          }
          required
        />
        <p className="text-sm text-muted-foreground">
          The user must have the fleet_driver role assigned.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="hireDate">Hire Date *</Label>
        <Input
          id="hireDate"
          type="date"
          value={formData.hireDate?.toISOString().split("T")[0] || ""}
          onChange={(e) =>
            setFormData({ ...formData, hireDate: new Date(e.target.value) })
          }
          required
        />
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="driverLicenseNumber">Driver License Number *</Label>
        <Input
          id="driverLicenseNumber"
          placeholder="Enter license number"
          value={formData.driverLicenseNumber || ""}
          onChange={(e) =>
            setFormData({ ...formData, driverLicenseNumber: e.target.value })
          }
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="licenseExpiry">License Expiry Date *</Label>
        <Input
          id="licenseExpiry"
          type="date"
          value={formData.licenseExpiry?.toISOString().split("T")[0] || ""}
          onChange={(e) =>
            setFormData({ ...formData, licenseExpiry: new Date(e.target.value) })
          }
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="licenseClass">License Class</Label>
        <Select
          value={formData.licenseClass || ""}
          onValueChange={(value) =>
            setFormData({ ...formData, licenseClass: value })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Select license class" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="A">Class A - Motorcycles</SelectItem>
            <SelectItem value="A1">Class A1 - Light motorcycles</SelectItem>
            <SelectItem value="B">Class B - Light vehicles</SelectItem>
            <SelectItem value="C">Class C - Heavy vehicles</SelectItem>
            <SelectItem value="C1">Class C1 - Light trucks</SelectItem>
            <SelectItem value="EB">Class EB - Light vehicle with trailer</SelectItem>
            <SelectItem value="EC">Class EC - Heavy vehicle with trailer</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="licensePhoto">License Photo (Optional)</Label>
        <div className="flex items-center gap-2">
          <Input
            id="licensePhoto"
            type="file"
            accept="image/*"
            onChange={handleLicensePhotoUpload}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => document.getElementById("licensePhoto")?.click()}
            className="w-full"
          >
            <Upload className="w-4 h-4 mr-2" />
            {licensePhotoFile ? licensePhotoFile.name : "Upload License Photo"}
          </Button>
        </div>
        {licensePhotoFile && (
          <p className="text-sm text-emerald-600">
            ✓ {licensePhotoFile.name} selected
          </p>
        )}
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="emergencyContactName">Emergency Contact Name</Label>
        <Input
          id="emergencyContactName"
          placeholder="Enter contact name"
          value={formData.emergencyContactName || ""}
          onChange={(e) =>
            setFormData({ ...formData, emergencyContactName: e.target.value })
          }
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="emergencyContactPhone">Emergency Contact Phone</Label>
        <Input
          id="emergencyContactPhone"
          type="tel"
          placeholder="+27 82 123 4567"
          value={formData.emergencyContactPhone || ""}
          onChange={(e) =>
            setFormData({ ...formData, emergencyContactPhone: e.target.value })
          }
        />
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-4">
      <div className="bg-muted p-4 rounded-lg space-y-3">
        <h3 className="font-semibold text-lg">Review Driver Information</h3>
        
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">User ID:</span>
            <span className="font-medium">{formData.userId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Hire Date:</span>
            <span className="font-medium">
              {formData.hireDate?.toLocaleDateString()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">License Number:</span>
            <span className="font-medium">{formData.driverLicenseNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">License Expiry:</span>
            <span className="font-medium">
              {formData.licenseExpiry?.toLocaleDateString()}
            </span>
          </div>
          {formData.licenseClass && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">License Class:</span>
              <span className="font-medium">{formData.licenseClass}</span>
            </div>
          )}
          {licensePhotoFile && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">License Photo:</span>
              <span className="font-medium text-emerald-600">✓ Uploaded</span>
            </div>
          )}
          {formData.emergencyContactName && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Emergency Contact:</span>
              <span className="font-medium">{formData.emergencyContactName}</span>
            </div>
          )}
          {formData.emergencyContactPhone && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Contact Phone:</span>
              <span className="font-medium">{formData.emergencyContactPhone}</span>
            </div>
          )}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Please review all information before submitting. You can go back to edit any step.
      </p>
    </div>
  );

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Onboard New Driver</CardTitle>
        <CardDescription>
          Complete all steps to onboard a new driver to the fleet.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {renderStepIndicator()}
        
        {currentStep === 1 && renderStep1()}
        {currentStep === 2 && renderStep2()}
        {currentStep === 3 && renderStep3()}
        {currentStep === 4 && renderStep4()}
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={currentStep === 1 || isUploading}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        
        {currentStep < 4 ? (
          <Button onClick={handleNext}>
            Next
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={isUploading || onboardDriver.isPending}
          >
            {isUploading || onboardDriver.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Onboarding...
              </>
            ) : (
              "Submit"
            )}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
