import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { Loader2, Plus, X } from "lucide-react";

export default function AddAssessor() {
  const [, setLocation] = useLocation();

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    professionalLicenseNumber: "",
    licenseExpiryDate: "",
    certificationLevel: "junior" as "junior" | "senior" | "expert" | "master",
    yearsOfExperience: 0,
    maxTravelDistanceKm: 50,
  });

  const [specializations, setSpecializations] = useState<string[]>([]);
  const [newSpecialization, setNewSpecialization] = useState("");

  const [certifications, setCertifications] = useState<string[]>([]);
  const [newCertification, setNewCertification] = useState("");

  const [serviceRegions, setServiceRegions] = useState<string[]>([]);
  const [newServiceRegion, setNewServiceRegion] = useState("");

  const addAssessorMutation = trpc.assessorOnboarding.addInsurerOwnedAssessor.useMutation({
    onSuccess: () => {
      alert("Assessor added successfully. Invitation email sent.");
      setLocation("/assessors");
    },
    onError: (error) => {
      alert(`Error: ${error.message}`);
      setIsSubmitting(false);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    addAssessorMutation.mutate({
      ...formData,
      specializations: specializations.length > 0 ? specializations : undefined,
      certifications: certifications.length > 0 ? certifications : undefined,
      serviceRegions: serviceRegions.length > 0 ? serviceRegions : undefined,
    });
  };

  const addItem = (value: string, list: string[], setList: (list: string[]) => void, setValue: (value: string) => void) => {
    if (value.trim() && !list.includes(value.trim())) {
      setList([...list, value.trim()]);
      setValue("");
    }
  };

  const removeItem = (index: number, list: string[], setList: (list: string[]) => void) => {
    setList(list.filter((_, i) => i !== index));
  };

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Add Insurer-Owned Assessor</h1>
        <p className="text-muted-foreground mt-2">
          Add an assessor to your organization's team. They will receive an invitation email to set up their account.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Assessor Information</CardTitle>
          <CardDescription>
            Enter the assessor's professional details and credentials
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>
            </div>

            {/* License Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="licenseNumber">Professional License Number *</Label>
                <Input
                  id="licenseNumber"
                  value={formData.professionalLicenseNumber}
                  onChange={(e) => setFormData({ ...formData, professionalLicenseNumber: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="licenseExpiry">License Expiry Date *</Label>
                <Input
                  id="licenseExpiry"
                  type="date"
                  value={formData.licenseExpiryDate}
                  onChange={(e) => setFormData({ ...formData, licenseExpiryDate: e.target.value })}
                  required
                />
              </div>
            </div>

            {/* Experience */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="certificationLevel">Certification Level *</Label>
                <Select
                  value={formData.certificationLevel}
                  onValueChange={(value: any) => setFormData({ ...formData, certificationLevel: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="junior">Junior</SelectItem>
                    <SelectItem value="senior">Senior</SelectItem>
                    <SelectItem value="expert">Expert</SelectItem>
                    <SelectItem value="master">Master</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="experience">Years of Experience</Label>
                <Input
                  id="experience"
                  type="number"
                  min="0"
                  value={formData.yearsOfExperience}
                  onChange={(e) => setFormData({ ...formData, yearsOfExperience: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>

            {/* Specializations */}
            <div className="space-y-2">
              <Label>Specializations</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g., Collision, Theft, Hail Damage"
                  value={newSpecialization}
                  onChange={(e) => setNewSpecialization(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addItem(newSpecialization, specializations, setSpecializations, setNewSpecialization);
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => addItem(newSpecialization, specializations, setSpecializations, setNewSpecialization)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {specializations.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {specializations.map((spec, index) => (
                    <div key={index} className="flex items-center gap-1 bg-secondary text-secondary-foreground px-3 py-1 rounded-md text-sm">
                      {spec}
                      <button
                        type="button"
                        onClick={() => removeItem(index, specializations, setSpecializations)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Certifications */}
            <div className="space-y-2">
              <Label>Certifications</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g., ACII, CILA, CII Diploma"
                  value={newCertification}
                  onChange={(e) => setNewCertification(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addItem(newCertification, certifications, setCertifications, setNewCertification);
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => addItem(newCertification, certifications, setCertifications, setNewCertification)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {certifications.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {certifications.map((cert, index) => (
                    <div key={index} className="flex items-center gap-1 bg-secondary text-secondary-foreground px-3 py-1 rounded-md text-sm">
                      {cert}
                      <button
                        type="button"
                        onClick={() => removeItem(index, certifications, setCertifications)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Service Regions */}
            <div className="space-y-2">
              <Label>Service Regions</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g., Gauteng, Western Cape"
                  value={newServiceRegion}
                  onChange={(e) => setNewServiceRegion(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addItem(newServiceRegion, serviceRegions, setServiceRegions, setNewServiceRegion);
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => addItem(newServiceRegion, serviceRegions, setServiceRegions, setNewServiceRegion)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {serviceRegions.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {serviceRegions.map((region, index) => (
                    <div key={index} className="flex items-center gap-1 bg-secondary text-secondary-foreground px-3 py-1 rounded-md text-sm">
                      {region}
                      <button
                        type="button"
                        onClick={() => removeItem(index, serviceRegions, setServiceRegions)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Travel Distance */}
            <div className="space-y-2">
              <Label htmlFor="travelDistance">Maximum Travel Distance (km)</Label>
              <Input
                id="travelDistance"
                type="number"
                min="0"
                value={formData.maxTravelDistanceKm}
                onChange={(e) => setFormData({ ...formData, maxTravelDistanceKm: parseInt(e.target.value) || 50 })}
              />
            </div>

            {/* Submit Buttons */}
            <div className="flex gap-4 pt-4">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add Assessor
              </Button>
              <Button type="button" variant="outline" onClick={() => setLocation("/assessors")}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
