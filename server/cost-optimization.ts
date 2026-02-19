// @ts-nocheck
/**
 * Cost Optimization Engine
 * 
 * Provides intelligent quote comparison, variance analysis, and negotiation strategies
 * for insurance claim cost optimization.
 * 
 * Key Features:
 * - Component-level variance detection
 * - Risk-adjusted quote scoring
 * - Negotiation strategy generation
 * - Fraud pattern detection through cost analysis
 */

export interface QuoteComponent {
  componentName: string;
  action: 'repair' | 'replace';
  partsCost: number; // in cents
  laborCost: number; // in cents
  laborHours: number;
  partsQuality?: 'aftermarket' | 'oem' | 'genuine' | 'used';
  warranty?: number; // months
  notes?: string;
}

export interface QuoteAnalysis {
  quoteId: number;
  panelBeaterId: number;
  panelBeaterName: string;
  totalCost: number;
  components: QuoteComponent[];
  partsQuality: string;
  warrantyMonths: number;
  estimatedDuration: number;
}

export interface ComponentComparison {
  componentName: string;
  quotes: Array<{
    quoteId: number;
    panelBeaterName: string;
    action: 'repair' | 'replace';
    cost: number;
    laborHours: number;
    partsQuality?: string;
  }>;
  median: number;
  lowest: number;
  highest: number;
  variance: number; // percentage
  flagged: boolean; // true if variance exceeds threshold
  recommendation: string;
}

export interface OptimizationResult {
  claimId: number;
  quotes: QuoteAnalysis[];
  componentComparisons: ComponentComparison[];
  
  // Overall analysis
  lowestQuote: QuoteAnalysis;
  highestQuote: QuoteAnalysis;
  medianCost: number;
  averageCost: number;
  costSpread: number; // highest - lowest
  spreadPercentage: number;
  
  // Optimization recommendations
  recommendedQuote: QuoteAnalysis;
  potentialSavings: number;
  savingsPercentage: number;
  riskLevel: 'low' | 'medium' | 'high';
  
  // Negotiation strategy
  negotiationTargets: Array<{
    quoteId: number;
    panelBeaterName: string;
    components: string[];
    targetReduction: number;
    talkingPoints: string[];
  }>;
  
  // Fraud indicators
  fraudFlags: string[];
  suspiciousPatterns: string[];
}

/**
 * Variance thresholds for different component types
 */
const VARIANCE_THRESHOLDS = {
  parts: {
    green: 25, // 0-25% variance is acceptable
    yellow: 40, // 25-40% needs review
    red: 40, // >40% is flagged
  },
  labor: {
    green: 35,
    yellow: 50,
    red: 50,
  },
  total: {
    green: 30,
    yellow: 45,
    red: 45,
  },
};

/**
 * Calculate median value from an array of numbers
 */
function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Calculate variance percentage from median
 */
function calculateVariance(value: number, median: number): number {
  if (median === 0) return 0;
  return Math.abs(((value - median) / median) * 100);
}

/**
 * Parse component breakdown from JSON string
 */
function parseComponents(componentsJson: string | null): QuoteComponent[] {
  if (!componentsJson) return [];
  try {
    return JSON.parse(componentsJson);
  } catch {
    return [];
  }
}

/**
 * Compare quotes component-by-component
 */
export function compareComponents(quotes: QuoteAnalysis[]): ComponentComparison[] {
  // Collect all unique component names
  const componentNames = new Set<string>();
  quotes.forEach(quote => {
    quote.components.forEach(comp => componentNames.add(comp.componentName));
  });

  const comparisons: ComponentComparison[] = [];

  for (const componentName of Array.from(componentNames)) {
    const componentQuotes = quotes
      .map(quote => {
        const comp = quote.components.find(c => c.componentName === componentName);
        if (!comp) return null;
        return {
          quoteId: quote.quoteId,
          panelBeaterName: quote.panelBeaterName,
          action: comp.action,
          cost: comp.partsCost + comp.laborCost,
          laborHours: comp.laborHours,
          partsQuality: comp.partsQuality,
        };
      })
      .filter((q): q is NonNullable<typeof q> => q !== null);

    if (componentQuotes.length === 0) continue;

    const costs = componentQuotes.map(q => q.cost);
    const median = calculateMedian(costs);
    const lowest = Math.min(...costs);
    const highest = Math.max(...costs);
    const variance = calculateVariance(highest, median);

    // Determine if component is flagged based on variance
    const flagged = variance > VARIANCE_THRESHOLDS.parts.red;

    // Generate recommendation
    let recommendation = '';
    if (componentQuotes.length < quotes.length) {
      recommendation = `⚠️ Only ${componentQuotes.length} of ${quotes.length} quotes include this component. Assessor should verify if this is necessary.`;
    } else if (flagged) {
      recommendation = `🚩 High variance (${variance.toFixed(1)}%). Investigate pricing discrepancy.`;
    } else if (variance > VARIANCE_THRESHOLDS.parts.yellow) {
      recommendation = `⚠️ Moderate variance (${variance.toFixed(1)}%). Consider negotiating with higher quotes.`;
    } else {
      recommendation = `✅ Acceptable variance (${variance.toFixed(1)}%). Prices are consistent.`;
    }

    comparisons.push({
      componentName,
      quotes: componentQuotes,
      median,
      lowest,
      highest,
      variance,
      flagged,
      recommendation,
    });
  }

  return comparisons.sort((a, b) => b.variance - a.variance); // Sort by variance descending
}

