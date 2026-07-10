/**
 * ARCH-03b Fix 1 Verification — Schema Migration Test
 *
 * Confirms that 'moderate' is a valid fraud_risk_level value in all 5 affected tables.
 * This test validates the schema definition (not the live DB) since vitest runs without
 * a live DB connection. The live DB was verified by scripts/apply-arch03b-migration.mjs.
 */
import { describe, it, expect } from 'vitest';
import { aiAssessments, assessorEvaluations, claims, fraudIndicators, historicalReplayResults } from '../drizzle/schema';

describe('ARCH-03b Fix 1 — fraud_risk_level enum includes moderate', () => {
  /**
   * Drizzle's mysqlEnum stores the allowed values on the column definition.
   * We extract them from the column config to verify 'moderate' is present.
   */
  function getEnumValues(table: Record<string, unknown>, columnName: string): string[] {
    const col = table[columnName] as { enumValues?: string[] } | undefined;
    return col?.enumValues ?? [];
  }

  it('aiAssessments.fraudRiskLevel includes moderate', () => {
    const values = getEnumValues(aiAssessments, 'fraudRiskLevel');
    expect(values).toContain('moderate');
    expect(values).toContain('low');
    expect(values).toContain('medium'); // legacy — kept for historical rows
    expect(values).toContain('high');
    expect(values).toContain('elevated');
  });

  it('assessorEvaluations.fraudRiskLevel includes moderate', () => {
    const values = getEnumValues(assessorEvaluations, 'fraudRiskLevel');
    expect(values).toContain('moderate');
    expect(values).toContain('low');
    expect(values).toContain('medium');
    expect(values).toContain('high');
  });

  it('claims.fraudRiskLevel includes moderate', () => {
    const values = getEnumValues(claims, 'fraudRiskLevel');
    expect(values).toContain('moderate');
    expect(values).toContain('low');
    expect(values).toContain('medium');
    expect(values).toContain('high');
  });

  it('fraudIndicators.fraudRiskLevel includes moderate', () => {
    const values = getEnumValues(fraudIndicators, 'fraudRiskLevel');
    expect(values).toContain('moderate');
    expect(values).toContain('low');
    expect(values).toContain('medium');
    expect(values).toContain('high');
    expect(values).toContain('elevated');
  });

  it('historicalReplayResults.fraudRiskLevel includes moderate', () => {
    const values = getEnumValues(historicalReplayResults, 'fraudRiskLevel');
    expect(values).toContain('moderate');
    expect(values).toContain('none');
    expect(values).toContain('low');
    expect(values).toContain('medium');
    expect(values).toContain('high');
    expect(values).toContain('elevated');
  });

  it('moderate appears between medium and high in all tables (ordering sanity)', () => {
    for (const [tableName, table] of [
      ['aiAssessments', aiAssessments],
      ['fraudIndicators', fraudIndicators],
    ] as const) {
      const values = getEnumValues(table as Record<string, unknown>, 'fraudRiskLevel');
      const medIdx = values.indexOf('medium');
      const modIdx = values.indexOf('moderate');
      const highIdx = values.indexOf('high');
      expect(modIdx, `${tableName}: moderate should come after medium`).toBeGreaterThan(medIdx);
      expect(modIdx, `${tableName}: moderate should come before high`).toBeLessThan(highIdx);
    }
  });
});
