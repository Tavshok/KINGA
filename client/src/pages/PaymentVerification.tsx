import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, CheckCircle, XCircle, Eye, Download, Calendar, CreditCard, FileText } from "lucide-react";

/**
 * Payment Verification Dashboard
 * 
 * For insurers to review and verify customer payment proofs.
 * Supports approval/rejection workflow with reasons.
 */
export default function PaymentVerification() {
  const [selectedQuote, setSelectedQuote] = useState<any>(null);
  const [showProofDialog, setShowProofDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  
  // Fetch pending payments
  const { data: pendingPayments, isLoading, refetch } = trpc.insurance.getPendingPayments.useQuery();
  
  // Verify payment mutation
  const verifyPaymentMutation = trpc.insurance.verifyPayment.useMutation({
    onSuccess: () => {
      toast.success("Payment verified successfully!");
      refetch();
      setSelectedQuote(null);
      setShowProofDialog(false);
    },
    onError: (error: any) => {
      toast.error(`Error: ${error.message}`);
    },
  });
  
  // Reject payment mutation
  const rejectPaymentMutation = trpc.insurance.rejectPayment.useMutation({
    onSuccess: () => {
      toast.success("Payment rejected");
      refetch();
      setSelectedQuote(null);
      setShowRejectDialog(false);
      setRejectionReason("");
    },
    onError: (error: any) => {
      toast.error(`Error: ${error.message}`);
    },
  });
  
  const handleVerifyPayment = (quoteId: number) => {
    if (confirm("Confirm payment verification? This will trigger policy issuance.")) {
      verifyPaymentMutation.mutate({ quoteId });
    }
  };
  
  const handleRejectPayment = () => {
    if (!rejectionReason.trim()) {
      toast.error("Please provide a rejection reason");
      return;
    }
    
    rejectPaymentMutation.mutate({
      quoteId: selectedQuote.id,
      reason: rejectionReason,
    });
  };
  
  const handleViewProof = (quote: any) => {
    setSelectedQuote(quote);
    setShowProofDialog(true);
  };
  
  const handleRejectClick = (quote: any) => {
    setSelectedQuote(quote);
    setShowRejectDialog(true);
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }
  
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-foreground">Payment Verification</h1>
        <p className="text-gray-600 dark:text-muted-foreground mt-2">Review and verify customer payment submissions</p>
      </div>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-muted-foreground">Pending Verification</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">
              {pendingPayments?.length || 0}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-muted-foreground">Total Amount</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-600">
              ${((pendingPayments?.reduce((sum: number, p: any) => sum + (p.paymentAmount || 0), 0) || 0)).toFixed(2)}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-muted-foreground">Avg. Processing Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">
              1.5 days
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Pending Payments List */}
      {!pendingPayments || pendingPayments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle className="h-12 w-12 text-emerald-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-foreground mb-2">All Caught Up!</h3>
            <p className="text-gray-600 dark:text-muted-foreground">No pending payment verifications at the moment.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {pendingPayments.map((quote: any) => {
            const monthlyPremium = quote.premiumAmount.toFixed(2);
            const paymentAmount = (quote.paymentAmount || 0).toFixed(2);
            
            return (
              <Card key={quote.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">Quote #{quote.quoteNumber}</CardTitle>
                      <CardDescription className="mt-1">
                        Submitted {quote.paymentSubmittedAt ? new Date(quote.paymentSubmittedAt).toLocaleString() : "N/A"}
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="bg-yellow-50 dark:bg-yellow-950/30 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800">
                      Pending Verification
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Payment Details */}
                    <div className="space-y-3">
                      <h4 className="font-semibold text-gray-900 dark:text-foreground flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        Payment Details
                      </h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-muted-foreground">Method:</span>
                          <span className="font-medium uppercase">{quote.paymentMethod}</span>
                        </div>
                        {quote.paymentReferenceNumber && (
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-muted-foreground">Reference:</span>
                            <span className="font-medium">{quote.paymentReferenceNumber}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-muted-foreground">Payment Date:</span>
                          <span className="font-medium">
                            {quote.paymentDate ? new Date(quote.paymentDate).toLocaleDateString() : "N/A"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-muted-foreground">Amount Paid:</span>
                          <span className="font-bold text-emerald-600">${paymentAmount}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-muted-foreground">Expected Amount:</span>
                          <span className="font-medium">${monthlyPremium}</span>
                        </div>
                        {paymentAmount !== monthlyPremium && (
                          <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded p-2 text-xs text-yellow-700 dark:text-yellow-300">
                            ⚠️ Amount mismatch detected
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Quote Details */}
                    <div className="space-y-3">
                      <h4 className="font-semibold text-gray-900 dark:text-foreground flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Quote Details
                      </h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-muted-foreground">Customer ID:</span>
                          <span className="font-medium">{quote.customerId}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-muted-foreground">Vehicle ID:</span>
                          <span className="font-medium">{quote.vehicleId}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-muted-foreground">Coverage:</span>
                          <span className="font-medium">Comprehensive</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-muted-foreground">Valid Until:</span>
                          <span className="font-medium">
                            {new Date(quote.quoteValidUntil).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Actions */}
                  <div className="flex gap-3 mt-6 pt-6 border-t">
                    <Button
                      onClick={() => handleViewProof(quote)}
                      variant="outline"
                      className="flex-1"
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      View Proof
                    </Button>
                    <Button
                      onClick={() => handleVerifyPayment(quote.id)}
                      disabled={verifyPaymentMutation.isPending}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                    >
                      {verifyPaymentMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle className="mr-2 h-4 w-4" />
                      )}
                      Verify Payment
                    </Button>
                    <Button
                      onClick={() => handleRejectClick(quote)}
                      disabled={rejectPaymentMutation.isPending}
                      variant="destructive"
                      className="flex-1"
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      
      {/* View Proof Dialog */}
      <Dialog open={showProofDialog} onOpenChange={setShowProofDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Payment Proof</DialogTitle>
            <DialogDescription>
              Quote #{selectedQuote?.quoteNumber} - {selectedQuote?.paymentMethod?.toUpperCase()}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {selectedQuote?.paymentProofS3Url ? (
              <div className="border rounded-lg overflow-hidden">
                <img
                  src={selectedQuote.paymentProofS3Url}
                  alt="Payment Proof"
                  className="w-full h-auto"
                />
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500 dark:text-muted-foreground">
                No payment proof available
              </div>
            )}
            
            <div className="flex gap-3">
              <Button
                onClick={() => window.open(selectedQuote?.paymentProofS3Url, '_blank')}
                variant="outline"
                className="flex-1"
              >
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
              <Button
                onClick={() => {
                  setShowProofDialog(false);
                  handleVerifyPayment(selectedQuote?.id);
                }}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Verify Payment
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Payment</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this payment. The customer will be notified.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="rejectionReason">Rejection Reason *</Label>
              <Textarea
                id="rejectionReason"
                placeholder="e.g., Payment amount incorrect, unclear receipt, wrong reference number..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={4}
              />
            </div>
            
            <div className="flex gap-3">
              <Button
                onClick={() => {
                  setShowRejectDialog(false);
                  setRejectionReason("");
                }}
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleRejectPayment}
                disabled={rejectPaymentMutation.isPending || !rejectionReason.trim()}
                variant="destructive"
                className="flex-1"
              >
                {rejectPaymentMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="mr-2 h-4 w-4" />
                )}
                Confirm Rejection
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
