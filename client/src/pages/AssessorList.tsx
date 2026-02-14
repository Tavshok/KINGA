import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Mail, Phone, MapPin, Award, Users } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

export default function AssessorList() {
  const [, setLocation] = useLocation();
  
  const { data: assessors, isLoading } = trpc.assessorOnboarding.listInsurerAssessors.useQuery();

  if (isLoading) {
    return (
      <div className="container max-w-6xl py-8">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-6xl py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">My Assessors</h1>
          <p className="text-muted-foreground mt-2">
            Manage your organization's assessor team
          </p>
        </div>
        <Button onClick={() => setLocation("/add-assessor")}>
          <Plus className="mr-2 h-4 w-4" />
          Add Assessor
        </Button>
      </div>

      {!assessors || assessors.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No assessors yet"
          description="Build your assessor team by adding internal or external assessors to handle claims."
          actionLabel="Add Your First Assessor"
          onAction={() => setLocation("/add-assessor")}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {assessors.map((assessor: any) => (
            <Card key={assessor.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{assessor.name}</CardTitle>
                    <CardDescription className="mt-1">
                      {assessor.certificationLevel.charAt(0).toUpperCase() + assessor.certificationLevel.slice(1)} Assessor
                    </CardDescription>
                  </div>
                  <Badge variant={assessor.assessorType === "insurer_owned" ? "default" : "secondary"}>
                    {assessor.assessorType === "insurer_owned" ? "Internal" : assessor.assessorType}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center text-sm text-muted-foreground">
                  <Mail className="h-4 w-4 mr-2" />
                  {assessor.email}
                </div>

                {assessor.yearsOfExperience && (
                  <div className="flex items-center text-sm text-muted-foreground">
                    <Award className="h-4 w-4 mr-2" />
                    {assessor.yearsOfExperience} years experience
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

                <div className="pt-2 flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1">
                    View Profile
                  </Button>
                  <Button size="sm" className="flex-1">
                    Assign Claim
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
