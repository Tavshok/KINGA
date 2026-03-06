// Dynamic imports - jspdf (707KB) only loaded when user clicks export
type JsPDFType = import('jspdf').jsPDF;

async function loadPdfLibs() {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  return { jsPDF, autoTable };
}

interface ClaimData {
  claimNumber: string;
  vehicle: string;
  registration: string;
  incidentDate: string;
  policeReport?: {
    reportNumber: string;
    policeStation: string;
    officerName: string;
    reportDate: string;
    reportedSpeed: string;
    weather: string;
    description: string;
    speedDiscrepancy?: number;
  };
  vehicleValuation?: {
    estimatedValue: number;
    finalValue: number;
    minPrice: number;
    medianPrice: number;
    maxPrice: number;
    mileageAdjustment?: number;
    valuationMethod: string;
    confidenceScore: number;
    totalLossRatio?: number;
    aiReasoning?: string;
  };
  assessorEvaluation?: {
    estimatedCost: number;
    laborCost: number;
    partsCost: number;
    estimatedDuration: number;
    fraudRisk: string;
    notes?: string;
  };
  quotes: Array<{
    panelBeaterName: string;
    totalCost: number;
    laborCost: number;
    partsCost: number;
    estimatedDuration: number;
    notes?: string;
    lineItems?: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
    }>;
  }>;
  quoteComparison?: {
    discrepancyCount: number;
    averageQuote: number;
    missingItems: Array<{
      description: string;
      presentIn: string[];
      missingIn: string[];
    }>;
  };
  /** Accident circumstances from the claim record */
  accidentCircumstances?: {
    incidentDescription?: string;
    incidentLocation?: string;
    incidentType?: string;
    accidentType?: string;
  };
  /** AI Intelligence Summary — derived from existing claim quotes and AI assessment record */
  aiIntelligence?: {
    /** Damaged component names parsed from damagedComponentsJson */
    detectedComponents: string[];
    /** Lowest quoted amount in cents */
    lowestQuote: number;
    /** Median quoted amount in cents */
    medianQuote: number;
    /** Highest quoted amount in cents */
    highestQuote: number;
    /** Percentage spread between lowest and highest: ((max-min)/max)*100 */
    spreadPercent: number;
    /** Name of the recommended repairer, if available */
    recommendedRepairer?: string;
    /** Reason for the recommendation, if available */
    recommendationReason?: string;
    /** Fraud risk level: low | medium | high */
    fraudRisk: string;
    /** Repair complexity: low | medium | high */
    repairComplexity: string;
    /** AI confidence score 0-100 */
    confidenceScore: number;
  };
  /**
   * Physics analysis — accepts both normalised DB format ({consistencyScore, _raw: {...}}) and
   * legacy flat format ({impactForce, estimatedSpeed, impactAngle, ...}).
   */
  physicsAnalysis?: Record<string, unknown>;
  /**
   * Forensic analysis — accepts both DB format ({paint, bodywork, tires, fluidLeaks, glass}) and
   * legacy format ({paintAnalysis, bodyworkAnalysis, ...}).
   */
  forensicAnalysis?: Record<string, unknown>;
  /** Damage photo URLs for inclusion in the report */
  damagePhotos?: string[];
}

/**
 * Generate PDF report for claim comparison
 */
