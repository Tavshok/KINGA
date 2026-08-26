import { applyKingaBranding, loadKingaLogoBase64, loadPdfLibs, type ClaimData } from "./pdfExport.shared";

export async function generateComparisonPDF(data: ClaimData, currencySymbol: string = 'US$'): Promise<void> {
  const { jsPDF, autoTable } = await loadPdfLibs();
  const logoBase64 = await loadKingaLogoBase64();
  const doc = new jsPDF();
  // yPos starts below the 14mm header bar
  let yPos = 22;

  // Title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(20, 83, 45);
  doc.text('Fraud Detection & Comparison Report', 20, yPos);
  doc.setTextColor(0, 0, 0);
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
    if (yPos > 230) { doc.addPage(); yPos = 22; }

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
      yPos = 22;
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

  // ─── KINGA Damage Intelligence Section ──────────────────────────────────────────
  if (data.aiIntelligence) {
    // Check if we need a new page
    if (yPos > 240) {
      doc.addPage();
      yPos = 22;
    }

    const ai = data.aiIntelligence;

    // Section heading with teal background bar
    doc.setFillColor(15, 118, 110); // teal-700
    doc.rect(20, yPos - 1, 170, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('KINGA Damage Intelligence', 23, yPos + 5);
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
    if (ai.lowestQuote > 0) {
      doc.text(`Lowest Quote:   ${currencySymbol}${ai.lowestQuote.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 26, yPos);
      yPos += 4;
      doc.text(`Median Quote:   ${currencySymbol}${ai.medianQuote.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 26, yPos);
      yPos += 4;
      doc.text(`Highest Quote:  ${currencySymbol}${ai.highestQuote.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 26, yPos);
      yPos += 4;
      doc.text(`Quote Spread:   ${ai.spreadPercent}%`, 26, yPos);
    } else {
      // No quotes yet — show KINGA estimated cost
      doc.setTextColor(100, 100, 100);
      doc.text('No panel beater quotes submitted yet', 26, yPos);
      doc.setTextColor(0, 0, 0);
      yPos += 4;
      if (ai.aiEstimatedCost && ai.aiEstimatedCost > 0) {
        doc.text(`KINGA Estimated Cost: ${currencySymbol}${ai.aiEstimatedCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 26, yPos);
      }
    }
    yPos += 7;

    // ── 3. KINGA Recommendation ─────────────────────────────────────────────────
    if (ai.recommendedRepairer) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('KINGA Recommendation:', 20, yPos);
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
    doc.text(`KINGA Confidence Score: ${ai.confidenceScore}%`, 20, yPos);
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
    yPos = 22;
  }

  // Vehicle Valuation Section
  if (data.vehicleValuation) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Vehicle Market Valuation', 20, yPos);
    yPos += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Estimated Market Value: $${data.vehicleValuation.estimatedValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 20, yPos);
    yPos += 5;
    doc.text(`Final Adjusted Value: $${data.vehicleValuation.finalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 20, yPos);
    yPos += 5;
    doc.text(`Price Range: $${data.vehicleValuation.minPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} - $${data.vehicleValuation.maxPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 20, yPos);
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
      doc.text('KINGA Reasoning:', 20, yPos);
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
    yPos = 22;
  }

  // Assessor Evaluation Section
  if (data.assessorEvaluation) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Assessor Evaluation', 20, yPos);
    yPos += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Estimated Cost: ${currencySymbol}${data.assessorEvaluation.estimatedCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 20, yPos);
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
      `${currencySymbol}${quote.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
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
    yPos = 22;
  }

  // ─── Physics Reconstruction Section ──────────────────────────────────────────
  if (data.physicsAnalysis) {
    if (yPos > 220) { doc.addPage(); yPos = 22; }
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
    if (yPos > 220) { doc.addPage(); yPos = 22; }
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
      if (yPos > 260) { doc.addPage(); yPos = 22; }
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
    doc.text(`Average Quote: $${data.quoteComparison.averageQuote.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 20, yPos);
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

  // ─── Digital Signature Block ──────────────────────────────────────────────
  if (yPos > 220) { doc.addPage(); yPos = 22; }
  yPos += 8;

  // Section header
  doc.setFillColor(20, 83, 45);
  doc.rect(20, yPos - 1, 170, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Assessment Authorisation & Digital Signature', 23, yPos + 5);
  doc.setTextColor(0, 0, 0);
  yPos += 14;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  const sigNote = 'This report has been generated by the KINGA system and is subject to review and authorisation by a qualified assessor. By signing below, the assessor confirms the accuracy of the KINGA-generated findings and takes responsibility for the final assessment decision.';
  const sigNoteLines = doc.splitTextToSize(sigNote, 170);
  doc.text(sigNoteLines, 20, yPos);
  doc.setTextColor(0, 0, 0);
  yPos += sigNoteLines.length * 4 + 8;

  // Three signature columns
  const colW = 52;
  const cols = [
    { label: 'Lead Assessor', x: 20 },
    { label: 'Claims Manager', x: 20 + colW + 7 },
    { label: 'Authorising Officer', x: 20 + (colW + 7) * 2 },
  ];

  cols.forEach(({ label, x }) => {
    // Signature line
    doc.setDrawColor(60, 60, 60);
    doc.setLineWidth(0.4);
    doc.line(x, yPos + 14, x + colW, yPos + 14);
    // Labels
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(label, x, yPos + 18);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text('Signature', x, yPos + 22);
    doc.text('Name: ___________________________', x, yPos + 27);
    doc.text(`Date: ${new Date().toLocaleDateString('en-ZA')}`, x, yPos + 32);
    doc.setTextColor(0, 0, 0);
  });

  yPos += 40;

  // Official stamp box
  doc.setDrawColor(20, 83, 45);
  doc.setLineWidth(0.5);
  doc.rect(20, yPos, 40, 25);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(20, 83, 45);
  doc.text('OFFICIAL STAMP', 22, yPos + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(120, 120, 120);
  doc.text('(Company seal or', 22, yPos + 11);
  doc.text('digital stamp here)', 22, yPos + 15);
  doc.setTextColor(0, 0, 0);

  // Report ID
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text(`Report ID: KINGA-${data.claimNumber}-${Date.now().toString(36).toUpperCase()}`, 70, yPos + 6);
  doc.text(`Generated: ${new Date().toLocaleString('en-ZA')}`, 70, yPos + 11);
  doc.text('This document is confidential and intended solely for the named insurer.', 70, yPos + 16);
  doc.text('Unauthorised disclosure or reproduction is strictly prohibited.', 70, yPos + 20);
  doc.setTextColor(0, 0, 0);

  // Apply KINGA branding (header + watermark + footer) to every page
  applyKingaBranding(doc, logoBase64, 'Fraud Detection & Comparison Report');

  // Save the PDF
  doc.save(`KINGA_Claim_${data.claimNumber}_Report.pdf`);
}

/**
 * Generate PDF report for fraud analytics dashboard
 */
