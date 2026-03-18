import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, Car, DollarSign, Calendar, Phone, Mail, User } from "lucide-react";

/**
 * Insurance Quote Request Page
 * 
 * Streamlined 7-field quote flow for instant insurance quotes:
 * 1. Vehicle registration number
 * 2. Make (autocomplete with free-form)
 * 3. Model (free-form)
 * 4. Year of manufacture
 * 5. Current value (or KINGA estimate)
 * 6. Primary driver age
 * 7. Annual mileage
 * 8. Phone number
 * 9. Email (optional)
 * 
 * No claims history required - KINGA builds its own intelligence database
 */
export default function InsuranceQuote() {
  const [, setLocation] = useLocation();
  
  // Form state
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [value, setValue] = useState("");
  const [useKingaEstimate, setUseKingaEstimate] = useState(false);
  const [driverAge, setDriverAge] = useState("");
  const [mileage, setMileage] = useState<"low" | "medium" | "high">("medium");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  
  // Common vehicle makes for autocomplete
  const commonMakes = [
    "Toyota", "Honda", "Nissan", "Mazda", "BMW", "Mercedes-Benz",
    "Volkswagen", "Ford", "Chevrolet", "Hyundai", "Kia", "Isuzu",
    "Mitsubishi", "Subaru", "Audi", "Land Rover", "Jeep", "Peugeot"
  ];
  
  // Get valuation estimate
  const valuationMutation = trpc.insurance.getVehicleValuation.useMutation();
  
  // Submit quote request
  const quoteMutation = trpc.insurance.requestQuote.useMutation({
    onSuccess: (data) => {
      toast.success(`Quote Generated! Your instant quote: $${data.premiumAmount.toFixed(2)}/month`);
      setLocation(`/insurance/quote/${data.quoteId}`);
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });
  
  const handleGetEstimate = async () => {
    if (!make || !model || !year) {
      toast.error("Please enter vehicle make, model, and year first");
      return;
    }
    
    try {
      const result = await valuationMutation.mutateAsync({
        make,
        model,
        year: parseInt(year),
      });
      
      setValue(result.estimatedValue.toString());
      setUseKingaEstimate(true);
      
      toast.success(`KINGA estimates your vehicle at $${result.estimatedValue.toFixed(2)}`);
    } catch (error: any) {
      toast.error(`Valuation Error: ${error.message}`);
    }
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!registrationNumber || !make || !model || !year || !value || !driverAge || !phoneNumber) {
      toast.error("Please fill in all required fields");
      return;
    }
    
    await quoteMutation.mutateAsync({
      registrationNumber,
      make,
      model,
      year: parseInt(year),
      currentValue: parseInt(value),
      driverAge: parseInt(driverAge),
      annualMileage: mileage,
      phoneNumber,
      email: email || undefined,
    });
  };
  
  const isLoading = valuationMutation.isPending || quoteMutation.isPending;
  
  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-bold text-emerald-600 mb-2">Get Your Instant Quote</h1>
        <p className="text-muted-foreground">
          Complete in under 2 minutes • No claims history required • Powered by KINGA intelligence
        </p>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Car className="h-6 w-6 text-emerald-600" />
            Vehicle & Driver Information
          </CardTitle>
          <CardDescription>
            Tell us about your vehicle and we'll provide an instant quote
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Vehicle Details Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Car className="h-5 w-5" />
                Vehicle Details
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="registration">Registration Number *</Label>
                  <Input
                    id="registration"
                    placeholder="e.g., ABC-1234"
                    value={registrationNumber}
                    onChange={(e) => setRegistrationNumber(e.target.value.toUpperCase())}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="make">Make *</Label>
                  <Input
                    id="make"
                    placeholder="e.g., Toyota"
                    value={make}
                    onChange={(e) => setMake(e.target.value)}
                    list="makes"
                    required
                  />
                  <datalist id="makes">
                    {commonMakes.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                  <p className="text-xs text-muted-foreground">Start typing to see suggestions</p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="model">Model *</Label>
                  <Input
                    id="model"
                    placeholder="e.g., Corolla"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="year">Year of Manufacture *</Label>
                  <Input
                    id="year"
                    type="number"
                    placeholder="e.g., 2018"
                    min="1990"
                    max={new Date().getFullYear() + 1}
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    required
                  />
                </div>
                
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="value">Current Value (USD) *</Label>
                  <div className="flex gap-2">
                    <Input
                      id="value"
                      type="number"
                      placeholder="e.g., 15000"
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      disabled={useKingaEstimate}
                      required
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleGetEstimate}
                      disabled={isLoading || !make || !model || !year}
                    >
                      {valuationMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Estimating...
                        </>
                      ) : (
                        <>
                          <DollarSign className="mr-2 h-4 w-4" />
                          KINGA Estimate
                        </>
                      )}
                    </Button>
                  </div>
                  {useKingaEstimate && (
                    <p className="text-xs text-emerald-600">✓ Using KINGA's valuation estimate</p>
                  )}
                </div>
              </div>
            </div>
            
            {/* Driver & Usage Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <User className="h-5 w-5" />
                Driver & Usage
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="driverAge">Primary Driver Age *</Label>
                  <Input
                    id="driverAge"
                    type="number"
                    placeholder="e.g., 35"
                    min="18"
                    max="100"
                    value={driverAge}
                    onChange={(e) => setDriverAge(e.target.value)}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="mileage">Annual Mileage *</Label>
                  <Select value={mileage} onValueChange={(v: any) => setMileage(v)}>
                    <SelectTrigger id="mileage">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low (0-10,000 km/year)</SelectItem>
                      <SelectItem value="medium">Medium (10,000-20,000 km/year)</SelectItem>
                      <SelectItem value="high">High (20,000+ km/year)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            
            {/* Contact Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Phone className="h-5 w-5" />
                Contact Information
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="e.g., +263 77 123 4567"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="email">Email (Optional)</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your.email@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>
            </div>
            
            {/* Submit Button */}
            <div className="flex justify-end gap-4 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => setLocation("/")}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={isLoading}
              >
                {quoteMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating Quote...
                  </>
                ) : (
                  <>
                    <DollarSign className="mr-2 h-4 w-4" />
                    Get Instant Quote
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      
      {/* Trust Indicators */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg">
          <div className="text-3xl font-bold text-emerald-600">2 min</div>
          <div className="text-sm text-muted-foreground">Average completion time</div>
        </div>
        <div className="p-4 bg-primary/5 rounded-lg">
          <div className="text-3xl font-bold text-primary">7 fields</div>
          <div className="text-sm text-muted-foreground">Simple, streamlined form</div>
        </div>
        <div className="p-4 bg-purple-50 dark:bg-purple-950/30 rounded-lg">
          <div className="text-3xl font-bold text-purple-600">AI-powered</div>
          <div className="text-sm text-muted-foreground">KINGA intelligence engine</div>
        </div>
      </div>
    </div>
  );
}
