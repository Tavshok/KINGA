/**
 * FleetRegister
 *
 * Allows a claimant to self-register as a fleet manager for their company.
 * Once registered, they can view all claims submitted under the company name.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  Building2,
  CheckCircle2,
  Loader2,
  ArrowLeft,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function FleetRegister() {
  const [, setLocation] = useLocation();
  const [companyName, setCompanyName] = useState("");
  const [companyRegistration, setCompanyRegistration] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [done, setDone] = useState(false);

  const registerMutation = trpc.fleetAccounts.registerAsFleetManager.useMutation({
    onSuccess: () => {
      setDone(true);
    },
    onError: (err) => {
      toast.error(err.message ?? "Registration failed. Please try again.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) {
      toast.error("Company name is required");
      return;
    }
    registerMutation.mutate({
      companyName: companyName.trim(),
      companyRegistration: companyRegistration.trim() || undefined,
      contactPerson: contactPerson.trim() || undefined,
      contactPhone: contactPhone.trim() || undefined,
    });
  };

  if (done) {
    return (
      <div className="p-8 max-w-lg mx-auto">
        <div className="text-center py-12 space-y-4">
          <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-500" />
          <h2 className="text-xl font-semibold">Fleet Account Registered</h2>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">
            Your fleet manager account for <strong>{companyName}</strong> has been created. All claims submitted under this company name will now appear in your Fleet Dashboard.
          </p>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={() => setLocation("/claimant/fleet-dashboard")}
          >
            Go to Fleet Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-lg mx-auto space-y-6">
      {/* Back */}
      <button
        type="button"
        onClick={() => setLocation("/claimant/dashboard")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Dashboard
      </button>

      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Building2 className="h-5 w-5 text-emerald-600" />
          Register Fleet Account
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Register your company to manage all vehicle claims in one place.
        </p>
      </div>

      {/* Info banner */}
      <div className="flex gap-3 p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
          <p className="font-medium">How fleet accounts work</p>
          <p className="text-xs text-blue-600 dark:text-blue-400">
            Any employee who submits a claim and enters your company name will have their claim automatically linked to this fleet account. You can then view all company claims, track time at garages, and download reports — even if claims were submitted from different branches.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Company Details</CardTitle>
          <CardDescription>
            Enter your company's details exactly as employees will type them when submitting claims.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Company Name *</Label>
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g., ZESA Holdings"
                required
              />
              <p className="text-xs text-muted-foreground">
                This must match exactly what employees type when submitting claims.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Company Registration Number</Label>
              <Input
                value={companyRegistration}
                onChange={(e) => setCompanyRegistration(e.target.value)}
                placeholder="e.g., 1234/2005"
              />
            </div>

            <div className="space-y-2">
              <Label>Your Name (Fleet Manager)</Label>
              <Input
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="Full name"
              />
            </div>

            <div className="space-y-2">
              <Label>Contact Phone</Label>
              <Input
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="+263 77 123 4567"
                type="tel"
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              disabled={registerMutation.isPending}
            >
              {registerMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Registering...
                </>
              ) : (
                <>
                  <Building2 className="mr-2 h-4 w-4" />
                  Register Fleet Account
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
