import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { INSURER_CLAIMS_LIST_PATH } from "@/lib/roleRouting";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Star, MapPin, Award, DollarSign } from "lucide-react";

export default function AssignAssessor() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const claimId = params.claimId ? parseInt(params.claimId) : null;

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRegion, setSelectedRegion] = useState("");
  const [selectedSpecialization, setSelectedSpecialization] = useState("");

  const { data: myAssessors, isLoading: loadingMy } = trpc.assessorOnboarding.listInsurerAssessors.useQuery();
  
  const { data: marketplaceAssessors, isLoading: loadingMarketplace } = trpc.assessorOnboarding.searchMarketplace.useQuery({
    serviceRegion: selectedRegion || undefined,
    specializations: selectedSpecialization ? [selectedSpecialization] : undefined,
    minPerformanceScore: undefined,
    minAverageRating: undefined,
  });

  const assignMutation = trpc.claims.assignToAssessor.useMutation({
    onSuccess: () => {
      alert(`Assessor successfully assigned to claim!`);
      setLocation(INSURER_CLAIMS_LIST_PATH);
    },
    onError: (error) => {
      alert(`Failed to assign assessor: ${error.message}`);
    },
  });

  const handleAssign = (assessorId: number) => {
    if (!claimId) {
      alert("No claim ID provided");
      return;
    }
    
    assignMutation.mutate({
      claimId,
      assessorId,
    });
  };

  const renderAssessorCard = (assessor: any, isMarketplace: boolean = false) => (
    <Card key={assessor.id} className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg">{assessor.name}</CardTitle>
            <CardDescription className="mt-1">
              {assessor.certificationLevel.charAt(0).toUpperCase() + assessor.certificationLevel.slice(1)} Assessor
            </CardDescription>
          </div>
          <Badge variant={isMarketplace ? "secondary" : "default"}>
            {isMarketplace ? "Marketplace" : "My Team"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isMarketplace && assessor.averageRating && (
          <div className="flex items-center text-sm">
            <Star className="h-4 w-4 mr-1 fill-yellow-400 text-yellow-400" />
            <span className="font-medium">{assessor.averageRating.toFixed(1)}</span>
            <span className="text-muted-foreground ml-1">
              ({assessor.totalReviews} reviews)
            </span>
          </div>
        )}

        {assessor.yearsOfExperience && (
          <div className="flex items-center text-sm text-muted-foreground">
            <Award className="h-4 w-4 mr-2" />
            {assessor.yearsOfExperience} years experience
          </div>
        )}

        {isMarketplace && assessor.marketplaceHourlyRate && (
          <div className="flex items-center text-sm text-muted-foreground">
            <DollarSign className="h-4 w-4 mr-2" />
            ${assessor.marketplaceHourlyRate}/hour
          </div>
        )}

        {assessor.serviceRegions && assessor.serviceRegions.length > 0 && (
          <div className="flex items-start text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 mr-2 mt-0.5" />
            <div className="flex flex-wrap gap-1">
              {assessor.serviceRegions.slice(0, 2).map((region: string, idx: number) => (
                <span key={idx} className="text-xs bg-secondary px-2 py-0.5 rounded">
                  {region}
                </span>
              ))}
              {assessor.serviceRegions.length > 2 && (
                <span className="text-xs">+{assessor.serviceRegions.length - 2} more</span>
              )}
            </div>
          </div>
        )}

        {assessor.specializations && assessor.specializations.length > 0 && (
          <div className="pt-2">
            <p className="text-xs font-medium mb-1">Specializations:</p>
            <div className="flex flex-wrap gap-1">
              {assessor.specializations.slice(0, 3).map((spec: string, idx: number) => (
                <Badge key={idx} variant="outline" className="text-xs">
                  {spec}
                </Badge>
              ))}
              {assessor.specializations.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{assessor.specializations.length - 3}
                </Badge>
              )}
            </div>
          </div>
        )}

        {isMarketplace && assessor.marketplaceBio && (
          <p className="text-sm text-muted-foreground line-clamp-2 pt-2">
            {assessor.marketplaceBio}
          </p>
        )}

        <div className="pt-2">
          <Button 
            size="sm" 
            className="w-full"
            onClick={() => handleAssign(assessor.id)}
            disabled={assignMutation.isPending}
          >
            {assignMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Assigning...
              </>
            ) : (
              "Assign to Claim"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  if (!claimId) {
    return (
      <div className="container max-w-4xl py-8">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Invalid claim ID</p>
            <Button onClick={() => setLocation(INSURER_CLAIMS_LIST_PATH)} className="mt-4">
              Back to Claims
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-6xl py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Assign Assessor to Claim</h1>
        <p className="text-muted-foreground mt-2">
          Choose from your team or browse the marketplace
        </p>
      </div>

      <Tabs defaultValue="my-team" className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="my-team">My Team</TabsTrigger>
          <TabsTrigger value="marketplace">Marketplace</TabsTrigger>
        </TabsList>

        <TabsContent value="my-team" className="space-y-4">
          {loadingMy ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !myAssessors || myAssessors.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground mb-4">
                  You haven't added any assessors to your team yet.
                </p>
                <Button onClick={() => setLocation("/add-assessor")}>
                  Add Your First Assessor
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {myAssessors.map((assessor: any) => renderAssessorCard(assessor, false))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="marketplace" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Search Marketplace</CardTitle>
              <CardDescription>
                Filter assessors by region, specialization, and more
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Input
                  placeholder="Region (e.g., Harare)"
                  value={selectedRegion}
                  onChange={(e) => setSelectedRegion(e.target.value)}
                />
                <Input
                  placeholder="Specialization"
                  value={selectedSpecialization}
                  onChange={(e) => setSelectedSpecialization(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {loadingMarketplace ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !marketplaceAssessors || marketplaceAssessors.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  No marketplace assessors found matching your criteria.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {marketplaceAssessors
                .filter((assessor: any) => 
                  !searchQuery || assessor.name.toLowerCase().includes(searchQuery.toLowerCase())
                )
                .map((assessor: any) => renderAssessorCard(assessor, true))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
