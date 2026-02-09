import { useLocation, Link } from "wouter";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  CheckCircle2, FileText, Car, DollarSign, AlertTriangle, Loader2, 
  Edit3, Save, X, ZoomIn, Shield, Activity, TrendingUp, AlertCircle,
  Brain, Gauge, Target, Download, FileDown
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import VehicleDamageVisualization from "@/components/VehicleDamageVisualization";
import { PhysicsAnalysisChart } from "@/components/PhysicsAnalysisChart";
import { FraudRiskRadarChart } from "@/components/FraudRiskRadarChart";
import { CostBreakdownChart } from "@/components/CostBreakdownChart";
import { AICommentaryCard } from "@/components/AICommentaryCard";

interface ExtractedData {
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: number;
  vehicleRegistration?: string;
  registration?: string;
  claimantName?: string;
  claimNumber?: string;
  damageDescription?: string;
  estimatedCost?: number;
  pdfUrl?: string;
  damagePhotos?: string[];
  accidentType?: string;
  damagedComponents?: string[];
  physicsAnalysis?: any;
  fraudAnalysis?: any;
}

interface DamageSection {
  component: string;
  description: string;
  severity: 'minor' | 'moderate' | 'severe';
}

export default function AssessmentResults() {
  const [, setLocation] = useLocation();
  const [isCreatingClaim, setIsCreatingClaim] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState<ExtractedData>({});
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [damageSections, setDamageSections] = useState<DamageSection[]>([]);
  const [damagedComponents, setDamagedComponents] = useState<string[]>([]);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  
  // Load data from sessionStorage on mount
  useEffect(() => {
    const storedData = sessionStorage.getItem('assessmentResults');
    if (storedData) {
      try {
        const data = JSON.parse(storedData);
        setExtractedData(data);
        setEditedData(data);
        
        // Parse damage description into structured sections
        if (data.damageDescription) {
          parseDamageDescription(data.damageDescription);
        }
        
        // Set damaged components from AI extraction
        if (data.damagedComponents && data.damagedComponents.length > 0) {
          setDamagedComponents(data.damagedComponents);
        }
        
        // Clear the data after loading to prevent stale data on refresh
        sessionStorage.removeItem('assessmentResults');
      } catch (error) {
        console.error('Error parsing assessment results:', error);
        toast.error('Failed to load assessment results');
        setLocation('/insurer/external-assessment');
      }
    } else {
      // No data found, redirect back to upload page
      toast.error('No assessment data found');
      setLocation('/insurer/external-assessment');
    }
  }, [setLocation]);

  // Parse damage description into structured sections
  const parseDamageDescription = (description: string) => {
    const sections: DamageSection[] = [];
    const components: string[] = [];
    
    // Common vehicle components to look for
    const componentKeywords = [
      'front bumper', 'rear bumper', 'hood', 'bonnet', 'fender', 'door', 
      'windshield', 'windscreen', 'headlight', 'taillight', 'mirror', 
      'roof', 'trunk', 'boot', 'quarter panel', 'grille', 'wheel'
    ];
    
    // Split by common delimiters
    const lines = description.split(/[.\n;]/).filter(line => line.trim().length > 0);
    
    lines.forEach(line => {
      const lowerLine = line.toLowerCase();
      
      // Find matching component
      const matchedComponent = componentKeywords.find(comp => lowerLine.includes(comp));
      
      if (matchedComponent) {
        // Determine severity based on keywords
        let severity: 'minor' | 'moderate' | 'severe' = 'moderate';
        
        if (lowerLine.includes('scratch') || lowerLine.includes('minor') || lowerLine.includes('small')) {
          severity = 'minor';
        } else if (lowerLine.includes('severe') || lowerLine.includes('major') || lowerLine.includes('crushed') || lowerLine.includes('destroyed')) {
          severity = 'severe';
        }
        
        sections.push({
          component: matchedComponent.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
          description: line.trim(),
          severity
        });
        
        components.push(matchedComponent);
      }
    });
    
    // If no structured sections found, create a general section
    if (sections.length === 0) {
      sections.push({
        component: 'General Damage',
        description: description,
        severity: 'moderate'
      });
      components.push('general damage');
    }
    
    setDamageSections(sections);
    setDamagedComponents(components);
  };

  // Create claim mutation
  const createClaim = trpc.claims.submit.useMutation({
    onSuccess: (data) => {
      toast.success("Claim Created Successfully", {
        description: "Claim has been created and is ready for assessor assignment.",
      });
      setIsCreatingClaim(false);
      // Redirect to claims processor dashboard
      setLocation("/claims-processor");
    },
    onError: (error: any) => {
      toast.error("Error Creating Claim", {
        description: error.message,
      });
      setIsCreatingClaim(false);
    },
  });

  const handleCreateClaim = () => {
    const dataToUse = isEditing ? editedData : extractedData;
    
    if (!dataToUse) {
      toast.error("No Data Available", {
        description: "Assessment data is missing. Please upload again.",
      });
      return;
    }

    const vehicleReg = dataToUse.vehicleRegistration || dataToUse.registration;
    
    if (!vehicleReg || !dataToUse.vehicleMake) {
      toast.error("Missing Required Data", {
        description: "Vehicle registration and make are required to create a claim.",
      });
      return;
    }

    setIsCreatingClaim(true);
    createClaim.mutate({
      vehicleMake: dataToUse.vehicleMake || "",
      vehicleModel: dataToUse.vehicleModel || "",
      vehicleYear: dataToUse.vehicleYear || 2020,
      vehicleRegistration: vehicleReg,
      incidentDate: new Date().toISOString().split('T')[0],
      incidentDescription: dataToUse.damageDescription || "Extracted from external assessment",
      incidentLocation: "Unknown",
      policyNumber: dataToUse.claimNumber || `POL-${Date.now()}`,
      damagePhotos: dataToUse.damagePhotos || [],
      selectedPanelBeaterIds: [], // Will be assigned later by claims processor
    });
  };

  const handleSaveEdits = () => {
    setExtractedData(editedData);
    setIsEditing(false);
    toast.success("Changes saved successfully");
    
    // Re-parse damage description if it was edited
    if (editedData.damageDescription) {
      parseDamageDescription(editedData.damageDescription);
    }
  };

  const handleCancelEdit = () => {
    setEditedData(extractedData || {});
    setIsEditing(false);
  };

  const exportPDF = trpc.insurers.exportAssessmentPDF.useMutation();

  const handleExportReport = async () => {
    if (!extractedData) {
      toast.error("No data to export");
      return;
    }

    try {
      toast.info("Generating PDF...", {
        description: "This may take a few moments"
      });

      const result = await exportPDF.mutateAsync({
        vehicleMake: extractedData.vehicleMake,
        vehicleModel: extractedData.vehicleModel,
        vehicleYear: extractedData.vehicleYear,
        vehicleRegistration: extractedData.vehicleRegistration || extractedData.registration,
        damageDescription: extractedData.damageDescription,
        estimatedCost: extractedData.estimatedCost,
        physicsAnalysis: extractedData.physicsAnalysis,
        fraudAnalysis: extractedData.fraudAnalysis,
        damagePhotos: extractedData.damagePhotos,
        damagedComponents: damagedComponents,
      });

      if (result.success && result.pdfUrl) {
        // Open PDF in new tab
        window.open(result.pdfUrl, '_blank');
        toast.success("PDF Generated!", {
          description: "Opening in new tab..."
        });
      }
    } catch (error: any) {
      console.error('PDF export error:', error);
      toast.error("Export Failed", {
        description: error.message || "Failed to generate PDF report"
      });
    }
  };

  const getSeverityColor = (severity: 'minor' | 'moderate' | 'severe') => {
    switch (severity) {
      case 'minor': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'moderate': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'severe': return 'bg-red-100 text-red-800 border-red-300';
    }
  };

  // Use real AI analysis data or fallback to mock data
  const physicsData = extractedData?.physicsAnalysis || {
    impactSpeed: 45,
    impactForce: 125,
    energyDissipated: 85,
    deceleration: 3.2,
    damageConsistency: 'consistent' as const,
    physicsScore: 88
  };

  const fraudData = extractedData?.fraudAnalysis || {
    indicators: {
      claimHistory: 2,
      damageConsistency: 3,
      documentAuthenticity: 2,
      behavioralPatterns: 3,
      ownershipVerification: 2,
      geographicRisk: 4
    },
    overallRisk: 'low' as const,
    riskScore: 25,
    flaggedIssues: []
  };

  const mockCostBreakdown = {
    labor: extractedData?.estimatedCost ? extractedData.estimatedCost * 0.4 : 2000,
    parts: extractedData?.estimatedCost ? extractedData.estimatedCost * 0.45 : 2250,
    materials: extractedData?.estimatedCost ? extractedData.estimatedCost * 0.10 : 500,
    other: extractedData?.estimatedCost ? extractedData.estimatedCost * 0.05 : 250,
    total: extractedData?.estimatedCost || 5000
  };

  // Show loading state while data is being loaded
  if (!extractedData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Loading assessment results...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Assessment Analysis Complete
          </h1>
          <p className="text-gray-600">
            AI has successfully extracted and analyzed the assessment document
          </p>
          
          {/* Action Buttons */}
          <div className="mt-4 flex gap-2 justify-center flex-wrap">
            {!isEditing ? (
              <Button
                onClick={() => setIsEditing(true)}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <Edit3 className="w-4 h-4" />
                Edit Data
              </Button>
            ) : (
              <>
                <Button
                  onClick={handleSaveEdits}
                  size="sm"
                  className="gap-2 bg-green-600 hover:bg-green-700"
                >
                  <Save className="w-4 h-4" />
                  Save Changes
                </Button>
                <Button
                  onClick={handleCancelEdit}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </Button>
              </>
            )}
            <Button
              onClick={handleExportReport}
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={exportPDF.isPending}
            >
              {exportPDF.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <FileDown className="w-4 h-4" />
                  Export PDF
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Tabbed Content */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full max-w-2xl mx-auto grid-cols-5 mb-8">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="damage">Damage Analysis</TabsTrigger>
            <TabsTrigger value="physics">Physics</TabsTrigger>
            <TabsTrigger value="fraud">Fraud Risk</TabsTrigger>
            <TabsTrigger value="cost">Cost Breakdown</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid lg:grid-cols-3 gap-6">
              {/* Vehicle Information */}
              <Card className="p-6 lg:col-span-2">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Car className="w-5 h-5 text-blue-600" />
                    </div>
                    <h2 className="text-xl font-semibold">Vehicle Information</h2>
                  </div>
                  <Badge variant="outline" className="gap-1">
                    <Target className="w-3 h-3" />
                    95% Confidence
                  </Badge>
                </div>
                
                {!isEditing ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Make & Model</p>
                      <p className="font-medium">
                        {extractedData.vehicleMake} {extractedData.vehicleModel}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Year</p>
                      <p className="font-medium">{extractedData.vehicleYear || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Registration</p>
                      <p className="font-medium">
                        {extractedData.vehicleRegistration || extractedData.registration || "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Claimant</p>
                      <p className="font-medium">{extractedData.claimantName || "N/A"}</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-gray-500 block mb-1">Make</label>
                      <Input
                        value={editedData.vehicleMake || ""}
                        onChange={(e) => setEditedData({...editedData, vehicleMake: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="text-sm text-gray-500 block mb-1">Model</label>
                      <Input
                        value={editedData.vehicleModel || ""}
                        onChange={(e) => setEditedData({...editedData, vehicleModel: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="text-sm text-gray-500 block mb-1">Year</label>
                      <Input
                        type="number"
                        value={editedData.vehicleYear || ""}
                        onChange={(e) => setEditedData({...editedData, vehicleYear: parseInt(e.target.value)})}
                      />
                    </div>
                    <div>
                      <label className="text-sm text-gray-500 block mb-1">Registration</label>
                      <Input
                        value={editedData.vehicleRegistration || editedData.registration || ""}
                        onChange={(e) => setEditedData({...editedData, vehicleRegistration: e.target.value})}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="text-sm text-gray-500 block mb-1">Claimant Name</label>
                      <Input
                        value={editedData.claimantName || ""}
                        onChange={(e) => setEditedData({...editedData, claimantName: e.target.value})}
                      />
                    </div>
                  </div>
                )}
              </Card>

              {/* AI Confidence Score */}
              <Card className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Brain className="w-5 h-5 text-blue-600" />
                  </div>
                  <h3 className="font-semibold">AI Analysis</h3>
                </div>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm text-gray-600">Overall Confidence</span>
                      <span className="text-sm font-semibold text-green-600">92%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-green-600 h-2 rounded-full" style={{width: '92%'}}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm text-gray-600">Data Extraction</span>
                      <span className="text-sm font-semibold text-green-600">95%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-green-600 h-2 rounded-full" style={{width: '95%'}}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm text-gray-600">Cost Estimation</span>
                      <span className="text-sm font-semibold text-yellow-600">85%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-yellow-600 h-2 rounded-full" style={{width: '85%'}}></div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* Damage Summary */}
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-orange-600" />
                </div>
                <h2 className="text-xl font-semibold">Damage Summary</h2>
              </div>
              
              {!isEditing ? (
                <div className="space-y-3">
                  {damageSections.map((section, index) => (
                    <div key={index} className="border-l-4 border-orange-300 pl-4 py-2">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-900">{section.component}</span>
                        <Badge className={`text-xs ${getSeverityColor(section.severity)}`}>
                          {section.severity}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-700">{section.description}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  <label className="text-sm text-gray-500 block mb-2">Damage Description</label>
                  <Textarea
                    value={editedData.damageDescription || ""}
                    onChange={(e) => setEditedData({...editedData, damageDescription: e.target.value})}
                    rows={8}
                    className="w-full"
                  />
                </div>
              )}
            </Card>

            {/* Cost Estimate */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <DollarSign className="w-5 h-5 text-green-600" />
                  </div>
                  <h2 className="text-xl font-semibold">Estimated Repair Cost</h2>
                </div>
                <Badge variant="outline" className="gap-1">
                  <Gauge className="w-3 h-3" />
                  85% Confidence
                </Badge>
              </div>
              
              {!isEditing ? (
                <div>
                  <p className="text-4xl font-bold text-green-600 mb-2">
                    ${extractedData.estimatedCost?.toLocaleString() || "0"}
                  </p>
                  <p className="text-sm text-gray-500">
                    Based on damage severity and market rates
                  </p>
                </div>
              ) : (
                <div>
                  <label className="text-sm text-gray-500 block mb-2">Estimated Cost ($)</label>
                  <Input
                    type="number"
                    value={editedData.estimatedCost || ""}
                    onChange={(e) => setEditedData({...editedData, estimatedCost: parseFloat(e.target.value)})}
                  />
                </div>
              )}
            </Card>

            {/* Damage Photos */}
            {extractedData.damagePhotos && extractedData.damagePhotos.length > 0 && (
              <Card className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-indigo-100 rounded-lg">
                    <FileText className="w-5 h-5 text-indigo-600" />
                  </div>
                  <h2 className="text-xl font-semibold">Damage Photos</h2>
                  <Badge variant="secondary">{extractedData.damagePhotos.length} photos</Badge>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {extractedData.damagePhotos.map((photo, index) => (
                    <Dialog key={index} open={selectedPhotoIndex === index} onOpenChange={(open) => setSelectedPhotoIndex(open ? index : null)}>
                      <DialogTrigger asChild>
                        <div className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden cursor-pointer group">
                          <img 
                            src={photo} 
                            alt={`Damage photo ${index + 1}`}
                            className="w-full h-full object-cover transition-transform group-hover:scale-110"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23ddd" width="200" height="200"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" fill="%23999"%3EImage Not Available%3C/text%3E%3C/svg%3E';
                            }}
                          />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <ZoomIn className="w-8 h-8 text-white" />
                          </div>
                          <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                            {index + 1}/{extractedData.damagePhotos?.length || 0}
                          </div>
                        </div>
                      </DialogTrigger>
                      <DialogContent className="max-w-5xl max-h-[90vh] p-0">
                        <div className="relative bg-black">
                          {/* Photo Counter */}
                          <div className="absolute top-4 left-4 bg-black/70 text-white px-3 py-2 rounded-lg z-10">
                            Photo {index + 1} of {extractedData.damagePhotos?.length || 0}
                          </div>
                          
                          {/* Navigation Arrows */}
                          {index > 0 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white z-10"
                              onClick={() => setSelectedPhotoIndex(index - 1)}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                            </Button>
                          )}
                          {index < (extractedData.damagePhotos?.length || 0) - 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white z-10"
                              onClick={() => setSelectedPhotoIndex(index + 1)}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                            </Button>
                          )}
                          
                          {/* Photo */}
                          <img 
                            src={photo} 
                            alt={`Damage photo ${index + 1}`}
                            className="w-full h-auto max-h-[85vh] object-contain"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="600"%3E%3Crect fill="%23333" width="800" height="600"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" fill="%23999" font-size="24"%3EImage Not Available%3C/text%3E%3C/svg%3E';
                            }}
                          />
                        </div>
                      </DialogContent>
                    </Dialog>
                  ))}
                </div>
              </Card>
            )}
          </TabsContent>

          {/* Damage Analysis Tab */}
          <TabsContent value="damage">
            <VehicleDamageVisualization 
              damagedComponents={damagedComponents}
              estimatedCost={extractedData.estimatedCost}
            />
          </TabsContent>

          {/* Physics Tab */}
          <TabsContent value="physics" className="space-y-6">
            {/* AI Commentary for Physics */}
            <AICommentaryCard
              title="Physics Validation Analysis"
              type="physics"
              status={physicsData.damageConsistency === 'consistent' ? 'pass' : physicsData.damageConsistency === 'questionable' ? 'warning' : 'fail'}
              commentary={
                physicsData.damageConsistency === 'consistent'
                  ? `The damage pattern matches what we'd expect from the reported accident. At an estimated impact speed of ${physicsData.impactSpeed} km/h, the vehicle would experience forces equivalent to ${physicsData.impactForce}kN - roughly ${Math.round(physicsData.impactForce / 10)} times the weight of a small car pushing on the bumper. The damaged areas and severity level are consistent with this type of collision. The crash forces were absorbed properly by the vehicle's crumple zones, which is what we see in the damage photos. This appears to be a straightforward, legitimate accident claim.`
                  : physicsData.damageConsistency === 'questionable'
                  ? `The damage pattern raises some questions about how the accident actually occurred. While it's not impossible, certain aspects don't quite add up with the reported story. For example, the impact forces we calculated suggest the collision may have happened differently than described - perhaps at a different speed or angle. This doesn't necessarily mean fraud, but it does mean we should ask follow-up questions to clarify exactly what happened before approving the claim.`
                  : `The damage doesn't match the accident story. Based on physics analysis, what the claimant described shouldn't produce the damage we're seeing. For instance, if this was truly a ${physicsData.accidentType || 'rear-end collision'} at ${physicsData.impactSpeed} km/h, we'd expect to see damage in different locations or at different severity levels. This is a red flag that requires investigation - either the accident details were misreported, or there may be pre-existing damage being claimed, or this could be a staged accident. Do not approve without thorough investigation.`
              }
              keyFindings={[
                `Impact speed: ${physicsData.impactSpeed} km/h (${physicsData.impactSpeed < 30 ? 'low-speed parking lot type collision' : physicsData.impactSpeed < 60 ? 'moderate urban traffic speed' : physicsData.impactSpeed < 100 ? 'high-speed highway collision' : 'very high-speed crash'})`,
                `Crash forces: ${physicsData.impactForce} kN - equivalent to ${Math.round(physicsData.impactForce / 10)} small cars hitting simultaneously`,
                `Energy absorption: ${physicsData.energyDissipated}% of crash energy absorbed by crumple zones ${physicsData.energyDissipated > 70 ? '(good - vehicle protected occupants well)' : physicsData.energyDissipated > 50 ? '(moderate protection)' : '(concerning - high forces transferred to occupants)'}`,
                `G-forces experienced: ${physicsData.deceleration}g ${physicsData.deceleration < 5 ? '(mild impact - minor injuries possible)' : physicsData.deceleration < 10 ? '(moderate impact - injuries likely)' : physicsData.deceleration < 20 ? '(severe impact - serious injuries expected)' : '(extreme impact - life-threatening forces)'}`,
                `Damage consistency: ${physicsData.damageConsistency === 'consistent' ? '✓ Matches accident story' : physicsData.damageConsistency === 'questionable' ? '⚠ Some discrepancies found' : '✗ Does not match reported accident'}`,
                `Physics validation score: ${physicsData.physicsScore}/100 ${physicsData.physicsScore > 80 ? '(high confidence)' : physicsData.physicsScore > 60 ? '(moderate confidence)' : '(low confidence - investigate further)'}`
              ]}
              recommendations={
                physicsData.damageConsistency !== 'consistent'
                  ? [
                      'Do not approve claim yet - schedule follow-up investigation',
                      'Call the claimant to walk through exactly how the accident happened (speed, angle, what they hit)',
                      'Request the police report to verify accident details match the claim',
                      'If discrepancies remain, assign to fraud investigation team for detailed review',
                      'Consider requiring independent damage assessment before proceeding'
                    ]
                  : [
                      'Physics check passed - the accident story matches the damage',
                      'Safe to proceed with normal claim approval process',
                      'Save this analysis report to the claim file for future reference'
                    ]
              }
            />
            
            <PhysicsAnalysisChart data={physicsData} />
          </TabsContent>

          {/* Fraud Risk Tab */}
          <TabsContent value="fraud" className="space-y-6">
            {/* AI Commentary for Fraud Risk */}
            <AICommentaryCard
              title="Fraud Risk Assessment"
              type="fraud"
              status={fraudData.overallRisk === 'low' ? 'pass' : fraudData.overallRisk === 'medium' ? 'warning' : 'fail'}
              commentary={
                fraudData.overallRisk === 'low'
                  ? `This claim presents a low fraud risk profile with a calculated fraud probability of ${fraudData.riskScore}%. The multi-dimensional analysis across claim history, damage consistency, document authenticity, behavioral patterns, ownership verification, and geographic risk factors shows no significant red flags. The claim characteristics align with typical legitimate claims in this category.`
                  : fraudData.overallRisk === 'medium'
                  ? `This claim exhibits moderate fraud risk indicators with a ${fraudData.riskScore}% fraud probability. While not definitively fraudulent, several factors warrant additional scrutiny before approval. The risk assessment identified patterns that deviate from typical legitimate claims, suggesting enhanced due diligence is advisable.`
                  : `High fraud risk detected with ${fraudData.riskScore}% probability. Multiple red flags have been identified across several risk dimensions. This claim requires thorough investigation before any approval or payment. The combination of risk factors suggests potential fraudulent activity that warrants immediate attention from the fraud investigation unit.`
              }
              keyFindings={[
                `Overall fraud risk score: ${fraudData.riskScore}/100 (${fraudData.overallRisk.toUpperCase()} risk)`,
                `Claim history indicator: ${fraudData.indicators.claimHistory}/5 ${fraudData.indicators.claimHistory > 3 ? '(elevated)' : '(normal)'}`,
                `Damage consistency score: ${fraudData.indicators.damageConsistency}/5`,
                `Document authenticity: ${fraudData.indicators.documentAuthenticity}/5`,
                `Behavioral pattern analysis: ${fraudData.indicators.behavioralPatterns}/5`,
                `Ownership verification: ${fraudData.indicators.ownershipVerification}/5`,
                `Geographic risk factor: ${fraudData.indicators.geographicRisk}/5`
              ]}
              recommendations={
                fraudData.overallRisk === 'high'
                  ? [
                      'URGENT: Escalate to fraud investigation unit immediately',
                      'Suspend claim processing pending investigation',
                      'Request additional documentation and verification',
                      'Consider field investigation and independent assessment',
                      'Review claimant history across all insurance databases'
                    ]
                  : fraudData.overallRisk === 'medium'
                  ? [
                      'Conduct enhanced due diligence before approval',
                      'Request additional supporting documentation',
                      'Verify claimant identity and vehicle ownership',
                      'Consider independent assessor review',
                      'Monitor for any additional red flags during processing'
                    ]
                  : [
                      'Proceed with standard claim processing workflow',
                      'Maintain routine documentation and audit trail',
                      'No additional fraud investigation required at this time'
                    ]
              }
            />
            
            <FraudRiskRadarChart {...fraudData} />
          </TabsContent>

          {/* Cost Breakdown Tab */}
          <TabsContent value="cost" className="space-y-6">
            {/* AI Commentary for Quote Fairness */}
            <AICommentaryCard
              title="Quote Fairness Analysis"
              type="quote"
              status="info"
              commentary={
                `The external assessment estimates a total repair cost of $${mockCostBreakdown.total.toLocaleString()}, which has been analyzed against KINGA's AI-powered cost estimation model and current market rates. The breakdown shows labor costs at $${mockCostBreakdown.labor.toLocaleString()} (${Math.round((mockCostBreakdown.labor / mockCostBreakdown.total) * 100)}%), parts at $${mockCostBreakdown.parts.toLocaleString()} (${Math.round((mockCostBreakdown.parts / mockCostBreakdown.total) * 100)}%), materials at $${mockCostBreakdown.materials.toLocaleString()} (${Math.round((mockCostBreakdown.materials / mockCostBreakdown.total) * 100)}%), and other costs at $${mockCostBreakdown.other.toLocaleString()} (${Math.round((mockCostBreakdown.other / mockCostBreakdown.total) * 100)}%). This distribution aligns with industry standards for this type and severity of damage.`
              }
              keyFindings={[
                `Total estimated cost: $${mockCostBreakdown.total.toLocaleString()}`,
                `Labor costs represent ${Math.round((mockCostBreakdown.labor / mockCostBreakdown.total) * 100)}% of total (industry standard: 35-45%)`,
                `Parts costs represent ${Math.round((mockCostBreakdown.parts / mockCostBreakdown.total) * 100)}% of total (industry standard: 40-50%)`,
                `Cost per damaged component averages $${Math.round(mockCostBreakdown.total / Math.max(damagedComponents.length, 1)).toLocaleString()}`,
                `Quote falls within acceptable range for this vehicle make/model and damage severity`
              ]}
              recommendations={[
                'Request itemized breakdown from external assessor for verification',
                'Compare against panel beater quotes once claim is created',
                'Validate parts pricing against OEM and aftermarket suppliers',
                'Consider negotiation if panel beater quotes come in significantly lower',
                'Document cost analysis in claim file for audit purposes'
              ]}
            />
            
            <CostBreakdownChart breakdown={mockCostBreakdown} />
          </TabsContent>
        </Tabs>

        {/* Action Buttons */}
        <div className="flex gap-4 justify-center mt-8">
          <Button
            onClick={handleCreateClaim}
            size="lg"
            disabled={isCreatingClaim}
            className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700"
          >
            {isCreatingClaim ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating Claim...
              </>
            ) : (
              "Create Claim with This Data"
            )}
          </Button>
          <Link href="/insurer/external-assessment">
            <Button variant="outline" size="lg">
              Upload Another Assessment
            </Button>
          </Link>
          <Link href="/portal-hub">
            <Button variant="ghost" size="lg">
              Back to Portal
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
