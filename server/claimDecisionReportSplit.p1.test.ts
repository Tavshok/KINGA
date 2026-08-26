import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('ClaimDecisionReport split contract', () => {
  it('keeps the legacy route module as a default-export barrel over explicit page and section boundaries', () => {
    const root = process.cwd();
    const barrel = fs.readFileSync(path.join(root, 'client/src/pages/ClaimDecisionReport.tsx'), 'utf8');
    const page = fs.readFileSync(path.join(root, 'client/src/pages/ClaimDecisionReport.page.tsx'), 'utf8');
    const sections = fs.readFileSync(path.join(root, 'client/src/pages/ClaimDecisionReport.sections.tsx'), 'utf8');

    expect(barrel).toContain("export { default } from './ClaimDecisionReport.page'");
    expect(page).toContain('export default function ClaimDecisionReport');
    expect(sections).toContain('export function FinalDecisionBanner');
    expect(sections).toContain('export function CostDecision');
  });
});
