# Daily User-Contamination Monitor: Activation and Baseline

**Date:** 18 September 2026
**Status:** Active read-only observation control
**Scope:** Aggregate-only monitoring of the live Manus-hosted KINGA application database after the owner-authorized test-data reset.

## Purpose

The monitor provides early warning if synthetic-looking or structurally invalid user records reappear after the reset. It is an observation control only. It does not create, link, update, disable, delete, archive, export, or otherwise alter users, claims, tenants, WorkOS mappings, authentication configuration, or provider settings.

## Schedule

The current task permits one recurring schedule. The previously paused, unused **KINGA Recovery Deadline Sweep** entry was therefore replaced with the active **KINGA Daily User-Contamination Monitor**.

| Setting | Value |
|---|---|
| Frequency | Daily at 09:00 |
| Time zone | Africa/Harare |
| Execution mode | Standard scheduled task |
| Status | Active |
| Read boundary | Aggregate SQL only; no identifiers or direct personal data |
| Automatic remediation | None; any delta is reported only |

## Monitor controls

Each run counts the following values and compares them with the baseline below.

| Control | Meaning | Alert condition |
|---|---|---|
| Total users | Current `users` row count | Any change from baseline requires review; a new legitimate user must be explicitly explained. |
| Test-marker users | Rows where `openId`, email, or name matches `test`, `seed`, `fixture`, `synthetic`, `load`, or `bulk` | Any nonzero result. |
| Absent tenant reference | Rows with blank or null `tenant_id` | Any nonzero result. |
| Unknown tenant reference | Nonblank `tenant_id` values that do not resolve to `tenants.id` | Any nonzero result. |
| Absent login method | Rows with blank or null `loginMethod` | Any nonzero result. |
| Most recent user creation | Maximum `users.createdAt` | Any later creation timestamp is reported with the aggregate delta. |

The scheduled instruction explicitly prohibits selecting or reporting names, emails, open IDs, numeric IDs, tenant IDs, or row-level records. It also prohibits automatic remediation.

## First baseline

The first aggregate query completed successfully after activation.

| Metric | Baseline result |
|---|---:|
| Total users | **1** |
| Test-marker users | **0** |
| Users with absent tenant reference | **0** |
| Users with unknown tenant reference | **0** |
| Users with absent login method | **0** |
| Most recent user creation | **2026-02-06 10:54:13** |

> **Result:** The baseline is clean. It is consistent with the independently verified reset postflight: the owner account is the sole remaining user and no residual synthetic-identity signature is present.

## Boundaries and follow-up

A monitor alert is evidence for investigation, not authority for a cleanup, credential change, WorkOS linking action, or provider change. The monitor may be revised or paused only through an explicit operational decision. WorkOS Package B and later authentication packages remain separately governed by their own approval gates.

## Verification

The baseline query used quoted live physical column names after an information-schema check confirmed the deployed naming mix (`openId`, `loginMethod`, `createdAt`, and `tenant_id`). This avoided relying on source naming assumptions and did not disclose any row-level data.
