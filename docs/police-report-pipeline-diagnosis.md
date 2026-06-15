# Police Report Pipeline — Diagnosis & Fix Plan

## Data Flow (as-built)

```
PDF/Image document
    ↓
stage-3-structured-extraction.ts   ← PROBLEM 1: extracts verbatim, no reasoning
    ↓ policeChargedParty, policeInvestigationStatus, policeOfficerFindings, thirdPartyAccountSummary
stage-5-assembly.ts                ← OK: maps all fields into claimRecord.policeReport
    ↓ claimRecord.policeReport (full PoliceReportRecord)
stage-7-unified.ts                 ← passes police fields to narrative engine only
    ↓ police_charged_party, police_investigation_status, police_officer_findings
stage-7b-causal-reasoning.ts       ← PROBLEM 2: police data NOT in the causal reasoning prompt
    ↓ causalVerdictJson (wrongedParty, thirdPartyLiabilityPct)
recoveryTrigger.ts                 ← reads wrongedParty from causalVerdictJson
    ↓ recovery case created with wrongedParty, thirdPartyLiabilityPct
demandLetterGenerator.ts           ← reads policeReportNumber, policeStation from flat DB columns only
    ↓ demand letter (PROBLEM 3: misses chargedParty, officerFindings, investigationStatus)
ForensicAuditReport.tsx            ← reads claimRecord.policeReport (all fields) — OK
```

## Problem 1: Stage-3 extracts verbatim, does not reason

**Current behaviour:** The system prompt says "Do NOT infer missing information" and "Preserve original meaning of the text". For police fields, this means:
- `policeOfficerFindings` returns raw transcription of whatever text is near "officer" on the form — including boilerplate, form labels, and irrelevant text
- `policeChargedParty` may return a vehicle registration number instead of a party name if the form says "TAB issued to: ABC 123" 
- `policeInvestigationStatus` may return null even when the form says "docket opened" because the LLM is told not to infer

**Fix:** Add a dedicated `CRITICAL POLICE REASONING RULES` section to the user prompt that instructs the LLM to:
1. Distinguish between the claimant's vehicle and the third party's vehicle when determining `policeChargedParty`
2. Map free-text investigation status to the enum (CHARGED / UNDER_INVESTIGATION / NO_CHARGE / CASE_WITHDRAWN / UNKNOWN)
3. Extract only the officer's factual observations from `policeOfficerFindings`, not form labels or boilerplate
4. Identify whether the charged party is the claimant or the third party, and return `"claimant"` or `"third_party"` as a normalised value alongside the name

## Problem 2: Police data not in causal reasoning prompt

**Current behaviour:** `stage-7b-causal-reasoning.ts` builds its `userPrompt` from:
1. Incident description
2. Physics output
3. Image analysis
4. Damage components
5. Precomputed scores

Police data (`chargedParty`, `investigationStatus`, `officerFindings`, `thirdPartyAccountSummary`) is passed to the **narrative engine** (stage-7e) but NOT to the **causal reasoning engine** (stage-7b). This means:
- `wrongedParty` is determined without knowing who the police charged
- `thirdPartyLiabilityPct` is determined without the officer's findings
- A claim where the third party was charged and found at fault may still get `wrongedParty: "unknown"` because the causal engine has no police data

**Fix:** Add a `6. Police Report Evidence` block to the causal reasoning `userPrompt` with:
- Who was charged at the scene (and whether that is the claimant or the third party)
- Investigation status
- Officer's factual findings (verbatim, if present)
- Third party's own account (if present)
- Explicit instruction: "If the police charged a specific party, this is strong evidence for `wrongedParty` determination. Weight it accordingly."

## Problem 3: Demand letter misses enriched police fields

**Current behaviour:** `demandLetterGenerator.ts` reads only `policeReportNumber` and `policeStation` from the flat DB columns. It does not read `chargedParty`, `officerFindings`, or `investigationStatus` from the `claimRecordJson`.

**Fix:** In `demandLetterGenerator.ts`, parse `claimRecordJson` (already fetched via the assessment) and include:
- `chargedParty` → "The attending officer charged [party] at the scene."
- `investigationStatus` → "Investigation status: [status]"
- `officerFindings` → Include in the "Circumstances of the Accident" section of the demand letter

## Fix Plan

### Fix A — Stage-3: Add police reasoning rules (stage-3-structured-extraction.ts)
- Add `CRITICAL POLICE REASONING RULES` block to the user prompt
- Normalise `policeChargedParty` to `"claimant"` | `"third_party"` | `"unknown"` | name
- Map free-text investigation status to the enum
- Strip boilerplate from `policeOfficerFindings`

### Fix B — Stage-7b: Include police evidence in causal reasoning prompt (stage-7b-causal-reasoning.ts)
- Add `police_charged_party`, `police_investigation_status`, `police_officer_findings`, `third_party_account` to `runCausalReasoningEngine` signature (already in ClaimRecord)
- Add block 6 "Police Report Evidence" to the `userPrompt`
- Add instruction on how to weight police evidence in `wrongedParty` determination

### Fix C — Demand letter: Include enriched police fields (demandLetterGenerator.ts)
- Parse `claimRecordJson` in the context assembly
- Add `chargedParty`, `officerFindings`, `investigationStatus` to the demand letter context
- Include in the letter template where legally relevant

## Files to change
1. `server/pipeline-v2/stage-3-structured-extraction.ts` — Fix A
2. `server/pipeline-v2/stage-7b-causal-reasoning.ts` — Fix B
3. `server/recovery/demandLetterGenerator.ts` — Fix C