/**
 * Generate negotiation strategy for a specific quote
 */
function generateNegotiationStrategy(
  quote: QuoteAnalysis,
  componentComparisons: ComponentComparison[],
  medianCost: number
): {
  components: string[];
  targetReduction: number;
  talkingPoints: string[];
} | null {
  const overpricedComponents = componentComparisons.filter(comp => {
    const quoteComp = comp.quotes.find(q => q.quoteId === quote.quoteId);
    if (!quoteComp) return false;
    return quoteComp.cost > comp.median * 1.15; // More than 15% above median
  });

  if (overpricedComponents.length === 0) return null;

  const targetReduction = overpricedComponents.reduce((sum, comp) => {
    const quoteComp = comp.quotes.find(q => q.quoteId === quote.quoteId)!;
    return sum + (quoteComp.cost - comp.median);
  }, 0);

  const talkingPoints: string[] = [];

  overpricedComponents.forEach(comp => {
    const quoteComp = comp.quotes.find(q => q.quoteId === quote.quoteId)!;
    const variance = calculateVariance(quoteComp.cost, comp.median);
    
    if (quoteComp.action === 'replace' && comp.quotes.some(q => q.action === 'repair')) {
      talkingPoints.push(
        `${comp.componentName}: You quoted replacement ($${(quoteComp.cost / 100).toFixed(2)}), but other shops can repair for $${(comp.lowest / 100).toFixed(2)}. Can you repair instead?`
      );
    } else {
      talkingPoints.push(
        `${comp.componentName}: Your quote ($${(quoteComp.cost / 100).toFixed(2)}) is ${variance.toFixed(1)}% above market median ($${(comp.median / 100).toFixed(2)}). Can you match the market rate?`
      );
    }
  });

  return {
    components: overpricedComponents.map(c => c.componentName),
    targetReduction,
    talkingPoints,
  };
}

/**
 * Detect fraud patterns in quotes
 */
function detectFraudPatterns(
  quotes: QuoteAnalysis[],
  componentComparisons: ComponentComparison[]
): { flags: string[]; patterns: string[] } {
  const flags: string[] = [];
  const patterns: string[] = [];

  // Check for copy quotations (suspiciously similar quotes)
  for (let i = 0; i < quotes.length; i++) {
    for (let j = i + 1; j < quotes.length; j++) {
      const diff = Math.abs(quotes[i].totalCost - quotes[j].totalCost);
      const avgCost = (quotes[i].totalCost + quotes[j].totalCost) / 2;
      const similarity = 1 - diff / avgCost;

      if (similarity > 0.98) {
        // Quotes are 98%+ identical
        flags.push(`Identical quotes detected: ${quotes[i].panelBeaterName} and ${quotes[j].panelBeaterName}`);
        patterns.push('copy_quotation');
      }
    }
  }

  // Check for missing components (incomplete quotes)
  const maxComponents = Math.max(...quotes.map(q => q.components.length));
  quotes.forEach(quote => {
    if (quote.components.length < maxComponents * 0.7) {
      // Missing 30%+ of components
      flags.push(`${quote.panelBeaterName}: Incomplete quote (${quote.components.length} components vs ${maxComponents} expected)`);
      patterns.push('incomplete_quote');
    }
  });

  // Check for excessive replacement vs repair
  quotes.forEach(quote => {
    const replaceCount = quote.components.filter(c => c.action === 'replace').length;
    const repairCount = quote.components.filter(c => c.action === 'repair').length;
    const replaceRatio = replaceCount / (replaceCount + repairCount);

    if (replaceRatio > 0.7) {
      // More than 70% replacement
      flags.push(`${quote.panelBeaterName}: Excessive replacement ratio (${(replaceRatio * 100).toFixed(0)}%)`);
      patterns.push('excessive_replacement');
    }
  });

  // Check for inflated labor hours
  componentComparisons.forEach(comp => {
    const laborHours = comp.quotes.map(q => q.laborHours);
    const medianHours = calculateMedian(laborHours);
    
    comp.quotes.forEach(q => {
      const variance = calculateVariance(q.laborHours, medianHours);
      if (variance > 50) {
        flags.push(`${q.panelBeaterName} - ${comp.componentName}: Labor hours ${variance.toFixed(0)}% above median`);
        patterns.push('inflated_labor');
      }
    });
  });

  return { flags, patterns };
}

