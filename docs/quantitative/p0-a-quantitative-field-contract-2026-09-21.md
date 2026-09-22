# P0-A Quantitative Field Eligibility Contract

**Status:** In implementation; source-only and not yet submitted for pull-request review
**Date:** 2026-09-21
**Package:** P0-A — shared contract foundation and the first physical-measurement vertical slice
**Scope:** `crush_depth_m` from VGE/VGR and raw Stage 6 observations through Stage 7, Physics Truth, and the Stage 10 report boundary.

## Purpose

P0 establishes a **per-field eligibility, provenance, and governing-versus-advisory contract**. A quantitative-looking value must not become governing merely because it is present, numerically shaped, or accompanied by a model confidence label. The first adapter covers crush depth and creates the reusable contract shape for future physical, fraud, cost, confidence, and learning fields.

> **An advisory value may be described for review but cannot be used as a governing calculation operand or rendered as a produced physics result.**

## P0-A policy decision

P0-A deliberately treats **all current visual crush geometry as advisory**. VGE and VGR now bind physical scale to stored vehicle dimensions and reject raw LLM physical dimensions, but their reference identity, pixel span, perspective interpretation, and condition assessment remain LLM-mediated. The owner-directed quantitative sequence therefore reserves visual-geometry governing authority for **P1 visual-measurement qualification**.

| Evidence condition                                                                           | P0-A disposition                  | Numerical authority | Effect                                                                       |
| -------------------------------------------------------------------------------------------- | --------------------------------- | ------------------- | ---------------------------------------------------------------------------- |
| VGR consensus, even where existing VGR qualification succeeds                                | `ADVISORY`                        | None in P0-A        | Preserved as descriptive geometry; collision physics is withheld pending P1. |
| VGE calibration, even where existing VGE qualification succeeds                              | `ADVISORY`                        | None in P0-A        | Preserved as descriptive geometry; cannot become a physics operand.          |
| Raw Stage 6 LLM crush-depth number                                                           | `ADVISORY`                        | None                | Never copied into the contract or collision calculation.                     |
| Raw Stage 6 structural displacement, deformation energy, severity, or document-derived value | Not re-labelled as crush evidence | None                | Cannot bypass the crush-depth adapter by substitution.                       |
| No crush observation                                                                         | `UNAVAILABLE`                     | None                | No inferred default is introduced.                                           |

This policy does **not** weaken the VGE integrity correction. Stored measurements remain the only accepted physical scale source when VGE/VGR runs. P0-A's narrower conclusion is that P1 must still qualify the visual observation chain before that calibrated geometry can govern downstream physics.

## Contract

`server/evidence-governance/quantitativeFieldGovernance.ts` provides a versioned `QuantitativeFieldDecision` with these invariant properties:

