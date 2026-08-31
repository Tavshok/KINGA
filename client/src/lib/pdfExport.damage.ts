import { applyKingaBranding, loadKingaLogoBase64, loadPdfLibs } from "./pdfExport.shared";

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
  const logoBase64 = await loadKingaLogoBase64();
  const doc = new jsPDF();
  let yPos = 22;

  // Title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(20, 83, 45);
  doc.text('Damage Component Breakdown Report', 20, yPos);
  doc.setTextColor(0, 0, 0);
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
      yPos = 22;
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
    yPos = 22;
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
      yPos = 22;
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
    yPos = 22;
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
        yPos = 22;
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
      'Note: Inferred damage is based on typical collision patterns and KINGA analysis. Physical inspection is recommended to confirm hidden damage before finalizing repair estimates.',
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
    yPos = 22;
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
      'KINGA analysis indicates potential frame or unibody damage. This may affect vehicle safety and resale value. Detailed structural inspection and repair certification required before vehicle can be returned to service.',
      170
    );
    doc.text(structuralWarning, 20, yPos);
    yPos += structuralWarning.length * 5 + 10;
  }

  // Check if we need a new page
  if (yPos > 220) {
    doc.addPage();
    yPos = 22;
  }

  // KINGA Damage Analysis Summary
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('KINGA Damage Analysis Summary', 20, yPos);
  yPos += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const descriptionLines = doc.splitTextToSize(data.damageDescription, 170);
  doc.text(descriptionLines, 20, yPos);
  yPos += descriptionLines.length * 4 + 10;

  // ─── Physics Reconstruction Section ──────────────────────────────────────────
  if (data.physicsAnalysis) {
    if (yPos > 220) { doc.addPage(); yPos = 22; }
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
    if (yPos > 220) { doc.addPage(); yPos = 22; }
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

  // ─── Digital Signature Block ──────────────────────────────────────────────
  if (yPos > 220) { doc.addPage(); yPos = 22; }
  yPos += 8;
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
  const dmgSigNote = 'This damage analysis report has been generated by the KINGA system. By signing below, the assessor confirms review of the KINGA-generated damage findings and accepts responsibility for the final assessment decision.';
  const dmgSigLines = doc.splitTextToSize(dmgSigNote, 170);
  doc.text(dmgSigLines, 20, yPos);
  doc.setTextColor(0, 0, 0);
  yPos += dmgSigLines.length * 4 + 8;
  const dmgCols = [
    { label: 'Lead Assessor', x: 20 },
    { label: 'Claims Manager', x: 79 },
    { label: 'Authorising Officer', x: 138 },
  ];
  dmgCols.forEach(({ label, x }) => {
    doc.setDrawColor(60, 60, 60);
    doc.setLineWidth(0.4);
    doc.line(x, yPos + 14, x + 52, yPos + 14);
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
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text(`Report ID: KINGA-DMG-${data.claimNumber}-${Date.now().toString(36).toUpperCase()}`, 70, yPos + 6);
  doc.text(`Generated: ${new Date().toLocaleString('en-ZA')}`, 70, yPos + 11);
  doc.text('This document is confidential and intended solely for the named insurer.', 70, yPos + 16);
  doc.setTextColor(0, 0, 0);

  // Apply KINGA branding (header + watermark + footer) to every page
  applyKingaBranding(doc, logoBase64, 'Damage Component Analysis');

  // Save the PDF
  doc.save(`KINGA_Damage_Report_${data.claimNumber}_${new Date().toISOString().split('T')[0]}.pdf`);
}

/**
 * Generate a quick summary PDF for a single claim from the triage list.
 * Lightweight — uses only the data available in the triage list without
 * requiring a full KINGA assessment fetch.
 */
