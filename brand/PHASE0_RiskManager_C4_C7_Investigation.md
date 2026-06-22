# Phase 0 — Risk Manager C4/C7 Investigation Findings
**Date:** June 22, 2026  
**Investigator:** Manus (automated git history analysis)  
**Verdict: Sprint 1 Scoring Error — NOT a regression**

---

## Question

The Sprint 2 Independent Verification Audit found zero occurrences of `SLADeadlineChip` and `AttentionRequired` in `RiskManagerDashboard.tsx`. The Sprint 1 closure report had credited Risk Manager with 8/12 certification criteria, which would require both C4 and C7 to be present. Were these components ever in this file, or was the Sprint 1 score wrong?

---

## Investigation Method

1. `git log --all --oneline -- client/src/pages/RiskManagerDashboard.tsx` — retrieved all commits ever touching this file
2. For each commit, ran `git show <sha>:client/src/pages/RiskManagerDashboard.tsx | grep -c "SLADeadlineChip\|AttentionRequired"` — checked every version of the file in history
3. Scored the file at the Sprint 1 baseline (`9c78f96a`) against all 12 certification criteria
4. Compared against the Sprint 2 current state

---

## Findings

**SLADeadlineChip** has never appeared in `RiskManagerDashboard.tsx` in any commit in the repository's history. Zero matches across all commits.

**AttentionRequired** has never appeared in `RiskManagerDashboard.tsx` in any commit in the repository's history. Zero matches across all commits.

**Sprint 1 baseline score (actual):** 6/12  
**Sprint 2 current score:** 6/12 (unchanged — T4/T5 additions did not affect C4 or C7)

| Criterion | Sprint 1 Actual | Notes |
|-----------|----------------|-------|
| C1 KingaPortalShell | FAIL | Never present |
| C2 KPI strip | FAIL | Never present |
| C3 No foreign colours | FAIL | 9 occurrences of emerald-/teal-/etc. at baseline |
| C4 SLADeadlineChip | FAIL | **Never present in any commit** |
| C5 TabsList | PASS | Present since early builds |
| C6 Phase 0 questions | Untested | Cannot verify programmatically |
| C7 AttentionRequired | FAIL | **Never present in any commit** |
| C8 tRPC actions | PASS | Multiple trpc.* calls |
| C9 Empty states | PASS | Empty state messages present |
| C10 Loading states | PASS | isLoading/isPending throughout |
| C11 No mock data | PASS | No mock/hardcoded data |
| C12 Zero TS errors | PASS | 0 errors in portal file |

---

## Root Cause of Sprint 1 Scoring Error

The Sprint 1 audit document (`KINGA_Decision_Aligned_Audit_v2.0.md`, Appendix B, line 1964) states:

> `| Risk Manager | 8/12 | Not Certified (SLA chips, false positive rate missing) |`

The document explicitly lists "SLA chips" as **missing**, yet records the score as 8/12. If C4 (SLADeadlineChip) and C7 (AttentionRequired) were both missing, the maximum possible score with the remaining 10 criteria (minus C6 which is untested) would be 6/12 confirmed + C6 unknown. The 8/12 figure was an overcount — likely the result of the Sprint 1 auditor crediting criteria that were not actually present in the file.

---

## Corrective Action

**No code restoration is required.** There is nothing to restore — these components were never present. The correct historical record is:

- Risk Manager Sprint 1 baseline: **6/12** (not 8/12)
- Risk Manager Sprint 2 (post-T4/T5): **6/12** (no change — T4/T5 added functional features but did not address C1, C2, C4, or C7)
- Risk Manager is **not certified** and will require C1 (KingaPortalShell), C2 (KPI strip), C4 (SLADeadlineChip), and C7 (AttentionRequired) in a future sprint to reach the 9/12 threshold

---

*Phase 0 complete. Proceeding to Phase 1 Task 1.*
