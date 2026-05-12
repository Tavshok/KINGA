new_content = r'''/**
 * FleetRegister
 *
 * Allows a claimant to self-register as a fleet manager for their company.
 * Submits a pending request that a claims manager must approve before access is granted.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  Building2,
  Clock,
  Loader2,
  ArrowLeft,
  Info,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function FleetRegister() {
  const [, setLocation] = useLocation();
  const [companyName, setCompanyName] = useState("");
  const [companyRegistration, setCompanyRegistration] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submittedCompany, setSubmittedCompany] = useState("");

  const registerMutation = trpc.fleetAccounts.registerAsFleetManager.useMutation({
    onSuccess: (data) => {
      if (data.status === "approved") {
        toast.success("Your fleet manager access is already approved.");
        setLocation("/claimant/fleet-dashboard");
        return;
      }
      setSubmittedCompany(companyName.trim());
      setSubmitted(true);
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
      companyReg: companyRegistration.trim() || undefined,
      jobTitle: jobTitle.trim() || undefined,
      contactPhone: contactPhone.trim() || undefined,
    });
  };

  if (submitted) {
    return (
      <div className="p-8 max-w-lg mx-auto">
        <div className="text-center py-12 space-y-5">
          <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto">
            <Clock className="h-8 w-8 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Request Submitted — Pending Approval</h2>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto">
              Your fleet manager registration for <strong>{submittedCompany}</strong> has been submitted. A claims manager will review and approve your request.
            </p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-left space-y-2">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              What happens next?
            </p>
            <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-1 list-disc list-inside">
              <li>A claims manager will review your request</li>
              <li>Once approved, your account will be upgraded to fleet manager</li>
              <li>You will then be able to view all company vehicle claims</li>
              <li>This typically takes 1-2 business days</li>
            </ul>
          </div>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => setLocation("/claimant/dashboard")}>
              Back to Dashboard
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => setLocation("/claimant/fleet-dashboard")}>
              Check Status
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-lg mx-auto space-y-6">
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
          Register as Fleet Manager
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Request fleet manager access to view all company vehicle claims in one place.
        </p>
      </div>

      <div className="flex gap-3 p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
          <p className="font-medium">Approval required</p>
          <p className="text-xs text-blue-600 dark:text-blue-400">
            Fleet manager access is granted after review by a claims manager. Once approved, you can view all claims submitted under your company name, track vehicle status, and see risk analytics across your fleet.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Company Details</CardTitle>
          <CardDescription>
            Enter your company details. The company name must match exactly what employees type when submitting claims.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Company Name <span className="text-destructive">*</span></Label>
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
              <Label>Your Job Title</Label>
              <Input
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="e.g., Fleet Manager, Transport Officer"
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
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting Request...</>
              ) : (
                <><Building2 className="mr-2 h-4 w-4" />Submit Registration Request</>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
'''

with open('client/src/pages/FleetRegister.tsx', 'w') as f:
    f.write(new_content)
print('FleetRegister.tsx written successfully')
