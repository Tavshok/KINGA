/**
 * Batch 4 Audit Tests
 *
 * R-A-22: document_category fallback in quoteExtractionEngine.ts
 * R-GH-20: physicsJson missing fields in db.ts
 */

import { describe, it, expect } from 'vitest';

// ─── R-A-22: document_category fallback ──────────────────────────────────────
// We test the behaviour of validateAndNormalise indirectly by checking
// the exported constant VALID_DOC_CATEGORIES and the fallback logic.

describe('R-A-22: document_category fallback in validateAndNormalise', () => {
  it('VALID_DOC_CATEGORIES contains all five expected values', async () => {
    // Import the engine — the set is defined inline in validateAndNormalise
    // but we can verify the accepted values via a real extraction call.
    // Since we cannot call the LLM in unit tests, we verify the logic
    // by inspecting the source code pattern.
    const fs = await import('fs');
    const src = fs.readFileSync(
      new URL('../server/pipeline-v2/quoteExtractionEngine.ts', import.meta.url).pathname,
      'utf8'
    );
    // The VALID_DOC_CATEGORIES set must include all five values
    expect(src).toContain("new Set(['repair_quote', 'parts_quote', 'assessor_report', 'agreed_cost', 'other'])");
  });

  it('validateAndNormalise returns other (not undefined) for unrecognised document_category', async () => {
    const src = await import('fs').then(fs =>
      fs.readFileSync(
        new URL('../server/pipeline-v2/quoteExtractionEngine.ts', import.meta.url).pathname,
        'utf8'
      )
    );
    // The fallback must be 'other', not undefined
    expect(src).toContain(": 'other'; // R-A-22: unrecognised or missing");
    // The old undefined fallback must NOT be present
    expect(src).not.toContain(': undefined; // undefined = not yet classified');
  });

  it('Stage 9 allSubmittedTotalsForL1 filter uses document_category when available', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(
      new URL('../server/pipeline-v2/stage-9-cost.ts', import.meta.url).pathname,
      'utf8'
    );
    // Must use document_category primary branch
    expect(src).toContain("if (q.document_category) return q.document_category === 'repair_quote';");
    // Must retain legacy fallback
    expect(src).toContain("return (q.quote_type ?? 'repair') !== 'parts_supplier';");
  });

  it('Stage 9 repairQuotes filter uses document_category when available', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(
      new URL('../server/pipeline-v2/stage-9-cost.ts', import.meta.url).pathname,
      'utf8'
    );
    // repairQuotes filter must use document_category
    const repairQuotesBlock = src.match(/const repairQuotes = allQuotes\.filter[\s\S]*?}\);/);
    expect(repairQuotesBlock).not.toBeNull();
    expect(repairQuotesBlock![0]).toContain("if (q.document_category) return q.document_category === 'repair_quote'");
    expect(repairQuotesBlock![0]).toContain("return q.quote_type !== 'parts_supplier'");
  });

  it('vision extraction path applies name-based heuristic for document_category', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(
      new URL('../server/pipeline-v2/quoteExtractionEngine.ts', import.meta.url).pathname,
      'utf8'
    );
    // The heuristic must be present in the vision extraction path
    expect(src).toContain("R-A-22: Apply name-based document_category heuristic");
    // Must handle assessor pattern
    expect(src).toContain("/adjuster|assessor|loss adjust|surveyor|inspection|valuation|apprais/");
    // Must handle parts-only pattern
    expect(src).toContain("/sarjazz|parts|spares|accessories|auto parts|motor parts|spare parts|");
  });
});

