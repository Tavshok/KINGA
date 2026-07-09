/**
 * R-INF-07 Audit Tests
 * Verifies that all invokeLLM calls in assessment-processor.ts are wrapped in withRetry.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const AP_PATH = path.join(__dirname, '../../server/assessment-processor.ts');
const content = fs.readFileSync(AP_PATH, 'utf-8');
const lines = content.split('\n');

describe('R-INF-07: assessment-processor.ts LLM retry coverage', () => {
  it('imports withRetry from _core/llm', () => {
    const importLine = lines.find(l => l.includes("from './_core/llm'") || l.includes('from "./_core/llm"'));
    expect(importLine).toBeTruthy();
    expect(importLine).toContain('withRetry');
    expect(importLine).toContain('invokeLLM');
  });

  it('has zero bare invokeLLM calls (all must be inside withRetry)', () => {
    const bare = lines.filter(l =>
      l.includes('await invokeLLM(') &&
      !l.includes('withRetry')
    );
    expect(bare).toHaveLength(0);
  });

  it('wraps extraction call in withRetry (ap-extraction)', () => {
    expect(content).toContain("withRetry(() => invokeLLM({");
    expect(content).toContain("}), 3, 'ap-extraction');");
  });

  it('wraps image classifier call in withRetry (ap-image-classify)', () => {
    expect(content).toContain("}), 3, 'ap-image-classify');");
  });

  it('wraps component recommendations call in withRetry (ap-rec)', () => {
    expect(content).toContain("}), 3, 'ap-rec');");
  });

  it('wraps non-collision physics call in withRetry (ap-non-collision)', () => {
    expect(content).toContain("}), 3, 'ap-non-collision');");
  });

  it('wraps physics analysis call in withRetry (ap-physics)', () => {
    expect(content).toContain("}), 3, 'ap-physics');");
  });

  it('wraps fraud analysis call in withRetry (ap-fraud)', () => {
    expect(content).toContain("}), 3, 'ap-fraud');");
  });

  it('has exactly 6 withRetry-wrapped invokeLLM opens', () => {
    const opens = lines.filter(l => l.includes('withRetry(() => invokeLLM({'));
    expect(opens).toHaveLength(6);
  });

  it('has exactly 6 withRetry closes with ap- labels', () => {
    const closes = lines.filter(l => /\}\), 3, 'ap-/.test(l));
    expect(closes).toHaveLength(6);
  });
});

describe('R-INF-09: agency role documentation comments', () => {
  const SCHEMA_PATH = path.join(__dirname, '../../drizzle/schema.ts');
  const BROKER_PATH = path.join(__dirname, '../../server/routers/agency-broker.ts');

  it('schema.ts users.role enum has R-INF-09 comment', () => {
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
    expect(schema).toContain('R-INF-09');
    expect(schema).toContain("'agency' role is intentionally ABSENT");
  });

  it('agency-broker.ts agencyProcedure has R-INF-09 comment', () => {
    const broker = fs.readFileSync(BROKER_PATH, 'utf-8');
    expect(broker).toContain('R-INF-09');
    expect(broker).toContain('pending product decision');
  });

  it('agency role is NOT in users.role enum values', () => {
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
    // Find the users table role enum line
    const roleLine = schema.split('\n').find(l =>
      l.includes("mysqlEnum(['user','admin','insurer'") &&
      l.includes("'claimant'") &&
      l.includes('.default(')
    );
    expect(roleLine).toBeTruthy();
    expect(roleLine).not.toContain("'agency'");
  });
});
