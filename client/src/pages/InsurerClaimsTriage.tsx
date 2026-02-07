import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {  ArrowLeft, CheckCircle, XCircle, Zap, Eye, BarChart3, Search } from "lucide-react";
import KingaLogo from "@/components/KingaLogo";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useState, useMemo } from "react";

export default function InsurerClaimsTriage() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedAssessors, setSelectedAssessors] = useState<Record<number, number>>({});
  const [searchQuery, setSearchQuery] = useState("");
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Get pending claims
  const { data: allClaims = [], refetch: refetchClaims } = trpc.claims.byStatus.useQuery({
    status: "submitted",
  });

  // Filter claims by registration number or claim number
  const claims = useMemo(() => {
    if (!searchQuery.trim()) return allClaims;
    const query = searchQuery.toLowerCase().trim();
    return allClaims.filter(claim => 
      claim.claimNumber.toLowerCase().includes(query) ||
      claim.vehicleRegistration?.toLowerCase().includes(query)
    );
  }, [allClaims, searchQuery]);

  // Get list of assessors
  const { data: assessors = [] } = trpc.assessors.list.useQuery();

  // Mutations
  const verifyPolicy = trpc.claims.verifyPolicy.useMutation({
    onSuccess: () => {
      toast.success("Policy verification updated");
      refetchClaims();
    },
    onError: (error) => {
      toast.error(`Failed to verify policy: ${error.message}`);
    },
  });

  const assignToAssessor = trpc.claims.assignToAssessor.useMutation({
    onSuccess: () => {
      toast.success("Claim assigned to assessor");
      refetchClaims();
    },
    onError: (error) => {
      toast.error(`Failed to assign claim: ${error.message}`);
    },
  });

  const triggerAiAssessment = trpc.claims.triggerAiAssessment.useMutation({
    onSuccess: (data, variables) => {
      toast.success("AI assessment completed successfully");
      refetchClaims();
      // Navigate to comparison view to show results
      setLocation(`/insurer/claims/${variables.claimId}/comparison`);
    },
    onError: (error) => {
      toast.error(`Failed to trigger AI assessment: ${error.message}`);
    },
  });

  const handleVerifyPolicy = (claimId: number, verified: boolean) => {
    verifyPolicy.mutate({ claimId, verified });
  };

  const handleAssignAssessor = (claimId: number) => {
    const assessorId = selectedAssessors[claimId];
    if (!assessorId) {
      toast.error("Please select an assessor");
      return;
    }
    assignToAssessor.mutate({ claimId, assessorId });
  };

  const handleTriggerAi = (claimId: number) => {
    triggerAiAssessment.mutate({ claimId });
  };

  // Paginate claims
  const paginatedClaims = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return claims.slice(startIndex, endIndex);
  }, [claims, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(claims.length / itemsPerPage);

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { className: string; label: string }> = {
      submitted: { 
        className: "bg-gradient-to-r from-blue-400 to-blue-500 text-white border-none", 
        label: "Pending Triage" 
      },
      triage: { 
        className: "bg-gradient-to-r from-amber-400 to-orange-500 text-white border-none", 
        label: "In Triage" 
      },
      assessment_pending: { 
        className: "bg-gradient-to-r from-purple-400 to-purple-500 text-white border-none", 
        label: "Assessment Pending" 
      },
      assessment_in_progress: { 
        className: "bg-gradient-to-r from-indigo-400 to-indigo-500 text-white border-none", 
        label: "Assessment In Progress" 
      },
      quotes_pending: { 
        className: "bg-gradient-to-r from-pink-400 to-pink-500 text-white border-none", 
        label: "Quotes Pending" 
      },
      comparison: { 
        className: "bg-gradient-to-r from-cyan-400 to-cyan-500 text-white border-none", 
        label: "In Comparison" 
      },
      repair_assigned: { 
        className: "bg-gradient-to-r from-teal-400 to-teal-500 text-white border-none", 
        label: "Repair Assigned" 
      },
      repair_in_progress: { 
        className: "bg-gradient-to-r from-lime-400 to-lime-500 text-white border-none", 
        label: "Repair In Progress" 
      },
      completed: { 
        className: "bg-gradient-to-r from-emerald-400 to-green-500 text-white border-none", 
        label: "Completed" 
      },
      rejected: { 
        className: "bg-gradient-to-r from-rose-400 to-red-500 text-white border-none", 
        label: "Rejected" 
      },
    };
    const config = statusConfig[status] || { 
      className: "bg-gray-100 text-gray-800", 
      label: status 
    };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <KingaLogo />
              <div>
                <p className="text-sm text-muted-foreground">Claims Triage</p>
                <p className="text-sm text-muted-foreground">Review and process submitted claims</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setLocation("/insurer/dashboard")}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Dashboard
              </Button>
              <div className="text-right">
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => logout()}>
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Pending Claims</CardTitle>
                <CardDescription>
                  {claims.length} claim(s) awaiting triage and processing
                </CardDescription>
              </div>
              <div className="relative w-80">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search by claim # or registration (e.g., AEW2816)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {claims.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No pending claims</p>
                <p className="text-sm mt-2">Claims submitted by claimants will appear here</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Claim #</TableHead>
                    <TableHead>Claimant</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Policy</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedClaims.map((claim) => (
                    <TableRow key={claim.id}>
                      <TableCell className="font-mono text-sm">
                        {claim.claimNumber}
                      </TableCell>
                      <TableCell>Claimant #{claim.claimantId}</TableCell>
                      <TableCell>
                        {claim.vehicleMake} {claim.vehicleModel} ({claim.vehicleYear})
                      </TableCell>
                      <TableCell>
                        {claim.incidentDate ? new Date(claim.incidentDate).toLocaleDateString() : "N/A"}
                      </TableCell>
                      <TableCell>{getStatusBadge(claim.status)}</TableCell>
                      <TableCell>
                        {claim.policyVerified === null ? (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2"
                              onClick={() => handleVerifyPolicy(claim.id, true)}
                              disabled={verifyPolicy.isPending}
                            >
                              <CheckCircle className="h-3 w-3 mr-1 text-green-600" />
                              Verify
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2"
                              onClick={() => handleVerifyPolicy(claim.id, false)}
                              disabled={verifyPolicy.isPending}
                            >
                              <XCircle className="h-3 w-3 mr-1 text-red-600" />
                              Reject
                            </Button>
                          </div>
                        ) : claim.policyVerified ? (
                          <Badge variant="default" className="bg-green-600">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Verified
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <XCircle className="h-3 w-3 mr-1" />
                            Rejected
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-2 min-w-[200px]">
                          <div className="flex gap-1">
                            <Select
                              value={selectedAssessors[claim.id]?.toString() || ""}
                              onValueChange={(value) =>
                                setSelectedAssessors((prev) => ({
                                  ...prev,
                                  [claim.id]: parseInt(value),
                                }))
                              }
                            >
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue placeholder="Select assessor" />
                              </SelectTrigger>
                              <SelectContent>
                                {assessors.map((assessor) => (
                                  <SelectItem key={assessor.id} value={assessor.id.toString()}>
                                    {assessor.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 px-2"
                              onClick={() => handleAssignAssessor(claim.id)}
                              disabled={!selectedAssessors[claim.id] || assignToAssessor.isPending}
                            >
                              Assign
                            </Button>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 flex-1"
                              onClick={() => handleTriggerAi(claim.id)}
                              disabled={triggerAiAssessment.isPending}
                            >
                              <Zap className="h-3 w-3 mr-1" />
                              AI Assess
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2"
                              onClick={() => setLocation(`/insurer/claims/${claim.id}`)}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              View
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 px-2"
                              onClick={() => setLocation(`/insurer/claims/${claim.id}/comparison`)}
                            >
                              <BarChart3 className="h-3 w-3 mr-1" />
                              Compare
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            
            {/* Pagination Controls */}
            {claims.length > itemsPerPage && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, claims.length)} of {claims.length} claims
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                      <Button
                        key={page}
                        variant={page === currentPage ? "default" : "outline"}
                        size="sm"
                        className="w-8 h-8 p-0"
                        onClick={() => setCurrentPage(page)}
                      >
                        {page}
                      </Button>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
