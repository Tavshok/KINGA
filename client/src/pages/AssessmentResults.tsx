import { useLocation, Link } from "wouter";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
  Maximize2, RotateCcw, Camera, Link2, ArrowRight, Wrench, Replace,
  BarChart3, ArrowDown, ArrowUp, Minus, Eye
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import VehicleDamageVisualization from "@/components/VehicleDamageVisualization";
import { VehicleImpactVectorDiagram } from "@/components/VehicleImpactVectorDiagram";
import { FraudRiskRadarChart } from "@/components/FraudRiskRadarChart";
import { CostBreakdownChart } from "@/components/CostBreakdownChart";
import { AICommentaryCard } from "@/components/AICommentaryCard";
import { ExecutiveSummary } from "@/components/ExecutiveSummary";
// Historical benchmarks are used internally by AI engine, not shown to insurers directly
// import { HistoricalBenchmarkCard } from "@/components/HistoricalBenchmarkCard";
import { CrossValidationPanel } from "@/components/CrossValidationPanel";



interface ItemizedCost {
  description: string;
  amount: number;
  category?: string;
}

interface ComponentRecommendation {
  component: string;
  action: 'repair' | 'replace';
  severity: 'minor' | 'moderate' | 'severe';
  estimatedCost: number;
  laborHours: number;
  reasoning: string;
}

interface QuoteFigure {
  label: string;
  amount: number;
  source: string;
  type: 'original' | 'agreed' | 'ai' | 'reference';
  description?: string;
}

interface PhotoWithClassification {
  url: string;
  classification: 'damage_photo' | 'document';
  page?: number;
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
  originalQuote?: number;
  agreedCost?: number;
  marketValue?: number;
  savings?: number;
  excessAmount?: number;
  betterment?: number;
  assessorName?: string;
  repairerName?: string;
  pdfUrl?: string;
  damagePhotos?: string[];
  allPhotos?: PhotoWithClassification[];
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
  componentRecommendations?: ComponentRecommendation[];
  quotes?: QuoteFigure[];
  missingData?: string[];
  dataQuality?: Record<string, boolean>;
  dataCompleteness?: number;
  crossValidation?: {
    timestamp: string;
    summary: {
      totalQuotedParts: number;
      totalVisibleDamage: number;
      confirmedCount: number;
      quotedNotVisibleCount: number;
      visibleNotQuotedCount: number;
      legitimateHiddenCount: number;
      suspiciousCount: number;
      overallRiskScore: number;
      overallRiskLevel: string;
    };
    items: {
      partName: string;
      rawName: string;
      zone: string | null;
      category: 'confirmed' | 'quoted_not_visible' | 'visible_not_quoted' | 'unaffected';
      isExternallyVisible: boolean;
      riskLevel: string;
      explanation: string;
      confidence: number;
      quotedCost?: number;
      quotedAction?: string;
    }[];
    fraudIndicators: string[];
    recommendations: string[];
  };
  normalizedComponents?: { raw: string; normalized: string; partId: string | null; zone: string | null }[];
  incidentClassification?: {
    incidentType: string;
    isCollision: boolean;
    vehicleWasStationary: boolean;
    confidence: number;
    reasoning: string;
  };
  narrativeValidation?: {
    narrativeScore: number;
    isPlausible: boolean;
    supports: string[];
    concerns: string[];
    deductions: string[];
  };
}

interface DamageSection {
  component: string;
  description: string;
  severity: 'minor' | 'moderate' | 'severe';
}

// ─── Image Gallery with Classification Filter & Zoom/Pan ──────────────
type PhotoFilter = 'all' | 'damage' | 'document';

