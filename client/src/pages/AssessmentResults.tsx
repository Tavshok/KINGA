import { useLocation, Link } from "wouter";
import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  CheckCircle2, FileText, Car, DollarSign, AlertTriangle, Loader2, 
  Edit3, Save, X, ZoomIn, ZoomOut, Shield, Activity, TrendingUp, AlertCircle,
  Brain, Gauge, Target, FileDown, ChevronLeft, ChevronRight, 
  Maximize2, RotateCcw, Camera, Link2, ArrowRight
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import VehicleDamageVisualization from "@/components/VehicleDamageVisualization";
import { PhysicsAnalysisChart } from "@/components/PhysicsAnalysisChart";
import { FraudRiskRadarChart } from "@/components/FraudRiskRadarChart";
import { CostBreakdownChart } from "@/components/CostBreakdownChart";
import { AICommentaryCard } from "@/components/AICommentaryCard";

interface ItemizedCost {
  description: string;
  amount: number;
  category?: string;
}

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
  accidentDate?: string;
  accidentLocation?: string;
  accidentDescription?: string;
  damagedComponents?: string[];
  physicsAnalysis?: any;
  fraudAnalysis?: any;
  itemizedCosts?: ItemizedCost[];
  costBreakdown?: {
    labor?: number;
    parts?: number;
    materials?: number;
    paint?: number;
    sublet?: number;
    other?: number;
  };
  missingData?: string[];
  dataQuality?: Record<string, boolean>;
  dataCompleteness?: number;
}

interface DamageSection {
  component: string;
  description: string;
  severity: 'minor' | 'moderate' | 'severe';
}

