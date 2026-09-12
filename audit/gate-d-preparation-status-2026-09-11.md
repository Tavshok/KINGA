# Gate D Preparation Status — 11 September 2026

## Completed preparation work

The repository now contains a non-executing Gate D readiness plan, a TiDB Cloud official-research note, and six ordered per-wave change-packet templates derived from the merged Gate C scratch evidence. The plan uses 189 selected source tables: 188 from Waves 1–5 and the approved `photo_reextraction_jobs` supplement.

The initial readiness package was later followed by an owner-authorised, read-only staging inspection and a bounded recovery rehearsal. The final recorded proof is a successful `2026-09-11 03:00:45 UTC` snapshot restore from `KINGA-staging` to the separate disposable `kinga-staging-restore-rehearsal-20260911`, followed by owner-operated target deletion. Final My TiDB evidence lists only Active `KINGA-staging` and `KINGA-production`; the disposable target is absent. No migration user, staging or production DDL/DML, schema migration, application configuration change, data change, or Gate D execution was performed.

## Explicitly unresolved before any Gate D action

| Category | Unresolved requirement |
|---|---|
| Target identity | Staging identity, AWS Frankfurt location, and TLS-protected, SELECT-only verifier scope were evidenced. The verifier sees zero tables; it is not a migration identity. |
| Ownership | Rehearsal approver and owner-console operator are evidenced. Named migration administrator, constrained migration operator, reviewer, application owner, and stop authority remain required for execution. |
| Access | The `kinga_verify` account is evidenced as SELECT-only. A separate least-privilege migration account, with just-in-time issue/revocation process and no runtime-secret reuse, remains uncreated and unauthorised. |
| Recovery | Free Starter’s snapshot-to-new-instance path was rehearsed successfully, including cleanup. It has one-day snapshot retention and no Starter PITR; this posture is accepted for the staging rehearsal only, not production. |
| Execution | No packet is signed for execution. A named Wave 1 packet, source/SQL hashes, preflight target metadata, window, reviewer, application validation plan, rollback/incident owner, and explicit staging DDL authority remain required. |

## Decision boundary

The restore rehearsal is complete, but Gate D remains **preparation only**. The next possible action is review and, if separately desired, approval of a specific non-executing Wave 1 packet. No staging schema/data operation follows from this evidence. Production remains untouched and requires an Essential or Dedicated service class with real PITR before production migration planning.
