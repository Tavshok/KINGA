import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
// Toast functionality - using simple alerts for now
import { CheckCircle2, Building2, User, Settings, ArrowRight, ArrowLeft } from "lucide-react";

interface OnboardingWizardProps {
  userRole: "admin" | "user" | "assessor" | "insurer" | "panel_beater" | "fleet_manager";
  onComplete: () => void;
}

export function OnboardingWizard({ userRole, onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(1);
  const [, navigate] = useLocation();
  // const { toast } = useToast();

  // Form state
  const [organizationName, setOrganizationName] = useState("");
  const [organizationDescription, setOrganizationDescription] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("Zimbabwe");

  // Role-specific state
  const [assessorLicenseNumber, setAssessorLicenseNumber] = useState("");
  const [insurerRegistrationNumber, setInsurerRegistrationNumber] = useState("");
  const [panelBeaterCertification, setPanelBeaterCertification] = useState("");
  const [fleetSize, setFleetSize] = useState("");

  const totalSteps = getRoleTotalSteps(userRole);

  function getRoleTotalSteps(role: string): number {
    switch (role) {
      case "assessor":
      case "insurer":
      case "panel_beater":
      case "fleet_manager":
        return 3;
      default:
        return 2;
    }
  }

  const nextStep = () => {
    if (step < totalSteps) {
      setStep(step + 1);
    }
  };

  const prevStep = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const completeOnboarding = () => {
    // Show success message
    alert("Welcome to KINGA! Your account has been set up successfully.");
    onComplete();
    
    // Navigate to appropriate dashboard
    switch (userRole) {
      case "assessor":
        navigate("/assessor/dashboard");
        break;
      case "insurer":
        navigate("/insurer/dashboard");
        break;
      case "panel_beater":
        navigate("/panel-beater/dashboard");
        break;
      case "fleet_manager":
        navigate("/fleet-management");
        break;
      default:
        navigate("/");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-white to-accent/5 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl p-8">
        {/* Progress Indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            {Array.from({ length: totalSteps }).map((_, index) => (
              <div key={index} className="flex items-center flex-1">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-colors ${
                    index + 1 < step
                      ? "bg-emerald-600 text-white"
                      : index + 1 === step
                      ? "bg-primary text-white"
                      : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {index + 1 < step ? <CheckCircle2 className="w-5 h-5" /> : index + 1}
                </div>
                {index < totalSteps - 1 && (
                  <div
                    className={`flex-1 h-1 mx-2 transition-colors ${
                      index + 1 < step ? "bg-emerald-600" : "bg-gray-200"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-gray-600">
            Step {step} of {totalSteps}
          </p>
        </div>

        {/* Step Content */}
        <div className="space-y-6">
          {step === 1 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <User className="w-16 h-16 mx-auto mb-4 text-emerald-600" />
                <h2 className="text-2xl font-bold text-gray-900">Welcome to KINGA!</h2>
                <p className="text-gray-600 mt-2">
                  Let's set up your {getRoleDisplayName(userRole)} account
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+263 ..."
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="address">Address</Label>
                  <Input
                    id="address"
                    placeholder="Street address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      placeholder="Harare"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="country">Country</Label>
                    <Select value={country} onValueChange={setCountry}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Zimbabwe">Zimbabwe</SelectItem>
                        <SelectItem value="Zambia">Zambia</SelectItem>
                        <SelectItem value="Botswana">Botswana</SelectItem>
                        <SelectItem value="South Africa">South Africa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <Building2 className="w-16 h-16 mx-auto mb-4 text-primary" />
                <h2 className="text-2xl font-bold text-gray-900">Organization Details</h2>
                <p className="text-gray-600 mt-2">
                  Tell us about your organization
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="orgName">Organization Name</Label>
                  <Input
                    id="orgName"
                    placeholder="Your company name"
                    value={organizationName}
                    onChange={(e) => setOrganizationName(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="orgDescription">Description</Label>
                  <Textarea
                    id="orgDescription"
                    placeholder="Brief description of your organization"
                    value={organizationDescription}
                    onChange={(e) => setOrganizationDescription(e.target.value)}
                    rows={4}
                  />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <Settings className="w-16 h-16 mx-auto mb-4 text-emerald-600" />
                <h2 className="text-2xl font-bold text-gray-900">
                  {getRoleDisplayName(userRole)} Specific Details
                </h2>
                <p className="text-gray-600 mt-2">
                  Complete your professional profile
                </p>
              </div>

              <div className="space-y-4">
                {userRole === "assessor" && (
                  <div>
                    <Label htmlFor="license">Assessor License Number</Label>
                    <Input
                      id="license"
                      placeholder="License number"
                      value={assessorLicenseNumber}
                      onChange={(e) => setAssessorLicenseNumber(e.target.value)}
                    />
                    <p className="text-sm text-gray-500 mt-1">
                      Your professional license or certification number
                    </p>
                  </div>
                )}

                {userRole === "insurer" && (
                  <div>
                    <Label htmlFor="registration">Insurance Registration Number</Label>
                    <Input
                      id="registration"
                      placeholder="Registration number"
                      value={insurerRegistrationNumber}
                      onChange={(e) => setInsurerRegistrationNumber(e.target.value)}
                    />
                    <p className="text-sm text-gray-500 mt-1">
                      Your insurance company registration number
                    </p>
                  </div>
                )}

                {userRole === "panel_beater" && (
                  <div>
                    <Label htmlFor="certification">Certification/Trade License</Label>
                    <Input
                      id="certification"
                      placeholder="Certification number"
                      value={panelBeaterCertification}
                      onChange={(e) => setPanelBeaterCertification(e.target.value)}
                    />
                    <p className="text-sm text-gray-500 mt-1">
                      Your trade license or certification number
                    </p>
                  </div>
                )}

                {userRole === "fleet_manager" && (
                  <div>
                    <Label htmlFor="fleetSize">Fleet Size</Label>
                    <Input
                      id="fleetSize"
                      type="number"
                      placeholder="Number of vehicles"
                      value={fleetSize}
                      onChange={(e) => setFleetSize(e.target.value)}
                    />
                    <p className="text-sm text-gray-500 mt-1">
                      Total number of vehicles in your fleet
                    </p>
                  </div>
                )}

                <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 mt-6">
                  <h3 className="font-semibold text-secondary mb-2">What's Next?</h3>
                  <ul className="text-sm text-secondary space-y-1">
                    {userRole === "assessor" && (
                      <>
                        <li>• Access your assigned claims dashboard</li>
                        <li>• Schedule appointments with claimants</li>
                        <li>• Submit damage assessments and cost estimates</li>
                      </>
                    )}
                    {userRole === "insurer" && (
                      <>
                        <li>• Review incoming claims in your triage queue</li>
                        <li>• Assign assessors to claims</li>
                        <li>• Compare AI, assessor, and panel beater quotes</li>
                      </>
                    )}
                    {userRole === "panel_beater" && (
                      <>
                        <li>• Receive quote requests from assessors</li>
                        <li>• Submit detailed repair quotes</li>
                        <li>• Coordinate with assessors for inspections</li>
                      </>
                    )}
                    {userRole === "fleet_manager" && (
                      <>
                        <li>• Add vehicles to your fleet inventory</li>
                        <li>• Track maintenance schedules and costs</li>
                        <li>• Monitor fuel consumption and TCO analytics</li>
                      </>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="flex justify-between mt-8 pt-6 border-t">
          <Button
            variant="outline"
            onClick={prevStep}
            disabled={step === 1}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Previous
          </Button>

          {step < totalSteps ? (
            <Button
              onClick={nextStep}
              className="bg-emerald-600 hover:bg-emerald-700 flex items-center gap-2"
            >
              Next
              <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              onClick={completeOnboarding}
              className="bg-primary hover:bg-primary/90 flex items-center gap-2"
            >
              Complete Setup
              <CheckCircle2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function getRoleDisplayName(role: string): string {
  switch (role) {
    case "assessor":
      return "Assessor";
    case "insurer":
      return "Insurer";
    case "panel_beater":
      return "Panel Beater";
    case "fleet_manager":
      return "Fleet Manager";
    case "admin":
      return "Administrator";
    default:
      return "User";
  }
}