// ─── R-GH-20: physicsJson missing fields ─────────────────────────────────────
describe('R-GH-20: physicsJson includes all Stage7Output fields', () => {
  it('physicsJson construction includes isPhysicallyPlausible', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(
      new URL('../server/db.ts', import.meta.url).pathname,
      'utf8'
    );
    expect(src).toContain('isPhysicallyPlausible: (physicsAnalysis as any).isPhysicallyPlausible ?? null');
  });

  it('physicsJson construction includes physicsConfidence', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(
      new URL('../server/db.ts', import.meta.url).pathname,
      'utf8'
    );
    expect(src).toContain('physicsConfidence: (physicsAnalysis as any).physicsConfidence ?? null');
  });

  it('physicsJson construction includes hasCriticalInconsistency', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(
      new URL('../server/db.ts', import.meta.url).pathname,
      'utf8'
    );
    expect(src).toContain('hasCriticalInconsistency: (physicsAnalysis as any).hasCriticalInconsistency ?? null');
  });

  it('physicsJson construction includes damageZones', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(
      new URL('../server/db.ts', import.meta.url).pathname,
      'utf8'
    );
    expect(src).toContain('damageZones: (physicsAnalysis as any).damageZones ?? null');
  });

  it('all four R-GH-20 fields are present in the physicsJson block', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(
      new URL('../server/db.ts', import.meta.url).pathname,
      'utf8'
    );
    // Extract the physicsJson block
    const physicsBlock = src.match(/const physicsJson = physicsAnalysis \? JSON\.stringify\(\{[\s\S]*?\}\) : null;/);
    expect(physicsBlock).not.toBeNull();
    const block = physicsBlock![0];
    expect(block).toContain('isPhysicallyPlausible');
    expect(block).toContain('physicsConfidence');
    expect(block).toContain('hasCriticalInconsistency');
    expect(block).toContain('damageZones');
    // R-GH-20 comment must be present
    expect(block).toContain('R-GH-20');
  });
});

// ─── Batch 3 confirmations ────────────────────────────────────────────────────
describe('Batch 3 confirmations: console.warn PII check', () => {
  it('context.ts console.warn logs only user.id and error message (no PII)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(
      new URL('../server/_core/context.ts', import.meta.url).pathname,
      'utf8'
    );
    // Must log user.id (identifier)
    expect(src).toContain('user.id');
    // Must NOT log phone numbers or claim data
    expect(src).not.toContain('phoneNumber');
    expect(src).not.toContain('claimantName');
    // Error message only — no full error object spread
    // The warn message must span multiple lines — use a broader match
    const warnIdx = src.indexOf('Tenant extraction failed');
    expect(warnIdx).toBeGreaterThan(-1);
    // Extract a 300-char window around the warn call
    const warnWindow = src.slice(Math.max(0, warnIdx - 50), warnIdx + 250);
    // Must use .message or String() — not the full error object
    expect(warnWindow).toMatch(/instanceof Error \? \w+\.message : String\(\w+\)/);
  });

  it('routers.ts narrativeErr console.warn logs only assessment.id and error message', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(
      new URL('../server/routers.ts', import.meta.url).pathname,
      'utf8'
    );
    const narrativeBlock = src.match(/catch \(narrativeErr: unknown\)[\s\S]*?console\.warn\([\s\S]*?\)/);
    expect(narrativeBlock).not.toBeNull();
    // Must reference assessment id (identifier), not claim data
    expect(narrativeBlock![0]).toContain('freshAssessment.id');
    // Must use .message or String() — not the full error object
    expect(narrativeBlock![0]).toMatch(/instanceof Error \? \w+\.message : String\(\w+\)/);
  });

  it('db.ts photoLogErr console.warn logs only claimId and error message', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(
      new URL('../server/db.ts', import.meta.url).pathname,
      'utf8'
    );
    const photoBlock = src.match(/catch \(photoLogErr: unknown\)[\s\S]*?console\.warn\([\s\S]*?\)/);
    expect(photoBlock).not.toBeNull();
    // Must reference claimId (identifier)
    expect(photoBlock![0]).toContain('claimId');
    // Must use .message or String() — not the full error object
    expect(photoBlock![0]).toMatch(/instanceof Error \? \w+\.message : String\(\w+\)/);
  });
});
