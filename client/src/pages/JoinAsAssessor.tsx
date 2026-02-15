import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, X, CheckCircle } from "lucide-react";

export default function JoinAsAssessor() {
  const [, setLocation] = useLocation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    professionalLicenseNumber: "",
    licenseExpiryDate: "",
    certificationLevel: "junior" as "junior" | "senior" | "expert" | "master",
    yearsOfExperience: 0,
    maxTravelDistanceKm: 50,
    marketplaceBio: "",
    marketplaceHourlyRate: 500,
    marketplaceAvailability: "full_time" as "full_time" | "part_time" | "on_demand",
    insuranceExpiryDate: "",
  });

  const [specializations, setSpecializations] = useState<string[]>([]);
  const [newSpecialization, setNewSpecialization] = useState("");

  const [serviceRegions, setServiceRegions] = useState<string[]>([]);
  const [newServiceRegion, setNewServiceRegion] = useState("");

  const registerMutation = trpc.assessorOnboarding.registerMarketplaceAssessor.useMutation({
    onSuccess: () => {
      setSuccess(true);
      setIsSubmitting(false);
    },
    onError: (error) => {
      alert(`Error: ${error.message}`);
      setIsSubmitting(false);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    registerMutation.mutate({
      ...formData,
      specializations: specializations.length > 0 ? specializations : [],
      serviceRegions: serviceRegions.length > 0 ? serviceRegions : [],
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

  if (success) {
    return (
      <div className="container max-w-2xl py-16">
        <Card>
          <CardContent className="pt-12 pb-12 text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Registration Successful!</h2>
            <p className="text-muted-foreground mb-6">
              Your marketplace assessor profile has been created. You'll receive an email once your application is reviewed and approved.
            </p>
            <Button onClick={() => setLocation("/")}>Return to Home</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Join KINGA Assessor Marketplace</h1>
        <p className="text-muted-foreground mt-2">
          Register as an independent assessor and get matched with insurance claims across multiple insurers.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Professional Information</CardTitle>
          <CardDescription>
            Provide your credentials and marketplace profile details
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
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
                    <SelectItem value="junior">Junior (0-2 years)</SelectItem>
                    <SelectItem value="senior">Senior (3-5 years)</SelectItem>
                    <SelectItem value="expert">Expert (6-10 years)</SelectItem>
                    <SelectItem value="master">Master (10+ years)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="experience">Years of Experience *</Label>
                <Input
                  id="experience"
                  type="number"
                  min="0"
                  value={formData.yearsOfExperience}
                  onChange={(e) => setFormData({ ...formData, yearsOfExperience: parseInt(e.target.value) || 0 })}
                  required
                />
              </div>
            </div>

            {/* Specializations */}
            <div className="space-y-2">
              <Label>Specializations *</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g., Collision, Theft, Hail Damage, Fire Damage"
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

            {/* Service Regions */}
            <div className="space-y-2">
              <Label>Service Regions *</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g., Harare, Bulawayo, Manicaland"
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
              <Label htmlFor="travelDistance">Maximum Travel Distance (km) *</Label>
              <Input
                id="travelDistance"
                type="number"
                min="0"
                value={formData.maxTravelDistanceKm}
                onChange={(e) => setFormData({ ...formData, maxTravelDistanceKm: parseInt(e.target.value) || 50 })}
                required
              />
            </div>

            {/* Marketplace Profile */}
            <div className="space-y-2">
              <Label htmlFor="bio">Professional Bio *</Label>
              <Textarea
                id="bio"
                placeholder="Describe your experience, expertise, and what makes you a great assessor..."
                value={formData.marketplaceBio}
                onChange={(e) => setFormData({ ...formData, marketplaceBio: e.target.value })}
                rows={4}
                required
              />
              <p className="text-xs text-muted-foreground">
                This will be visible to insurers browsing the marketplace
              </p>
            </div>

            {/* Pricing & Availability */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="hourlyRate">Hourly Rate (USD) *</Label>
                <Input
                  id="hourlyRate"
                  type="number"
                  min="0"
                  step="50"
                  value={formData.marketplaceHourlyRate}
                  onChange={(e) => setFormData({ ...formData, marketplaceHourlyRate: parseInt(e.target.value) || 500 })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="availability">Availability *</Label>
                <Select
                  value={formData.marketplaceAvailability}
                  onValueChange={(value: any) => setFormData({ ...formData, marketplaceAvailability: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full_time">Full Time</SelectItem>
                    <SelectItem value="part_time">Part Time</SelectItem>
                    <SelectItem value="on_demand">On Demand</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Insurance */}
            <div className="space-y-2">
              <Label htmlFor="insuranceExpiry">Professional Indemnity Insurance Expiry *</Label>
              <Input
                id="insuranceExpiry"
                type="date"
                value={formData.insuranceExpiryDate}
                onChange={(e) => setFormData({ ...formData, insuranceExpiryDate: e.target.value })}
                required
              />
            </div>

            {/* Submit Buttons */}
            <div className="flex gap-4 pt-4">
              <Button type="submit" disabled={isSubmitting || specializations.length === 0 || serviceRegions.length === 0}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Application
              </Button>
              <Button type="button" variant="outline" onClick={() => setLocation("/")}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
