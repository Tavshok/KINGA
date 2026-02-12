/**
 * KINGA Report Visualization Generation Service
 * 
 * Generates chart and gauge visualizations for insurance reports
 * using Chart.js data structures that can be embedded in PDFs
 */

import type { ClaimIntelligence } from "./report-intelligence-aggregator";

export interface ConfidenceGaugeData {
  type: "gauge";
  value: number;
  label: string;
  thresholds: {
    low: number;
    medium: number;
    high: number;
  };
  colors: {
    low: string;
    medium: string;
    high: string;
  };
}

export interface CostComparisonChartData {
  type: "bar";
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor: string;
  }>;
}

export interface FraudRiskHeatScaleData {
  type: "heatscale";
  value: number;
  label: string;
  scale: Array<{
    min: number;
    max: number;
    label: string;
    color: string;
  }>;
}

export interface WorkflowTimelineData {
  type: "timeline";
  events: Array<{
    id: string;
    timestamp: Date;
    status: string;
    actor: string;
    notes: string | null;
  }>;
}

export interface ReportVisualizations {
  confidenceGauge: ConfidenceGaugeData;
  costComparisonChart: CostComparisonChartData;
  fraudRiskHeatScale: FraudRiskHeatScaleData;
  workflowTimeline: WorkflowTimelineData;
  damageSeverityLegend: {
    type: "legend";
    items: Array<{
      label: string;
      color: string;
      description: string;
    }>;
  };
}

/**
 * Generate all visualizations for a claim report
 */
export function generateReportVisualizations(
  intelligence: ClaimIntelligence
): ReportVisualizations {
  return {
    confidenceGauge: generateConfidenceGauge(intelligence),
    costComparisonChart: generateCostComparisonChart(intelligence),
    fraudRiskHeatScale: generateFraudRiskHeatScale(intelligence),
    workflowTimeline: generateWorkflowTimeline(intelligence),
    damageSeverityLegend: generateDamageSeverityLegend(intelligence),
  };
}

/**
 * Generate confidence gauge visualization
 */
function generateConfidenceGauge(
  intelligence: ClaimIntelligence
): ConfidenceGaugeData {
  const confidenceScore = intelligence.aiAssessment?.confidenceScore || 0;

  return {
    type: "gauge",
    value: confidenceScore,
    label: "AI Assessment Confidence",
    thresholds: {
      low: 60,
      medium: 80,
      high: 100,
    },
    colors: {
      low: "#ef4444", // red
      medium: "#f59e0b", // amber
      high: "#10b981", // green
    },
  };
}

/**
 * Generate cost comparison chart
 */
function generateCostComparisonChart(
  intelligence: ClaimIntelligence
): CostComparisonChartData {
  const labels: string[] = [];
  const aiData: number[] = [];
  const assessorData: number[] = [];
  const quotesData: number[] = [];

  // AI estimate
  if (intelligence.aiAssessment) {
    labels.push("AI Estimate");
    aiData.push(intelligence.aiAssessment.estimatedRepairCost || 0);
    assessorData.push(0);
    quotesData.push(0);
  }

  // Assessor estimate
  if (intelligence.assessorEvaluation) {
    labels.push("Assessor Estimate");
    aiData.push(0);
    assessorData.push(intelligence.assessorEvaluation.estimatedRepairCost || 0);
    quotesData.push(0);
  }

  // Panel beater quotes
  intelligence.panelBeaterQuotes.forEach((quote: any, index: number) => {
    labels.push(`Quote ${index + 1}`);
    aiData.push(0);
    assessorData.push(0);
    quotesData.push(quote.totalCost || 0);
  });

  return {
    type: "bar",
    labels,
    datasets: [
      {
        label: "AI Estimate",
        data: aiData,
        backgroundColor: "#3b82f6", // blue
      },
      {
        label: "Assessor Estimate",
        data: assessorData,
        backgroundColor: "#8b5cf6", // purple
      },
      {
        label: "Panel Beater Quotes",
        data: quotesData,
        backgroundColor: "#10b981", // green
      },
    ],
  };
}

/**
 * Generate fraud risk heat scale
 */
function generateFraudRiskHeatScale(
  intelligence: ClaimIntelligence
): FraudRiskHeatScaleData {
  const fraudRiskScore = intelligence.claim.fraudRiskScore || 0;

  return {
    type: "heatscale",
    value: fraudRiskScore,
    label: "Fraud Risk Score",
    scale: [
      {
        min: 0,
        max: 30,
        label: "Low Risk",
        color: "#10b981", // green
      },
      {
        min: 30,
        max: 60,
        label: "Medium Risk",
        color: "#f59e0b", // amber
      },
      {
        min: 60,
        max: 100,
        label: "High Risk",
        color: "#ef4444", // red
      },
    ],
  };
}

/**
 * Generate workflow timeline
 */
