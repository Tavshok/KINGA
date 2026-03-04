/**
 * Incident Report Submission Form
 * 
 * Allows fleet drivers to submit incident reports with photo upload and GPS location.
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Upload, MapPin, Loader2, AlertCircle } from "lucide-react";

interface IncidentReportFormProps {
  driverId: number;
  fleetId?: number;
  onComplete?: () => void;
}

export function IncidentReportForm({ driverId, fleetId, onComplete }: IncidentReportFormProps) {
  const [, setLocation] = useLocation();
  const [formData, setFormData] = useState({
    vehicleId: 0,
    incidentDate: new Date().toISOString().split("T")[0],
    location: "",
    description: "",
    severity: "moderate" as "minor" | "moderate" | "major" | "critical",
    policeReportNumber: "",
    witnessName: "",
    witnessPhone: "",
    estimatedDamage: 0,
    vehicleDriveable: true,
  });
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [gpsLocation, setGpsLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isCapturingLocation, setIsCapturingLocation] = useState(false);

  const submitIncident = trpc.fleet.createServiceRequest.useMutation({
    onSuccess: () => {
      toast.success("Incident report submitted successfully", {
        description: "Your report has been sent for manager review.",
      });
      if (onComplete) {
        onComplete();
      } else {
        setLocation("/fleet-management");
      }
    },
    onError: (error: any) => {
      toast.error("Failed to submit incident report", {
        description: error.message,
      });
    },
  });

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    
    // Validate file types
    const invalidFiles = files.filter((file) => !file.type.startsWith("image/"));
    if (invalidFiles.length > 0) {
      toast.error("Please upload only image files");
      return;
    }

    // Validate file sizes (max 5MB each)
    const oversizedFiles = files.filter((file) => file.size > 5 * 1024 * 1024);
    if (oversizedFiles.length > 0) {
      toast.error("Each file must be less than 5MB");
      return;
    }

    // Limit to 5 photos
    if (photoFiles.length + files.length > 5) {
      toast.error("Maximum 5 photos allowed");
      return;
    }

    setPhotoFiles([...photoFiles, ...files]);
    toast.success(`${files.length} photo(s) added`);
  };

  const removePhoto = (index: number) => {
    setPhotoFiles(photoFiles.filter((_, i) => i !== index));
  };

  const captureGPSLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }

    setIsCapturingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGpsLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setFormData({
          ...formData,
          location: `${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`,
        });
        toast.success("GPS location captured");
        setIsCapturingLocation(false);
      },
      (error) => {
        toast.error("Failed to capture GPS location", {
          description: error.message,
        });
        setIsCapturingLocation(false);
      }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    if (!formData.vehicleId || !formData.incidentDate || !formData.location || !formData.description) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      // TODO: Upload photos to S3
      // For now, skip file upload and proceed with submission
      const problemImages = photoFiles.map((file) => file.name);

      await submitIncident.mutateAsync({
        vehicleId: formData.vehicleId,
        // requestType: "emergency",
        // serviceCategory: "bodywork",
        // title: `Incident on ${formData.incidentDate}`,
        description: `${formData.description}\n\nLocation: ${formData.location}${
          formData.policeReportNumber ? `\nPolice Report: ${formData.policeReportNumber}` : ""
        }${formData.witnessName ? `\nWitness: ${formData.witnessName} (${formData.witnessPhone})` : ""}${
          formData.estimatedDamage > 0 ? `\nEstimated Damage: R${formData.estimatedDamage}` : ""
        }\nVehicle Driveable: ${formData.vehicleDriveable ? "Yes" : "No"}`,
        serviceType: "incident_repair",
        priority: (formData.severity === "critical" ? "urgent" : formData.severity === "major" ? "high" : "medium") as "low" | "medium" | "high" | "urgent",
      });
    } catch (error) {
      console.error("Error submitting incident report:", error);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Submit Incident Report</CardTitle>
        <CardDescription>
          Provide details about the incident for manager review.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {/* Vehicle Selection */}
          <div className="space-y-2">
            <Label htmlFor="vehicleId">Vehicle *</Label>
            <Input
              id="vehicleId"
              type="number"
              placeholder="Enter vehicle ID"
              value={formData.vehicleId || ""}
              onChange={(e) =>
                setFormData({ ...formData, vehicleId: parseInt(e.target.value) })
              }
              required
            />
            <p className="text-sm text-muted-foreground">
              Enter the ID of the vehicle involved in the incident.
            </p>
          </div>

          {/* Incident Date */}
          <div className="space-y-2">
            <Label htmlFor="incidentDate">Incident Date *</Label>
            <Input
              id="incidentDate"
              type="date"
              value={formData.incidentDate}
              onChange={(e) =>
                setFormData({ ...formData, incidentDate: e.target.value })
              }
              required
            />
          </div>

          {/* Location */}
          <div className="space-y-2">
            <Label htmlFor="location">Location *</Label>
            <div className="flex gap-2">
              <Input
                id="location"
                placeholder="Enter incident location or use GPS"
                value={formData.location}
                onChange={(e) =>
                  setFormData({ ...formData, location: e.target.value })
                }
                required
              />
              <Button
                type="button"
                variant="outline"
                onClick={captureGPSLocation}
                disabled={isCapturingLocation}
              >
                {isCapturingLocation ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <MapPin className="w-4 h-4" />
                )}
              </Button>
            </div>
            {gpsLocation && (
              <p className="text-sm text-emerald-600">
                ✓ GPS location captured
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              placeholder="Describe what happened in detail..."
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              rows={4}
              required
            />
          </div>

          {/* Severity */}
          <div className="space-y-2">
            <Label htmlFor="severity">Severity *</Label>
            <Select
              value={formData.severity}
              onValueChange={(value: any) =>
                setFormData({ ...formData, severity: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minor">Minor - Cosmetic damage only</SelectItem>
                <SelectItem value="moderate">Moderate - Repairable damage</SelectItem>
                <SelectItem value="major">Major - Significant damage</SelectItem>
                <SelectItem value="critical">Critical - Total loss or injury</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Photo Upload */}
          <div className="space-y-2">
            <Label htmlFor="photos">Incident Photos (Optional)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="photos"
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoUpload}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => document.getElementById("photos")?.click()}
                className="w-full"
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload Photos (Max 5)
              </Button>
            </div>
            {photoFiles.length > 0 && (
              <div className="space-y-1">
                {photoFiles.map((file, index) => (
                  <div key={index} className="flex items-center justify-between text-sm">
                    <span className="text-emerald-600">✓ {file.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removePhoto(index)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Optional Fields */}
          <div className="space-y-4 pt-4 border-t">
            <h3 className="font-semibold">Additional Information (Optional)</h3>

            <div className="space-y-2">
              <Label htmlFor="policeReportNumber">Police Report Number</Label>
              <Input
                id="policeReportNumber"
                placeholder="Enter police report number if applicable"
                value={formData.policeReportNumber}
                onChange={(e) =>
                  setFormData({ ...formData, policeReportNumber: e.target.value })
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="witnessName">Witness Name</Label>
                <Input
                  id="witnessName"
                  placeholder="Enter witness name"
                  value={formData.witnessName}
                  onChange={(e) =>
                    setFormData({ ...formData, witnessName: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="witnessPhone">Witness Phone</Label>
                <Input
                  id="witnessPhone"
                  type="tel"
                  placeholder="+27 82 123 4567"
                  value={formData.witnessPhone}
                  onChange={(e) =>
                    setFormData({ ...formData, witnessPhone: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="estimatedDamage">Estimated Damage (R)</Label>
              <Input
                id="estimatedDamage"
                type="number"
                placeholder="Enter estimated damage amount"
                value={formData.estimatedDamage || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    estimatedDamage: parseFloat(e.target.value) || 0,
                  })
                }
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="vehicleDriveable"
                checked={formData.vehicleDriveable}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, vehicleDriveable: checked as boolean })
                }
              />
              <Label htmlFor="vehicleDriveable" className="cursor-pointer">
                Vehicle is driveable
              </Label>
            </div>
          </div>

          {/* Warning for Critical Incidents */}
          {formData.severity === "critical" && (
            <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
              <div className="text-sm text-red-800">
                <p className="font-semibold">Critical Incident</p>
                <p>
                  This incident will be flagged for immediate manager review. If there are
                  injuries, please contact emergency services immediately.
                </p>
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter>
          <Button
            type="submit"
            className="w-full"
            disabled={submitIncident.isPending}
          >
            {submitIncident.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit Incident Report"
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