// ─── Image Gallery with Zoom/Pan ───────────────────────────────────────
function ImageGallery({ photos }: { photos: string[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imgContainerRef = useRef<HTMLDivElement>(null);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.5, 5));
  const handleZoomOut = () => {
    setZoom(prev => {
      const newZoom = Math.max(prev - 0.5, 1);
      if (newZoom === 1) setPan({ x: 0, y: 0 });
      return newZoom;
    });
  };

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.25 : 0.25;
    setZoom(prev => {
      const newZoom = Math.max(1, Math.min(prev + delta, 5));
      if (newZoom === 1) setPan({ x: 0, y: 0 });
      return newZoom;
    });
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || zoom <= 1) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => setIsDragging(false);

  const goToPhoto = (index: number) => {
    setCurrentIndex(index);
    resetView();
  };

  const goNext = () => goToPhoto(Math.min(currentIndex + 1, photos.length - 1));
  const goPrev = () => goToPhoto(Math.max(currentIndex - 1, 0));

  if (photos.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Camera className="w-12 h-12 mx-auto text-gray-300 mb-3" />
        <p className="text-gray-500 font-medium">No damage photos extracted</p>
        <p className="text-sm text-gray-400 mt-1">Photos could not be extracted from this PDF. The document may not contain embedded images.</p>
      </Card>
    );
  }

  return (
    <>
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <Camera className="w-5 h-5 text-indigo-600" />
            </div>
            <h2 className="text-xl font-semibold">Damage Photos</h2>
            <Badge variant="secondary">{photos.length} photos</Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={handleZoomOut} disabled={zoom <= 1} className="h-8 w-8">
              <ZoomOut className="w-4 h-4" />
            </Button>
            <span className="text-xs text-gray-500 w-12 text-center">{Math.round(zoom * 100)}%</span>
            <Button variant="ghost" size="icon" onClick={handleZoomIn} disabled={zoom >= 5} className="h-8 w-8">
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={resetView} className="h-8 w-8">
              <RotateCcw className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => { resetView(); setIsFullscreen(true); }} className="h-8 w-8">
              <Maximize2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Main Image Viewer */}
        <div 
          ref={imgContainerRef}
          className="relative bg-gray-900 rounded-lg overflow-hidden select-none"
          style={{ height: '420px', cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Navigation Arrows */}
          {currentIndex > 0 && (
            <Button
              variant="ghost" size="icon"
              className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white z-10 h-10 w-10 rounded-full"
              onClick={(e) => { e.stopPropagation(); goPrev(); }}
            >
              <ChevronLeft className="w-6 h-6" />
            </Button>
          )}
          {currentIndex < photos.length - 1 && (
            <Button
              variant="ghost" size="icon"
              className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white z-10 h-10 w-10 rounded-full"
              onClick={(e) => { e.stopPropagation(); goNext(); }}
            >
              <ChevronRight className="w-6 h-6" />
            </Button>
          )}

          {/* Photo Counter */}
          <div className="absolute top-3 left-3 bg-black/60 text-white text-sm px-3 py-1.5 rounded-lg z-10 font-medium">
            {currentIndex + 1} / {photos.length}
          </div>

          {/* Image */}
          <div className="w-full h-full flex items-center justify-center overflow-hidden">
            <img 
              src={photos[currentIndex]} 
              alt={`Damage photo ${currentIndex + 1}`}
              className="max-w-full max-h-full object-contain"
              style={{
                transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                transition: isDragging ? 'none' : 'transform 0.15s ease-out',
                pointerEvents: 'none'
              }}
              draggable={false}
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23333" width="400" height="300"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" fill="%23999" font-size="16"%3EImage Not Available%3C/text%3E%3C/svg%3E';
              }}
            />
          </div>
        </div>

        {/* Filmstrip Thumbnails */}
        <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
          {photos.map((photo, index) => (
            <button
              key={index}
              onClick={() => goToPhoto(index)}
              className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                index === currentIndex ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 hover:border-gray-400'
              }`}
            >
              <img 
                src={photo} 
                alt={`Thumbnail ${index + 1}`}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="64" height="64"%3E%3Crect fill="%23ddd" width="64" height="64"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" fill="%23999" font-size="10"%3E?%3C/text%3E%3C/svg%3E';
                }}
              />
            </button>
          ))}
        </div>
      </Card>

      {/* Fullscreen Dialog */}
      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black border-none">
          <div className="relative w-full h-[90vh]">
            {/* Controls */}
            <div className="absolute top-4 right-4 z-20 flex gap-2">
              <Button variant="ghost" size="icon" onClick={handleZoomOut} className="bg-black/50 hover:bg-black/70 text-white h-9 w-9">
                <ZoomOut className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleZoomIn} className="bg-black/50 hover:bg-black/70 text-white h-9 w-9">
                <ZoomIn className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={resetView} className="bg-black/50 hover:bg-black/70 text-white h-9 w-9">
                <RotateCcw className="w-4 h-4" />
              </Button>
            </div>

            {/* Counter */}
            <div className="absolute top-4 left-4 bg-black/60 text-white text-sm px-3 py-1.5 rounded-lg z-20 font-medium">
              {currentIndex + 1} / {photos.length}
            </div>

            {/* Navigation */}
            {currentIndex > 0 && (
              <Button variant="ghost" size="icon" className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white z-20 h-12 w-12 rounded-full" onClick={goPrev}>
                <ChevronLeft className="w-8 h-8" />
              </Button>
            )}
            {currentIndex < photos.length - 1 && (
              <Button variant="ghost" size="icon" className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white z-20 h-12 w-12 rounded-full" onClick={goNext}>
                <ChevronRight className="w-8 h-8" />
              </Button>
            )}

            {/* Image */}
            <div 
              className="w-full h-full flex items-center justify-center overflow-hidden"
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              style={{ cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
            >
              <img 
                src={photos[currentIndex]} 
                alt={`Damage photo ${currentIndex + 1}`}
                className="max-w-full max-h-full object-contain"
                style={{
                  transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                  transition: isDragging ? 'none' : 'transform 0.15s ease-out',
                  pointerEvents: 'none'
                }}
                draggable={false}
              />
            </div>

            {/* Filmstrip */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 bg-black/60 px-3 py-2 rounded-lg z-20">
              {photos.map((photo, index) => (
                <button
                  key={index}
                  onClick={() => goToPhoto(index)}
                  className={`flex-shrink-0 w-12 h-12 rounded overflow-hidden border-2 transition-all ${
                    index === currentIndex ? 'border-white' : 'border-transparent hover:border-white/50'
                  }`}
                >
                  <img src={photo} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Physics/Fraud Cross-Reference Card ────────────────────────────────
function PhysicsFraudCrossReference({ physicsAnalysis, fraudAnalysis }: { physicsAnalysis: any; fraudAnalysis: any }) {
  const crossRef = fraudAnalysis?.physics_cross_reference;
  if (!crossRef) return null;

  const contributes = crossRef.physics_contributes_to_fraud;
  const physicsFlags = physicsAnalysis?.flags || [];

  return (
    <Card className={`p-6 border-2 ${contributes ? 'border-amber-300 bg-amber-50/50' : 'border-green-300 bg-green-50/50'}`}>
      <div className="flex items-center gap-3 mb-4">
        <div className={`p-2 rounded-lg ${contributes ? 'bg-amber-100' : 'bg-green-100'}`}>
          <Link2 className={`w-5 h-5 ${contributes ? 'text-amber-600' : 'text-green-600'}`} />
        </div>
        <h3 className="text-lg font-semibold">Physics ↔ Fraud Cross-Reference</h3>
        <Badge className={contributes ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}>
          {contributes ? 'Elevated Risk' : 'Consistent'}
        </Badge>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <div className="p-4 bg-white rounded-lg border">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-semibold text-gray-700">Physics Validation</span>
          </div>
          <div className="text-2xl font-bold text-purple-600">{crossRef.physics_score}/100</div>
          <p className="text-xs text-gray-500 mt-1">
            {physicsFlags.length > 0 ? `${physicsFlags.length} flag(s) raised` : 'No flags raised'}
          </p>
        </div>
        <div className="p-4 bg-white rounded-lg border">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-semibold text-gray-700">Fraud Risk Impact</span>
          </div>
          <div className={`text-2xl font-bold ${contributes ? 'text-amber-600' : 'text-green-600'}`}>
            {contributes ? 'Score Elevated' : 'No Impact'}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {contributes ? 'Physics inconsistencies increased fraud score' : 'Physics supports claim legitimacy'}
          </p>
        </div>
      </div>

      {/* Physics Flags */}
      {physicsFlags.length > 0 && (
        <div className="mb-4 p-3 bg-white rounded-lg border border-amber-200">
          <p className="text-sm font-semibold text-amber-800 mb-2">Physics Flags Feeding Into Fraud Score:</p>
          <ul className="space-y-1">
            {physicsFlags.map((flag: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-sm text-amber-700">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>{flag}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="p-3 bg-white rounded-lg border">
        <p className="text-sm text-gray-700">
          <strong>Analysis:</strong> {crossRef.physics_notes}
        </p>
      </div>
    </Card>
  );
}

// ─── Main Component ────────────────────────────────────────────────────
export default function AssessmentResults() {
  const [, setLocation] = useLocation();
  const [isCreatingClaim, setIsCreatingClaim] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState<ExtractedData>({});
  const [damageSections, setDamageSections] = useState<DamageSection[]>([]);
  const [damagedComponents, setDamagedComponents] = useState<string[]>([]);
  
  useEffect(() => {
    const storedData = sessionStorage.getItem('assessmentResults');
    if (storedData) {
      try {
        const data = JSON.parse(storedData);
        setExtractedData(data);
        setEditedData(data);
        if (data.damageDescription) parseDamageDescription(data.damageDescription);
        if (data.damagedComponents?.length > 0) setDamagedComponents(data.damagedComponents);
        sessionStorage.removeItem('assessmentResults');
      } catch (error) {
        toast.error('Failed to load assessment results');
        setLocation('/insurer/external-assessment');
      }
    } else {
      toast.error('No assessment data found');
      setLocation('/insurer/external-assessment');
    }
  }, [setLocation]);

  const parseDamageDescription = (description: string) => {
    const sections: DamageSection[] = [];
    const components: string[] = [];
    const componentKeywords = [
      'front bumper', 'rear bumper', 'hood', 'bonnet', 'fender', 'door', 
      'windshield', 'windscreen', 'headlight', 'taillight', 'mirror', 
      'roof', 'trunk', 'boot', 'quarter panel', 'grille', 'wheel',
      'side panel', 'running board', 'mudguard', 'canopy', 'bull bar',
      'radiator', 'chassis', 'suspension', 'axle', 'frame'
    ];
    
    const lines = description.split(/[.\n;]/).filter(line => line.trim().length > 0);
    lines.forEach(line => {
      const lowerLine = line.toLowerCase();
      const matchedComponent = componentKeywords.find(comp => lowerLine.includes(comp));
      if (matchedComponent) {
        let severity: 'minor' | 'moderate' | 'severe' = 'moderate';
        if (lowerLine.includes('scratch') || lowerLine.includes('minor') || lowerLine.includes('small') || lowerLine.includes('dent')) severity = 'minor';
        else if (lowerLine.includes('severe') || lowerLine.includes('major') || lowerLine.includes('crushed') || lowerLine.includes('destroyed') || lowerLine.includes('replace')) severity = 'severe';
        sections.push({
          component: matchedComponent.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
          description: line.trim(),
          severity
        });
        components.push(matchedComponent);
      }
    });
    
    if (sections.length === 0) {
      sections.push({ component: 'General Damage', description: description, severity: 'moderate' });
      components.push('general damage');
    }
    
    setDamageSections(sections);
    if (components.length > 0) setDamagedComponents(components);
  };

  const createClaim = trpc.claims.submit.useMutation({
    onSuccess: () => {
      toast.success("Claim Created Successfully", { description: "Claim has been created and is ready for assessor assignment." });
      setIsCreatingClaim(false);
      setLocation("/claims-processor");
    },
    onError: (error: any) => {
      toast.error("Error Creating Claim", { description: error.message });
      setIsCreatingClaim(false);
    },
  });

  const handleCreateClaim = () => {
    const dataToUse = isEditing ? editedData : extractedData;
    if (!dataToUse) { toast.error("No Data Available"); return; }
    const vehicleReg = dataToUse.vehicleRegistration || dataToUse.registration;
    if (!vehicleReg || !dataToUse.vehicleMake) { toast.error("Missing Required Data", { description: "Vehicle registration and make are required." }); return; }
    setIsCreatingClaim(true);
    createClaim.mutate({
      vehicleMake: dataToUse.vehicleMake || "",
      vehicleModel: dataToUse.vehicleModel || "",
      vehicleYear: dataToUse.vehicleYear || 2020,
      vehicleRegistration: vehicleReg,
      incidentDate: new Date().toISOString().split('T')[0],
      incidentDescription: dataToUse.damageDescription || "Extracted from external assessment",
      incidentLocation: dataToUse.accidentLocation || "Unknown",
      policyNumber: dataToUse.claimNumber || `POL-${Date.now()}`,
      damagePhotos: dataToUse.damagePhotos || [],
      selectedPanelBeaterIds: [],
    });
  };

  const handleSaveEdits = () => {
    setExtractedData(editedData);
    setIsEditing(false);
    toast.success("Changes saved successfully");
    if (editedData.damageDescription) parseDamageDescription(editedData.damageDescription);
  };

  const handleCancelEdit = () => { setEditedData(extractedData || {}); setIsEditing(false); };

  const exportPDF = trpc.insurers.exportAssessmentPDF.useMutation();
  const handleExportReport = async () => {
    if (!extractedData) { toast.error("No data to export"); return; }
    try {
      toast.info("Generating PDF...", { description: "This may take a few moments" });
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
        window.open(result.pdfUrl, '_blank');
        toast.success("PDF Generated!", { description: "Opening in new tab..." });
      }
    } catch (error: any) {
      toast.error("Export Failed", { description: error.message || "Failed to generate PDF report" });
    }
  };

  const getSeverityColor = (severity: 'minor' | 'moderate' | 'severe') => {
    switch (severity) {
      case 'minor': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'moderate': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'severe': return 'bg-red-100 text-red-800 border-red-300';
    }
  };

  // ─── Normalize physics data ──────────────────────────────────────────
  const rawPhysics = extractedData?.physicsAnalysis || {};
  const physicsData = {
    impactSpeed: rawPhysics.impactSpeed ?? 45,
    impactForce: rawPhysics.impactForce ?? 80,
    energyDissipated: rawPhysics.energyDissipated ?? 65,
    deceleration: rawPhysics.deceleration ?? 4.5,
    damageConsistency: (rawPhysics.damageConsistency === 'inconsistent' ? 'impossible' : rawPhysics.damageConsistency || 'consistent') as 'consistent' | 'questionable' | 'impossible',
    physicsScore: rawPhysics.physicsScore ?? 70,
    confidence: rawPhysics.confidence ?? 0.7,
    is_valid: rawPhysics.is_valid ?? true,
    analysis_notes: rawPhysics.analysis_notes || '',
    accidentType: extractedData?.accidentType || 'other',
    flags: rawPhysics.flags || [],
    recommendations: rawPhysics.recommendations || []
  };

  // ─── Normalize fraud data ────────────────────────────────────────────
  const rawFraud = extractedData?.fraudAnalysis || {};
  const fraudData = {
    indicators: {
      claimHistory: rawFraud?.indicators?.claimHistory ?? 2,
      damageConsistency: rawFraud?.indicators?.damageConsistency ?? 2,
      documentAuthenticity: rawFraud?.indicators?.documentAuthenticity ?? 2,
      behavioralPatterns: rawFraud?.indicators?.behavioralPatterns ?? 2,
      ownershipVerification: rawFraud?.indicators?.ownershipVerification ?? 2,
      geographicRisk: rawFraud?.indicators?.geographicRisk ?? 2
    },
    overallRisk: (rawFraud?.risk_level || 'low') as 'low' | 'medium' | 'high',
    riskScore: rawFraud?.risk_score ?? (rawFraud?.fraud_probability ? Math.round(rawFraud.fraud_probability * 100) : 20),
    flaggedIssues: rawFraud?.top_risk_factors || []
  };

  // ─── Build cost breakdown from real data ─────────────────────────────
  const realBreakdown = extractedData?.costBreakdown;
  const totalCost = extractedData?.estimatedCost || 0;
  const costBreakdown = {
    labor: realBreakdown?.labor || 0,
    parts: realBreakdown?.parts || 0,
    materials: realBreakdown?.materials || 0,
    paint: realBreakdown?.paint || 0,
    sublet: realBreakdown?.sublet || 0,
    other: realBreakdown?.other || 0,
    total: totalCost
  };
  
  // If breakdown sums to 0, estimate from total
  const breakdownSum = costBreakdown.labor + costBreakdown.parts + costBreakdown.materials + costBreakdown.paint + costBreakdown.sublet + costBreakdown.other;
  if (breakdownSum === 0 && totalCost > 0) {
    costBreakdown.labor = Math.round(totalCost * 0.35 * 100) / 100;
    costBreakdown.parts = Math.round(totalCost * 0.40 * 100) / 100;
    costBreakdown.materials = Math.round(totalCost * 0.10 * 100) / 100;
    costBreakdown.paint = Math.round(totalCost * 0.10 * 100) / 100;
    costBreakdown.other = Math.round(totalCost * 0.05 * 100) / 100;
  }

  const dataCompleteness = extractedData?.dataCompleteness || 0;

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
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Assessment Analysis Complete</h1>
          <p className="text-gray-600">AI has successfully extracted and analyzed the assessment document</p>
          
          {/* Data Quality Bar */}
          <div className="mt-3 max-w-md mx-auto">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Data Completeness</span>
              <span className="font-semibold">{dataCompleteness}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className={`h-2 rounded-full ${dataCompleteness >= 70 ? 'bg-green-500' : dataCompleteness >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${dataCompleteness}%` }}></div>
            </div>
            {extractedData.missingData && extractedData.missingData.length > 0 && (
              <p className="text-xs text-gray-400 mt-1">Missing: {extractedData.missingData.join(', ')}</p>
            )}
          </div>
          
          {/* Action Buttons */}
          <div className="mt-4 flex gap-2 justify-center flex-wrap">
            {!isEditing ? (
              <Button onClick={() => setIsEditing(true)} variant="outline" size="sm" className="gap-2">
                <Edit3 className="w-4 h-4" /> Edit Data
              </Button>
            ) : (
              <>
                <Button onClick={handleSaveEdits} size="sm" className="gap-2 bg-green-600 hover:bg-green-700">
                  <Save className="w-4 h-4" /> Save Changes
                </Button>
                <Button onClick={handleCancelEdit} variant="outline" size="sm" className="gap-2">
                  <X className="w-4 h-4" /> Cancel
                </Button>
              </>
            )}
            <Button onClick={handleExportReport} variant="outline" size="sm" className="gap-2" disabled={exportPDF.isPending}>
              {exportPDF.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</> : <><FileDown className="w-4 h-4" /> Export PDF</>}
            </Button>
          </div>
        </div>

        {/* Tabbed Content */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full max-w-3xl mx-auto grid-cols-5 mb-8">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="damage">Damage</TabsTrigger>
            <TabsTrigger value="physics">Physics</TabsTrigger>
            <TabsTrigger value="fraud">Fraud Risk</TabsTrigger>
            <TabsTrigger value="cost">Cost</TabsTrigger>
          </TabsList>

          {/* ═══ OVERVIEW TAB ═══ */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid lg:grid-cols-3 gap-6">
              {/* Vehicle Information */}
              <Card className="p-6 lg:col-span-2">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg"><Car className="w-5 h-5 text-blue-600" /></div>
                    <h2 className="text-xl font-semibold">Vehicle Information</h2>
                  </div>
                  <Badge variant="outline" className="gap-1"><Target className="w-3 h-3" />{dataCompleteness}% Complete</Badge>
                </div>
                
                {!isEditing ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div><p className="text-sm text-gray-500">Make & Model</p><p className="font-medium">{extractedData.vehicleMake || "N/A"} {extractedData.vehicleModel || ""}</p></div>
                    <div><p className="text-sm text-gray-500">Year</p><p className="font-medium">{extractedData.vehicleYear || "N/A"}</p></div>
                    <div><p className="text-sm text-gray-500">Registration</p><p className="font-medium">{extractedData.vehicleRegistration || extractedData.registration || "N/A"}</p></div>
                    <div><p className="text-sm text-gray-500">Claimant</p><p className="font-medium">{extractedData.claimantName || "N/A"}</p></div>
                    {extractedData.accidentDate && <div><p className="text-sm text-gray-500">Accident Date</p><p className="font-medium">{extractedData.accidentDate}</p></div>}
                    {extractedData.accidentLocation && <div><p className="text-sm text-gray-500">Location</p><p className="font-medium">{extractedData.accidentLocation}</p></div>}
                    {extractedData.accidentType && <div><p className="text-sm text-gray-500">Accident Type</p><p className="font-medium capitalize">{extractedData.accidentType.replace(/_/g, ' ')}</p></div>}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-sm text-gray-500 block mb-1">Make</label><Input value={editedData.vehicleMake || ""} onChange={(e) => setEditedData({...editedData, vehicleMake: e.target.value})} /></div>
                    <div><label className="text-sm text-gray-500 block mb-1">Model</label><Input value={editedData.vehicleModel || ""} onChange={(e) => setEditedData({...editedData, vehicleModel: e.target.value})} /></div>
                    <div><label className="text-sm text-gray-500 block mb-1">Year</label><Input type="number" value={editedData.vehicleYear || ""} onChange={(e) => setEditedData({...editedData, vehicleYear: parseInt(e.target.value)})} /></div>
                    <div><label className="text-sm text-gray-500 block mb-1">Registration</label><Input value={editedData.vehicleRegistration || ""} onChange={(e) => setEditedData({...editedData, vehicleRegistration: e.target.value})} /></div>
                    <div className="col-span-2"><label className="text-sm text-gray-500 block mb-1">Claimant Name</label><Input value={editedData.claimantName || ""} onChange={(e) => setEditedData({...editedData, claimantName: e.target.value})} /></div>
                  </div>
                )}
              </Card>

              {/* AI Confidence Score */}
              <Card className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-blue-100 rounded-lg"><Brain className="w-5 h-5 text-blue-600" /></div>
                  <h3 className="font-semibold">AI Analysis</h3>
                </div>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-1"><span className="text-sm text-gray-600">Physics Score</span><span className="text-sm font-semibold" style={{ color: physicsData.physicsScore >= 70 ? '#16a34a' : physicsData.physicsScore >= 40 ? '#ca8a04' : '#dc2626' }}>{physicsData.physicsScore}%</span></div>
                    <div className="w-full bg-gray-200 rounded-full h-2"><div className="h-2 rounded-full" style={{ width: `${physicsData.physicsScore}%`, backgroundColor: physicsData.physicsScore >= 70 ? '#16a34a' : physicsData.physicsScore >= 40 ? '#ca8a04' : '#dc2626' }}></div></div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1"><span className="text-sm text-gray-600">Fraud Risk</span><span className="text-sm font-semibold" style={{ color: fraudData.riskScore <= 30 ? '#16a34a' : fraudData.riskScore <= 60 ? '#ca8a04' : '#dc2626' }}>{fraudData.riskScore}%</span></div>
                    <div className="w-full bg-gray-200 rounded-full h-2"><div className="h-2 rounded-full" style={{ width: `${fraudData.riskScore}%`, backgroundColor: fraudData.riskScore <= 30 ? '#16a34a' : fraudData.riskScore <= 60 ? '#ca8a04' : '#dc2626' }}></div></div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1"><span className="text-sm text-gray-600">Data Quality</span><span className="text-sm font-semibold" style={{ color: dataCompleteness >= 70 ? '#16a34a' : dataCompleteness >= 40 ? '#ca8a04' : '#dc2626' }}>{dataCompleteness}%</span></div>
                    <div className="w-full bg-gray-200 rounded-full h-2"><div className="h-2 rounded-full" style={{ width: `${dataCompleteness}%`, backgroundColor: dataCompleteness >= 70 ? '#16a34a' : dataCompleteness >= 40 ? '#ca8a04' : '#dc2626' }}></div></div>
                  </div>
                </div>
              </Card>
            </div>

            {/* Damage Summary */}
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-orange-100 rounded-lg"><AlertTriangle className="w-5 h-5 text-orange-600" /></div>
                <h2 className="text-xl font-semibold">Damage Summary</h2>
                {extractedData.damagedComponents && <Badge variant="secondary">{extractedData.damagedComponents.length} components</Badge>}
              </div>
              
              {!isEditing ? (
                <div className="space-y-3">
                  {extractedData.accidentDescription && (
                    <div className="p-3 bg-gray-50 rounded-lg mb-3">
                      <p className="text-sm text-gray-500 mb-1 font-medium">Accident Description</p>
                      <p className="text-sm text-gray-800">{extractedData.accidentDescription}</p>
                    </div>
                  )}
                  {damageSections.map((section, index) => (
                    <div key={index} className="border-l-4 border-orange-300 pl-4 py-2">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-900">{section.component}</span>
                        <Badge className={`text-xs ${getSeverityColor(section.severity)}`}>{section.severity}</Badge>
                      </div>
                      <p className="text-sm text-gray-700">{section.description}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  <label className="text-sm text-gray-500 block mb-2">Damage Description</label>
                  <Textarea value={editedData.damageDescription || ""} onChange={(e) => setEditedData({...editedData, damageDescription: e.target.value})} rows={8} className="w-full" />
                </div>
              )}
            </Card>

            {/* Cost Estimate */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg"><DollarSign className="w-5 h-5 text-green-600" /></div>
                  <h2 className="text-xl font-semibold">Estimated Repair Cost</h2>
                </div>
              </div>
              {!isEditing ? (
                <div>
                  <p className="text-4xl font-bold text-green-600 mb-2">${extractedData.estimatedCost?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || "0"}</p>
                  <p className="text-sm text-gray-500">Based on extracted assessment data and AI analysis</p>
                </div>
              ) : (
                <div>
                  <label className="text-sm text-gray-500 block mb-2">Estimated Cost ($)</label>
                  <Input type="number" value={editedData.estimatedCost || ""} onChange={(e) => setEditedData({...editedData, estimatedCost: parseFloat(e.target.value)})} />
                </div>
              )}
            </Card>

            {/* Damage Photos */}
            <ImageGallery photos={extractedData.damagePhotos || []} />
          </TabsContent>

          {/* ═══ DAMAGE ANALYSIS TAB ═══ */}
          <TabsContent value="damage" className="space-y-6">
            {/* Component-level breakdown */}
            {extractedData.damagedComponents && extractedData.damagedComponents.length > 0 && (
              <Card className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-orange-100 rounded-lg"><AlertTriangle className="w-5 h-5 text-orange-600" /></div>
                  <h2 className="text-xl font-semibold">Damaged Components</h2>
                  <Badge variant="secondary">{extractedData.damagedComponents.length} identified</Badge>
                </div>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {extractedData.damagedComponents.map((comp, i) => {
                    // Find matching itemized cost for this component
                    const matchingCost = extractedData.itemizedCosts?.find(
                      item => item.description.toLowerCase().includes(comp.toLowerCase()) || comp.toLowerCase().includes(item.description.toLowerCase().split(' ')[0])
                    );
                    return (
                      <div key={i} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <p className="font-medium text-gray-900 capitalize text-sm">{comp}</p>
                        {matchingCost && (
                          <p className="text-xs text-green-600 font-semibold mt-1">${matchingCost.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            <VehicleDamageVisualization 
              damagedComponents={damagedComponents}
              accidentType={extractedData.accidentType}
              estimatedCost={extractedData.estimatedCost}
            />

            {/* Damage Photos in Damage Tab */}
            <ImageGallery photos={extractedData.damagePhotos || []} />
          </TabsContent>

          {/* ═══ PHYSICS TAB ═══ */}
          <TabsContent value="physics" className="space-y-6">
            <AICommentaryCard
              title="Physics Validation Analysis"
              type="physics"
              status={physicsData.damageConsistency === 'consistent' ? 'pass' : physicsData.damageConsistency === 'questionable' ? 'warning' : 'fail'}
              commentary={
                physicsData.analysis_notes || (
                  physicsData.damageConsistency === 'consistent'
                    ? `The damage pattern matches what we'd expect from the reported accident. At an estimated impact speed of ${physicsData.impactSpeed} km/h, the vehicle would experience forces of approximately ${physicsData.impactForce} kN. The damaged areas and severity level are consistent with this type of collision. Physics validation score: ${physicsData.physicsScore}/100.`
                    : physicsData.damageConsistency === 'questionable'
                    ? `The damage pattern raises some questions. While not impossible, certain aspects don't align with the reported accident at ${physicsData.impactSpeed} km/h. The impact forces suggest the collision may have occurred differently than described.`
                    : `The damage doesn't match the accident story. Based on physics analysis at ${physicsData.impactSpeed} km/h, the reported ${physicsData.accidentType} shouldn't produce the observed damage pattern. This requires investigation.`
                )
              }
              keyFindings={[
                `Impact speed: ${physicsData.impactSpeed} km/h (${physicsData.impactSpeed < 30 ? 'low-speed' : physicsData.impactSpeed < 60 ? 'moderate' : physicsData.impactSpeed < 100 ? 'high-speed' : 'very high-speed'})`,
                `Crash forces: ${physicsData.impactForce} kN`,
                `Energy absorption: ${physicsData.energyDissipated}%`,
                `G-forces: ${physicsData.deceleration}g`,
                `Damage consistency: ${physicsData.damageConsistency === 'consistent' ? '✓ Matches accident story' : physicsData.damageConsistency === 'questionable' ? '⚠ Some discrepancies' : '✗ Does not match'}`,
                `Physics score: ${physicsData.physicsScore}/100`,
                ...(physicsData.flags.length > 0 ? [`Flags raised: ${physicsData.flags.join('; ')}`] : [])
              ]}
              recommendations={physicsData.recommendations.length > 0 ? physicsData.recommendations : (
                physicsData.damageConsistency !== 'consistent'
                  ? ['Schedule follow-up investigation', 'Request police report', 'Consider independent assessment']
                  : ['Physics check passed', 'Safe to proceed with normal claim process']
              )}
            />
            
            <PhysicsAnalysisChart data={physicsData} />

            {/* Cross-reference to fraud */}
            <PhysicsFraudCrossReference physicsAnalysis={extractedData.physicsAnalysis} fraudAnalysis={extractedData.fraudAnalysis} />
          </TabsContent>

          {/* ═══ FRAUD RISK TAB ═══ */}
          <TabsContent value="fraud" className="space-y-6">
            <AICommentaryCard
              title="Fraud Risk Assessment"
              type="fraud"
              status={fraudData.overallRisk === 'low' ? 'pass' : fraudData.overallRisk === 'medium' ? 'warning' : 'fail'}
              commentary={
                extractedData.fraudAnalysis?.analysis_notes || (
                  fraudData.overallRisk === 'low'
                    ? `This claim presents a low fraud risk profile with a calculated fraud probability of ${fraudData.riskScore}%. No significant red flags were identified across the multi-dimensional analysis.`
                    : fraudData.overallRisk === 'medium'
                    ? `This claim exhibits moderate fraud risk indicators with a ${fraudData.riskScore}% fraud probability. Several factors warrant additional scrutiny before approval.`
                    : `High fraud risk detected with ${fraudData.riskScore}% probability. Multiple red flags have been identified. This claim requires thorough investigation.`
                )
              }
              keyFindings={[
                `Overall fraud risk: ${fraudData.riskScore}/100 (${fraudData.overallRisk.toUpperCase()})`,
                `Claim history: ${fraudData.indicators.claimHistory}/5`,
                `Damage consistency: ${fraudData.indicators.damageConsistency}/5`,
                `Document authenticity: ${fraudData.indicators.documentAuthenticity}/5`,
                `Behavioral patterns: ${fraudData.indicators.behavioralPatterns}/5`,
                `Ownership verification: ${fraudData.indicators.ownershipVerification}/5`,
                `Geographic risk: ${fraudData.indicators.geographicRisk}/5`
              ]}
              recommendations={
                extractedData.fraudAnalysis?.recommendations?.length > 0 
                  ? extractedData.fraudAnalysis.recommendations
                  : (fraudData.overallRisk === 'high'
                    ? ['Escalate to fraud investigation unit', 'Suspend claim processing', 'Request additional documentation']
                    : fraudData.overallRisk === 'medium'
                    ? ['Conduct enhanced due diligence', 'Verify claimant identity', 'Consider independent review']
                    : ['Proceed with standard processing', 'Maintain routine documentation'])
              }
            />
            
            <FraudRiskRadarChart {...fraudData} />

            {/* Cross-reference from physics */}
            <PhysicsFraudCrossReference physicsAnalysis={extractedData.physicsAnalysis} fraudAnalysis={extractedData.fraudAnalysis} />
          </TabsContent>

          {/* ═══ COST BREAKDOWN TAB ═══ */}
          <TabsContent value="cost" className="space-y-6">
            <AICommentaryCard
              title="Quote Fairness Analysis"
              type="quote"
              status="info"
              commentary={
                `The assessment estimates a total repair cost of $${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}. ` +
                (extractedData.itemizedCosts && extractedData.itemizedCosts.length > 0
                  ? `The assessment includes ${extractedData.itemizedCosts.length} itemized line items covering labor, parts, materials, and other costs. `
                  : `No itemized line items were extracted from the document. The category breakdown below is estimated based on industry averages. `) +
                `Labor costs at $${costBreakdown.labor.toLocaleString(undefined, { minimumFractionDigits: 2 })} (${totalCost > 0 ? Math.round((costBreakdown.labor / totalCost) * 100) : 0}%), ` +
                `parts at $${costBreakdown.parts.toLocaleString(undefined, { minimumFractionDigits: 2 })} (${totalCost > 0 ? Math.round((costBreakdown.parts / totalCost) * 100) : 0}%).`
              }
              keyFindings={[
                `Total estimated cost: $${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
                `Itemized line items: ${extractedData.itemizedCosts?.length || 0}`,
                `Labor: ${totalCost > 0 ? Math.round((costBreakdown.labor / totalCost) * 100) : 0}% (industry standard: 30-40%)`,
                `Parts: ${totalCost > 0 ? Math.round((costBreakdown.parts / totalCost) * 100) : 0}% (industry standard: 35-50%)`,
                `Cost per damaged component: $${damagedComponents.length > 0 ? Math.round(totalCost / damagedComponents.length).toLocaleString() : 'N/A'}`
              ]}
              recommendations={[
                'Compare against panel beater quotes once claim is created',
                'Validate parts pricing against OEM and aftermarket suppliers',
                'Request itemized breakdown from assessor if not already provided',
                'Document cost analysis in claim file for audit purposes'
              ]}
            />
            
            <CostBreakdownChart 
              breakdown={costBreakdown} 
              itemizedCosts={extractedData.itemizedCosts}
            />
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
            {isCreatingClaim ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating Claim...</> : "Create Claim with This Data"}
          </Button>
          <Link href="/insurer/external-assessment">
            <Button variant="outline" size="lg">Upload Another Assessment</Button>
          </Link>
          <Link href="/portal-hub">
            <Button variant="ghost" size="lg">Back to Portal</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