| Field              | P0-A requirement                                                                                                                                                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contractVersion`  | `P0-1.0`, carried with the decision for historical interpretation.                                                                                                                                                                                   |
| `field`            | `crush_depth_m` is the only active adapter; broader vocabulary is non-authoritative until a later package implements each field rule.                                                                                                                |
| `disposition`      | `ADVISORY` or `UNAVAILABLE` for every current P0-A crush decision.                                                                                                                                                                                   |
| `governing`        | Always `null`; no current source may forge a governing visual-geometry decision.                                                                                                                                                                     |
| `advisoryEvidence` | Source and reason only; the contract intentionally carries no advisory numeric value.                                                                                                                                                                |
| runtime validation | Recomputes the exact decision from the complete live VGE, VGR, and raw-Stage-6 presence snapshot. It rejects forged, omitted-source, false-unavailable, unknown-key, missing, or inconsistent persisted decisions; downstream consumers fail closed. |

## Consumer behavior

| Consumer                       | P0-A behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stage 7 collision physics      | Produces a review-required, null-valued outcome before legacy physics, parking calculations, animal-strike estimation, ensembles, recomputations, or fallbacks can consume crush depth. It records the exact advisory/unavailable decision.                                                                                                                                                                                                                                         |
| Physics Truth                  | Preserves the Stage 7 decision; withholds canonical crush, VGE/VGR numeric projections, collision speed, energy, delta-V, latent damage, structural-load-path, braking, and causation projections where they depend on rejected collision physics. It also replaces every collision-physics integrity flag with a non-numeric `P0_COLLISION_PHYSICS_UNAVAILABLE` review signal, so an internally supplied ensemble cannot leak a speed-ceiling or physical-impossibility narrative. |
| Unified causation and Stage 37 | Rebinds the live VGE, VGR, and raw-Stage-6 snapshot before either causal-reasoning pass or causal-chain construction. When P0 is advisory, unavailable, missing, stale, or forged, it invokes neither causal engine, emits no physics coherence or physics-to-fraud step, and leaves the causal verdict and chain unavailable.                                                                                                                                                      |
| Stage 10 report                | Fails closed for advisory, unavailable, missing, or malformed P0 crush decisions; suppresses both physics reconstruction and causal-chain narratives; and presents an explicit review-required state rather than a numerical reconstruction.                                                                                                                                                                                                                                        |
| Final output projection        | Applies the same no-go state defensively to the top-level causal verdict and causal chain and to `forensicAnalysis.causalChain`; an upstream forged or legacy causal payload cannot be published through those paths.                                                                                                                                                                                                                                                               |
| Existing visual artifacts      | May retain descriptive VGE/VGR provenance for human review, but the P0 contract does not authorize their numeric promotion.                                                                                                                                                                                                                                                                                                                                                         |

## Deliberate boundaries

P0-A does not add a schema or migration and makes no staging, production, seed, or application-data write. The decision is carried in existing JSON-compatible Stage 7 and Physics Truth payloads. Animal-strike numerical estimation is withheld because it has no active P0 governing-measurement adapter. Independent speed sources, fraud, cost, confidence, and learning each require their own field-specific adapter and consumer matrix before being claimed as P0-governed.

## Verification obligations before review

1. A raw Stage 6 crush, energy, severity, structural-displacement, or document numeric cannot produce Stage 7 force, speed, energy, delta-V, ensemble, recomputation, or fallback output.
2. Qualified VGE/VGR remains explicitly `ADVISORY` until P1, and cannot bypass the contract at Stage 7, Physics Truth, or Stage 10.
3. Missing, malformed, or stale persisted decisions fail closed at each consumer boundary.
4. Advisory evidence carries no numeric value in the P0 decision itself.
5. A Physics Truth decision remains source-bound when raw Stage 6 component crush is present, including when Stage 7 itself produced no numeric output.
6. Test execution uses only `scripts/run-isolated-vitest.ts` and the disposable loopback `kinga_ci_test` database.
7. No schema, migration, staging, production, credential, seed, or deployment action is introduced.
8. Causal reasoning is not a side channel around P0: Unified Stage 7, the downstream Stage 7b rerun, Stage 37, top-level output, and forensic output must not create or publish collision-physics causation unless a future policy defines a source-bound governing decision.
9. Physics Truth cannot retain a numerical physics integrity narrative after its public canonical fields have been withheld. Under P0, speed ensembles, delta-V, kinetic energy, evidence-quality scoring, causation ceilings, and related integrity flags remain unavailable rather than becoming a secondary publication path.

## Current focused validation

On 2026-09-22, after the causal-publication and Physics Truth integrity-flag corrections, the guarded P0 matrix passed **11 test files and 243 tests** against the disposable `kinga_ci_test` database. It covers the shared governance contract, Stage 7 physics, Unified Stage 7 causal suppression, the actual Stage 7b Pass 2 gate, causal-chain construction, the final orchestrator result projection, Physics Truth, Stage 10 report suppression, CGI, interpretation, Claim Truth canonical evidence, and truth reconciliation.

The merge-readiness checkpoint also passed the guarded full suite at **604 files passed, 1 skipped; 9,684 tests passed, 4 skipped**, and the production build completed successfully. `git diff --check` passed. The repository-wide TypeScript check is not pristine: it retains broad inherited diagnostics. The P0 changed paths report only two existing `orchestrator.ts` optional-`runId` calls, outside the P0 causal controls; no diagnostic is attributed to the new governance, Stage 7 Unified, causal-chain, or Physics Truth logic.

## Follow-on sequence

P1 will define the visual-measurement qualification/attestation needed to introduce a future governing visual-geometry source. P2 must then define admissible physics calculations over that qualified measurement. Fraud, confidence, financial, and learning adapters remain separately scoped P0 follow-ons and are not authorized by this document.
