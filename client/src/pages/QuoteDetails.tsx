import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, CheckCircle, Clock, Upload, FileText, CreditCard, Smartphone, Building2, Banknote } from "lucide-react";

/**
 * Quote Details Page
 * 
 * Displays insurance quote details and provides payment instructions for:
 * - Cash payments at office
 * - Bank transfers
 * - Mobile money (EcoCash, OneMoney)
 * - RTGS
 * - ZIPIT
 * 
 * Allows customers to upload proof of payment for verification by insurers.
 */
export default function QuoteDetails() {
  const { quoteId } = useParams<{ quoteId: string }>();
  const [, setLocation] = useLocation();
  
  // Form state for payment submission
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentProof, setPaymentProof] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  
  // Fetch quote details
  const { data: quote, isLoading, refetch } = trpc.insurance.getQuote.useQuery(
    { quoteId: parseInt(quoteId || "0") },
    { enabled: !!quoteId }
  );
  
  // Submit payment proof mutation
  const submitPaymentMutation = trpc.insurance.submitPaymentProof.useMutation({
    onSuccess: () => {
      toast.success("Payment proof submitted successfully! Awaiting verification.");
      refetch();
      // Reset form
      setPaymentMethod("");
      setReferenceNumber("");
      setPaymentDate("");
      setPaymentProof(null);
    },
    onError: (error: any) => {
      toast.error(`Error: ${error.message}`);
    },
  });
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setPaymentProof(e.target.files[0]);
    }
  };
  
  const handleSubmitPayment = async () => {
    if (!paymentMethod || !paymentDate || !paymentProof) {
      toast.error("Please fill in all required fields and upload payment proof");
      return;
    }
    
    setUploading(true);
    
    try {
      // Convert file to base64 for upload
      const reader = new FileReader();
      reader.readAsDataURL(paymentProof);
      reader.onload = async () => {
        const base64 = reader.result as string;
        
        await submitPaymentMutation.mutateAsync({
          quoteId: parseInt(quoteId || "0"),
          paymentMethod: paymentMethod as any,
          referenceNumber: referenceNumber || undefined,
          paymentDate: new Date(paymentDate),
          paymentProofBase64: base64,
          paymentProofFileName: paymentProof.name,
        });
        
        setUploading(false);
      };
      reader.onerror = () => {
        toast.error("Failed to read file");
        setUploading(false);
      };
    } catch (error: any) {
      toast.error(`Upload failed: ${error.message}`);
      setUploading(false);
    }
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }
  
  if (!quote) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Quote Not Found</CardTitle>
            <CardDescription>The requested quote could not be found.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setLocation("/insurance/quote")}>
              Get a New Quote
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  const monthlyPremium = quote.premiumAmount / 100;
  const annualPremium = monthlyPremium * 12;
  const validUntil = new Date(quote.quoteValidUntil);
  const isExpired = validUntil < new Date();
  
  // Parse driver details
  let driverDetails: any = {};
  try {
    driverDetails = JSON.parse(quote.driverDetails || "{}");
  } catch (e) {
    console.error("Failed to parse driver details");
  }
  
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Quote Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Insurance Quote</h1>
        <p className="text-gray-600 mt-2">Quote Number: {quote.quoteNumber}</p>
      </div>
      
      {/* Status Badge */}
      <div className="mb-6">
        {quote.status === "pending" && (
          <div className="flex items-center gap-2 text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3">
            <Clock className="h-5 w-5" />
            <span className="font-medium">Awaiting Payment</span>
          </div>
        )}
        {quote.status === "payment_submitted" && (
          <div className="flex items-center gap-2 text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
            <Clock className="h-5 w-5" />
            <span className="font-medium">Payment Verification in Progress</span>
          </div>
        )}
        {quote.status === "payment_verified" && (
          <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
            <CheckCircle className="h-5 w-5" />
            <span className="font-medium">Payment Verified - Policy Being Issued</span>
          </div>
        )}
        {quote.status === "accepted" && (
          <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
            <CheckCircle className="h-5 w-5" />
            <span className="font-medium">Policy Active</span>
          </div>
        )}
        {quote.status === "rejected" && (
          <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <span className="font-medium">Payment Rejected</span>
            {quote.paymentRejectionReason && (
              <span className="text-sm">- {quote.paymentRejectionReason}</span>
            )}
          </div>
        )}
        {isExpired && quote.status === "pending" && (
          <div className="flex items-center gap-2 text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
            <span className="font-medium">Quote Expired - Please Request a New Quote</span>
          </div>
        )}
      </div>
      
      {/* Quote Summary */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Quote Summary</CardTitle>
          <CardDescription>Valid until {validUntil.toLocaleDateString()}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-600">Monthly Premium</Label>
              <p className="text-2xl font-bold text-emerald-600">${monthlyPremium.toFixed(2)}</p>
            </div>
            <div>
              <Label className="text-gray-600">Annual Premium</Label>
              <p className="text-2xl font-bold text-gray-900">${annualPremium.toFixed(2)}</p>
            </div>
          </div>
          
          <div className="border-t pt-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Coverage Type</span>
              <span className="font-medium">Comprehensive</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Excess Amount</span>
              <span className="font-medium">${(quote.excessAmount || 0) / 100}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Driver Age</span>
              <span className="font-medium">{driverDetails.age} years</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Annual Mileage</span>
              <span className="font-medium capitalize">{driverDetails.annualMileage}</span>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Payment Instructions */}
      {(quote.status === "pending" || quote.status === "rejected") && !isExpired && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Payment Instructions</CardTitle>
            <CardDescription>Choose your preferred payment method and complete payment</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Payment Methods */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Bank Transfer */}
              <Card className="border-2 hover:border-emerald-500 cursor-pointer transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-emerald-600" />
                    <CardTitle className="text-lg">Bank Transfer</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="text-sm space-y-1">
                  <p><strong>Bank:</strong> CBZ Bank</p>
                  <p><strong>Account Name:</strong> KINGA Insurance</p>
                  <p><strong>Account Number:</strong> 01234567890</p>
                  <p><strong>Branch:</strong> Harare Main</p>
                  <p className="text-gray-600 text-xs mt-2">Use quote number as reference</p>
                </CardContent>
              </Card>
              
              {/* Mobile Money - EcoCash */}
              <Card className="border-2 hover:border-emerald-500 cursor-pointer transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-5 w-5 text-emerald-600" />
                    <CardTitle className="text-lg">EcoCash</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="text-sm space-y-1">
                  <p><strong>Merchant Code:</strong> 123456</p>
                  <p><strong>Number:</strong> 0771234567</p>
                  <p><strong>Name:</strong> KINGA Insurance</p>
                  <p className="text-gray-600 text-xs mt-2">Use quote number as reference</p>
                </CardContent>
              </Card>
              
              {/* Mobile Money - OneMoney */}
              <Card className="border-2 hover:border-emerald-500 cursor-pointer transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-5 w-5 text-emerald-600" />
                    <CardTitle className="text-lg">OneMoney</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="text-sm space-y-1">
                  <p><strong>Merchant Code:</strong> 789012</p>
                  <p><strong>Number:</strong> 0712345678</p>
                  <p><strong>Name:</strong> KINGA Insurance</p>
                  <p className="text-gray-600 text-xs mt-2">Use quote number as reference</p>
                </CardContent>
              </Card>
              
              {/* Cash Payment */}
              <Card className="border-2 hover:border-emerald-500 cursor-pointer transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Banknote className="h-5 w-5 text-emerald-600" />
                    <CardTitle className="text-lg">Cash Payment</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="text-sm space-y-1">
                  <p><strong>Office:</strong> KINGA Harare</p>
                  <p><strong>Address:</strong> 123 Nelson Mandela Ave</p>
                  <p><strong>Hours:</strong> Mon-Fri 8AM-5PM</p>
                  <p className="text-gray-600 text-xs mt-2">Bring quote number for reference</p>
                </CardContent>
              </Card>
            </div>
            
            {/* Upload Payment Proof Form */}
            <div className="border-t pt-6 space-y-4">
              <h3 className="font-semibold text-lg">Submit Payment Proof</h3>
              
              <div className="space-y-4">
                <div>
                  <Label htmlFor="paymentMethod">Payment Method *</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select payment method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="ecocash">EcoCash</SelectItem>
                      <SelectItem value="onemoney">OneMoney</SelectItem>
                      <SelectItem value="rtgs">RTGS</SelectItem>
                      <SelectItem value="zipit">ZIPIT</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="referenceNumber">Reference Number (Optional)</Label>
                  <Input
                    id="referenceNumber"
                    placeholder="Transaction/Receipt number"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                  />
                </div>
                
                <div>
                  <Label htmlFor="paymentDate">Payment Date *</Label>
                  <Input
                    id="paymentDate"
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                  />
                </div>
                
                <div>
                  <Label htmlFor="paymentProof">Upload Payment Proof * (Receipt, Screenshot, etc.)</Label>
                  <Input
                    id="paymentProof"
                    type="file"
                    accept="image/*,.pdf"
                    onChange={handleFileChange}
                  />
                  {paymentProof && (
                    <p className="text-sm text-gray-600 mt-1">
                      Selected: {paymentProof.name}
                    </p>
                  )}
                </div>
                
                <Button
                  onClick={handleSubmitPayment}
                  disabled={uploading || !paymentMethod || !paymentDate || !paymentProof}
                  className="w-full"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Submit Payment Proof
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Payment Submitted Info */}
      {quote.status === "payment_submitted" && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Payment Under Review</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p>Your payment proof has been submitted and is being verified by our team.</p>
            <div className="bg-gray-50 p-4 rounded-lg space-y-2 text-sm">
              <p><strong>Payment Method:</strong> {quote.paymentMethod?.toUpperCase()}</p>
              {quote.paymentReferenceNumber && (
                <p><strong>Reference:</strong> {quote.paymentReferenceNumber}</p>
              )}
              {quote.paymentDate && (
                <p><strong>Payment Date:</strong> {new Date(quote.paymentDate).toLocaleDateString()}</p>
              )}
              <p><strong>Submitted:</strong> {quote.paymentSubmittedAt ? new Date(quote.paymentSubmittedAt).toLocaleString() : "N/A"}</p>
            </div>
            <p className="text-sm text-gray-600 mt-4">
              We'll notify you once your payment is verified. This usually takes 1-2 business days.
            </p>
          </CardContent>
        </Card>
      )}
      
      {/* Actions */}
      <div className="flex gap-4">
        <Button variant="outline" onClick={() => setLocation("/")}>
          Back to Home
        </Button>
        {quote.status === "accepted" && (
          <Button onClick={() => setLocation("/insurance/dashboard")}>
            View My Policies
          </Button>
        )}
      </div>
    </div>
  );
}
