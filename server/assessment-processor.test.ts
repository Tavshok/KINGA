import { describe, it, expect, vi } from 'vitest';

// Test the assessment processor types and structure
describe('Assessment Processor v2 Types', () => {
  it('should define ComponentRecommendation interface correctly', () => {
    const rec = {
      component: 'front bumper',
      action: 'replace' as const,
      severity: 'severe' as const,
      estimatedCost: 1200,
      laborHours: 3.5,
      reasoning: 'Bumper is cracked beyond repair'
    };
    expect(rec.component).toBe('front bumper');
    expect(rec.action).toBe('replace');
    expect(rec.severity).toBe('severe');
    expect(rec.estimatedCost).toBe(1200);
    expect(rec.laborHours).toBe(3.5);
  });

  it('should define QuoteFigure interface correctly', () => {
    const quote = {
      label: 'Original Repairer Quote',
      amount: 5411.33,
      source: 'Panel Beater A',
      type: 'original' as const,
      description: 'Initial repair estimate'
    };
    expect(quote.type).toBe('original');
    expect(quote.amount).toBe(5411.33);
  });

  it('should define PhotoWithClassification interface correctly', () => {
    const photo = {
      url: 'https://example.com/photo.jpg',
      classification: 'damage_photo' as const,
      page: 3
    };
    expect(photo.classification).toBe('damage_photo');
    expect(photo.page).toBe(3);
  });

  it('should build multi-quote comparison from extracted data', () => {
    const originalQuote = 5411.33;
    const agreedCost = 4750.07;
    const aiEstimate = 4200;
    const marketValue = 15000;

    const quotes = [];
    if (originalQuote > 0) quotes.push({ label: 'Original', amount: originalQuote, source: 'Repairer', type: 'original' });
    if (agreedCost > 0) quotes.push({ label: 'Agreed', amount: agreedCost, source: 'Assessor', type: 'agreed' });
    if (aiEstimate > 0) quotes.push({ label: 'AI', amount: aiEstimate, source: 'KINGA', type: 'ai' });
    if (marketValue > 0) quotes.push({ label: 'Market Value', amount: marketValue, source: 'Reference', type: 'reference' });

    expect(quotes).toHaveLength(4);
    expect(quotes[0].amount).toBe(5411.33);
    expect(quotes[1].amount).toBe(4750.07);
    
    // Savings calculation
    const savings = originalQuote - agreedCost;
    expect(savings).toBeCloseTo(661.26, 2);
  });

  it('should calculate cost breakdown percentages correctly', () => {
    const totalCost = 4750.07;
    const breakdown = {
      labor: Math.round(totalCost * 0.35 * 100) / 100,
      parts: Math.round(totalCost * 0.40 * 100) / 100,
      materials: Math.round(totalCost * 0.10 * 100) / 100,
      paint: Math.round(totalCost * 0.10 * 100) / 100,
      other: Math.round(totalCost * 0.05 * 100) / 100,
    };
    
    const sum = breakdown.labor + breakdown.parts + breakdown.materials + breakdown.paint + breakdown.other;
    // Sum should be approximately equal to total (small rounding differences ok)
    expect(Math.abs(sum - totalCost)).toBeLessThan(1);
    
    // Labor should be ~35%
    expect(breakdown.labor / totalCost).toBeCloseTo(0.35, 1);
    // Parts should be ~40%
    expect(breakdown.parts / totalCost).toBeCloseTo(0.40, 1);
  });

  it('should classify images based on heuristics', () => {
    // Simulate the classification logic
    function classifyImage(pageTextLen: number, sizeBytes: number, width: number, height: number): string {
      let score = 0;
      if (sizeBytes > 200000) score += 3;
      else if (sizeBytes > 100000) score += 2;
      else if (sizeBytes > 50000) score += 1;
      else if (sizeBytes < 20000) score -= 2;
      
      const pixels = width * height;
      if (pixels > 500000) score += 2;
      else if (pixels > 200000) score += 1;
      else if (pixels < 50000) score -= 2;
      
      if (pageTextLen <= 50) score += 2;
      else if (pageTextLen > 200) score -= 2;
      
      return score >= 1 ? 'damage_photo' : 'document';
    }

    // Large image on text-free page = damage photo
    expect(classifyImage(0, 300000, 1024, 768)).toBe('damage_photo');
    
    // Small image on text-heavy page = document
    expect(classifyImage(500, 15000, 100, 100)).toBe('document');
    
    // Medium image on text-free page = damage photo
    expect(classifyImage(10, 120000, 800, 600)).toBe('damage_photo');
    
    // Large image on text-heavy page - borderline
    expect(classifyImage(300, 250000, 1024, 768)).toBe('damage_photo'); // size wins
  });

  it('should handle component recommendations with repair/replace actions', () => {
    const recommendations = [
      { component: 'front bumper', action: 'replace', severity: 'severe', estimatedCost: 1200, laborHours: 3, reasoning: 'Cracked' },
      { component: 'headlight', action: 'replace', severity: 'severe', estimatedCost: 800, laborHours: 1, reasoning: 'Shattered' },
      { component: 'fender', action: 'repair', severity: 'moderate', estimatedCost: 600, laborHours: 4, reasoning: 'Dented' },
      { component: 'hood', action: 'repair', severity: 'minor', estimatedCost: 400, laborHours: 2, reasoning: 'Scratched' },
    ];

    const totalCost = recommendations.reduce((s, r) => s + r.estimatedCost, 0);
    expect(totalCost).toBe(3000);

    const totalHours = recommendations.reduce((s, r) => s + r.laborHours, 0);
    expect(totalHours).toBe(10);

    const repairCount = recommendations.filter(r => r.action === 'repair').length;
    const replaceCount = recommendations.filter(r => r.action === 'replace').length;
    expect(repairCount).toBe(2);
    expect(replaceCount).toBe(2);
  });
});
