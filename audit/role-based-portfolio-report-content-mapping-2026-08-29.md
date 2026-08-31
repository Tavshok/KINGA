# Role-Based Portfolio Report Content Mapping

## Retiring report keys and destinations

| Retiring key | Current content | Approved destination |
|---|---|---|
| `executive.insurer_summary` | Total claims, approval/rejection rates, high-fraud rate, average AI cost, total exposure | Claims-manager operational totals; risk-manager fraud/exposure; executive aggregate KPIs |
| `executive.claims_trend` | Monthly volumes, approvals, average AI cost | Claims-manager processing trend; executive aggregate trend |
| `executive.financial_exposure` | Open claims, open/approved/settled AI-estimate values, average cost | Risk-manager financial exposure; executive aggregate financial KPI |
| `executive.full_report` | Portfolio, financial, fraud, operational, recovery, assessor, action-register sections | Claims manager: portfolio/processing/ageing; risk manager: fraud and exposure; executive: aggregate-only portfolio, fraud, financial, and dwell-time trends. Recovery remains recovery-officer-only; assessor and action-register detail do not appear in executive view. |

## Current dependency trace

The retiring keys occur in `server/reporting/reportDefinitions.ts` (access map and dispatcher), `server/routers/reporting.ts` (catalogue and validation), `server/reporting.access.test.ts`, `client/src/components/ClaimsManagerReportsCentre.tsx`, and `client/src/components/executive/ExecutiveReportTab.tsx`. Retirement must update each caller only after replacements exist.

Existing `portfolio.fraud_summary` and `risk_manager_portfolio` are candidates to extend rather than duplicate. Existing recovery reports remain outside this consolidation and must be restricted to `recovery_officer` plus the established insurer-admin access pattern.
