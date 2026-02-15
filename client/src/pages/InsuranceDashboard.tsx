import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, FileText, Shield, Clock, CheckCircle, XCircle, AlertCircle, Plus, Download } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

/**
 * Insurance Dashboard
 * 
 * Customer dashboard for viewing:
 * - Active policies
 * - Pending quotes
 * - Payment status
 * - Policy documents
 */
export default function InsuranceDashboard() {
  const [, setLocation] = useLocation();
  
  // Fetch customer's policies
  const { data: policies, isLoading: policiesLoading } = trpc.insurance.getMyPolicies.useQuery();
  
  // Fetch customer's quotes
  const { data: quotes, isLoading: quotesLoading } = trpc.insurance.getMyQuotes.useQuery();
  
  // PDF download mutation
  const downloadPDFMutation = trpc.insurance.downloadPolicyPDF.useMutation();
  
  const isLoading = policiesLoading || quotesLoading;
  
  // Handle PDF download
  const handleDownloadPDF = async (policyId: number, policyNumber: string) => {
    try {
      const result = await downloadPDFMutation.mutateAsync({ policyId });
      
      if (result.success && result.data) {
        // Convert base64 to blob
        const byteCharacters = atob(result.data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });
        
        // Create download link
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = result.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        
        toast.success('Policy document downloaded successfully');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to download policy document');
    }
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }
  
  const activePolicies = policies?.filter((p: any) => p.status === 'active') || [];
  const pendingQuotes = quotes?.filter((q: any) => ['pending', 'payment_pending', 'payment_submitted'].includes(q.status)) || [];
  const rejectedQuotes = quotes?.filter((q: any) => q.status === 'rejected') || [];
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-emerald-600">Active</Badge>;
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Awaiting Payment</Badge>;
      case 'payment_submitted':
        return <Badge variant="outline" className="bg-primary/5 text-primary/90 border-primary/20">Verifying Payment</Badge>;
      case 'payment_verified':
        return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Payment Verified</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Payment Rejected</Badge>;
      case 'expired':
        return <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">Expired</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };
  
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Insurance Dashboard</h1>
          <p className="text-gray-600 mt-2">Manage your policies and quotes</p>
        </div>
        <Button onClick={() => setLocation("/insurance/quote")} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="mr-2 h-4 w-4" />
          Get New Quote
        </Button>
      </div>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Active Policies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-600">
              {activePolicies.length}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Pending Quotes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">
              {pendingQuotes.length}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Total Coverage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">
              ${((activePolicies.reduce((sum: number, p: any) => sum + (p.premiumAmount || 0), 0)) / 100 * 12).toFixed(0)}
            </div>
            <p className="text-xs text-gray-500 mt-1">Annual value</p>
          </CardContent>
        </Card>
      </div>
      
      {/* Tabs */}
      <Tabs defaultValue="policies" className="space-y-6">
        <TabsList>
          <TabsTrigger value="policies">Active Policies</TabsTrigger>
          <TabsTrigger value="quotes">Pending Quotes</TabsTrigger>
          <TabsTrigger value="rejected">Rejected Payments</TabsTrigger>
        </TabsList>
        
        {/* Active Policies Tab */}
        <TabsContent value="policies" className="space-y-4">
          {activePolicies.length === 0 ? (
            <EmptyState
              icon={Shield}
              title="No Active Policies"
              description="Get started by requesting a quote for your vehicle. Our AI-powered system will provide instant pricing."
              actionLabel="Get a Quote"
              onAction={() => setLocation("/insurance/quote")}
            />
          ) : (
            activePolicies.map((policy: any) => {
              const monthlyPremium = (policy.premiumAmount / 100).toFixed(2);
              const startDate = new Date(policy.coverageStartDate);
              const endDate = new Date(policy.coverageEndDate);
              const daysRemaining = Math.ceil((endDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
              
              return (
                <Card key={policy.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg">Policy #{policy.policyNumber}</CardTitle>
                        <CardDescription className="mt-1">
                          Valid until {endDate.toLocaleDateString()}
                        </CardDescription>
                      </div>
                      {getStatusBadge(policy.status)}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <h4 className="font-semibold text-gray-900">Coverage Details</h4>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Type:</span>
                            <span className="font-medium">Comprehensive</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Monthly Premium:</span>
                            <span className="font-bold text-emerald-600">${monthlyPremium}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Excess:</span>
                            <span className="font-medium">${(policy.excessAmount || 0) / 100}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <h4 className="font-semibold text-gray-900">Policy Period</h4>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Start Date:</span>
                            <span className="font-medium">{startDate.toLocaleDateString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">End Date:</span>
                            <span className="font-medium">{endDate.toLocaleDateString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Days Remaining:</span>
                            <span className="font-medium">{daysRemaining} days</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {daysRemaining <= 30 && (
                      <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-center gap-2 text-sm text-yellow-700">
                        <AlertCircle className="h-4 w-4" />
                        <span>Your policy expires in {daysRemaining} days. Consider renewing soon.</span>
                      </div>
                    )}
                    
                    <div className="flex gap-3 mt-6 pt-6 border-t">
                      <Button 
                        variant="outline" 
                        className="flex-1"
                        onClick={() => handleDownloadPDF(policy.id, policy.policyNumber)}
                        disabled={downloadPDFMutation.isPending}
                      >
                        {downloadPDFMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="mr-2 h-4 w-4" />
                        )}
                        Download Policy PDF
                      </Button>
                      <Button variant="outline" className="flex-1">
                        View Claims
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>
        
        {/* Pending Quotes Tab */}
        <TabsContent value="quotes" className="space-y-4">
          {pendingQuotes.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle className="h-12 w-12 text-emerald-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Pending Quotes</h3>
                <p className="text-gray-600">All your quotes have been processed.</p>
              </CardContent>
            </Card>
          ) : (
            pendingQuotes.map((quote: any) => {
              const monthlyPremium = (quote.premiumAmount / 100).toFixed(2);
              const validUntil = new Date(quote.quoteValidUntil);
              const isExpired = validUntil < new Date();
              
              return (
                <Card key={quote.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg">Quote #{quote.quoteNumber}</CardTitle>
                        <CardDescription className="mt-1">
                          {isExpired ? 'Expired' : `Valid until ${validUntil.toLocaleDateString()}`}
                        </CardDescription>
                      </div>
                      {getStatusBadge(quote.status)}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm text-gray-600">Monthly Premium</p>
                          <p className="text-2xl font-bold text-emerald-600">${monthlyPremium}</p>
                        </div>
                        <Button 
                          onClick={() => setLocation(`/insurance/quote/${quote.id}`)}
                          disabled={isExpired}
                        >
                          {quote.status === 'pending' ? 'Complete Payment' : 'View Details'}
                        </Button>
                      </div>
                      
                      {quote.status === 'payment_submitted' && (
                        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-sm text-primary/90">
                          <p className="font-medium">Payment verification in progress</p>
                          <p className="text-xs mt-1">We're reviewing your payment proof. This usually takes 1-2 business days.</p>
                        </div>
                      )}
                      
                      {isExpired && (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-700">
                          <p className="font-medium">Quote expired</p>
                          <p className="text-xs mt-1">Please request a new quote to get updated pricing.</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>
        
        {/* Rejected Payments Tab */}
        <TabsContent value="rejected" className="space-y-4">
          {rejectedQuotes.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle className="h-12 w-12 text-emerald-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Rejected Payments</h3>
                <p className="text-gray-600">All your payment submissions have been accepted.</p>
              </CardContent>
            </Card>
          ) : (
            rejectedQuotes.map((quote: any) => {
              const monthlyPremium = (quote.premiumAmount / 100).toFixed(2);
              
              return (
                <Card key={quote.id} className="border-red-200">
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg">Quote #{quote.quoteNumber}</CardTitle>
                        <CardDescription className="mt-1">
                          Payment rejected
                        </CardDescription>
                      </div>
                      {getStatusBadge(quote.status)}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <p className="font-medium text-red-900 text-sm">Rejection Reason:</p>
                        <p className="text-sm text-red-700 mt-1">{quote.paymentRejectionReason || 'No reason provided'}</p>
                      </div>
                      
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm text-gray-600">Monthly Premium</p>
                          <p className="text-2xl font-bold text-emerald-600">${monthlyPremium}</p>
                        </div>
                        <Button 
                          onClick={() => setLocation(`/insurance/quote/${quote.id}`)}
                          className="bg-emerald-600 hover:bg-emerald-700"
                        >
                          Resubmit Payment
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