/**
 * Main optimization function - analyzes all quotes and generates recommendations
 */
export function optimizeQuotes(quotes: QuoteAnalysis[]): OptimizationResult {
  if (quotes.length === 0) {
    throw new Error('No quotes provided for optimization');
  }

  const claimId = quotes[0].quoteId; // Assuming all quotes are for the same claim

  // Calculate overall statistics
  const costs = quotes.map(q => q.totalCost);
  const medianCost = calculateMedian(costs);
  const averageCost = costs.reduce((sum, cost) => sum + cost, 0) / costs.length;
  const lowestQuote = quotes.reduce((min, q) => q.totalCost < min.totalCost ? q : min);
  const highestQuote = quotes.reduce((max, q) => q.totalCost > max.totalCost ? q : max);
  const costSpread = highestQuote.totalCost - lowestQuote.totalCost;
  const spreadPercentage = (costSpread / medianCost) * 100;

  // Component-level comparison
  const componentComparisons = compareComponents(quotes);

  // Detect fraud patterns
  const { flags: fraudFlags, patterns: suspiciousPatterns } = detectFraudPatterns(quotes, componentComparisons);

  // Determine recommended quote (lowest cost with acceptable quality)
  // For now, simply recommend the lowest quote
  // In future, factor in shop reliability, parts quality, warranty
  const recommendedQuote = lowestQuote;
  const potentialSavings = highestQuote.totalCost - lowestQuote.totalCost;
  const savingsPercentage = (potentialSavings / highestQuote.totalCost) * 100;

  // Determine risk level
  let riskLevel: 'low' | 'medium' | 'high' = 'low';
  if (spreadPercentage > 45 || fraudFlags.length > 2) {
    riskLevel = 'high';
  } else if (spreadPercentage > 30 || fraudFlags.length > 0) {
    riskLevel = 'medium';
  }

  // Generate negotiation strategies
  const negotiationTargets = quotes
    .filter(q => q.quoteId !== lowestQuote.quoteId) // Don't negotiate with lowest quote
    .map(quote => {
      const strategy = generateNegotiationStrategy(quote, componentComparisons, medianCost);
      if (!strategy) return null;
      return {
        quoteId: quote.quoteId,
        panelBeaterName: quote.panelBeaterName,
        ...strategy,
      };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);

  return {
    claimId,
    quotes,
    componentComparisons,
    lowestQuote,
    highestQuote,
    medianCost,
    averageCost,
    costSpread,
    spreadPercentage,
    recommendedQuote,
    potentialSavings,
    savingsPercentage,
    riskLevel,
    negotiationTargets,
    fraudFlags,
    suspiciousPatterns,
  };
}

/**
 * Calculate assessor performance score based on variance from final approved cost
 */
export function calculateAssessorPerformanceScore(
  assessorEstimate: number,
  finalApprovedCost: number
): {
  score: number; // 0-100
  variance: number; // percentage
  rating: 'excellent' | 'good' | 'fair' | 'poor';
} {
  const variance = calculateVariance(assessorEstimate, finalApprovedCost);
  
  // Score calculation: 100 - (variance * 2)
  // 0% variance = 100 score
  // 10% variance = 80 score
  // 25% variance = 50 score
  // 50% variance = 0 score
  let score = Math.max(0, Math.min(100, 100 - variance * 2));

  let rating: 'excellent' | 'good' | 'fair' | 'poor';
  if (score >= 85) rating = 'excellent';
  else if (score >= 70) rating = 'good';
  else if (score >= 50) rating = 'fair';
  else rating = 'poor';

  return { score, variance, rating };
}