function ImageGallery({ 
  damagePhotos, 
  allPhotos 
}: { 
  damagePhotos: string[]; 
  allPhotos?: PhotoWithClassification[];
}) {
  const [filter, setFilter] = useState<PhotoFilter>('damage');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const filteredPhotos = useMemo(() => {
    if (!allPhotos || allPhotos.length === 0) {
      // Fallback: all damagePhotos treated as damage
      return filter === 'document' ? [] : damagePhotos;
    }
    switch (filter) {
      case 'damage': return allPhotos.filter(p => p.classification === 'damage_photo').map(p => p.url);
      case 'document': return allPhotos.filter(p => p.classification === 'document').map(p => p.url);
      default: return allPhotos.map(p => p.url);
    }
  }, [filter, damagePhotos, allPhotos]);

  const damageCount = allPhotos ? allPhotos.filter(p => p.classification === 'damage_photo').length : damagePhotos.length;
  const documentCount = allPhotos ? allPhotos.filter(p => p.classification === 'document').length : 0;
  const totalCount = allPhotos ? allPhotos.length : damagePhotos.length;

  const resetView = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);

  useEffect(() => { setCurrentIndex(0); resetView(); }, [filter, resetView]);

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.5, 5));
  const handleZoomOut = () => {
    setZoom(prev => { const nz = Math.max(prev - 0.5, 1); if (nz === 1) setPan({ x: 0, y: 0 }); return nz; });
  };
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.25 : 0.25;
    setZoom(prev => { const nz = Math.max(1, Math.min(prev + delta, 5)); if (nz === 1) setPan({ x: 0, y: 0 }); return nz; });
  }, []);
  const handleMouseDown = (e: React.MouseEvent) => { if (zoom <= 1) return; setIsDragging(true); setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y }); };
  const handleMouseMove = (e: React.MouseEvent) => { if (!isDragging || zoom <= 1) return; setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }); };
  const handleMouseUp = () => setIsDragging(false);
  const goToPhoto = (i: number) => { setCurrentIndex(i); resetView(); };
  const goNext = () => goToPhoto(Math.min(currentIndex + 1, filteredPhotos.length - 1));
  const goPrev = () => goToPhoto(Math.max(currentIndex - 1, 0));

  if (totalCount === 0) {
    return (
      <Card className="p-8 text-center">
        <Camera className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
        <p className="text-muted-foreground font-medium">No photos extracted</p>
        <p className="text-sm text-muted-foreground/70 mt-1">The document may not contain embedded images.</p>
      </Card>
    );
  }

  return (
    <>
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg"><Camera className="w-5 h-5 text-indigo-600" /></div>
            <h2 className="text-xl font-semibold">Photo Gallery</h2>
            <Badge variant="secondary">{totalCount} total</Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={handleZoomOut} disabled={zoom <= 1} className="h-8 w-8"><ZoomOut className="w-4 h-4" /></Button>
            <span className="text-xs text-muted-foreground w-12 text-center">{Math.round(zoom * 100)}%</span>
            <Button variant="ghost" size="icon" onClick={handleZoomIn} disabled={zoom >= 5} className="h-8 w-8"><ZoomIn className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" onClick={resetView} className="h-8 w-8"><RotateCcw className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => { resetView(); setIsFullscreen(true); }} className="h-8 w-8"><Maximize2 className="w-4 h-4" /></Button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-4">
          <Button
            variant={filter === 'damage' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('damage')}
            className="gap-1.5"
          >
            <Camera className="w-3.5 h-3.5" /> Damage Photos
            <Badge variant="secondary" className="ml-1 text-xs px-1.5">{damageCount}</Badge>
          </Button>
          <Button
            variant={filter === 'document' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('document')}
            className="gap-1.5"
          >
            <FileText className="w-3.5 h-3.5" /> Documents
            <Badge variant="secondary" className="ml-1 text-xs px-1.5">{documentCount}</Badge>
          </Button>
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
            className="gap-1.5"
          >
            All
            <Badge variant="secondary" className="ml-1 text-xs px-1.5">{totalCount}</Badge>
          </Button>
        </div>

        {filteredPhotos.length === 0 ? (
          <div className="h-48 flex items-center justify-center bg-gray-50 dark:bg-muted/50 rounded-lg">
            <p className="text-muted-foreground/70">No {filter === 'damage' ? 'damage' : 'document'} photos in this category</p>
          </div>
        ) : (
          <>
            {/* Main Image Viewer */}
            <div 
              className="relative bg-gray-900 rounded-lg overflow-hidden select-none"
              style={{ height: '420px', cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {currentIndex > 0 && (
                <Button variant="ghost" size="icon" className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white z-10 h-10 w-10 rounded-full" onClick={(e) => { e.stopPropagation(); goPrev(); }}>
                  <ChevronLeft className="w-6 h-6" />
                </Button>
              )}
              {currentIndex < filteredPhotos.length - 1 && (
                <Button variant="ghost" size="icon" className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white z-10 h-10 w-10 rounded-full" onClick={(e) => { e.stopPropagation(); goNext(); }}>
                  <ChevronRight className="w-6 h-6" />
                </Button>
              )}
              <div className="absolute top-3 left-3 bg-black/60 text-white text-sm px-3 py-1.5 rounded-lg z-10 font-medium">
                {currentIndex + 1} / {filteredPhotos.length}
              </div>
              <div className="w-full h-full flex items-center justify-center overflow-hidden">
                <img 
                  src={filteredPhotos[currentIndex]} 
                  alt={`Photo ${currentIndex + 1}`}
                  className="max-w-full max-h-full object-contain"
                  style={{ transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`, transition: isDragging ? 'none' : 'transform 0.15s ease-out', pointerEvents: 'none' }}
                  draggable={false}
                  onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23333" width="400" height="300"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" fill="%23999" font-size="16"%3EImage Not Available%3C/text%3E%3C/svg%3E'; }}
                />
              </div>
            </div>

            {/* Filmstrip */}
            <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
              {filteredPhotos.map((photo, index) => (
                <button key={index} onClick={() => goToPhoto(index)} className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${index === currentIndex ? 'border-primary/80 ring-2 ring-primary/20' : 'border-gray-200 dark:border-border hover:border-gray-400'}`}>
                  <img src={photo} alt={`Thumb ${index + 1}`} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="64" height="64"%3E%3Crect fill="%23ddd" width="64" height="64"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" fill="%23999" font-size="10"%3E?%3C/text%3E%3C/svg%3E'; }} />
                </button>
              ))}
            </div>
          </>
        )}
      </Card>

      {/* Fullscreen Dialog */}
      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black border-none">
          <div className="relative w-full h-[90vh]">
            <div className="absolute top-4 right-4 z-20 flex gap-2">
              <Button variant="ghost" size="icon" onClick={handleZoomOut} className="bg-black/50 hover:bg-black/70 text-white h-9 w-9"><ZoomOut className="w-4 h-4" /></Button>
              <Button variant="ghost" size="icon" onClick={handleZoomIn} className="bg-black/50 hover:bg-black/70 text-white h-9 w-9"><ZoomIn className="w-4 h-4" /></Button>
              <Button variant="ghost" size="icon" onClick={resetView} className="bg-black/50 hover:bg-black/70 text-white h-9 w-9"><RotateCcw className="w-4 h-4" /></Button>
            </div>
            <div className="absolute top-4 left-4 z-20 bg-black/60 text-white text-sm px-3 py-1.5 rounded-lg">{currentIndex + 1} / {filteredPhotos.length}</div>
            {currentIndex > 0 && <Button variant="ghost" size="icon" className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white z-20 h-12 w-12 rounded-full" onClick={goPrev}><ChevronLeft className="w-8 h-8" /></Button>}
            {currentIndex < filteredPhotos.length - 1 && <Button variant="ghost" size="icon" className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white z-20 h-12 w-12 rounded-full" onClick={goNext}><ChevronRight className="w-8 h-8" /></Button>}
            <div className="w-full h-full flex items-center justify-center overflow-hidden" onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} style={{ cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}>
              <img src={filteredPhotos[currentIndex]} alt={`Photo ${currentIndex + 1}`} className="max-w-full max-h-full object-contain" style={{ transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`, transition: isDragging ? 'none' : 'transform 0.15s ease-out', pointerEvents: 'none' }} draggable={false} />
            </div>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 bg-black/60 px-3 py-2 rounded-lg z-20">
              {filteredPhotos.map((photo, index) => (
                <button key={index} onClick={() => goToPhoto(index)} className={`flex-shrink-0 w-12 h-12 rounded overflow-hidden border-2 transition-all ${index === currentIndex ? 'border-white' : 'border-transparent hover:border-white/50'}`}>
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
    <Card className={`p-6 border-2 ${contributes ? 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/50' : 'border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-950/50'}`}>
      <div className="flex items-center gap-3 mb-4">
        <div className={`p-2 rounded-lg ${contributes ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-green-100 dark:bg-green-900/30'}`}>
          <Link2 className={`w-5 h-5 ${contributes ? 'text-amber-600' : 'text-green-600'}`} />
        </div>
        <h3 className="text-lg font-semibold">Physics ↔ Fraud Cross-Reference</h3>
        <Badge className={contributes ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200' : 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'}>
          {contributes ? 'Elevated Risk' : 'Consistent'}
        </Badge>
      </div>
      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <div className="p-4 bg-white dark:bg-card rounded-lg border">
          <div className="flex items-center gap-2 mb-2"><Activity className="w-4 h-4 text-purple-600" /><span className="text-sm font-semibold text-foreground/80">Physics Validation</span></div>
          <div className="text-2xl font-bold text-purple-600">{crossRef.physics_score}/100</div>
          <p className="text-xs text-muted-foreground mt-1">{physicsFlags.length > 0 ? `${physicsFlags.length} flag(s) raised` : 'No flags raised'}</p>
        </div>
        <div className="p-4 bg-white dark:bg-card rounded-lg border">
          <div className="flex items-center gap-2 mb-2"><Shield className="w-4 h-4 text-primary" /><span className="text-sm font-semibold text-foreground/80">Fraud Risk Impact</span></div>
          <div className={`text-2xl font-bold ${contributes ? 'text-amber-600' : 'text-green-600'}`}>{contributes ? 'Score Elevated' : 'No Impact'}</div>
          <p className="text-xs text-muted-foreground mt-1">{contributes ? 'Physics inconsistencies increased fraud score' : 'Physics supports claim legitimacy'}</p>
        </div>
      </div>
      {physicsFlags.length > 0 && (
        <div className="mb-4 p-3 bg-white dark:bg-card rounded-lg border border-amber-200 dark:border-amber-800">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">Physics Flags Feeding Into Fraud Score:</p>
          <ul className="space-y-1">
            {physicsFlags.map((flag: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /><span>{flag}</span></li>
            ))}
          </ul>
        </div>
      )}
      <div className="p-3 bg-white dark:bg-card rounded-lg border">
        <p className="text-sm text-foreground/80"><strong>Analysis:</strong> {crossRef.physics_notes}</p>
      </div>
    </Card>
  );
}

// ─── Quote Comparison Bar Chart (inline SVG) ──────────────────────────
function QuoteComparisonChart({ quotes }: { quotes: QuoteFigure[] }) {
  if (!quotes || quotes.length === 0) return null;
  const maxAmount = Math.max(...quotes.map(q => q.amount));
  const colors: Record<string, string> = { original: '#ef4444', agreed: '#22c55e', ai: '#3b82f6', reference: '#a855f7' };
  const labels: Record<string, string> = { original: 'Original', agreed: 'Agreed', ai: 'AI Estimate', reference: 'Reference' };

  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-primary/10 rounded-lg"><BarChart3 className="w-5 h-5 text-primary" /></div>
        <h2 className="text-xl font-semibold">Quote Comparison</h2>
        <Badge variant="secondary">{quotes.length} quotes</Badge>
      </div>
      <div className="space-y-4">
        {quotes.map((quote, i) => {
          const pct = maxAmount > 0 ? (quote.amount / maxAmount) * 100 : 0;
          const color = colors[quote.type] || '#6b7280';
          return (
            <div key={i}>
              <div className="flex items-center justify-between mb-1.5">
                <div>
                  <span className="text-sm font-semibold text-gray-900 dark:text-foreground">{quote.label}</span>
                  <span className="text-xs text-muted-foreground ml-2">({quote.source})</span>
                </div>
                <span className="text-lg font-bold" style={{ color }}>${quote.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="w-full bg-gray-100 dark:bg-muted rounded-full h-6 overflow-hidden">
                <div className="h-full rounded-full flex items-center justify-end pr-2 text-xs font-semibold text-white transition-all duration-500" style={{ width: `${Math.max(pct, 8)}%`, backgroundColor: color }}>
                  {pct > 20 && `${Math.round(pct)}%`}
                </div>
              </div>
              {quote.description && <p className="text-xs text-muted-foreground mt-1">{quote.description}</p>}
            </div>
          );
        })}
      </div>

      {/* Savings highlight */}
      {quotes.length >= 2 && (() => {
        const orig = quotes.find(q => q.type === 'original');
        const agreed = quotes.find(q => q.type === 'agreed');
        if (orig && agreed && orig.amount > agreed.amount) {
          const saved = orig.amount - agreed.amount;
          const pctSaved = ((saved / orig.amount) * 100).toFixed(1);
          return (
            <div className="mt-6 p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <ArrowDown className="w-5 h-5 text-green-600" />
                <span className="font-semibold text-green-800 dark:text-green-200">Negotiation Savings</span>
              </div>
              <p className="text-2xl font-bold text-green-600">${saved.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span className="text-sm font-normal text-green-700 dark:text-green-300">({pctSaved}% reduction)</span></p>
              <p className="text-xs text-green-600 mt-1">Difference between original repairer quote and agreed cost after assessment</p>
            </div>
          );
        }
        return null;
      })()}
    </Card>
  );
}

// ─── Component Recommendations ────────────────────────────────────────
function ComponentRecommendations({ recommendations }: { recommendations: ComponentRecommendation[] }) {
  if (!recommendations || recommendations.length === 0) return null;
  const totalCost = recommendations.reduce((s, r) => s + r.estimatedCost, 0);
  const totalHours = recommendations.reduce((s, r) => s + r.laborHours, 0);
  const repairCount = recommendations.filter(r => r.action === 'repair').length;
  const replaceCount = recommendations.filter(r => r.action === 'replace').length;

  const severityColor = (s: string) => {
    switch (s) {
      case 'minor': return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 border-yellow-300 dark:border-yellow-700';
      case 'moderate': return 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200 border-orange-300 dark:border-orange-700';
      case 'severe': return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border-red-300 dark:border-red-700';
      default: return 'bg-gray-100 dark:bg-muted text-gray-800 dark:text-foreground';
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg"><Wrench className="w-5 h-5 text-purple-600" /></div>
        <h2 className="text-xl font-semibold">Repair vs Replace Recommendations</h2>
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="p-3 bg-primary/5 rounded-lg text-center">
          <p className="text-2xl font-bold text-primary">{recommendations.length}</p>
          <p className="text-xs text-muted-foreground">Components</p>
        </div>
        <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-lg text-center">
          <p className="text-2xl font-bold text-green-600">{repairCount}</p>
          <p className="text-xs text-muted-foreground">Repair</p>
        </div>
        <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-lg text-center">
          <p className="text-2xl font-bold text-red-600">{replaceCount}</p>
          <p className="text-xs text-muted-foreground">Replace</p>
        </div>
        <div className="p-3 bg-purple-50 dark:bg-purple-950/30 rounded-lg text-center">
          <p className="text-2xl font-bold text-purple-600">{totalHours.toFixed(1)}h</p>
          <p className="text-xs text-muted-foreground">Total Labor</p>
        </div>
      </div>

      {/* Component Cards */}
      <div className="space-y-3">
        {recommendations.map((rec, i) => (
          <div key={i} className={`p-4 rounded-lg border-l-4 ${rec.action === 'replace' ? 'border-l-red-500 bg-red-50/30 dark:bg-red-950/30' : 'border-l-green-500 bg-green-50/30 dark:bg-green-950/30'}`}>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-gray-900 dark:text-foreground capitalize">{rec.component}</span>
                  <Badge className={`text-xs ${rec.action === 'replace' ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200' : 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'}`}>
                    {rec.action === 'replace' ? '⟳ REPLACE' : '🔧 REPAIR'}
                  </Badge>
                  <Badge className={`text-xs ${severityColor(rec.severity)}`}>{rec.severity}</Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{rec.reasoning}</p>
                <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                  <span>Labor: {rec.laborHours}h</span>
                </div>
              </div>
              <div className="text-right ml-4">
                <p className="text-lg font-bold text-gray-900 dark:text-foreground">${rec.estimatedCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Total */}
      <div className="mt-4 p-4 bg-gray-100 dark:bg-muted rounded-lg flex items-center justify-between">
        <span className="font-semibold text-foreground/80">AI Component Total</span>
        <span className="text-xl font-bold text-gray-900 dark:text-foreground">${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
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
        sections.push({ component: matchedComponent.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '), description: line.trim(), severity });
        components.push(matchedComponent);
      }
    });
    if (sections.length === 0) { sections.push({ component: 'General Damage', description: description, severity: 'moderate' }); components.push('general damage'); }
    setDamageSections(sections);
    if (components.length > 0) setDamagedComponents(components);
  };

  const createClaim = trpc.claims.submit.useMutation({
    onSuccess: () => { toast.success("Claim Created Successfully"); setIsCreatingClaim(false); setLocation("/insurer-portal/claims-processor"); },
    onError: (error: any) => { toast.error("Error Creating Claim", { description: error.message }); setIsCreatingClaim(false); },
  });

  const handleCreateClaim = () => {
    const dataToUse = isEditing ? editedData : extractedData;
    if (!dataToUse) { toast.error("No Data Available"); return; }
    const vehicleReg = dataToUse.vehicleRegistration || dataToUse.registration;
    if (!vehicleReg || !dataToUse.vehicleMake) { toast.error("Missing Required Data"); return; }
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
      panelBeaterChoice1: '',
      panelBeaterChoice2: '',
      panelBeaterChoice3: '',
    });
  };

  const handleSaveEdits = () => { setExtractedData(editedData); setIsEditing(false); toast.success("Changes saved"); if (editedData.damageDescription) parseDamageDescription(editedData.damageDescription); };
  const handleCancelEdit = () => { setEditedData(extractedData || {}); setIsEditing(false); };

  const exportPDF = trpc.insurers.exportAssessmentPDF.useMutation();
  const handleExportReport = async () => {
    if (!extractedData) { toast.error("No data to export"); return; }
    try {
      toast.info("Generating PDF...");
      const result = await exportPDF.mutateAsync({
        vehicleMake: extractedData.vehicleMake,
        vehicleModel: extractedData.vehicleModel,
        vehicleYear: extractedData.vehicleYear,
        vehicleRegistration: extractedData.vehicleRegistration || extractedData.registration,
        damageDescription: extractedData.damageDescription,
        estimatedCost: extractedData.estimatedCost,
        originalQuote: extractedData.originalQuote,
        agreedCost: extractedData.agreedCost,
        savings: extractedData.savings,
        physicsAnalysis: extractedData.physicsAnalysis,
        fraudAnalysis: extractedData.fraudAnalysis,
        damagePhotos: extractedData.damagePhotos,
        damagedComponents: damagedComponents,
        crossValidation: extractedData.crossValidation,
        normalizedComponents: extractedData.normalizedComponents,
        componentRecommendations: extractedData.componentRecommendations,
        itemizedCosts: extractedData.itemizedCosts,
        accidentType: extractedData.accidentType,
        accidentDate: extractedData.accidentDate,
        accidentDescription: extractedData.accidentDescription,
        assessorName: extractedData.assessorName,
        repairerName: extractedData.repairerName,
        claimantName: extractedData.claimantName,
        claimNumber: extractedData.claimNumber,
      });
      if (result.success && result.pdfUrl) { window.open(result.pdfUrl, '_blank'); toast.success("PDF Generated!"); }
    } catch (error: any) { toast.error("Export Failed", { description: error.message }); }
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
  
  // ─── Extract quantitative physics validation data ──────────────────────
  const physicsValidation = rawPhysics.quantitativeMode && rawPhysics.impactAngleDegrees !== undefined
    ? {
        impactAngleDegrees: rawPhysics.impactAngleDegrees,
        calculatedImpactForceKN: rawPhysics.calculatedImpactForceKN || 0,
        impactLocationNormalized: rawPhysics.impactLocationNormalized || { relativeX: 0.5, relativeY: 0.5 }
      }
    : null;

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
  const breakdownSum = costBreakdown.labor + costBreakdown.parts + costBreakdown.materials + costBreakdown.paint + costBreakdown.sublet + costBreakdown.other;
  const isEstimatedBreakdown = breakdownSum === 0 && totalCost > 0;
  if (isEstimatedBreakdown) {
    costBreakdown.labor = Math.round(totalCost * 0.35 * 100) / 100;
    costBreakdown.parts = Math.round(totalCost * 0.40 * 100) / 100;
    costBreakdown.materials = Math.round(totalCost * 0.10 * 100) / 100;
    costBreakdown.paint = Math.round(totalCost * 0.10 * 100) / 100;
    costBreakdown.other = Math.round(totalCost * 0.05 * 100) / 100;
  }

  const dataCompleteness = extractedData?.dataCompleteness || 0;

  if (!extractedData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-white to-accent/5 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading assessment results...</p>
        </div>
      </div>
    );
  }

  const hasQuotes = extractedData.quotes && extractedData.quotes.length > 0;
  const hasRecommendations = extractedData.componentRecommendations && extractedData.componentRecommendations.length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-white to-accent/5 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-foreground mb-2">Assessment Analysis Complete</h1>
          <p className="text-muted-foreground">AI has successfully extracted and analyzed the assessment document</p>
          
          {/* Data Quality Bar */}
          <div className="mt-3 max-w-md mx-auto">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Data Completeness</span>
              <span className="font-semibold">{dataCompleteness}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div className={`h-2 rounded-full ${dataCompleteness >= 70 ? 'bg-emerald-500' : dataCompleteness >= 40 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${dataCompleteness}%` }}></div>
            </div>
            {extractedData.missingData && extractedData.missingData.length > 0 && (
              <p className="text-xs text-muted-foreground/70 mt-1">Missing: {extractedData.missingData.join(', ')}</p>
            )}
          </div>
          
          {/* Action Buttons */}
          <div className="mt-4 flex gap-2 justify-center flex-wrap">
            {!isEditing ? (
              <Button onClick={() => setIsEditing(true)} variant="outline" size="sm" className="gap-2"><Edit3 className="w-4 h-4" /> Edit Data</Button>
            ) : (
              <>
                <Button onClick={handleSaveEdits} size="sm" className="gap-2 bg-green-600 hover:bg-green-700"><Save className="w-4 h-4" /> Save Changes</Button>
                <Button onClick={handleCancelEdit} variant="outline" size="sm" className="gap-2"><X className="w-4 h-4" /> Cancel</Button>
              </>
            )}
            <Button onClick={handleExportReport} variant="outline" size="sm" className="gap-2" disabled={exportPDF.isPending}>
              {exportPDF.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</> : <><FileDown className="w-4 h-4" /> Export PDF</>}
            </Button>
          </div>
        </div>

        {/* Tabbed Content */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full max-w-5xl mx-auto grid-cols-7 mb-8">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="damage">Damage</TabsTrigger>
            <TabsTrigger value="validation" className="gap-1">
              <Eye className="w-3.5 h-3.5" /> Validation
            </TabsTrigger>
            <TabsTrigger value="physics">Physics</TabsTrigger>
            <TabsTrigger value="fraud">Fraud Risk</TabsTrigger>
            <TabsTrigger value="cost">Cost</TabsTrigger>
            <TabsTrigger value="quotes">Quotes</TabsTrigger>
          </TabsList>

          {/* ═══ OVERVIEW TAB ═══ */}
          <TabsContent value="overview" className="space-y-6">
            {/* Executive Summary */}
            <ExecutiveSummary
              vehicleMake={extractedData.vehicleMake}
              vehicleModel={extractedData.vehicleModel}
              vehicleYear={extractedData.vehicleYear}
              vehicleRegistration={extractedData.vehicleRegistration || extractedData.registration}
              accidentType={extractedData.accidentType}
              accidentDescription={extractedData.accidentDescription}
              totalCost={totalCost}
              originalQuote={extractedData.originalQuote}
              agreedCost={extractedData.agreedCost}
              savings={extractedData.savings}
              componentCount={damagedComponents.length}
              physicsData={physicsData}
              fraudData={fraudData}
              crossValidation={extractedData.crossValidation}
              incidentClassification={extractedData.incidentClassification}
              narrativeValidation={extractedData.narrativeValidation}
              dataCompleteness={dataCompleteness}
              damagePhotoCount={extractedData.damagePhotos?.length || 0}
            />


            <div className="grid lg:grid-cols-3 gap-6">
              {/* Vehicle Information */}
              <Card className="p-6 lg:col-span-2">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg"><Car className="w-5 h-5 text-primary" /></div>
                    <h2 className="text-xl font-semibold">Vehicle Information</h2>
                  </div>
                  <Badge variant="outline" className="gap-1"><Target className="w-3 h-3" />{dataCompleteness}% Complete</Badge>
                </div>
                
                {!isEditing ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div><p className="text-sm text-muted-foreground">Make & Model</p><p className="font-medium">{extractedData.vehicleMake || "N/A"} {extractedData.vehicleModel || ""}</p></div>
                    <div><p className="text-sm text-muted-foreground">Year</p><p className="font-medium">{extractedData.vehicleYear || "N/A"}</p></div>
                    <div><p className="text-sm text-muted-foreground">Registration</p><p className="font-medium">{extractedData.vehicleRegistration || extractedData.registration || "N/A"}</p></div>
                    <div><p className="text-sm text-muted-foreground">Claimant</p><p className="font-medium">{extractedData.claimantName || "N/A"}</p></div>
                    {extractedData.accidentDate && <div><p className="text-sm text-muted-foreground">Accident Date</p><p className="font-medium">{extractedData.accidentDate}</p></div>}
                    {extractedData.accidentLocation && <div><p className="text-sm text-muted-foreground">Location</p><p className="font-medium">{extractedData.accidentLocation}</p></div>}
                    {extractedData.accidentType && <div><p className="text-sm text-muted-foreground">Accident Type</p><p className="font-medium capitalize">{extractedData.accidentType.replace(/_/g, ' ')}</p></div>}
                    {extractedData.assessorName && <div><p className="text-sm text-muted-foreground">Assessor</p><p className="font-medium">{extractedData.assessorName}</p></div>}
                    {extractedData.repairerName && <div><p className="text-sm text-muted-foreground">Repairer</p><p className="font-medium">{extractedData.repairerName}</p></div>}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-sm text-muted-foreground block mb-1">Make</label><Input value={editedData.vehicleMake || ""} onChange={(e) => setEditedData({...editedData, vehicleMake: e.target.value})} /></div>
                    <div><label className="text-sm text-muted-foreground block mb-1">Model</label><Input value={editedData.vehicleModel || ""} onChange={(e) => setEditedData({...editedData, vehicleModel: e.target.value})} /></div>
                    <div><label className="text-sm text-muted-foreground block mb-1">Year</label><Input type="number" value={editedData.vehicleYear || ""} onChange={(e) => setEditedData({...editedData, vehicleYear: parseInt(e.target.value)})} /></div>
                    <div><label className="text-sm text-muted-foreground block mb-1">Registration</label><Input value={editedData.vehicleRegistration || ""} onChange={(e) => setEditedData({...editedData, vehicleRegistration: e.target.value})} /></div>
                    <div className="col-span-2"><label className="text-sm text-muted-foreground block mb-1">Claimant Name</label><Input value={editedData.claimantName || ""} onChange={(e) => setEditedData({...editedData, claimantName: e.target.value})} /></div>
                  </div>
                )}
              </Card>

              {/* AI Confidence Score */}
              <Card className="p-6 bg-gradient-to-br from-primary/5 to-secondary/5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-primary/10 rounded-lg"><Brain className="w-5 h-5 text-primary" /></div>
                  <h3 className="text-lg font-semibold">AI Analysis</h3>
                </div>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm text-muted-foreground">Physics Score</span>
                      <span className={`text-sm font-semibold ${physicsData.physicsScore >= 70 ? 'text-emerald-600 dark:text-emerald-400' : physicsData.physicsScore >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>{physicsData.physicsScore}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div className={`h-2 rounded-full ${physicsData.physicsScore >= 70 ? 'bg-emerald-500' : physicsData.physicsScore >= 40 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${physicsData.physicsScore}%` }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm text-muted-foreground">Fraud Risk</span>
                      <span className={`text-sm font-semibold ${fraudData.riskScore <= 30 ? 'text-emerald-600 dark:text-emerald-400' : fraudData.riskScore <= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>{fraudData.riskScore}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div className={`h-2 rounded-full ${fraudData.riskScore <= 30 ? 'bg-emerald-500' : fraudData.riskScore <= 60 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${fraudData.riskScore}%` }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm text-muted-foreground">Data Quality</span>
                      <span className={`text-sm font-semibold ${dataCompleteness >= 70 ? 'text-emerald-600 dark:text-emerald-400' : dataCompleteness >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>{dataCompleteness}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div className={`h-2 rounded-full ${dataCompleteness >= 70 ? 'bg-emerald-500' : dataCompleteness >= 40 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${dataCompleteness}%` }}></div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* Cost Summary Cards */}
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="p-5">
                <p className="text-sm text-muted-foreground mb-1">Agreed Cost</p>
                <p className="text-2xl font-bold text-green-600">${(extractedData.agreedCost || extractedData.estimatedCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                {extractedData.assessorName && <p className="text-xs text-muted-foreground/70 mt-1">By {extractedData.assessorName}</p>}
              </Card>
              {extractedData.originalQuote && extractedData.originalQuote > 0 && (
                <Card className="p-5">
                  <p className="text-sm text-muted-foreground mb-1">Original Quote</p>
                  <p className="text-2xl font-bold text-red-500">${extractedData.originalQuote.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  {extractedData.repairerName && <p className="text-xs text-muted-foreground/70 mt-1">By {extractedData.repairerName}</p>}
                </Card>
              )}
              {extractedData.savings && extractedData.savings > 0 && (
                <Card className="p-5 bg-green-50/50 dark:bg-green-950/50">
                  <p className="text-sm text-muted-foreground mb-1">Savings</p>
                  <p className="text-2xl font-bold text-green-600 flex items-center gap-1"><ArrowDown className="w-5 h-5" />${extractedData.savings.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </Card>
              )}
              {extractedData.marketValue && extractedData.marketValue > 0 && (
                <Card className="p-5">
                  <p className="text-sm text-muted-foreground mb-1">Market Value</p>
                  <p className="text-2xl font-bold text-purple-600">${extractedData.marketValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </Card>
              )}
            </div>

            {/* Damage Summary */}
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg"><AlertTriangle className="w-5 h-5 text-orange-600" /></div>
                <h2 className="text-xl font-semibold">Damage Summary</h2>
                {extractedData.damagedComponents && <Badge variant="secondary">{extractedData.damagedComponents.length} components</Badge>}
              </div>
              {!isEditing ? (
                <div className="space-y-3">
                  {extractedData.accidentDescription && (
                    <div className="p-3 bg-gray-50 dark:bg-muted/50 rounded-lg mb-3">
                      <p className="text-sm text-muted-foreground mb-1 font-medium">Accident Description</p>
                      <p className="text-sm text-gray-800 dark:text-foreground">{extractedData.accidentDescription}</p>
                    </div>
                  )}
                  {damageSections.map((section, index) => (
                    <div key={index} className="border-l-4 border-orange-300 dark:border-orange-700 pl-4 py-2">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-900 dark:text-foreground">{section.component}</span>
                        <Badge className={`text-xs ${section.severity === 'minor' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200' : section.severity === 'moderate' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200' : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200'}`}>{section.severity}</Badge>
                      </div>
                      <p className="text-sm text-foreground/80">{section.description}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  <label className="text-sm text-muted-foreground block mb-2">Damage Description</label>
                  <Textarea value={editedData.damageDescription || ""} onChange={(e) => setEditedData({...editedData, damageDescription: e.target.value})} rows={8} className="w-full" />
                </div>
              )}
            </Card>

            {/* Damage Photos */}
            <ImageGallery damagePhotos={extractedData.damagePhotos || []} allPhotos={extractedData.allPhotos} />
          </TabsContent>

          {/* ═══ VALIDATION TAB ═══ */}
          <TabsContent value="validation" className="space-y-6">
            {/* 3D Vehicle Visualization */}
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg"><Car className="w-5 h-5 text-indigo-600" /></div>
                <div>
                  <h2 className="text-xl font-semibold">Damage Visualization</h2>
                  <p className="text-sm text-muted-foreground">Visual representation of damage zones on the vehicle</p>
                </div>
              </div>
              <VehicleDamageVisualization
                damagedComponents={extractedData.damagedComponents || []}
                accidentType={extractedData.accidentType}
                estimatedCost={extractedData.estimatedCost}
              />
            </Card>

            {/* Cross-Validation Panel */}
            {extractedData.crossValidation ? (
              <CrossValidationPanel data={extractedData.crossValidation} />
            ) : (
              <Card className="p-8 text-center">
                <Eye className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground font-medium">Cross-Validation Not Available</p>
                <p className="text-sm text-muted-foreground/70 mt-1">Cross-validation requires both damage photos and quoted components. Upload an assessment with photos to enable this analysis.</p>
              </Card>
            )}

            {/* Normalized Component Mapping */}
            {extractedData.normalizedComponents && extractedData.normalizedComponents.length > 0 && (
              <Card className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg"><Wrench className="w-5 h-5 text-purple-600" /></div>
                  <h2 className="text-xl font-semibold">Component Name Resolution</h2>
                  <Badge variant="secondary">{extractedData.normalizedComponents.length} components</Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-4">Raw component names from the assessment mapped to standardized vehicle part taxonomy</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-border">
                        <th className="text-left py-2 px-3 font-semibold text-muted-foreground">Raw Name (from PDF)</th>
                        <th className="text-left py-2 px-3 font-semibold text-muted-foreground">Normalized Name</th>
                        <th className="text-left py-2 px-3 font-semibold text-muted-foreground">Vehicle Zone</th>
                        <th className="text-left py-2 px-3 font-semibold text-muted-foreground">Part ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {extractedData.normalizedComponents.map((nc, i) => (
                        <tr key={i} className="border-b border-gray-100 hover:bg-gray-50 dark:bg-muted/50">
                          <td className="py-2 px-3 text-foreground/80">{nc.raw}</td>
                          <td className="py-2 px-3 font-medium text-gray-900 dark:text-foreground">{nc.normalized}</td>
                          <td className="py-2 px-3">
                            {nc.zone ? <Badge variant="outline" className="text-xs capitalize">{nc.zone.replace(/_/g, ' ')}</Badge> : <span className="text-muted-foreground/70">—</span>}
                          </td>
                          <td className="py-2 px-3 text-xs text-muted-foreground/70 font-mono">{nc.partId || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </TabsContent>

          {/* ═══ DAMAGE ANALYSIS TAB ═══ */}
          <TabsContent value="damage" className="space-y-6">
            {/* Component Recommendations */}
            {hasRecommendations && (
              <ComponentRecommendations recommendations={extractedData.componentRecommendations!} />
            )}

            {/* Component List (fallback if no recommendations) */}
            {!hasRecommendations && extractedData.damagedComponents && extractedData.damagedComponents.length > 0 && (
              <Card className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg"><AlertTriangle className="w-5 h-5 text-orange-600" /></div>
                  <h2 className="text-xl font-semibold">Damaged Components</h2>
                  <Badge variant="secondary">{extractedData.damagedComponents.length} identified</Badge>
                </div>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {extractedData.damagedComponents.map((comp, i) => {
                    const matchingCost = extractedData.itemizedCosts?.find(
                      item => item.description.toLowerCase().includes(comp.toLowerCase()) || comp.toLowerCase().includes(item.description.toLowerCase().split(' ')[0])
                    );
                    return (
                      <div key={i} className="p-3 bg-gray-50 dark:bg-muted/50 rounded-lg border border-gray-200 dark:border-border">
                        <p className="font-medium text-gray-900 dark:text-foreground capitalize text-sm">{comp}</p>
                        {matchingCost && <p className="text-xs text-green-600 font-semibold mt-1">${matchingCost.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>}
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

            <ImageGallery damagePhotos={extractedData.damagePhotos || []} allPhotos={extractedData.allPhotos} />
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
                    ? `The damage pattern matches what we'd expect from the reported accident. At an estimated impact speed of ${physicsData.impactSpeed} km/h, the vehicle would experience forces of approximately ${physicsData.impactForce} kN. Physics validation score: ${physicsData.physicsScore}/100.`
                    : physicsData.damageConsistency === 'questionable'
                    ? `The damage pattern raises some questions. While not impossible, certain aspects don't align with the reported accident at ${physicsData.impactSpeed} km/h.`
                    : `The damage doesn't match the accident story. Based on physics analysis at ${physicsData.impactSpeed} km/h, the reported ${physicsData.accidentType} shouldn't produce the observed damage pattern.`
                )
              }
              keyFindings={[
                `Impact speed: ${physicsData.impactSpeed} km/h`,
                `Crash forces: ${physicsData.impactForce} kN`,
                `Energy absorption: ${physicsData.energyDissipated}%`,
                `G-forces: ${physicsData.deceleration}g`,
                `Damage consistency: ${physicsData.damageConsistency === 'consistent' ? '✓ Matches' : physicsData.damageConsistency === 'questionable' ? '⚠ Discrepancies' : '✗ Does not match'}`,
                `Physics score: ${physicsData.physicsScore}/100`,
                ...((physicsData.flags ?? []).length > 0 ? [`Flags: ${physicsData.flags.join('; ')}`] : [])
              ]}
              recommendations={(physicsData.recommendations ?? []).length > 0 ? physicsData.recommendations : (
                physicsData.damageConsistency !== 'consistent'
                  ? ['Schedule follow-up investigation', 'Request police report', 'Consider independent assessment']
                  : ['Physics check passed', 'Safe to proceed with normal claim process']
              )}
            />
            <VehicleImpactVectorDiagram
              vehicleMake={extractedData?.vehicleMake}
              vehicleModel={extractedData?.vehicleModel}
              vehicleYear={extractedData?.vehicleYear}
              accidentType={extractedData?.accidentType}
              impactSpeed={physicsData.impactSpeed}
              impactForce={physicsData.impactForce}
              impactPoint={extractedData?.accidentType}
              damagedComponents={extractedData?.damagedComponents || []}
              damageConsistency={physicsData.damageConsistency}
              physicsValidation={physicsValidation}
              confidenceScore={physicsData.confidence}
            />
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
                    ? `Low fraud risk profile with ${fraudData.riskScore}% probability. No significant red flags identified.`
                    : fraudData.overallRisk === 'medium'
                    ? `Moderate fraud risk at ${fraudData.riskScore}%. Several factors warrant additional scrutiny.`
                    : `High fraud risk at ${fraudData.riskScore}%. Multiple red flags require investigation.`
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
            <FraudRiskRadarChart indicators={fraudData.indicators} overallRisk={fraudData.overallRisk} riskScore={fraudData.riskScore} flaggedIssues={fraudData.flaggedIssues} />
            <PhysicsFraudCrossReference physicsAnalysis={extractedData.physicsAnalysis} fraudAnalysis={extractedData.fraudAnalysis} />
          </TabsContent>

          {/* ═══ COST BREAKDOWN TAB ═══ */}
          <TabsContent value="cost" className="space-y-6">
            {/* Cost Summary Cards */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card className="p-5 bg-gradient-to-br from-green-50 to-emerald-50 border-green-200 dark:border-green-800">
                <p className="text-sm text-muted-foreground mb-1">Agreed / Estimated Cost</p>
                <p className="text-3xl font-bold text-green-700 dark:text-green-300">${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </Card>
              {extractedData.excessAmount && extractedData.excessAmount > 0 && (
                <Card className="p-5">
                  <p className="text-sm text-muted-foreground mb-1">Excess / Deductible</p>
                  <p className="text-2xl font-bold text-orange-600">${extractedData.excessAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </Card>
              )}
              {extractedData.betterment && extractedData.betterment > 0 && (
                <Card className="p-5">
                  <p className="text-sm text-muted-foreground mb-1">Betterment / Depreciation</p>
                  <p className="text-2xl font-bold text-amber-600">${extractedData.betterment.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </Card>
              )}
            </div>

            <AICommentaryCard
              title="Quote Fairness Analysis"
              type="quote"
              status="info"
              commentary={
                `Total repair cost: $${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}. ` +
                (extractedData.itemizedCosts && extractedData.itemizedCosts.length > 0
                  ? `${extractedData.itemizedCosts.length} itemized line items extracted. `
                  : `Category breakdown estimated from industry averages. `) +
                `Labor: $${costBreakdown.labor.toLocaleString(undefined, { minimumFractionDigits: 2 })} (${totalCost > 0 ? Math.round((costBreakdown.labor / totalCost) * 100) : 0}%), ` +
                `Parts: $${costBreakdown.parts.toLocaleString(undefined, { minimumFractionDigits: 2 })} (${totalCost > 0 ? Math.round((costBreakdown.parts / totalCost) * 100) : 0}%).`
              }
              keyFindings={[
                `Total: $${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
                `Line items: ${extractedData.itemizedCosts?.length || 0}`,
                `Labor: ${totalCost > 0 ? Math.round((costBreakdown.labor / totalCost) * 100) : 0}% (standard: 30-40%)`,
                `Parts: ${totalCost > 0 ? Math.round((costBreakdown.parts / totalCost) * 100) : 0}% (standard: 35-50%)`,
                `Per component: $${damagedComponents.length > 0 ? Math.round(totalCost / damagedComponents.length).toLocaleString() : 'N/A'}`
              ]}
              recommendations={[
                'Compare against panel beater quotes once claim is created',
                'Validate parts pricing against OEM and aftermarket suppliers',
                'Request itemized breakdown from assessor if not provided',
                'Document cost analysis in claim file for audit purposes'
              ]}
            />
            
            <CostBreakdownChart breakdown={costBreakdown} itemizedCosts={extractedData.itemizedCosts} isEstimated={isEstimatedBreakdown} />
          </TabsContent>

          {/* ═══ QUOTES TAB ═══ */}
          <TabsContent value="quotes" className="space-y-6">
            {hasQuotes ? (
              <QuoteComparisonChart quotes={extractedData.quotes!} />
            ) : (
              <Card className="p-8 text-center">
                <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground font-medium">No multiple quotes available</p>
                <p className="text-sm text-muted-foreground/70 mt-1">Only a single cost figure was extracted from this assessment. Upload multiple assessments or create a claim to collect panel beater quotes for comparison.</p>
              </Card>
            )}

            {/* Component-level AI estimate */}
            {hasRecommendations && (
              <ComponentRecommendations recommendations={extractedData.componentRecommendations!} />
            )}

            {/* Itemized Costs Table */}
            {extractedData.itemizedCosts && extractedData.itemizedCosts.length > 0 && (
              <Card className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg"><DollarSign className="w-5 h-5 text-green-600" /></div>
                  <h2 className="text-xl font-semibold">Itemized Cost Breakdown</h2>
                  <Badge variant="secondary">{extractedData.itemizedCosts.length} items</Badge>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-border">
                        <th className="text-left py-2 px-3 font-semibold text-muted-foreground">Description</th>
                        <th className="text-left py-2 px-3 font-semibold text-muted-foreground">Category</th>
                        <th className="text-right py-2 px-3 font-semibold text-muted-foreground">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {extractedData.itemizedCosts.map((item, i) => (
                        <tr key={i} className="border-b border-gray-100 hover:bg-gray-50 dark:bg-muted/50">
                          <td className="py-2 px-3 text-gray-900 dark:text-foreground">{item.description}</td>
                          <td className="py-2 px-3"><Badge variant="outline" className="text-xs capitalize">{item.category || 'other'}</Badge></td>
                          <td className="py-2 px-3 text-right font-medium text-gray-900 dark:text-foreground">${item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-300 dark:border-border">
                        <td colSpan={2} className="py-3 px-3 font-bold text-gray-900 dark:text-foreground">Total</td>
                        <td className="py-3 px-3 text-right font-bold text-green-600 text-lg">
                          ${extractedData.itemizedCosts.reduce((s, i) => s + i.amount, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Action Buttons */}
        <div className="flex gap-4 justify-center mt-8">
          <Button
            onClick={handleCreateClaim}
            size="lg"
            disabled={isCreatingClaim}
            className="bg-gradient-to-r from-accent to-primary hover:from-accent/90 hover:to-primary/90"
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