export async function generateComparisonPDF(data: ClaimData, currencySymbol: string = 'US$'): Promise<void> {
  const { jsPDF, autoTable } = await loadPdfLibs();
  const doc = new jsPDF();
  let yPos = 20;

  // Add logo to header
  const logoImg = new Image();
  logoImg.src = 'https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/XlSqWNhiGxKiigDt.png';
  doc.addImage(logoImg, 'PNG', 20, yPos - 5, 15, 15);
  
  // Header text next to logo
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text('Insurance Claims Analysis', 65, yPos + 5);
  
  yPos += 15;

  // Title
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.text('Fraud Detection & Comparison Report', 20, yPos);
  yPos += 10;

  // Claim Summary
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Claim Summary', 20, yPos);
  yPos += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Claim Number: ${data.claimNumber}`, 20, yPos);
  yPos += 5;
  doc.text(`Vehicle: ${data.vehicle}`, 20, yPos);
  yPos += 5;
  doc.text(`Registration: ${data.registration}`, 20, yPos);
  yPos += 5;
  doc.text(`Incident Date: ${data.incidentDate}`, 20, yPos);
  yPos += 10;

  // ─── Accident Circumstances Section ──────────────────────────────────────────
  const ac = data.accidentCircumstances;
  if (ac && (ac.incidentDescription || ac.incidentLocation || ac.incidentType || ac.accidentType)) {
    if (yPos > 230) { doc.addPage(); yPos = 20; }

    doc.setFillColor(22, 101, 52); // green-800
    doc.rect(20, yPos - 1, 170, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Accident Circumstances', 23, yPos + 5);
    doc.setTextColor(0, 0, 0);
    yPos += 13;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    if (ac.incidentType || ac.accidentType) {
      const typeLabel = (ac.incidentType || ac.accidentType || '').replace(/_/g, ' ').toUpperCase();
      doc.setFont('helvetica', 'bold');
      doc.text(`Incident Type: `, 26, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(typeLabel, 26 + doc.getTextWidth('Incident Type: '), yPos);
      yPos += 5;
    }

    if (ac.incidentLocation) {
      doc.setFont('helvetica', 'bold');
      doc.text(`Location: `, 26, yPos);
      doc.setFont('helvetica', 'normal');
      const locLines = doc.splitTextToSize(ac.incidentLocation, 145);
      doc.text(locLines, 26 + doc.getTextWidth('Location: '), yPos);
      yPos += locLines.length * 4 + 2;
    }

    if (ac.incidentDescription) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('Description:', 26, yPos);
      yPos += 5;
      doc.setFont('helvetica', 'normal');
      const descLines = doc.splitTextToSize(ac.incidentDescription, 158);
      doc.text(descLines, 26, yPos);
      yPos += descLines.length * 4 + 3;
    }

    doc.setDrawColor(200, 200, 200);
    doc.line(20, yPos, 190, yPos);
    yPos += 8;
  }

  // ─── Damage Photos Section ──────────────────────────────────────────────────
  if (data.damagePhotos && data.damagePhotos.length > 0) {
    if (yPos > 200) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFillColor(37, 99, 235); // blue-600
    doc.rect(20, yPos - 1, 170, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`Damage Photos (${data.damagePhotos.length})`, 23, yPos + 5);
    doc.setTextColor(0, 0, 0);
    yPos += 13;

    // Render up to 6 photo thumbnails in a 3x2 grid
    const maxPhotos = Math.min(data.damagePhotos.length, 6);
    const thumbW = 50;
    const thumbH = 38;
    const gap = 5;
    const cols = 3;

    for (let i = 0; i < maxPhotos; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = 20 + col * (thumbW + gap);
      const y = yPos + row * (thumbH + gap);

      try {
        doc.addImage(data.damagePhotos[i], 'JPEG', x, y, thumbW, thumbH);
      } catch {
        // If image fails to load, draw a placeholder
        doc.setDrawColor(200, 200, 200);
        doc.rect(x, y, thumbW, thumbH);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Photo ${i + 1}`, x + 15, y + 20);
        doc.setTextColor(0, 0, 0);
      }
    }

    const totalRows = Math.ceil(maxPhotos / cols);
    yPos += totalRows * (thumbH + gap) + 5;

    if (data.damagePhotos.length > 6) {
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(`+ ${data.damagePhotos.length - 6} additional photos not shown`, 20, yPos);
      doc.setTextColor(0, 0, 0);
      yPos += 8;
    }
  }

  // ─── AI Damage Intelligence Section ──────────────────────────────────────────
  if (data.aiIntelligence) {
    // Check if we need a new page
    if (yPos > 240) {
      doc.addPage();
      yPos = 20;
    }

    const ai = data.aiIntelligence;

    // Section heading with teal background bar
    doc.setFillColor(15, 118, 110); // teal-700
    doc.rect(20, yPos - 1, 170, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('AI Damage Intelligence', 23, yPos + 5);
    doc.setTextColor(0, 0, 0);
    yPos += 13;

    // ── 1. Detected Components ────────────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Detected Components:', 20, yPos);
    yPos += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    if (ai.detectedComponents.length > 0) {
      ai.detectedComponents.slice(0, 6).forEach((comp) => {
        doc.text(`\u2022  ${comp}`, 26, yPos);
        yPos += 4;
      });
      if (ai.detectedComponents.length > 6) {
        doc.setTextColor(100, 100, 100);
        doc.text(`  ... and ${ai.detectedComponents.length - 6} more`, 26, yPos);
        doc.setTextColor(0, 0, 0);
        yPos += 4;
      }
    } else {
      doc.setTextColor(120, 120, 120);
      doc.text('No component data available', 26, yPos);
      doc.setTextColor(0, 0, 0);
      yPos += 4;
    }
    yPos += 3;

    // ── 2. Repair Cost Intelligence ───────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Repair Cost Intelligence:', 20, yPos);
    yPos += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Lowest Quote:   ${currencySymbol}${ai.lowestQuote.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 26, yPos);
    yPos += 4;
    doc.text(`Median Quote:   ${currencySymbol}${ai.medianQuote.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 26, yPos);
    yPos += 4;
    doc.text(`Highest Quote:  ${currencySymbol}${ai.highestQuote.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 26, yPos);
    yPos += 4;
    doc.text(`Quote Spread:   ${ai.spreadPercent}%`, 26, yPos);
    yPos += 7;

    // ── 3. AI Recommendation ─────────────────────────────────────────────────
    if (ai.recommendedRepairer) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('AI Recommendation:', 20, yPos);
      yPos += 5;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Recommended Repairer: ${ai.recommendedRepairer}`, 26, yPos);
      yPos += 4;
      if (ai.recommendationReason) {
        const reasonLines = doc.splitTextToSize(`Reason: ${ai.recommendationReason}`, 160);
        doc.text(reasonLines, 26, yPos);
        yPos += reasonLines.length * 4;
      }
      yPos += 3;
    }

    // ── 4. Risk Indicators ────────────────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Risk Indicators:', 20, yPos);
    yPos += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    // Fraud risk — colour-coded
    const fraudRiskUpper = ai.fraudRisk.toUpperCase();
    if (fraudRiskUpper === 'HIGH') {
      doc.setTextColor(185, 28, 28); // red-700
    } else if (fraudRiskUpper === 'MEDIUM') {
      doc.setTextColor(180, 83, 9); // amber-700
    } else {
      doc.setTextColor(4, 120, 87); // emerald-700
    }
    doc.text(`Fraud Risk:          ${fraudRiskUpper}`, 26, yPos);
    doc.setTextColor(0, 0, 0);
    yPos += 4;

    doc.text(`Repair Complexity:   ${ai.repairComplexity.toUpperCase()}`, 26, yPos);
    yPos += 7;

    // ── 5. Confidence Score ───────────────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`AI Confidence Score: ${ai.confidenceScore}%`, 20, yPos);
    yPos += 10;

    // Thin divider line
    doc.setDrawColor(200, 200, 200);
    doc.line(20, yPos - 4, 190, yPos - 4);
  }

  // Police Report Section
  if (data.policeReport) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Police Report', 20, yPos);
    yPos += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Report Number: ${data.policeReport.reportNumber}`, 20, yPos);
    yPos += 5;
    doc.text(`Police Station: ${data.policeReport.policeStation}`, 20, yPos);
    yPos += 5;
    doc.text(`Officer: ${data.policeReport.officerName}`, 20, yPos);
    yPos += 5;
    doc.text(`Reported Speed: ${data.policeReport.reportedSpeed}`, 20, yPos);
    yPos += 5;
    doc.text(`Weather: ${data.policeReport.weather}`, 20, yPos);
    yPos += 5;

    if (data.policeReport.speedDiscrepancy && data.policeReport.speedDiscrepancy > 0) {
      doc.setTextColor(255, 165, 0); // Orange for warnings
      doc.setFont('helvetica', 'bold');
      doc.text(`⚠ Speed Discrepancy: ${data.policeReport.speedDiscrepancy} km/h`, 20, yPos);
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      yPos += 5;
    }

    // Wrap accident description
    const descLines = doc.splitTextToSize(data.policeReport.description, 170);
    doc.text('Description:', 20, yPos);
    yPos += 5;
    doc.text(descLines, 20, yPos);
    yPos += descLines.length * 5 + 5;
  }

  // Check if we need a new page
  if (yPos > 250) {
    doc.addPage();
    yPos = 20;
  }

  // Vehicle Valuation Section
  if (data.vehicleValuation) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Vehicle Market Valuation', 20, yPos);
    yPos += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Estimated Market Value: $${data.vehicleValuation.estimatedValue.toLocaleString()}`, 20, yPos);
    yPos += 5;
    doc.text(`Final Adjusted Value: $${data.vehicleValuation.finalValue.toLocaleString()}`, 20, yPos);
    yPos += 5;
    doc.text(`Price Range: $${data.vehicleValuation.minPrice.toLocaleString()} - $${data.vehicleValuation.maxPrice.toLocaleString()}`, 20, yPos);
    yPos += 5;
    doc.text(`Valuation Method: ${data.vehicleValuation.valuationMethod}`, 20, yPos);
    yPos += 5;
    doc.text(`Confidence Score: ${data.vehicleValuation.confidenceScore}%`, 20, yPos);
    yPos += 5;

    if (data.vehicleValuation.totalLossRatio) {
      doc.text(`Total Loss Ratio: ${data.vehicleValuation.totalLossRatio.toFixed(1)}%`, 20, yPos);
      yPos += 5;
    }

    if (data.vehicleValuation.aiReasoning) {
      const reasoningLines = doc.splitTextToSize(data.vehicleValuation.aiReasoning, 170);
      doc.text('AI Reasoning:', 20, yPos);
      yPos += 5;
      doc.setFontSize(9);
      doc.text(reasoningLines, 20, yPos);
      yPos += reasoningLines.length * 4 + 5;
      doc.setFontSize(10);
    }

    yPos += 5;
  }

  // Check if we need a new page
  if (yPos > 250) {
    doc.addPage();
    yPos = 20;
  }

  // Assessor Evaluation Section
  if (data.assessorEvaluation) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Assessor Evaluation', 20, yPos);
    yPos += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Estimated Cost: $${data.assessorEvaluation.estimatedCost.toLocaleString()}`, 20, yPos);
    yPos += 5;
    doc.text(`Duration: ${data.assessorEvaluation.estimatedDuration} days`, 20, yPos);
    yPos += 5;
    doc.text(`Fraud Risk: ${data.assessorEvaluation.fraudRisk.toUpperCase()}`, 20, yPos);
    yPos += 10;
  }

  // Panel Beater Quotes Section
  if (data.quotes && data.quotes.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Panel Beater Quotes', 20, yPos);
    yPos += 7;

    // Create table data
    const tableData = data.quotes.map((quote, index) => [
      `Quote ${index + 1}`,
      quote.panelBeaterName,
      `${currencySymbol}${quote.totalCost.toLocaleString()}`,
      `${quote.estimatedDuration} days`,
      quote.notes || 'N/A'
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [['#', 'Panel Beater', 'Total Cost', 'Duration', 'Notes']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [16, 185, 129] }, // Emerald green
      margin: { left: 20 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;
  }

  // Check if we need a new page
  if (yPos > 250) {
    doc.addPage();
    yPos = 20;
  }

  // ─── Physics Reconstruction Section ──────────────────────────────────────────
  if (data.physicsAnalysis) {
    if (yPos > 220) { doc.addPage(); yPos = 20; }
    const phys = data.physicsAnalysis as any;
    const raw = phys._raw;

    // Resolve values from normalised format (_raw) or legacy flat format
    const impactForceKN = raw?.impactForce?.magnitude != null
      ? (raw.impactForce.magnitude / 1000)
      : (typeof phys.impactForce === 'number' ? phys.impactForce : 0);
    const speedKmh = raw?.estimatedSpeed?.value != null
      ? raw.estimatedSpeed.value
      : (typeof phys.estimatedSpeed === 'number' ? phys.estimatedSpeed : 0);
    const impactAngle = raw?.impactAngle != null
      ? raw.impactAngle
      : (typeof phys.impactAngle === 'number' ? phys.impactAngle : 0);
    const consistencyScore = phys.consistencyScore ?? (raw?.damageConsistency?.score ?? 0);
    const accidentSeverity = raw?.accidentSeverity ?? '';
    const collisionType = raw?.collisionType ?? '';

    // Resolve fraud indicators — normalised array or legacy object
    const fraudIndicatorsList: string[] = [];
    if (Array.isArray(phys.fraudIndicators)) {
      phys.fraudIndicators.forEach((fi: any) => {
        if (fi.component) fraudIndicatorsList.push(`${fi.component} (confidence: ${fi.confidence ?? '?'}%)`);
      });
    } else if (raw?.fraudIndicators) {
      // Fall back to _raw.fraudIndicators (legacy object format)
      const rfi = raw.fraudIndicators;
      (rfi.impossibleDamagePatterns ?? []).forEach((p: string) => fraudIndicatorsList.push(`Impossible pattern: ${p}`));
      (rfi.unrelatedDamage ?? []).forEach((d: string) => fraudIndicatorsList.push(`Unrelated damage: ${d}`));
      (rfi.stagedAccidentIndicators ?? []).forEach((s: string) => fraudIndicatorsList.push(`Staged indicator: ${s}`));
      if (rfi.severityMismatch) fraudIndicatorsList.push('Severity mismatch between reported and physics-estimated damage');
    } else if (phys.fraudIndicators && !Array.isArray(phys.fraudIndicators)) {
      const fi = phys.fraudIndicators as any;
      (fi.impossibleDamagePatterns ?? []).forEach((p: string) => fraudIndicatorsList.push(`Impossible pattern: ${p}`));
      (fi.unrelatedDamage ?? []).forEach((d: any) => {
        const label = typeof d === 'string' ? d : d?.component ?? String(d);
        fraudIndicatorsList.push(`Unrelated damage: ${label}`);
      });
      (fi.stagedAccidentIndicators ?? []).forEach((s: string) => fraudIndicatorsList.push(`Staged indicator: ${s}`));
      if (fi.severityMismatch) fraudIndicatorsList.push('Severity mismatch between reported and physics-estimated damage');
    }

    doc.setFillColor(30, 58, 138); // blue-900
    doc.rect(20, yPos - 1, 170, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Accident Physics Reconstruction', 23, yPos + 5);
    doc.setTextColor(0, 0, 0);
    yPos += 13;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    if (impactForceKN > 0) { doc.text(`Estimated Impact Force: ${impactForceKN.toFixed(1)} kN`, 26, yPos); yPos += 4; }
    if (speedKmh > 0) { doc.text(`Estimated Speed at Impact: ${speedKmh.toFixed(0)} km/h`, 26, yPos); yPos += 4; }
    if (impactAngle > 0) { doc.text(`Impact Angle: ${impactAngle.toFixed(0)}\u00b0`, 26, yPos); yPos += 4; }
    if (consistencyScore > 0) { doc.text(`Physics Consistency Score: ${consistencyScore}/100`, 26, yPos); yPos += 4; }
    if (accidentSeverity) { doc.text(`Accident Severity: ${accidentSeverity.toUpperCase()}`, 26, yPos); yPos += 4; }
    if (collisionType) { doc.text(`Collision Type: ${collisionType.replace(/_/g, ' ').toUpperCase()}`, 26, yPos); yPos += 4; }
    yPos += 2;

    // Damage propagation
    const propagation = raw?.damagePropagation ?? phys.damagePropagation ?? [];
    if (Array.isArray(propagation) && propagation.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Damage Propagation Path:', 20, yPos); yPos += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      propagation.slice(0, 5).forEach((dp: any) => {
        const force = typeof dp.force === 'number' ? dp.force.toFixed(1) : '?';
        const dist = typeof dp.distance === 'number' ? dp.distance.toFixed(2) : '?';
        doc.text(`\u2022  ${dp.component} \u2014 ${force} kN at ${dist}m from impact`, 26, yPos);
        yPos += 4;
      });
      yPos += 3;
    }

    // Physics fraud indicators
    if (fraudIndicatorsList.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(185, 28, 28);
      doc.text('Physics-Based Fraud Indicators:', 20, yPos);
      doc.setTextColor(0, 0, 0);
      yPos += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      fraudIndicatorsList.slice(0, 6).forEach((indicator) => {
        const lines = doc.splitTextToSize(`\u2022  ${indicator}`, 158);
        doc.text(lines, 26, yPos);
        yPos += lines.length * 4;
      });
      yPos += 3;
    }

    doc.setDrawColor(200, 200, 200);
    doc.line(20, yPos, 190, yPos);
    yPos += 5;
  }

  // ─── Forensic Analysis Section ──────────────────────────────────────────
  if (data.forensicAnalysis) {
    if (yPos > 220) { doc.addPage(); yPos = 20; }
    const fa = data.forensicAnalysis as any;

    doc.setFillColor(88, 28, 135); // purple-900
    doc.rect(20, yPos - 1, 170, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Image Forensic Analysis', 23, yPos + 5);
    doc.setTextColor(0, 0, 0);
    yPos += 13;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Overall Forensic Fraud Score: ${fa.overallFraudScore ?? 0}/100`, 26, yPos); yPos += 6;

    // Helper: normalise a forensic section to {score, findings} regardless of DB vs legacy format
    const normaliseSection = (dbSection: any, legacySection: any): { score: number; findings: string[] } | null => {
      if (legacySection) return legacySection;
      if (!dbSection) return null;
      const score = dbSection.fraudRiskScore ?? 0;
      const findings: string[] = [];
      if (Array.isArray(dbSection.paintInconsistencies)) findings.push(...dbSection.paintInconsistencies);
      if (Array.isArray(dbSection.fraudIndicators)) findings.push(...dbSection.fraudIndicators);
      if (Array.isArray(dbSection.findings)) findings.push(...dbSection.findings);
      if (dbSection.hasPreviousRepairs) findings.push('Previous repair work detected');
      if (dbSection.oversprayDetected) findings.push('Overspray detected');
      if (dbSection.dentRepairEvidence) findings.push('Evidence of previous dent repair');
      if (dbSection.panelReplacementEvidence) findings.push('Panel replacement evidence found');
      return { score, findings };
    };

    const analyses = [
      { name: 'Paint Analysis', section: normaliseSection(fa.paint, fa.paintAnalysis) },
      { name: 'Bodywork Analysis', section: normaliseSection(fa.bodywork, fa.bodyworkAnalysis) },
      { name: 'Glass Analysis', section: normaliseSection(fa.glass, fa.glassAnalysis) },
      { name: 'Tire Analysis', section: normaliseSection(fa.tires, fa.tireAnalysis) },
      { name: 'Fluid Leak Analysis', section: normaliseSection(fa.fluidLeaks, fa.fluidAnalysis) },
    ];
    analyses.forEach(({ name, section }) => {
      if (!section) return;
      if (yPos > 260) { doc.addPage(); yPos = 20; }
      doc.setFont('helvetica', 'bold');
      doc.text(`${name} (Score: ${section.score}/100):`, 26, yPos); yPos += 4;
      doc.setFont('helvetica', 'normal');
      if (section.findings.length > 0) {
        section.findings.slice(0, 3).forEach((f) => {
          const lines = doc.splitTextToSize(`\u2022  ${f}`, 155);
          doc.text(lines, 30, yPos);
          yPos += lines.length * 4;
        });
      } else {
        doc.setTextColor(120, 120, 120);
        doc.text('No anomalies detected', 30, yPos); yPos += 4;
        doc.setTextColor(0, 0, 0);
      }
      yPos += 2;
    });

    doc.setDrawColor(200, 200, 200);
    doc.line(20, yPos, 190, yPos);
    yPos += 5;
  }

  // Quote Comparison Analysis
  if (data.quoteComparison && data.quoteComparison.discrepancyCount > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Quote Comparison Analysis', 20, yPos);
    yPos += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Discrepancies Found: ${data.quoteComparison.discrepancyCount}`, 20, yPos);
    yPos += 5;
    doc.text(`Average Quote: $${data.quoteComparison.averageQuote.toLocaleString()}`, 20, yPos);
    yPos += 10;

    if (data.quoteComparison.missingItems && data.quoteComparison.missingItems.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.text('Missing Items:', 20, yPos);
      yPos += 5;

      doc.setFont('helvetica', 'normal');
      data.quoteComparison.missingItems.forEach((item) => {
        doc.text(`• ${item.description}`, 25, yPos);
        yPos += 5;
        doc.setFontSize(9);
        doc.text(`  Present in: ${item.presentIn.join(', ')}`, 30, yPos);
        yPos += 4;
        doc.text(`  Missing in: ${item.missingIn.join(', ')}`, 30, yPos);
        yPos += 6;
        doc.setFontSize(10);
      });
    }
  }

  // Add watermark and footer to all pages
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    
    // Add watermark logo (centered, faint)
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setGState({ opacity: 0.1 });
    doc.addImage(logoImg, 'PNG', (pageWidth - 60) / 2, (pageHeight - 60) / 2, 60, 60);
    doc.setGState({ opacity: 1 });
    
    // Footer text
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Generated by KINGA - Page ${i} of ${pageCount} - ${new Date().toLocaleDateString()}`,
      20,
      285
    );
  }

  // Save the PDF
  doc.save(`KINGA_Claim_${data.claimNumber}_Report.pdf`);
}

/**
 * Generate PDF report for fraud analytics dashboard
 */
export async function generateFraudAnalyticsPDF(data: {
  totalClaims: number;
  fraudDetected: number;
  fraudRate: number;
  avgClaimValue: number;
  totalSavings: number;
  topFraudIndicators: Array<{ name: string; count: number; percentage: number }>;
  monthlyTrends: Array<{ month: string; claims: number; frauds: number }>;
}): Promise<void> {
  const { jsPDF, autoTable } = await loadPdfLibs();
  const doc = new jsPDF();
  let yPos = 20;

  // Add logo to header
  const logoImg = new Image();
  logoImg.src = 'https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/XlSqWNhiGxKiigDt.png';
  doc.addImage(logoImg, 'PNG', 20, yPos - 5, 15, 15);
  
  // Header text next to logo
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text('Fraud Analytics Report', 65, yPos + 5);
  
  yPos += 15;

  // Title
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.text('Fraud Detection Analytics', 20, yPos);
  yPos += 10;

  // Summary Metrics
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Summary Metrics', 20, yPos);
  yPos += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Total Claims Processed: ${data.totalClaims}`, 20, yPos);
  yPos += 5;
  doc.text(`Fraud Cases Detected: ${data.fraudDetected}`, 20, yPos);
  yPos += 5;
  doc.text(`Fraud Detection Rate: ${data.fraudRate.toFixed(1)}%`, 20, yPos);
  yPos += 5;
  doc.text(`Average Claim Value: $${data.avgClaimValue.toLocaleString()}`, 20, yPos);
  yPos += 5;
  doc.text(`Total Savings from Fraud Prevention: $${data.totalSavings.toLocaleString()}`, 20, yPos);
  yPos += 15;

  // Top Fraud Indicators
  if (data.topFraudIndicators && data.topFraudIndicators.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Top Fraud Indicators', 20, yPos);
    yPos += 7;

    const tableData = data.topFraudIndicators.map((indicator) => [
      indicator.name,
      indicator.count.toString(),
      `${indicator.percentage.toFixed(1)}%`
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [['Indicator', 'Count', 'Percentage']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [239, 68, 68] }, // Red for fraud
      margin: { left: 20 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;
  }

  // Monthly Trends
  if (data.monthlyTrends && data.monthlyTrends.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Monthly Fraud Trends', 20, yPos);
    yPos += 7;

    const trendData = data.monthlyTrends.map((trend) => [
      trend.month,
      trend.claims.toString(),
      trend.frauds.toString(),
      `${((trend.frauds / trend.claims) * 100).toFixed(1)}%`
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [['Month', 'Total Claims', 'Fraud Cases', 'Fraud Rate']],
      body: trendData,
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246] }, // Blue
      margin: { left: 20 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;
  }

  // Add watermark and footer to all pages
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    
    // Add watermark logo (centered, faint)
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setGState({ opacity: 0.1 });
    doc.addImage(logoImg, 'PNG', (pageWidth - 60) / 2, (pageHeight - 60) / 2, 60, 60);
    doc.setGState({ opacity: 1 });
    
    // Footer text
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Generated by KINGA - Page ${i} of ${pageCount} - ${new Date().toLocaleDateString()}`,
      20,
      285
    );
  }

  // Save the PDF
  doc.save(`KINGA_Fraud_Analytics_Report_${new Date().toISOString().split('T')[0]}.pdf`);
}

/**
 * Generate PDF report for damage component breakdown
 */
export async function generateDamageReportPDF(data: {
  claimNumber: string;
  vehicle: string;
  registration: string;
  incidentDate: string;
  accidentType: string;
  damagedComponents: string[];
  categorizedDamage: Record<string, string[]>;
  inferredHiddenDamage: Array<{ component: string; reason: string; confidence: string }>;
  structuralDamage: boolean;
  airbagDeployment: boolean;
  estimatedCost: number;
  partsCost: number;
  laborCost: number;
  damageDescription: string;
  /** Physics analysis — accepts both normalised format ({_raw, consistencyScore, ...}) and legacy flat format */
  physicsAnalysis?: Record<string, unknown>;
  /** Forensic analysis — accepts both DB format ({paint, bodywork, ...}) and legacy format ({paintAnalysis, ...}) */
  forensicAnalysis?: Record<string, unknown>;
  damagePhotos?: string[];
}): Promise<void> {
  const { jsPDF, autoTable } = await loadPdfLibs();
  const doc = new jsPDF();
  let yPos = 20;

  // Add logo to header
  const logoImg = new Image();
  logoImg.src = 'https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/XlSqWNhiGxKiigDt.png';
  doc.addImage(logoImg, 'PNG', 20, yPos - 5, 15, 15);
  
  // Header text next to logo
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text('Damage Component Analysis', 65, yPos + 5);
  
  yPos += 15;

  // Title
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.text('Damage Component Breakdown Report', 20, yPos);
  yPos += 10;

  // Claim Summary
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Claim Information', 20, yPos);
  yPos += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Claim Number: ${data.claimNumber}`, 20, yPos);
  yPos += 5;
  doc.text(`Vehicle: ${data.vehicle}`, 20, yPos);
  yPos += 5;
  doc.text(`Registration: ${data.registration}`, 20, yPos);
  yPos += 5;
  doc.text(`Incident Date: ${data.incidentDate}`, 20, yPos);
  yPos += 5;
  doc.text(`Accident Type: ${data.accidentType.replace('_', ' ').toUpperCase()}`, 20, yPos);
  yPos += 10;

  // ─── Damage Photos Section ──────────────────────────────────────────────────
  if (data.damagePhotos && data.damagePhotos.length > 0) {
    if (yPos > 200) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFillColor(37, 99, 235);
    doc.rect(20, yPos - 1, 170, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`Damage Photos (${data.damagePhotos.length})`, 23, yPos + 5);
    doc.setTextColor(0, 0, 0);
    yPos += 13;

    const maxPhotos = Math.min(data.damagePhotos.length, 6);
    const thumbW = 50;
    const thumbH = 38;
    const gap = 5;
    const cols = 3;

    for (let i = 0; i < maxPhotos; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = 20 + col * (thumbW + gap);
      const y = yPos + row * (thumbH + gap);

      try {
        doc.addImage(data.damagePhotos[i], 'JPEG', x, y, thumbW, thumbH);
      } catch {
        doc.setDrawColor(200, 200, 200);
        doc.rect(x, y, thumbW, thumbH);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Photo ${i + 1}`, x + 15, y + 20);
        doc.setTextColor(0, 0, 0);
      }
    }

    const totalRows = Math.ceil(maxPhotos / cols);
    yPos += totalRows * (thumbH + gap) + 5;

    if (data.damagePhotos.length > 6) {
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(`+ ${data.damagePhotos.length - 6} additional photos not shown`, 20, yPos);
      doc.setTextColor(0, 0, 0);
      yPos += 8;
    }
  }

  // Summary Statistics
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Summary Statistics', 20, yPos);
  yPos += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Total Components Detected: ${data.damagedComponents.length}`, 20, yPos);
  yPos += 5;
  doc.text(`Inferred Hidden Damage: ${data.inferredHiddenDamage.length}`, 20, yPos);
  yPos += 5;
  doc.text(`Estimated Total Cost: $${data.estimatedCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 20, yPos);
  yPos += 5;
  doc.text(`Parts Cost: $${data.partsCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 20, yPos);
  yPos += 5;
  doc.text(`Labor Cost: $${data.laborCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 20, yPos);
  yPos += 5;
  doc.text(`Structural Damage: ${data.structuralDamage ? 'YES ⚠' : 'NO'}`, 20, yPos);
  yPos += 5;
  doc.text(`Airbag Deployment: ${data.airbagDeployment ? 'YES' : 'NO'}`, 20, yPos);
  yPos += 10;

  // Check if we need a new page
  if (yPos > 250) {
    doc.addPage();
    yPos = 20;
  }

  // Detected Damage Components by Category
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Detected Damage Components', 20, yPos);
  yPos += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);

  Object.entries(data.categorizedDamage).forEach(([category, components]) => {
    // Check if we need a new page
    if (yPos > 260) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFont('helvetica', 'bold');
    doc.text(`${category}:`, 20, yPos);
    yPos += 5;

    doc.setFont('helvetica', 'normal');
    components.forEach((component: string) => {
      doc.text(`  • ${component}`, 25, yPos);
      yPos += 5;
    });
    yPos += 3;
  });

  // Uncategorized components
  const categorizedFlat = Object.values(data.categorizedDamage).flat();
  const uncategorized = data.damagedComponents.filter(comp => !categorizedFlat.includes(comp));
  
  if (uncategorized.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.text('Other Components:', 20, yPos);
    yPos += 5;

    doc.setFont('helvetica', 'normal');
    uncategorized.forEach((component: string) => {
      doc.text(`  • ${component}`, 25, yPos);
      yPos += 5;
    });
    yPos += 5;
  }

  // Check if we need a new page
  if (yPos > 240) {
    doc.addPage();
    yPos = 20;
  }

  // Inferred Hidden Damage
  if (data.inferredHiddenDamage.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(255, 165, 0); // Orange
    doc.text('⚠ Inferred Hidden Damage (Requires Inspection)', 20, yPos);
    doc.setTextColor(0, 0, 0);
    yPos += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);

    data.inferredHiddenDamage.forEach((item) => {
      // Check if we need a new page
      if (yPos > 260) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFont('helvetica', 'bold');
      doc.text(`• ${item.component}`, 20, yPos);
      yPos += 5;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`  Confidence: ${item.confidence}`, 25, yPos);
      yPos += 4;
      const reasonLines = doc.splitTextToSize(`  Reason: ${item.reason}`, 160);
      doc.text(reasonLines, 25, yPos);
      yPos += reasonLines.length * 4 + 5;
      doc.setFontSize(10);
    });

    // Warning note
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    const warningText = doc.splitTextToSize(
      'Note: Inferred damage is based on typical collision patterns and AI analysis. Physical inspection is recommended to confirm hidden damage before finalizing repair estimates.',
      170
    );
    doc.text(warningText, 20, yPos);
    yPos += warningText.length * 4 + 10;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
  }

  // Check if we need a new page
  if (yPos > 240) {
    doc.addPage();
    yPos = 20;
  }

  // Structural Damage Warning
  if (data.structuralDamage) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(220, 38, 38); // Red
    doc.text('⚠ STRUCTURAL DAMAGE DETECTED', 20, yPos);
    doc.setTextColor(0, 0, 0);
    yPos += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const structuralWarning = doc.splitTextToSize(
      'AI analysis indicates potential frame or unibody damage. This may affect vehicle safety and resale value. Detailed structural inspection and repair certification required before vehicle can be returned to service.',
      170
    );
    doc.text(structuralWarning, 20, yPos);
    yPos += structuralWarning.length * 5 + 10;
  }

  // Check if we need a new page
  if (yPos > 220) {
    doc.addPage();
    yPos = 20;
  }

  // AI Damage Analysis Summary
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('AI Damage Analysis Summary', 20, yPos);
  yPos += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const descriptionLines = doc.splitTextToSize(data.damageDescription, 170);
  doc.text(descriptionLines, 20, yPos);
  yPos += descriptionLines.length * 4 + 10;

  // ─── Physics Reconstruction Section ──────────────────────────────────────────
  if (data.physicsAnalysis) {
    if (yPos > 220) { doc.addPage(); yPos = 20; }
    const phys2 = data.physicsAnalysis as any;
    const raw2 = phys2._raw;
    const impactForceKN2 = raw2?.impactForce?.magnitude != null
      ? (raw2.impactForce.magnitude / 1000)
      : (typeof phys2.impactForce === 'number' ? phys2.impactForce : 0);
    const speedKmh2 = raw2?.estimatedSpeed?.value != null
      ? raw2.estimatedSpeed.value
      : (typeof phys2.estimatedSpeed === 'number' ? phys2.estimatedSpeed : 0);
    const impactAngle2 = raw2?.impactAngle != null
      ? raw2.impactAngle
      : (typeof phys2.impactAngle === 'number' ? phys2.impactAngle : 0);
    const consistencyScore2 = phys2.consistencyScore ?? (raw2?.damageConsistency?.score ?? 0);
    const accidentSeverity2 = raw2?.accidentSeverity ?? '';

    doc.setFillColor(30, 58, 138);
    doc.rect(20, yPos - 1, 170, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Accident Physics Reconstruction', 23, yPos + 5);
    doc.setTextColor(0, 0, 0);
    yPos += 13;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    if (impactForceKN2 > 0) { doc.text(`Estimated Impact Force: ${impactForceKN2.toFixed(1)} kN`, 26, yPos); yPos += 4; }
    if (speedKmh2 > 0) { doc.text(`Estimated Speed at Impact: ${speedKmh2.toFixed(0)} km/h`, 26, yPos); yPos += 4; }
    if (impactAngle2 > 0) { doc.text(`Impact Angle: ${impactAngle2.toFixed(0)}\u00b0`, 26, yPos); yPos += 4; }
    if (consistencyScore2 > 0) { doc.text(`Physics Consistency Score: ${consistencyScore2}/100`, 26, yPos); yPos += 4; }
    if (accidentSeverity2) { doc.text(`Accident Severity: ${accidentSeverity2.toUpperCase()}`, 26, yPos); yPos += 4; }
    yPos += 2;
    const propagation2 = raw2?.damagePropagation ?? phys2.damagePropagation ?? [];
    if (Array.isArray(propagation2) && propagation2.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Damage Propagation Path:', 20, yPos); yPos += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      propagation2.slice(0, 5).forEach((dp: any) => {
        const force = typeof dp.force === 'number' ? dp.force.toFixed(1) : '?';
        const dist = typeof dp.distance === 'number' ? dp.distance.toFixed(2) : '?';
        doc.text(`\u2022  ${dp.component} \u2014 ${force} kN at ${dist}m`, 26, yPos);
        yPos += 4;
      });
      yPos += 3;
    }
    doc.setDrawColor(200, 200, 200);
    doc.line(20, yPos, 190, yPos);
    yPos += 5;
  }

  // ─── Forensic Analysis Section ──────────────────────────────────────────
  if (data.forensicAnalysis) {
    if (yPos > 220) { doc.addPage(); yPos = 20; }
    const fa2 = data.forensicAnalysis as any;
    doc.setFillColor(88, 28, 135);
    doc.rect(20, yPos - 1, 170, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Image Forensic Analysis', 23, yPos + 5);
    doc.setTextColor(0, 0, 0);
    yPos += 13;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Overall Forensic Fraud Score: ${fa2.overallFraudScore ?? 0}/100`, 26, yPos); yPos += 6;
    const normaliseSection2 = (dbSection: any, legacySection: any): { score: number; findings: string[] } | null => {
      if (legacySection) return legacySection;
      if (!dbSection) return null;
      const score = dbSection.fraudRiskScore ?? 0;
      const findings: string[] = [];
      if (Array.isArray(dbSection.paintInconsistencies)) findings.push(...dbSection.paintInconsistencies);
      if (Array.isArray(dbSection.fraudIndicators)) findings.push(...dbSection.fraudIndicators);
      if (Array.isArray(dbSection.findings)) findings.push(...dbSection.findings);
      if (dbSection.hasPreviousRepairs) findings.push('Previous repair work detected');
      if (dbSection.oversprayDetected) findings.push('Overspray detected');
      if (dbSection.dentRepairEvidence) findings.push('Evidence of previous dent repair');
      if (dbSection.panelReplacementEvidence) findings.push('Panel replacement evidence found');
      return { score, findings };
    };
    const analyses2 = [
      { name: 'Paint Analysis', section: normaliseSection2(fa2.paint, fa2.paintAnalysis) },
      { name: 'Bodywork Analysis', section: normaliseSection2(fa2.bodywork, fa2.bodyworkAnalysis) },
      { name: 'Glass Analysis', section: normaliseSection2(fa2.glass, fa2.glassAnalysis) },
      { name: 'Tire Analysis', section: normaliseSection2(fa2.tires, fa2.tireAnalysis) },
      { name: 'Fluid Leak Analysis', section: normaliseSection2(fa2.fluidLeaks, fa2.fluidAnalysis) },
    ];
    analyses2.forEach(({ name, section }) => {
      if (!section) return;
      if (yPos > 260) { doc.addPage(); yPos = 20; }
      doc.setFont('helvetica', 'bold');
      doc.text(`${name} (Score: ${section.score}/100):`, 26, yPos); yPos += 4;
      doc.setFont('helvetica', 'normal');
      if (section.findings.length > 0) {
        section.findings.slice(0, 3).forEach((f) => {
          const lines = doc.splitTextToSize(`\u2022  ${f}`, 155);
          doc.text(lines, 30, yPos);
          yPos += lines.length * 4;
        });
      } else {
        doc.setTextColor(120, 120, 120);
        doc.text('No anomalies detected', 30, yPos); yPos += 4;
        doc.setTextColor(0, 0, 0);
      }
      yPos += 2;
    });
    doc.setDrawColor(200, 200, 200);
    doc.line(20, yPos, 190, yPos);
    yPos += 5;
  }

  // Add watermark and footer to all pages
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    
    // Add watermark logo (centered, faint)
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setGState({ opacity: 0.1 });
    doc.addImage(logoImg, 'PNG', (pageWidth - 60) / 2, (pageHeight - 60) / 2, 60, 60);
    doc.setGState({ opacity: 1 });
    
    // Footer text
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Generated by KINGA - Page ${i} of ${pageCount} - ${new Date().toLocaleDateString()}`,
      20,
      285
    );
  }

  // Save the PDF
  doc.save(`KINGA_Damage_Report_${data.claimNumber}_${new Date().toISOString().split('T')[0]}.pdf`);
}