function generateWorkflowTimeline(
  intelligence: ClaimIntelligence
): WorkflowTimelineData {
  const events: WorkflowTimelineData["events"] = [];

  // Claim submitted
  events.push({
    id: "1",
    timestamp: intelligence.claim.createdAt,
    status: "Submitted",
    actor: "Claimant",
    notes: "Claim submitted",
  });

  // AI assessment
  if (intelligence.aiAssessment) {
    events.push({
      id: "2",
      timestamp: intelligence.aiAssessment.createdAt,
      status: "AI Assessed",
      actor: "AI System",
      notes: "AI assessment completed",
    });
  }

  // Assessor evaluation
  if (intelligence.assessorEvaluation) {
    events.push({
      id: "3",
      timestamp: intelligence.assessorEvaluation.createdAt,
      status: "Assessor Evaluated",
      actor: "Professional Assessor",
      notes: "Assessor evaluation completed",
    });
  }

  // Quotes received
  if (intelligence.panelBeaterQuotes && intelligence.panelBeaterQuotes.length > 0) {
    events.push({
      id: "4",
      timestamp: intelligence.panelBeaterQuotes[0].createdAt,
      status: "Quotes Received",
      actor: "Panel Beaters",
      notes: `${intelligence.panelBeaterQuotes.length} quote(s) received`,
    });
  }

  return {
    type: "timeline",
    events,
  };
}

/**
 * Generate damage severity legend
 */
function generateDamageSeverityLegend(intelligence: ClaimIntelligence) {
  return {
    type: "legend" as const,
    items: [
      {
        label: "Minor",
        color: "#10b981", // green
        description: "Cosmetic damage, no structural impact",
      },
      {
        label: "Moderate",
        color: "#f59e0b", // amber
        description: "Functional damage, repairable",
      },
      {
        label: "Severe",
        color: "#ef4444", // red
        description: "Structural damage, may require replacement",
      },
      {
        label: "Total Loss",
        color: "#7f1d1d", // dark red
        description: "Repair cost exceeds vehicle value",
      },
    ],
  };
}

/**
 * Generate Chart.js configuration for embedding in HTML/PDF
 */
export function generateChartJSConfig(
  chartData: CostComparisonChartData
): string {
  return `
{
  type: 'bar',
  data: ${JSON.stringify(chartData)},
  options: {
    responsive: true,
    plugins: {
      title: {
        display: true,
        text: 'Cost Comparison Analysis'
      },
      legend: {
        display: true,
        position: 'top'
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Cost ($)'
        }
      }
    }
  }
}
  `.trim();
}

/**
 * Generate SVG gauge visualization
 */
export function generateGaugeSVG(gaugeData: ConfidenceGaugeData): string {
  const { value, label, thresholds, colors } = gaugeData;
  
  // Determine color based on value
  let color = colors.low;
  if (value >= thresholds.high) {
    color = colors.high;
  } else if (value >= thresholds.medium) {
    color = colors.medium;
  }

  // Calculate arc path
  const radius = 80;
  const centerX = 100;
  const centerY = 100;
  const startAngle = -135;
  const endAngle = startAngle + (value / 100) * 270;

  const startRad = (startAngle * Math.PI) / 180;
  const endRad = (endAngle * Math.PI) / 180;

  const x1 = centerX + radius * Math.cos(startRad);
  const y1 = centerY + radius * Math.sin(startRad);
  const x2 = centerX + radius * Math.cos(endRad);
  const y2 = centerY + radius * Math.sin(endRad);

  const largeArcFlag = value > 50 ? 1 : 0;

  return `
<svg width="200" height="150" xmlns="http://www.w3.org/2000/svg">
  <!-- Background arc -->
  <path d="M ${x1} ${y1} A ${radius} ${radius} 0 1 1 ${centerX + radius * Math.cos((45 * Math.PI) / 180)} ${centerY + radius * Math.sin((45 * Math.PI) / 180)}"
        stroke="#e5e7eb" stroke-width="12" fill="none" stroke-linecap="round"/>
  
  <!-- Value arc -->
  <path d="M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}"
        stroke="${color}" stroke-width="12" fill="none" stroke-linecap="round"/>
  
  <!-- Center text -->
  <text x="${centerX}" y="${centerY}" text-anchor="middle" font-size="32" font-weight="bold" fill="${color}">
    ${value}%
  </text>
  <text x="${centerX}" y="${centerY + 25}" text-anchor="middle" font-size="12" fill="#6b7280">
    ${label}
  </text>
</svg>
  `.trim();
}

/**
 * Generate SVG heat scale visualization
 */
export function generateHeatScaleSVG(heatScaleData: FraudRiskHeatScaleData): string {
  const { value, label, scale } = heatScaleData;
  
  const width = 300;
  const height = 60;
  const scaleWidth = width / scale.length;

  let currentColor = scale[0].color;
  for (const segment of scale) {
    if (value >= segment.min && value < segment.max) {
      currentColor = segment.color;
      break;
    }
  }

  const markerX = (value / 100) * width;

  return `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <!-- Scale segments -->
  ${scale.map((segment, index) => `
    <rect x="${index * scaleWidth}" y="20" width="${scaleWidth}" height="20" fill="${segment.color}"/>
    <text x="${index * scaleWidth + scaleWidth / 2}" y="55" text-anchor="middle" font-size="10" fill="#6b7280">
      ${segment.label}
    </text>
  `).join('')}
  
  <!-- Marker -->
  <polygon points="${markerX},15 ${markerX - 5},5 ${markerX + 5},5" fill="#1f2937"/>
  <text x="${markerX}" y="3" text-anchor="middle" font-size="12" font-weight="bold" fill="#1f2937">
    ${value}
  </text>
  
  <!-- Label -->
  <text x="${width / 2}" y="12" text-anchor="middle" font-size="11" fill="#374151">
    ${label}
  </text>
</svg>
  `.trim();
}
