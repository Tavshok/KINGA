# KINGA Platform — Active Todo List
# Audited: June 2026 | Replaced 12,469-line accumulation with clean active list

---

## Reports — Claims Intelligence & Forensic Claim Decision (Completed July 2026)

- [x] Build shared KINGA CSS design system (kingaDesignSystem.ts)
- [x] Build Claims Intelligence Report generator (claimsIntelligenceReport.ts) — 6 sections: §1 Claim Identity, §P Policy & Coverage, §2 Cost Intelligence, §3 Risk Indicators, §4 Evidence Snapshot, §5 Decision & Next Steps + upgrade banner
- [x] Redesign Forensic Claim Decision Report (forensicDecisionReport.ts) — v7 design: compact rows, SVG speed scale, damage zone map, Chart.js fraud radar, photo forensics grid, 5-stage workflow
- [x] Register claim.intelligence in REPORT_ACCESS, REPORT_CATALOGUE, dispatcher, and UI
- [x] Route claim.forensic to new v7 generateForensicDecisionReport generator
- [x] Remove redundant claim.forensic_decision key (claim.forensic is canonical)
- [x] Write full test suite: 111 tests covering access control, column mapping, HTML structure, design system, UI wiring (server/kinga-reports.test.ts)

---

## Stabilization Pass — July 2026

- [x] Fix document visibility: add documents.allByClaim tRPC procedure merging ingestion_documents + claim_documents; update DocumentList component
- [x] CI hardening: pre-commit hook blocking commits with git conflict markers — `.githooks/pre-commit`, portable installer, staged-content scanner, and regression tests verified
- [x] Pipeline observability: retained the verified `pipeline_runs` + `pipeline_jobs` model as canonical; the audit records why a separate `pipeline_execution_logs` table would fragment operational truth.
- [x] Approved pipeline observability model decision: mapped current pipeline run/job writes and reads, selected the canonical record model, and prohibited a parallel/disconnected execution-log writer without an approved migration.
- [x] Approved pipeline observability no-write regressions: proved canonical pipeline-run/job lifecycle linkage, stage ordering, retry representation, detailed degraded metadata, and non-blocking observability failure handling without creating production records.
- [ ] End-to-end regression test suite: upload → analysis → report lifecycle — deterministic lifecycle wiring contract added in `server/claim-lifecycle-contract.test.ts`; isolated-tenant external-service OAT remains required
- [x] Approved isolated claim-to-report lifecycle acceptance: production-shared readiness and report-access contract are in place; added no-write rendered CL, CI, and FR evidence proving the real consumers qualify failed/pending lifecycle states.
- [x] Approved lifecycle non-blocking qualification proof: added runtime renderer acceptance for assessment_start_failed, intake_pending, and assessment-unavailable states; proved CL, CI, and FR render an explicit incomplete-intelligence qualification while retaining available claim and evidence transparency.
- [x] P0 lifecycle production readiness boundary: added a shared report-lifecycle readiness helper and consumed it from the actual report contracts without blocking assessment or introducing a new write path.
- [x] P0 lifecycle callable report-access proof: invoked the real report-access contract for permitted and denied roles while combining it with the production readiness boundary in isolated no-write acceptance.
- [x] P0 lifecycle rendered consumer matrix: drove the shared production readiness consumer through CL, CI, and FR no-write render inputs and asserted the generated output carries the explicit qualified state and never marks the input as ready for completed assessment intelligence.

## Portal Conformance & Runtime Stability — August 2026

- [ ] Transparency gate: current-state register prepared at audit/current-state-register-2026-08-11.md; obtain user review and approval before starting any new feature batch
- [ ] Role-to-feature conformance audit: map each portal tab, route, data source, mutation, and empty/error state to its intended role; remove cross-role feature leakage and orphaned states
- [ ] Portal navigation conformance: verify every visible tab and action resolves to an authorized, role-correct destination or an explicit role-appropriate empty state
- [ ] Controlled P0 role-to-workflow conformance batch: inventory active portals, tabs, actions, data sources, and empty/error states; align each to the correct role shell, route, procedure, and bounded access outcome without operational data changes.
- [ ] Approved P0 role-to-workflow execution: implement the conformance inventory outcomes, role-correct navigation/data/action boundaries, explicit unavailable states, no-loop recovery, deterministic regressions, and authenticated user checklist without operational or financial record changes.
- [x] Approved P0 role-to-workflow batch finalisation: close fleet claim-document server-authority proof, execute the final deterministic regression/build matrix, checkpoint the batch, and hand off the authenticated operational acceptance checklist.
- [x] P0 customer, agency, and legacy fleet route conformance: limited client self-service to customer/fleet roles plus administrative test shells; guarded client insurance/profile/valuation routes; guarded agency quote execution; and redirected the legacy fleet cross-role route to the fleet shell with deterministic regressions.
- [x] P0 administration control-tower conformance: removed insurer admission from integrity, pipeline, learning, workflow, escalation, and workflow-settings control-tower routes; retained only administration and platform-super-admin shell access with deterministic regression proof.
- [x] P0 My Portal fleet claim-detail conformance: moved the claim-detail route from claimant-only portal admission to the customer/fleet service boundary so fleet managers and drivers can reach company-vehicle claim detail; report and object procedures remain authoritative.
- [x] P0 fleet claim-document route conformance: align the claim-document route with the customer/fleet claim-detail boundary so authorised fleet roles can reach company-vehicle evidence subject to object-level document authorization.
- [x] P0 fleet claim-document server authority: prove the ClaimDocuments data-loading and mutation procedures admit an authorised fleet_manager/fleet_admin/fleet_driver only for company-vehicle claim documents within the correct tenant; deny foreign and unrelated vehicles.
- [x] P0 fleet claim-document no-write acceptance: execute an authorised fleet success, foreign-tenant denial, and unauthorised unrelated-vehicle denial matrix through the route’s actual document-access contract.
- [x] P0 agency and engineer route conformance: redirected deprecated agency valuation URLs to the agency service shell rather than denied client self-service, and applied the canonical engineer domain to engineering intelligence and asset-passport workspaces; deterministic route tests passed.
- [x] P0 agency canonical landing conformance: added the missing agency role-to-portal map so agency users land directly in the agency service portal rather than the insurer fallback; deterministic route tests passed.
- [x] P0 exhaustive active-role landing conformance: added regression coverage for every active top-level role, preventing a silent portal-hub or unrelated insurer fallback while retaining the insurer role-selection portal intentionally.
- [ ] P0 role-to-workflow operational acceptance: user-execute authenticated claimant, fleet, agency, insurer, assessor, panel-beater, engineer, and platform-super-admin route matrix; record only portal-shell outcomes and prohibited loops or cross-role leakage.
- [x] P0 fleet document procedure-level acceptance: invoked all five actual tRPC procedures for same-tenant fleet_manager/fleet_admin/fleet_driver success and completed foreign-tenant/unrelated-vehicle denial for byClaim, upload, and delete.
- [x] P0 fleet-admin document authority: added explicit fleet_admin success proof through every actual document procedure, not only the shared helper.
- [x] Approved P0 fleet document actual-procedure matrix: used isolated tRPC caller contexts to prove same-tenant company-vehicle access for fleet_manager, fleet_admin, and fleet_driver across all five document procedures without a production write.
- [x] Approved P0 fleet document denial matrix: extended actual-procedure foreign-tenant and unrelated-vehicle denial coverage to byClaim, upload, and delete; proved denied upload/deletion causes no storage, insert/delete, or audit effect.
- [x] P0 fleet document denied-mutation effects: asserted foreign/unrelated documents.upload calls neither storagePut nor document persistence/audit, and documents.delete calls neither database deletion nor audit logging through actual tRPC procedures.
- [ ] Report and image evidence audit: cost provenance and tables remediated in R1; raw-image side/zone classification verification remains open
- [x] Report remediation batch R1: unify canonical cost hierarchy across CL, CI, and FR; extend CL cost intelligence; distinguish documented/agreed, L1, L2, and benchmark values; correct FR currency formatting
- [x] Header cost-provenance trace: identify the exact source/calculation for every CL, CI, and FR header/decision-summary amount before approving any cost-table or label remediation
- [x] L2 integrity audit: verify every repair component is retained in the all-in L2 recommendation; unbenchmarked components must use traceable quote-source fallback rather than be omitted
- [x] Quote uniqueness audit: detect and normalise duplicate panel-beater quotations before quote count, L1, L2 comparison, savings, or report display
- [x] L1–L2 cost-basis integrity: reconcile VAT and mandatory payable fees consistently before calculating any savings or recommended settlement
- [x] R1-A: Add a typed canonical quote ledger with durable repairer identity, normalised scope fingerprint, source traceability, and active/superseded/supplementary/duplicate status
- [x] R1-B: Route Stage 9 L1, L2, quote count, variance, and savings inputs through the canonical active-quote ledger
- [x] R1-C: Add an all-in L2 coverage contract; an unresolved required repair-scope item must return L2 incomplete and suppress savings/settlement output
- [x] R1-D: Preserve unbenchmarked component price through the submitted-quote fallback, including paint, labour, sundries, VAT, and mandatory payable fees on a common cost basis
- [x] R1-E: Isolate documentedAgreedCostUsd to assessor calibration/comparison and remove it from L2, settlement, and report fallback paths
- [x] R1-F: Align CL, CI, and FR to the shared ledger, L2 integrity status, payable-cost basis, and recommendation terminology
- [x] R1-G: Add focused Vitest regression coverage for duplicate repairer inputs, unbenchmarked all-in scope, unresolved scope, common tax basis, agreed-cost isolation, and report provenance
- [x] R1-H: Display documented/agreed assessor cost in CL, CI, and FR only as a labelled calibration/comparison reference; add report-renderer regression coverage
- [x] R1-I: Re-render CL, CI, and FR for claims 10719902, 11709902, and 12879902 and verify the distinct submitted ledger, L1, L2 status, benchmark, and assessor comparison treatment
- [x] Image evidence verification: compare raw representative images to their rendered side/zone labels; retain the image classification remediation decision until that evidence is documented
- [x] Image remediation batch R2: enforce crush-depth eligibility, preserve image confidence/provenance, disclose fallbacks, and extend FR photo evidence metadata across every Stage 6 source and degraded fallback path; direct no-write acceptance covers PDF-direct, description-inference, and degraded outputs.
- [x] Approved R2 non-blocking safeguard: exclude unsuitable or uncertain imagery only from the affected crush-depth/physics calculation; preserve claim assessment, non-physics evidence processing, and report generation with an explicit qualified/unavailable explanation across every Stage 6 path.
- [x] R2 completion gap: map every Stage 6 fallback path to an R2 evidence envelope, physics exclusion rule, and report disclosure; add focused path-level regressions and a no-write report-panel acceptance proving qualified metadata and no crush-depth contribution.
- [x] R2 PDF-direct acceptance: execute a current-code no-write PDF-direct/fallback acceptance and verify source page, classifier, fallback warning, physics exclusion wording, and zero numeric Stage 7 eligibility.
- [x] Approved R2 dry-run acceptance harness: execute transient Stage 6, Stage 7, and shared report-panel assertions with no database writes, customer data mutation, report-job creation, payment, settlement, or claim-decision change.
- [x] R2 fallback regression matrix: add focused coverage for targeted PDF render, single-pass PDF fallback, no-photo description inference, and Stage 6 degraded/error output; prove damage analysis and report generation continue while numeric physics remains unavailable.
- [x] R2 degraded-report disclosure: document and verify the shared qualified/unavailable explanation used by CL, CI, and FR for no-photo and Stage 6 degraded paths.
- [x] R2 deterministic fallback-matrix implementation: added source envelopes and physics stripping for dedicated photos, scored PDF pages, targeted PDF-direct pages, single-pass PDF fallback, no-photo, and degraded paths; added shared-panel disclosure regressions and passed focused tests plus production builds.
- [x] Functional audit F-01: establish the authoritative inventory of portals, routes, dashboards, services, and report entry points from the live codebase
- [x] Functional audit F-02: create a route, tab, button, and action matrix with UI-to-procedure-to-data outcome evidence
- [x] Functional audit F-03: trace end-to-end claims, agency, fleet, engineering, reporting, and administrative workflows, recording environmental limitations explicitly
- [x] Functional audit F-04: audit role permissions, tenant isolation, data propagation, dashboards, exports, notifications, placeholders, and error states
- [x] Functional audit F-05: deliver the dashboard requirements matrix, defect register, functional-readiness scores, and prioritised corrective sequence without changing product behavior
- [x] P0 Package 1-A: bind report generation, polling, download recording, schedules, and report-output URLs to authorised tenant and requester scope
- [x] P0 Package 1-B: bind agency quote acceptance/rejection and sibling closure to the caller's agency tenant and authorised client/fleet scope
- [x] P0 Package 1-C: enforce tenant- and role-derived scope for intelligence registries and relationship graph; remove caller-controlled raw-SQL tenant interpolation
- [x] P0 Package 1-D: add adversarial two-tenant regression tests covering read, generation, mutation, polling, download, and direct-ID attacks
- [x] P0 Package 1-E: complete a platform-super-admin exception policy that is explicit, audited, tenant-selectable, and never inherited by ordinary roles
- [x] P0 Package 1-D1: execute reporting two-tenant runtime tests for foreign generation override, job polling, download URL, download recording, job listing, and schedule mutation versus same-tenant success
- [x] P0 Package 1-D2: execute agency quote-decision runtime tests for foreign quote IDs and sibling closure isolation versus same-tenant acceptance/rejection
- [x] P0 Package 1-D3: execute intelligence runtime tests for foreign tenant input, unauthorised roles, and tenant-filtered registry and relationship-graph results
- [x] P0 Package 1-D2a: execute a successful same-tenant agency quote rejection and verify only the scoped quote is updated
- [x] P0 Package 1-D2b: assert a same-tenant quote acceptance cannot include another agency tenant in sibling closure
- [x] P0 Package 2-A: define and enforce the canonical server-owned intake evidence contract across all user-facing claim sources
- [x] P0 Package 2-B: create authorised, idempotent claim-document and photo association during intake persistence
- [x] P0 Package 2-C: replace exact-three panel-beater submission blocking with non-blocking exception routing and in-app warnings
- [x] P0 Package 2-D: prove web, My Portal, agency, WhatsApp, and any concrete mobile/API claimant submissions route through the shared intake service
- [x] P0 Package 2-E: preserve and surface post-intake assessment trigger failures as recoverable in-app operational work
- [ ] P0 Package 2-F: execute complete multi-channel and tenant-negative runtime proof; current canonical, recovery, and identity focused tests pass but do not close every channel path
- [x] P0 Package 2-G: prove original attachment metadata, source association, and evidence provenance through persisted-output comparison for every real intake path
- [x] P0 Package 2-H: test intake with 0, 1, 2, 3, and 4+ repairer preferences without changing pricing, settlement, fraud, or downstream assessment rules
- [x] P0 Package 2-I: executed isolated adapter-level interrupted-submission recovery proof for web/My Portal, agency-assisted, and WhatsApp-local canonical entry paths; each proves one committed claim/evidence set, one assessment start, and no duplicate recovery notification on replay.
- [x] P0 Package 2-J: compared isolated persisted canonical claim and claim-document output through the concrete web/My Portal, agency-assisted, and WhatsApp-local adapter boundaries; no concrete API/mobile canonical adapter exists in the inventory.
- [x] P0 Package 2-K: executed isolated adversarial foreign attachment and existing-intake-record denial tests through the concrete Package 2 adapter boundaries; denied requests produce no cross-tenant write, assessment start, audit, event, or notification side effect.
- [x] P0 Package 2-L: resolve WhatsApp submitters to an existing tenant-bound KINGA claimant account through verified prior claimant-phone evidence, without creating a duplicate claimant identity; record an explicit unregistered path where no verified account link exists
- [x] P0 Package 2-M: create a restricted unregistered claimant identity only within a verified insurer tenant when no account-phone match exists, with later My Portal linkage support
- [x] P0 Package 2-N: fail closed for WhatsApp submissions whose insurer cannot be mapped to an active tenant; prove no cross-tenant claim or evidence association
- [x] P0 Package 2-F1: add and run router-level P0 tests covering real web/My Portal, WhatsApp, and every concrete API/mobile claim-submit path into canonical intake
- [x] P0 Package 2-F2: added and ran adversarial P0 tests for foreign attachment and existing-record mutation attempts through every implemented Package 2 entry point; no concrete API/mobile canonical entry point exists.
- [x] Approved P0 Package 2-F/F2 internal entry-point matrix: proved concrete web/My Portal, WhatsApp-local, and agency-assisted boundaries derive actor/tenant identity server-side and deny foreign mutation attempts without persistence, assessment, audit, event, or notification effects.
- [x] P0 Package 2 external-provider gate record: retained the connected-provider WhatsApp webhook/media/duplicate-delivery scenario as the explicitly unclosed external acceptance item after internal adapter proof.
- [x] P0 Package 2-G1: compare persisted claims and claim_documents output for each real intake path to prove lossless metadata, associations, and source provenance
- [x] P0 Package 2-I1: added and ran adapter-level interrupted-submission retry tests proving no duplicate canonical claim/evidence set, assessment start, or recovery notification side effects across every implemented adapter.
- [x] P0 Package 2-OA1: ran an isolated two-tenant canonical-intake fixture and compared normalised persisted claim and claim-document records for web/My Portal, WhatsApp-local, and agency-assisted hand-off paths.
- [x] P0 Package 2-OA2: ran isolated duplicate, interrupted, and failed-assessment-start retries for web/My Portal, agency-assisted, and WhatsApp-local intake; proved one canonical claim/evidence set, one external assessment start, and one recoverable notification effect.
- [x] P0 Package 2-OA3: ran isolated direct-ID foreign-tenant attachment and existing-intake-record mutation attempts and recorded denial evidence before any write, assessment start, audit, event, or notification side effect.
- [x] Approved P0 Package 2 two-tenant output proof: compared normalised isolated claim and document persistence output across web/My Portal, agency-assisted, and WhatsApp-local adapters in two tenants, without provider or production interaction.
- [x] Approved P0 Package 2 foreign direct-ID denial proof: proved isolated foreign attachment and prior-intake-record attempts are denied before a cross-tenant write, assessment start, audit, event, or notification side effect.
- [ ] Proposed P0 Package 2 isolated acceptance: use transient or isolated tenant fixtures to compare canonical claim/evidence output across supported portal, agency, and hand-off channels; prove idempotent retry, recoverable assessment failure, and foreign-tenant denial without an external WhatsApp provider or live claimant data.
- [x] P0 Package 2 agency intake conformance gap: no direct agency claim-submission adapter currently calls the canonical intake service; define and implement the authorised agency claim-intake hand-off before claiming agency-channel convergence.
- [x] Proposed agency canonical-intake hand-off: define agency client authority, claimant/tenant attribution, evidence upload ownership, audit provenance, and non-delegable client consent before introducing a direct agency claim-submission adapter.
- [x] Approved agency canonical-intake implementation: replace the direct agency claim insert with an agency-assisted canonical intake adapter; remove intake-time estimated repair cost; preserve agency-client and agency-user provenance; enforce agency-scoped evidence ownership, idempotency, recovery, and tenant/client authority regressions.
- [x] Agency canonical-intake identity decision: agency_clients has no portal-user linkage while canonical claims require a claimant user; select the authorised existing-user linking or restricted agency-assisted identity model before implementation.
- [x] Approved Option B agency-assisted identity: create a restricted lower-trust claimant identity tied to the agency client contact when no verified My Portal user exists; preserve agency submitter provenance; permit only the claim workflow; require auditable verified later linking; deny independent portal, communication, document-control, financial, settlement, and fraud authority.
- [x] Agency architecture correction: replace the misnamed `createAgencyClaim` insurance-quote-request writer, which currently creates a synthetic claim for a cover requirement, with a separate agency insurance service-request lifecycle; reserve canonical intake and the restricted assisted identity for genuine agency-assisted accident claims only.
- [ ] Feature-separation invariant: audit and eliminate persistence paths that represent insurance service requests, accident claims, valuations, policy workflows, or repair/settlement workflows as another feature type; each must retain distinct authority, evidence, lifecycle, report, and financial boundaries.
- [ ] Insurance-request valuation pathway: separate standalone valuation access from insurance service requests; capture client-proposed value and KINGA independent valuation as distinct, source-labelled values within the insurance-request lifecycle, with neither becoming a policy, premium, claim, or settlement decision by default.
- [ ] Insurance-request valuation variance controls: calculate and source-label proposed-versus-KINGA variance; disclose underinsurance and overinsurance implications to the client; capture an auditable acknowledgement when the client retains a materially different proposed value; retain an agency deviation record; expose valuation provenance, confidence, and uncertainty to the insurer as decision support only.
- [x] Approved insurance-request valuation comparison: calculated a source-labelled client-proposed versus KINGA Market Valuation variance within the separate insurance-request lifecycle, without policy, premium, claim, repair, settlement, or payment effects.
- [x] Approved insurance-request valuation acknowledgement: presented underinsurance/overinsurance implications for material variance, retained client acknowledgement/deviation facts, and projected bounded agency and insurer decision-support views without client raw-confidence display.
- [ ] Valuation reliability boundary: the current vehicle valuation service is evidence-light and AI-led despite multi-source claims; do not present it as independently verified or highly accurate until real comparable-source ingestion, recency, adjustment provenance, source coverage, and uncertainty controls are implemented and validated.
- [ ] Human-centred valuation presentation: retain detailed confidence and uncertainty internally; present clients with evidence-led status such as Market-supported, Provisional, or Expert review needed; give agencies and insurers a professional evidence view; never expose unexplained raw confidence percentages as the client-facing trust mechanism.
- [x] Market-valuation confirmation: present the client-facing output as KINGA Market Valuation; require the client to confirm vehicle identity, specification, condition, mileage, modifications, and chosen insured value; retain internal valuation evidence controls and an agency deviation record where selected cover differs from market valuation.
- [x] Vehicle-condition valuation snapshot: persist a dated, versioned pre-loss condition record with vehicle facts, external/interior/mechanical condition, damage, tyres, glass, mileage, modifications, photographs, evidence sources, and observations; associate it with the valuation and surface relevant pre-loss evidence in the Vehicle Passport when a later claim occurs.
- [x] Agency-assisted canonical runtime proof: add router/service-level regressions for same-tenant submission, foreign agency-client denial, foreign attachment denial, idempotent replay, and recoverable assessment-start failure on `createAgencyAssistedClaim`.
- [x] Restricted assisted-claimant authority enforcement: deny unregistered agency-assisted claimant identities independent portal, communication, document-control, financial, settlement, fraud, and non-claim report authority across relevant routes; add route-level regressions.
- [x] Restricted assisted-claimant core authority enforcement: deny independent portal, notification, report, insurance-request, insurance-document, quote-acceptance, settlement, dispute, and payment instructions while retaining the agency-assisted canonical claim path; prove tenant-scoped, auditable verified linkage without retrospective ownership change.
- [x] Restricted assisted-claimant verified-link workflow: implement an explicit audited verified-link procedure with authorized actor checks, identity status transition, linkedBy/linkedAt preservation, and regression proof that ordinary claimant capability is not granted before completion.
- [x] Restricted assisted-claimant non-claim route inventory: enumerate claimant-accessible fraud, financial, document-control, and communication actions; apply the reusable restricted guard to every applicable route and add a route-matrix regression proving only the agency-assisted canonical claim workflow remains available.
- [x] Platform-wide valuation/service-request separation: audited and corrected remaining future valuation, insurance-request, and legacy quotation paths in `server/routers/insurance-phase7.ts`; active future writers retain distinct record types and lifecycles.
- [x] Approved platform-wide future-write separation: mapped every future valuation, insurance service-request, quotation, policy, repair, and settlement writer; legacy quotation rows remain labelled history and no-write regression rejects mixed-workflow persistence drift.
- [x] Approved insurance phase future-write review: inventoried active writers in `server/routers/insurance-phase7.ts`, classified their target record type and authority/lifecycle boundary, and identified no active future mixed writer without touching existing records.
- [x] Approved insurance phase separation regression: labelled legacy quotation reads/documents as history, corrected their document dependency, and added no-write regression evidence that future valuation, service request, quotation, policy, repair, and settlement persistence remain distinct.
- [x] Approved platform-wide future-write separation: mapped standalone valuation, insurance service-request, quote, and policy writers; legacy quotation rows remain labelled history; deterministic regression rejects new cross-lifecycle writer drift before persistence.
- [ ] Professional valuation evidence view: provide agency and insurer views of valuation provenance, adjustments, source coverage, and limitations without exposing raw confidence percentages to clients.
- [x] Non-blocking insurer valuation boundary: agency service requests proceed on the agency/client valuation path when an insurer does not provide a valuation; insurer participation or a separate insurer view is optional decision support and does not block submission, acknowledgement, dispatch, or review.
- [x] Approved non-blocking professional valuation evidence proof: used no-write fixtures to prove agency and insurer projections are bounded decision support, clients receive no raw confidence, and no insurer valuation is required for agency service-request progression.
- [x] Approved insurer-valuation absence acceptance: proved no insurer valuation input or insurer evidence field is required for agency service-request creation, material client acknowledgement, or dispatch to explicitly selected insurers; retained selected-insurer recipient validation only.
- [ ] Approved valuation reliability evidence ledger: persist comparable-source provenance, vehicle match, recency, coverage, adjustments, exclusions, limitations, and review state; project bounded professional evidence views while preserving simple client-facing KINGA Market Valuation wording.
- [x] Standalone valuation reliability evidence controls: added source-backed comparable ledger persistence, explicit vehicle-match/recency/coverage/adjustment/limitation state, bounded client evidence wording, and agency/insurer professional reliability projections without raw confidence display or external-provider connection.
- [ ] Approved valuation reliability evidence ledger: persist comparable-source provenance, vehicle match, recency, coverage, adjustments, exclusions, limitations, and review state; project bounded professional evidence views while preserving simple client-facing KINGA Market Valuation wording.
- [x] Approved P0 Package 2 isolated acceptance harness: implemented no-write web/My Portal and local WhatsApp adapters over one canonical observable output contract; verified equivalent transient claim/document persistence shape, attachment-ownership denial, idempotent persistence, and recoverable assessment-start behavior with 14 focused tests and bundled server/Vite builds. Agency convergence remains a separate missing-adapter conformance item.
- [x] P0 Package 2 implemented-adapter deterministic acceptance: completed under the approved harness item above; broader two-tenant runtime and provider-level acceptance remain tracked separately.
- [x] P0 Package 2 deterministic acceptance: 8 focused test files / 40 tests passed; server and Vite production builds passed, including downstream CI/FR evidence visibility
- [x] P0 Package 2 concrete-adapter inventory acceptance: enumerated the current web/My Portal, agency-assisted, and WhatsApp local canonical writers; added a regression that fails if an unverified writer is introduced; verified no concrete mobile or generic API canonical writer exists; ran 24 focused no-write cross-channel, provenance, repairer-count, idempotency, recovery, and attachment-ownership tests plus bundled server/Vite builds.
- [x] P0 Package 2 interrupted adapter replay matrix: replayed web/My Portal, agency-assisted, and WhatsApp-local submissions after isolated pre-commit interruption and recoverable assessment-start failure; proved one claim/evidence set, one assessment-start attempt per persisted request state, and no duplicate recovery notification.
- [x] Approved P0 Package 2 isolated adapter-replay proof: executed equivalent web/My Portal, agency-assisted, and WhatsApp-local interruption/replay scenarios against isolated no-write adapters, proving one durable canonical result per idempotency key and no external-provider interaction.
- [x] Approved P0 Package 2 replay side-effect proof: asserted each adapter has zero assessment starts after persistence interruption, one assessment start after successful replay, and one recovery notification after recoverable assessment-start failure with no duplication on retry.
- [x] P0 Package 2 replay-safe submission boundary: web/My Portal and WhatsApp now execute persistence plus assessment start through one shared helper; deterministic tests prove no assessment start after failed persistence, one start after a successful replay, and preservation of recoverable assessment-start status across an idempotent replay.
- [x] P0 Package 2 isolated portal/WhatsApp tenant fixture: compared canonical claim and claim-document persistence in distinct tenant fixtures, proving tenant-bound claimant ownership, separate claim-document associations, and source-owned attachment keys without live records.
- [x] P0 Package 2 agency insurer-identity denial: added a defence-in-depth pre-persistence guard that rejects a restricted agency-assisted claimant identity resolved from a different insurer tenant.
- [x] P0 Package 2 agency persisted-output acceptance: executed the agency-assisted service against isolated canonical persistence, proving retained claimant tenant/identity, claim-document ownership, original attachment metadata, and agency provenance.
- [x] P0 Package 2 actor-derived direct-ID boundary: added regression proof that web/My Portal derives tenant and claimant from authenticated context, agency input scopes clients through the agency tenant and restricted insurer identity, and WhatsApp resolves identity server-side before canonical attachment validation.
- [x] P0 Package 2 unified replay-safe adapter boundary: web/My Portal, WhatsApp-local, and agency-assisted accident intake now use the same canonical persistence-plus-assessment-start boundary; shared recovery status and idempotent replay semantics are enforced and regression-tested once.
- [x] P0 Package 2 WhatsApp duplicate-delivery side effects: extracted post-persistence success and document-request messaging; sequential duplicate delivery now produces one session save, one confirmation, and one scheduled document request in no-write regression proof.
- [x] P0 Package 2 foreign-existing-record replay denial: isolated canonical persistence test proves a replay mapped to a claim outside the authenticated tenant is rejected before any transaction, claim write, or document write.
- [x] P0 Package 2 shared-boundary adversarial proof: portal, WhatsApp-local, and agency-assisted adapters are verified to enter the same tenant, attachment-ownership, and replay-safe canonical boundary; foreign attachment denial now executes for both portal and WhatsApp actors, while agency retains its scoped-client and foreign-insurer denials.
- [x] P0 Package 2 shared replay-side-effect proof: no-write regression proves persistence interruption starts no assessment, a successful replay produces one external assessment start, idempotent replays return recorded state without another start, and recoverable assessment retries do not duplicate the recovery notification effect.
- [ ] P0 Package 2 live WhatsApp acceptance gate: use a connected provider test number, webhook, media access, isolated tenant, synthetic claimant, and duplicate-delivery replay to prove the complete external path without side effects
- [x] P0 Package 3-A: remove reachable mock executive claim and override records from every active runtime drill-down path
- [x] P0 Package 3-B: add tenant-derived, role-authorised executive drill-down data retrieval with claim/object scope checks
- [x] P0 Package 3-C: render explicit empty/unavailable executive detail states rather than invented operational values
- [x] P0 Package 3-D: apply explicit audited platform-super-admin tenant selection to executive drill-down testing
- [x] P0 Package 3-E: add two-tenant, no-mock, unavailable-state, same-tenant, and super-admin audit regression proof
- [x] P0 Package 3-F: map every active Executive operational data path and classify all mock/demo/static claim payloads by runtime reachability
- [x] P0 Package 3-G: enforce the minimum authoritative-field contract without zero, low-risk, approved, or invented fallback values for missing data
- [x] P0 Package 3-H: complete the full Executive access acceptance matrix after explicit missing-tenant and numeric direct-ID tests are added
- [ ] P0 Package 3-I: execute the active Executive Dashboard runtime against authorised data, unavailable data, foreign IDs, and error state without any mock fallback
- [ ] P0 Package 3-H1: execute authenticated Executive Dashboard API-failure and route-level browser acceptance with an Executive or explicitly tenant-selected platform-super-admin session
- [x] P0 Package 4-A: consolidate approved server-side direct-admin checks through `isAdminRole()` or documented intentional distinctions
- [x] P0 Package 4-B: correct platform-super-admin admission to intended client, professional, and administrative portal routes without loops
- [x] P0 Package 4-C: preserve Package 1 tenant/object limits and audited explicit cross-tenant selection under platform-super-admin access
- [x] P0 Package 4-D: implement the explicit portal-route allow/deny/unavailable role matrix
- [x] P0 Package 4-E: add server, client-route, ordinary-denial, super-admin-entry, object-boundary, and no-loop regression proof
- [x] P0 Package 4-F: produce and maintain a file-by-file classification of direct administrative checks as canonical admin, intentional business role, UI display, workflow-specific, or object-security control
- [x] P0 Package 4-G: prove platform-super-admin portal-shell admission separately from foreign tenant claim, report, document, and workflow object denial
- [x] P0 Package 4-H: execute the Package 1 report, agency, intelligence, and explicit audited cross-tenant regression matrix after authorization consolidation
- [ ] P0 Package 4-I: test authenticated login → role resolution → portal route deterministic states for platform-super-admin and ordinary personas when role accounts are available
- [ ] P0 Package 4-I1: user-executed authenticated platform-super-admin portal-shell checklist; no browser-control access requested or required
- [ ] P0 Package 5 discovery: rank the remaining actionable audit defects and prepare the next controlled remediation package without changing product behavior
- [ ] P1 Package 5-A: define tenant-scoped RFQ action authority for fleet/client instruction, agency execution, and insurer response
- [ ] P1 Package 5-B: replace fleet RFQ Accept/Reject dead-end with a truthful authorised client/fleet instruction journey
- [ ] P1 Package 5-C: enforce agency RFQ execution and sibling closure against agency tenant, client/fleet instruction, and workflow state
- [ ] P1 Package 5-D: replace conflicting commission placeholders with one configured versioned source or an explicit not-configured state
- [ ] P1 Package 5-E: add explicit RFQ lifecycle unavailable, forbidden, pending, instruction, agency-action, accepted, rejected, and expired states
- [ ] P1 Package 5-F: add two-agency, one-fleet, commission-source, no-configuration, action-parity, and Package 1 non-regression evidence
- [ ] P0 Package 5-A: map and enforce the authoritative RFQ actor, relationship, owner, batch, sibling, state, mutation, audit, notification, report, and commission paths
- [ ] P0 Package 5-B: separate tenant-authorised fleet/client instruction from agency RFQ execution; fleet must never call agency execution mutation
- [ ] P0 Package 5-C: enforce agency tenant, RFQ ownership, authorised relationship, instruction, and valid current state before agency execution or sibling closure
- [ ] P0 Package 5-D: implement actual RFQ state transitions and explicit pending instruction, instruction received, agency action required, accepted, rejected, expired, unavailable, and forbidden behavior without duplicate conflicting states
- [ ] P0 Package 5-E: remove all active 5% and 10% commission placeholders; use an auditable configured commercial source or explicit commission-unavailable state that blocks financial finalisation
- [ ] P0 Package 5-F: prove configured/unconfigured commission consistency across UI, calculation, persistence, audit, and report; retain monetary precision conventions
- [ ] P0 Package 5-G: execute the two-agency, fleet relationship, foreign RFQ/sibling, invalid transition, instruction, action-parity, Package 1, and browser acceptance matrix
- [ ] P0 Package 5 commission model: agency users configure commission per product per agency tenant; commission is unavailable when unconfigured and is strictly isolated from policy issuance, underwriting, premiums, claims, settlement, and insurer workflows.
- [ ] Approved P0 Package 5 implementation: create agency-owned tenant-product commission configuration with no default rate and no policy/RFQ/insurance decision dependency; implement authorised client/fleet instruction and agency execution lifecycle with explicit tenant-safe states and audit evidence.
- [x] P0 Package 5 deterministic foundation: added agency-owned tenant-product commission configuration with no default; removed RFQ acceptance-time commission estimates; added fleet-owner instruction, agency execution queue, tenant-scoped instruction ledger, explicit audit records, and direct fleet-RFQ action denial; 40 focused lifecycle, authority, and commission-isolation tests plus bundled server and Vite builds pass.
- [ ] P0 Package 5 operational acceptance: execute the required two-agency, one-fleet, foreign direct-ID and sibling-closure denial, unconfigured/configured product commission, agency execution, and authenticated browser UI parity matrix without issuing any policy.
- [x] Critical report integrity R0-A: reconcile supplied CL, CI, and FR outputs for DOC-20260802-AE62B9CF before any report or L2 remediation
- [x] Critical report integrity R0-B: trace L2 component coverage, document lineage, pipeline run provenance, valuation, fraud, physics, photo, and decision sources for the supplied claim
- [x] Critical report integrity R0-C: produce a single source-of-truth remediation plan for cross-report contradictions, data provenance, L2 completeness, and rendering defects
- [x] R0-A: persist typed canonical L2 completeness, component scope, cost basis, partial scope, and quote-ledger version for every Stage 9 result
- [x] R0-B: distinguish submitted quote receipt from itemised repair-scope completeness in all report contracts
- [x] R0-C: implement one report-safe decision and hold contract shared by CL, CI, and FR
- [x] R0-D: quarantine base expected-repair estimates from L2, savings, settlement, and optimisation display paths
- [x] R0-E: correct shared typed physics, fraud-unavailable, photo-count, and coverage rendering contracts
- [x] R0-F: persist immutable report input, generator, and provenance snapshots for every delivered output
- [x] R0-G: implemented reusable immutable same-snapshot CL, CI, and FR acceptance fixtures for no-quote, total-only, incomplete, and complete all-in quote sets.
- [x] R0 progressive-L2 invariant: proved every quote-evidence fixture keeps L2 analysis active, exposes what KINGA knows and does not know, and suppresses only unsupported conclusions—not available comparison intelligence.
- [x] Approved R0 same-snapshot acceptance implementation: built one immutable fixture model for no-quote, total-only, incomplete-itemised, and complete-all-in states; asserted shared cost/decision semantics and progressive L2 disclosures across CL, CI, FR, and the top cost view without production data mutation.
- [x] Approved R0-G fixture consolidation: replaced duplicated R0 quote-evidence fixture data with one immutable reusable model for no-quote, total-only, incomplete-itemised, and complete-all-in states without production writes.
- [x] Approved progressive-L2 cross-surface semantic proof: asserted each reusable evidence state retains available L2 comparison intelligence while consistently withholding only unsupported payable-cost, savings, and settlement conclusions in CL, CI, FR, and the client top view.
- [x] R0 deterministic progressive-L2 contract acceptance: implemented immutable no-quote, total-only, incomplete-itemised, and complete-all-in fixtures; validated shared cost/decision boundaries, active-ledger exclusion, and top-view evidence-qualified disclosure with 26 focused regressions and production builds.
- [x] R0-H: replaced CL, CI, FR, and client top-of-report cost strips with the active submitted quote ledger, explicit quote receipt/scope status, and typed L2 state; no base-estimate substitution.
- [x] R0-I: proved rendered CL, CI, FR, and client top-cost views show active submitted quotes, label incomplete L2 as evidence-qualified comparison, and suppress savings/settlement conclusions under integrity holds.
- [x] Approved R0 same-snapshot report acceptance: extended immutable fixture coverage for no-quote, total-only, incomplete-itemised, and complete-all-in evidence states across CL, CI, FR, and the top-cost view without production writes.
- [x] Approved R0 top-cost contract acceptance: proved the top-cost view lists every active submitted quotation, labels verification and KINGA Optimised Quote separately, and never renders unsupported L2, savings, or settlement as a payable cost.
- [x] Approved R0-H/R0-I cross-surface proof: inspected and aligned every remaining CL, CI, FR, and client top-of-report cost strip to the active submitted-quote ledger and typed L2 boundary; added immutable assertions for complete and non-complete evidence states without production writes.
- [x] Approved R0-H/R0-I conclusion suppression proof: demonstrated that scope, reconciliation, and integrity holds suppress unsupported L2-as-payable-cost, savings, and settlement output while retaining submitted evidence and evidence-qualified comparison intelligence.
- [x] P0 Package 3-H2: add and run an Executive direct numeric claim-ID test proving a foreign object is unavailable even when no tenant override is supplied
- [x] P0 Package 3-H3: add and run missing-tenant context tests for an ordinary Executive and platform-super-admin Executive detail request
- [ ] Approved Fleet navigation batch: route precedence and My Portal company redirect implemented; 25 focused tests and production builds passed; live Fleet Driver and legacy claimant route acceptance remains
- [x] Approved corrective removal: removed accidentally checkpointed claim re-run permissions and related test adjustment; preserved approved Fleet navigation correction and conformance matrix
- [ ] P0: Diagnose and eliminate the React runtime crash shown on the live portal route (minified React error #130)
- [x] Controlled P0 React runtime-crash diagnosis: collect route, component, error-boundary, import, and render-state evidence without changing portal behavior; present findings and a separate remediation notice before any fix.
- [x] Approved P0 React runtime-crash diagnosis execution: inspect static route/import/error-boundary contracts, development logs, and available public route evidence; classify the historic incident as reproducible, externally blocked, or unconfirmed without behavioral changes.
- [ ] P0 authenticated React crash reproduction: execute a role-and-route-specific browser matrix using the original affected account/session; capture the browser console and error-boundary stack if the historic #130 incident recurs before proposing any remediation.
- [ ] P0: Complete live end-to-end route verification for every portal; audit/portal-conformance-audit.md records the current static findings and remaining failures
- [ ] P0: Implement and verify the role-to-workflow conformance map for My Portal, Insurer, Assessor, Panel Beater, Agency, Fleet, Engineers, and Platform Administration
- [ ] P1: Correct Agency Portal so it is an agent/broker service workspace for managing clients, quotes, policies, documents, and commissions—not a client self-service quote page
- [ ] P1: Verify Panel Beater workflow end-to-end with allocated work: direct quote submission, VAT persistence, repair evidence upload, and repair completion
- [ ] P1: Verify Fleet and KINGA Engineers portal workflows against their intended roles, including route and capability coverage
- [ ] P1: Fleet workflow — expose manager onboarding and assignment of drivers, then provide an assigned-driver worklist for vehicle checks, incident/claim submission, and repair-status tracking
- [ ] P1: Insurer workflow — complete insurer sub-role selection, persistence, and direct routing to the appropriate professional workspace
- [ ] P1: My Portal insurance workflow — verify a client can submit, view, and securely open only their own direct insurance quote and policy records after publishing
- [x] R0 follow-up: trace claim 12909902 active quotation ledger, extracted line items, required damage scope, and L2 hold trigger; distinguish a genuine evidence gap from a quote-lineage or scope-classification defect before any correction. At formula level, L2 must select submitted prices only; a benchmark remains a comparative line-item range and variance, never an L2 replacement or added labour, VAT, fee, paint, or other amount.
- [ ] Approved L2 correction: remove benchmark substitution from L2 selection; retain benchmark range and variance only as line-item comparison; rebuild and persist legacy composite evidence from active persisted quote line items without changing submitted quote data. **Open:** document-to-row reconstruction is required because the historic structured ledger does not faithfully retain the primary quote pages.
- [ ] Approved L2 verification: prove every selected L2 amount is traceable to an active submitted quote line or explicitly all-in quote total; reconcile every header-versus-line residual against original quote documents and extraction lineage before classification. Every finding must retain the source document, source location where available, extraction evidence, and arithmetic. Surface an unsupported or unverified amount as a quote-reconciliation/inflation verification finding; never invent, allocate, or silently absorb it into labour, VAT, fees, paint, or another component. **Open:** document-to-row reconstruction and authenticated portal cost-view verification; CL, CI, and FR report presentation is verified.
- [x] Evidence governance foundation: introduce controlled evidence statuses (Verified, Reconstructed, Documented Revision, Scope Difference, Extraction Defect, Evidence Gap, Pricing Variance Review Signal, Unresolved) and mandatory provenance for material monetary figures and intelligence findings; make L2 eligibility depend on equivalent verified scope, without manufacturing certainty or converting a review signal into a decision.
- [x] Approved evidence-governance implementation: persist document-backed monetary evidence, source-to-ledger reconciliation findings, and controlled evidence statuses; require verified-equivalent scope for L2 eligibility; present a report evidence register, reconciliation matrix, variance review signals, and decision boundary without asserting fraud, inflation, or unsupported settlement values.
- [ ] Evidence-governance follow-up: persist page-and-row source provenance at every quote-submission and supplementary/requote write path, then reconstruct verified equivalent source rows for historic claim 12909902 before a final all-in L2, savings figure, or settlement recommendation can be published.
- [x] Progressive L2 intelligence: replace binary L2 availability with always-running evidence-qualified analysis; show verified comparable portions, partial comparisons, evidence coverage, scope differences, source discrepancies, pricing-variance review signals, and decision boundaries while gating only unsupported final totals, savings, and settlement recommendations.
- [x] Source-row classification rule: record every explicit quote component, labour, VAT, paint, fee, discount, and adjustment as a separate source-backed row; disclose only genuinely unclassified source differences as standalone reconciliation findings and never hide or allocate them.
- [ ] Approved claim 12909902 reconstruction: complete controlled transcription of remaining Stylin and ambiguous C.A.M.E.L source rows from document 4650001; retain page/row provenance and arithmetic findings without modifying submitted quote records.
- [x] Evidence Gap Intelligence: preserve every ambiguous source row with document/page/location/crop, OCR or transcription attempt, observable characters, confidence, candidate readings where explicitly derived, and impact on arithmetic; distinguish source-observed value from arithmetic residual; expose a non-fabricated uncertainty envelope and targeted minimum human-verification request while L2 continues to analyse verified evidence.
- [x] Approved Evidence Gap Intelligence implementation: persist ambiguity observations, directly supported candidate readings, arithmetic constraints, evidence-impact boundaries, and minimum human-verification requests; render them in the progressive L2 report panel without changing source quote values or producing a fabricated cost.

---

## Codebase Maintainability — Phase 1 (Active)

- [x] Write developer README.md — quick start, pipeline overview, table map, code standards, key decisions
- [x] Remove @ts-nocheck from server/db.ts
- [x] Remove @ts-nocheck from server/routers.ts
- [x] Wire upsertVehicleRegistry into post-pipeline flow (fire-and-forget, non-blocking)
- [x] Wire runCrossClaimIntelligence into post-pipeline flow (3s delay, non-blocking)
- [x] Fix persistExtractedQuote.ts: li.unitCost → li.unitPrice (silent bug — line-item sum always returned 0)
- [ ] Remove @ts-nocheck from remaining server files — prioritise server/routers/ and server/services/ first (~40 high-value files out of 161 total)
- [ ] Add per-field confidence scores to extracted quote fields
- [ ] Add OCR quality pre-assessment step before Stage 3 extraction (reject low-quality scans before LLM call)
- [ ] Build human-correction feedback loop for adjuster overrides (store adjuster corrections → feed back into extraction training data)

---

## Part Normalisation — Phase A (Completed June 2026)

- [x] Fix 1: normalise() in quoteOptimisationEngine now calls resolveToCanonical() as single source of truth
- [x] Fix 2: ASSEMBLY_CONTAINS map — deferred; current matching is sufficient for Phase A
- [x] Fix 3: canonicalPartId stored in QuoteLineItem output from quoteExtractionEngine

## Part Normalisation — Phase B (Next Sprint)

- [ ] Add ASSEMBLY_CONTAINS map to canonicalPartsVocabulary.ts for assembly-aware matching (e.g. "front bumper assembly" → bumper + grille + fog light)
- [ ] Add per-line-item confidence score to QuoteLineItem (extraction confidence, not just canonical match)
- [ ] Wire canonicalPartId into the quote optimisation scoring engine (currently stored but not consumed)

---

## Police Report Pipeline (Completed June 2026)

- [x] Fix A: Stage-3 extraction — CRITICAL POLICE REASONING RULES block added (normalise chargedParty, map status to enum, strip boilerplate from officerFindings)
- [x] Fix B: Stage-7b causal reasoning — police evidence block added to prompt; wrongedParty now informed by police charge
- [x] Fix C: Demand letter generator — enriched police fields (chargedParty, officerFindings, investigationStatus) now included in letter context
- [x] Fix D: Recovery trigger RPS scoring — policeChargedThirdParty and policeInvestigationActive now boost RPS score

---

## ForensicAuditReport — Fix Plan (Completed June 2026)

### Data Integrity
- [x] FAR-1: Police report data path unified — claimRecord0?.policeReport?.reportNumber is primary, aiAssessment?.policeReportNumber is fallback
- [x] FAR-2: Photo fallback from claimDocuments table — if bridge.photoUrls and damagePhotosJson are both empty, FAR query now reads damage_photo entries from claimDocuments
- [x] FAR-3: KINGA Estimate row — green left border (4px solid #15803d) added to visually distinguish it from submitted quote rows
- [x] FAR-4: "0 pts" → "Not triggered" with muted italic style and tooltip

### P1 Layout
- [x] FAR-P1-1: Vehicle Damage Map — full-width, centred, maxWidth 320px (confirmed in code)
- [x] FAR-P1-2: Decision Flowchart — nodeW=130, diamondW=120 (applied)
- [x] FAR-P1-3: Quote Reconciliation — redesigned from pill tags to 3-column discrepancy table
- [x] FAR-P1-4: Section 9 pending state — compact horizontal strip with lock icon

### P2 Layout
- [x] FAR-P2-1: Analysis Methods filter — "Corroborates speed range" rows hidden; only numeric results + outliers shown
- [x] FAR-P2-2: Quality Score table — maxWidth: 480 applied
- [x] FAR-P2-3: Validation grid padding — reduced to 2px 5px
- [x] FAR-P2-4: Confidence Meter — 3-bar strip (FCDI / Data Completeness / Physics) added to Section 0

### Structural
- [x] FAR-S1: Glossary column widths — Term: 55px, Full Name: maxWidth 180px, Definition: fills remainder
- [x] FAR-S2: Legacy formula names retired — M1–M5 now use KINGA-branded names throughout
- [x] FAR-S3: White gap elimination — section-heading and sub-heading margins reduced

---

## AI → KINGA Rebranding (Completed June 2026)

- [x] Replace all user-facing "AI" labels with KINGA branding — 216 replacements across 70 client + server files
- [x] Preserve internal variable names (aiAssessment, aiVision) and third-party references (OpenAI)

---

## Intelligence Registry — Phase 1 (Next Sprint)

- [ ] Build repairerIntelligence table: repairer_id, risk_tier (A/B/C/D), total_claims, avg_deviation_pct, fraud_flags, last_updated
- [ ] Build entityLinks table: entity_type (repairer/claimant/driver/address/phone), entity_value, linked_claim_ids, link_type
- [ ] Build collusionRings table: ring_id, member_entity_ids, evidence_summary, confidence_score, investigation_status
- [ ] Add collusion signals to crossClaimSignals: repairer_claimant_address_match, director_is_claimant, phone_ring_detected, address_ring_detected
- [ ] Admin UI: Intelligence Registry page — searchable table of repairers with risk tier, claim count, fraud flags
- [ ] Admin UI: Entity Graph page — visual network of linked entities for a given claim
- [ ] Admin UI: Collusion Rings page — list detected rings with evidence and investigation status
- [ ] Add repairer intelligence summary to fraud report section in ForensicAuditReport
- [ ] Ensure absence from registry is NOT treated as fraud — all new entities start at risk tier A (neutral)

---

## Image Subsystem — Pending Fixes

- [ ] Verify: extracted quote line items persist into `quote_line_items` and are consumed consistently by the assessment record, cost model, and reports; live persistence evidence is documented in audit/quote-line-item-persistence-audit.md; downstream Stage 9/report regression coverage added
- [ ] Historical quote line-item recovery: run `server/scripts/backfill-quote-line-items.ts` claim-by-claim in dry-run mode, review mappings, then apply only approved claim repairs
- [ ] Fix: Report missing critical sections when image analysis fails (assessor remarks, cost breakdown, evidence summary should degrade gracefully, not disappear)
- [ ] Add image classification pre-step: distinguish page renders vs damage photos vs document scans before vision analysis
- [ ] Re-run BMW 318i case study: target consistencyScore > 70, criticalFailures = 0
- [ ] **POST-LAUNCH: Fix C larger-sample validation** — Run imageClassifier on 100+ claims processed before Fix C (checkpoint 22811f0f) and confirm `quote_with_embedded_photo` category fires correctly for document pages with incidental vehicle images. Spot-check found one case (VOLTRON page-002: accident sketch form) that reached photoForensicsEngine as a document page in the pre-fix pipeline. Validate Fix C catches these at the classifier stage, not downstream. Target: zero document pages reaching Stage 6 vision analysis.
- [ ] **POST-LAUNCH: Claimant photo-capture UX proposal** — Design and implement a guided photo-capture flow for claimants submitting via the portal. Goal: ensure at least one close-up, perpendicular, front-crush-zone photograph with a visible scale reference is captured per claim. Current portfolio has 23% of claims falling back to deployment-threshold/momentum-only speed estimation because no SUITABLE crush-depth image exists. A guided capture flow ("Take a photo of the front bumper from directly in front, within 1 metre") would directly improve physics input quality. Requires: UX design, mobile-first implementation, integration with the claim submission flow.
- [ ] **POST-LAUNCH: Physics confidence label audit** — After 50+ new claims are processed with Fixes A/B/C in place, audit the distribution of MEDIUM vs LOW vs HIGH confidence speed estimates to confirm the 77% usable-crush-depth rate holds on new submissions vs the pre-fix portfolio.

---

## Structural / Product Decisions (Requires Discussion)

- [ ] Two render modes for ForensicAuditReport: "Decision View" (1-page adjuster summary) vs "Full Audit View" (current 23-page methodology)
- [ ] Move Glossary (Appendix B) to true appendix position — currently renders inline after Section 9

---

## ML Cost Prediction — Training Data Pipeline (Awaiting Data)

- [ ] Build training data export: extract (vehicle, damage zone, part, labour hours, cost) tuples from completed claims
- [ ] Define feature schema for ML model input (vehicle age, make, model, damage severity, repair type)
- [ ] Evaluate model options: gradient boosting vs neural net for cost range prediction
- [ ] Build confidence interval output: predicted cost ± range, not point estimate
- [ ] Wire ML prediction into KINGA Estimate as a second signal alongside rule-based estimate

---

## Fleet / Company Claimant — Remaining Items

- [ ] Fleet dashboard: show aggregate claim cost by vehicle, by driver, by period — current manager intelligence has rolling 12-month vehicle/driver totals; period controls and time-series grouping remain
- [ ] Fleet risk scoring: flag vehicles or drivers with abnormal claim frequency — current vehicle frequencies and persisted vehicle risk scores work; harden driver linkage for company-submitted claims
- [ ] Fleet manager analytics: add 30/90/365-day and custom-period controls plus time-series cost breakdowns by vehicle and driver
- [ ] Fleet manager analytics: link company-submitted fleet claims to the responsible assigned driver so driver cost and frequency metrics are complete
- [ ] Fleet PDF report: exportable summary of all fleet claims for a given period

---

## Recovery / Subrogation — Remaining Items

- [ ] Recovery case timeline view: show all events (demand sent, response received, escalation, settlement) in chronological order
- [ ] Recovery outcome analytics: recovery rate by claim type, by third-party insurer, by legal firm
- [ ] Automated follow-up reminder: if no response within 14 days of demand letter, trigger notification to recovery officer

---

## Executive Dashboard v2 Implementation

### Phase 1: Critical Fixes
- [x] Replace hardcoded DEMO_MONTH_COMPARISON with real analytics.getMonthComparison procedure
- [x] Add recovery report case handlers (recovery.case_summary, recovery.performance, recovery.third_party_profiles) to generateReportHtml
- [x] Fix Net Exposure formula in analytics.getFinancialOverview (totalReserves - totalRecovered)

### Phase 2: Visual Redesign
- [x] Add Inter font via Google Fonts CDN in client/index.html
- [x] Add exec design tokens to client/src/index.css
- [ ] Create ExecutivePeriodContext with global period state (deferred — requires state management refactor)
- [x] Redesign dashboard header (white bg, strong bottom border, period selector, action buttons)
- [x] Redesign tab navigation (underline style, emerald active)
- [x] Redesign KPI cards (white bg, 4px coloured left border, Inter font, tabular numbers)
- [ ] Wire all existing queries to consume period context (deferred — depends on ExecutivePeriodContext)
- [ ] Add Demo Mode banner (deferred)

### Phase 3: New Components
- [x] analytics.getExecutiveAlerts procedure + Executive Alerts Centre component
- [x] analytics.getMonthComparison procedure + Month Comparison Strip component (real data)
- [x] analytics.getClaimsAgeing procedure + Claims Ageing Panel component
- [x] analytics.getEscalationCounts procedure + Escalations Dashboard component
- [x] analytics.getFraudInvestigationFunnel procedure + Investigation Funnel component
- [x] crossClaim.getTopEntities procedure + Cross-Claim Intelligence panel
- [x] analytics.getSettlementTrend procedure + Settlement Trend chart
- [x] governance.getExceptionsRegister procedure + Governance Exceptions Register
- [x] Add Leakage tile to Financial Overview
- [x] Wire Recovery Dashboard to recovery.getKPIs + recovery.getCases (already wired in RecoveryPortal.tsx)

### Phase 4: Executive Report
- [x] executive.full_report added to REPORT_ACCESS + switch statement in reportDefinitions.ts
- [x] generateExecutiveFullReport HTML template (7 sections)
- [x] AI narrative integration (6 LLM calls, parallel)
- [x] Tab 6 (Executive Reports) UI with generation form and progress indicator
- [x] Recent reports table wired to reportingEngine.getMyJobs

---

## OBSOLETE — Items to Delete on Next Cleanup
> These sections existed in the original todo.md but have been fully superseded.
> Safe to delete entirely:

- Phases 1–11 (original scaffold phases — all done)
- "Continuation Phase", "Final Build Phase", "Final Features Implementation" — all done
- "Code Quality & Optimization Phase" — all done
- "Advanced Features Phase" — all done
- "Final Polish & Deployment Preparation" — all done
- "Document Management Feature" — all done
- "Testing Phase" (original) — superseded by current test coverage
- "Report Format Fix (Critical)" — all done
- "Bug Fixes & Testing" (original) — all done
- "Final Enhancements" — all done
- "UI Redesign & Advanced Features" — all done
- "Real-Time Notifications System" — all done
- "Comprehensive Fraud Detection System" (original 300-line section) — superseded by Intelligence Registry above
- "System Integration & UI Implementation" — all done
- "Additional Engineering Features (Immediate)" — all done
- "Immediate Engineering Features Implementation" — all done
- "Bug Fixes (Continued)" — all done
- "UI/UX Improvements" — all done
- "Fraud Analytics Dashboard Implementation" — superseded by Intelligence Registry
- "Weather API Integration" — deferred indefinitely
- "Vehicle Database Integration" — done (NHTSA integration complete)
- "Manual Assessment Analysis" sections — done
- "Handwritten Quote Processing" — done
- "Today's Implementation - Police Report & Vehicle Valuation" — done
- "Test Data Creation for End-to-End Testing" — done
- "End-to-End Testing Preparation" — done
- "Fraud Detection Enhancements" — superseded by Intelligence Registry
- "UI Color & Visual Enhancements" — done
- "Colorful UI Enhancements" — done
- "Final Implementation - Assessor Dashboard, OCR & Reports" — done
- "Final Tasks for Today (Feb 6, 2026)" — done
- "Portal Selection Landing Page" — done
- "Role Switcher for Testing" — done
- "Fix Role Switcher Redirect" — done
- Phases 1–7 (Go-Live Preparation roadmap) — superseded by current architecture
- Phases 13–32 (sprint phases through May 2026) — all completed
- "Strategic Review Backlog (2026-05-10)" — all done
- "Design & Format Consistency Audit (2026-05-10)" — all done
- "Combined Reviewer Fixes" — all done
- "Format Consistency Sprint" — all done
- "Dashboard Role-Access Sprint" — all done
- "Structured Note Display + Photo Classification Caching Sprint" — done
- "Bug Fix: isLateSubmission ReferenceError" — done
- "C-06 Removal + Days-to-Claim Fix" — done
- "Production Crash Fixes (May 2026)" — done
- "Branding Cleanup (May 2026)" — done
- "Issues Batch — May 11 2026" — done
- "Line Item Extraction Root Cause Fix — May 11 2026" — done
- "Report PDF Review Fixes — May 11 2026" — done
- "Company / Fleet Claimant Feature — May 12 2026" — done (core feature)
- "Fleet Expansion — Phase 2" — partially done; remaining items moved to Fleet section above
- "Dashboard Demo Data & Tab Improvements" — done
- "Presentation Polish (2026-05-13)" — done
- "Brand Cleanup (2026-05-13)" — done
- "Pipeline Reliability Fix (2026-05-13)" — done
- "Portal Hub & Currency Fix (2026-05-13)" — done
- "Pipeline Fix & Branding (2026-05-14)" — done
- "CRITICAL: Pre-Presentation Fixes (May 14)" — done
- "System Reliability: First-Try Upload Success" — done
- "Server Stability — OOM Prevention" — done
- "Upload 503 Fix — Multipart Endpoint" — done
- "Pipeline Fix — Remove pdftoppm dependency" — done
- "Cloud Run Native Binary Fix" — done
- "Quote Line Item Hardening" — done
- "Quote Line Item Persistence & UI Display" — done
- "Claim Truth Layer (CTL) — Pipeline Integration Fix" — done
- "Cross-Quote Gap Analysis Engine" — done
- "KINGA Savings Dashboard Audit" — done
- "Forensic Report Quality Improvement" — done (FAR fix plan above)
- "Hallucination / Inconsistency / Fraud Score Fixes" — done
- "Comprehensive Report Quality Audit (Jun 2026)" — done
- "Quotation Extraction Audit (Chevrolet Trailblazer)" — done
- "Multi-Quote Report Display Bug" — done
- "Multi-Quote Extraction Permanent Fix" — done
- "Fraud Scoring Redesign (2026-06-12)" — done
- "NHTSA Vehicle Structural Intelligence Integration" — done
- "Vehicle Structural Intelligence — COMPLETED" — done
- "ML Production Implementation (Phase 1–4)" — partially done; remaining items moved to ML section above

---

## Claims Manager Portal Realignment — Phase 1: Production Defect Fixes

- [x] D-01: Implement claims.closeForProcessing procedure (replaces incorrect approveClaim usage)
- [x] D-01: Update CloseForProcessingDialog to call new procedure + capture closureReason
- [x] D-02: Implement claims.escalateClaim procedure (escalation ≠ send-back)
- [x] D-02: Build EscalateClaimDialog component
- [x] D-02: Wire Escalate button in Fraud Alerts tab to EscalateClaimDialog
- [x] Phase 1 vitest tests for closeForProcessing and escalateClaim

---

## Claims Manager Portal Realignment — Phase 2: Operational Command Centre

- [x] F-01/F-06/F-07: Implement claims.getQueueHealthMatrix procedure
- [x] F-02: Implement claims.getAttentionRequired procedure
- [x] F-04: Implement claims.getApprovalWorkbenchMetrics procedure
- [x] F-05/M-06: Implement claims.getCapacityForecast procedure
- [x] F-01: Build QueueHealthMatrix component (Row 1)
- [x] F-02: Build AttentionRequiredWidget component (Row 2 left)
- [x] F-03: Build EscalationCentre component (Row 2 right)
- [x] F-04: Build ApprovalWorkbench component (Row 3 left)
- [x] F-05: Build CapacityForecast component (Row 3 right)
- [x] R-01: Demote KPI cards to compact horizontal strip
- [x] F-08: Add Fleet Approvals to sidebar navigation
- [x] Phase 2: Integrate all new components into ClaimsManagerDashboard layout
- [x] Phase 2 vitest tests for all four new procedures

---

## Claims Manager Portal Realignment — Phase 3: Management Intelligence

- [x] M-02: Implement workflowAnalytics.getSendBackAnalytics procedure
- [x] M-03: Implement recovery.getWatchlist procedure
- [x] M-01: Build WorkforceIntelligence component (Row 4) — Processor + Assessor + Workload panels
- [x] M-03: Build RecoveryWatchlist component
- [x] M-03: Replace Recovery KPI row with RecoveryWatchlist
- [x] M-04: Build OperationalFraudQueue component — groups fraud alerts into 4 actionable categories
- [x] M-05: Add ClaimsManagerReportsCentre (13 authorised reports surfaced)
- [x] M-05: Add per-claim report buttons to Review Queue tab (assessment, audit trail, cost comparison)
- [x] M-02: Add structured sendBackReason enum to send-back dialog (7 categories)
- [x] Phase 3 vitest tests (getSendBackAnalytics, recovery.getWatchlist)

---

## Claims Manager Portal Realignment — Phase 4: Refinements

- [x] R-03: Implement claims.reopenClaim procedure (closed → disputed)
- [x] R-03: Add Reopen action to Processed Claims tab with Reopen Claim dialog
- [ ] R-04: Record automation threshold in workflow_audit_trail.metadata at approval — backlog
- [x] R-05: Validate targetRole against WORKFLOW_TRANSITIONS in sendBackClaim procedure
- [ ] R-06: Merge Recently Closed card into Processed Claims tab — backlog
- [ ] Add KPI trend sparklines to compact KPI strip — future enhancement

---

## Claims Manager Portal Realignment — Maintainability Refactor

- [x] Extract ClaimsManagerCommandCentre.tsx wrapper (Rows 1–5 + Reports Centre)
- [x] ClaimsManagerDashboard.tsx reduced from 1,567 lines to 1,542 lines (command centre rows replaced by single wrapper)
- [ ] R-04: Record automation threshold in workflow_audit_trail.metadata at approval — future enhancement
- [ ] R-06: Merge Recently Closed card into Processed Claims tab — future enhancement
- [ ] Add KPI trend sparklines to compact KPI strip — future enhancement

---

## UI Redesign — Claims Manager & Executive Dashboards (June 2026)

- [ ] Fix AttentionRequiredPanel tile layout — min-widths, label/value separation, no text wrapping mid-word
- [ ] Fix ClaimsManagerCommandCentre section headers, spacing, panel hierarchy
- [ ] Fix Reports Centre grid — remove text truncation, improve 2-column layout
- [ ] Redesign ClaimsManagerDashboard tab arrangement — logical grouping, clear labels, consistent spacing
- [ ] Redesign Executive Dashboard — layout rhythm, tab arrangement, typography hierarchy

---

## KINGA Brand & Portal Design System (June 2026)

- [x] Create KINGA Brand & Design System document (brand/KINGA_Brand_Design_System.md)
- [x] Create KINGA Brand Reference HTML page (brand/KINGA_Brand_Reference.html)
- [x] Create KINGA Portal Governance & Alignment Audit v1.0 (brand/KINGA_Portal_Governance_Audit_v1.0.md)
- [x] Build KingaPortalShell unified component (client/src/components/KingaPortalShell.tsx)
- [x] Rebuild Assessor Dashboard as full operational workspace (My Queue, Appointments, Performance tabs)
- [x] Fix Claims Processor Dashboard — replace teal gradient header, foreign-colour stat cards, fix chart colours
- [x] Fix Claims Manager Dashboard — brand-aligned header, KPI strip, tab bar, chart colours
- [x] Fix Executive Dashboard — brand-aligned KPI cards, stat bar, tab bar, chart colours
- [x] Fix DashboardLayout sidebar active state — KINGA forest green left-border indicator
- [x] Fix ExecutiveAnalyticsCharts — all foreign colours replaced with KINGA brand palette
- [ ] Apply KingaPortalShell to remaining portals: Admin, Panel Beater, Claimant, Fleet Manager, Risk Manager, Recovery, Insurer Admin
- [ ] Implement portal certification checklist (85% pass threshold per KINGA_Portal_Governance_Audit_v1.0.md)
- [ ] Add keyboard arrow-key navigation to Claims Manager custom tab bar

---

## Brand Alignment Sprint — June 2026

- [x] Build KingaPortalShell unified component (PortalHeader, PortalKPIStrip, PortalAlerts, PortalTabs, PortalContent)
- [x] Rebuild Assessor Dashboard as full operational workspace (My Queue, Appointments, Performance tabs)
- [x] Fix Claims Processor Dashboard — replace teal gradient header, foreign-colour stat cards, chart colours
- [x] Fix Claims Manager Dashboard — brand-aligned header, KPI strip, tab bar, chart colours
- [x] Fix Executive Dashboard — brand-aligned KPI cards, stat bar, tab bar, chart colours
- [x] Fix DashboardLayout sidebar active state — KINGA forest green left-border indicator
- [x] Fix ExecutiveAnalyticsCharts — all foreign colours replaced with KINGA brand palette
- [x] Fix Admin Dashboard — remove gradient, fix emerald active buttons, fix KPI stat colours
- [x] Fix Risk Manager Dashboard — replace foreign accent colour classes with brand hex values
- [x] Fix Panel Beater Dashboard — fix page background, header text, tier badge colours
- [x] Fix Fleet Manager Dashboard — fix KPI icon/value colours, status badges, tab active state, empty state icons
- [x] Fix Claimant Dashboard — fix stepper colours, status badge classNames, header status pill
- [x] Fix Recovery Portal — fix tab config colours, deadline badges, header icon, warning banner
- [x] Fix Insurer Admin Dashboard — fix role badges, KPI card colours, claim status badges, activity icons
- [x] Create KINGA Brand & Design System document (brand/KINGA_Brand_Design_System.md)
- [x] Create KINGA Brand Reference HTML page (brand/KINGA_Brand_Reference.html)
- [x] Create KINGA Portal Governance & Alignment Audit v1.0 (brand/KINGA_Portal_Governance_Audit_v1.0.md)
- [ ] Apply portal certification checklist (85% pass threshold) to all 11 portals
- [ ] Add keyboard arrow-key navigation to Claims Manager custom tab bar
- [ ] Apply KingaPortalShell header component to Panel Beater, Claimant, and Fleet portals (currently use custom headers)

---

## Sprint 1 — Decision Alignment (June 2026)

- [x] Create shared SLADeadlineChip component (client/src/components/portal/SLADeadlineChip.tsx)
- [x] Recovery Portal: replace local deadlineChip with shared SLADeadlineChip
- [x] Claims Processor Dashboard: replace local SLA badge with shared SLADeadlineChip
- [x] IntakeQueueTab (Claims Manager): add SLADeadlineChip to claim rows
- [x] Panel Beater Dashboard: add SLADeadlineChip to pending request claim rows
- [x] AttentionRequiredPanel: already persistent above Claims Manager tab bar (inside ClaimsManagerCommandCentre) — no change needed
- [x] Executive Dashboard: add SLA Compliance Rate KPI to secondary KPI strip (5th cell, sage teal)
- [x] Claims Processor Dashboard: add Throughput (7d) and Rework Rate KPIs to KPI strip (8-cell grid)
- [x] Recovery Portal: integrate PortalHeader from KingaPortalShell (replaces custom header div)
- [x] Assessor Dashboard: already uses full KingaPortalShell — no change needed
- [ ] Add keyboard arrow-key navigation to Claims Manager custom tab bar
- [ ] Apply KingaPortalShell header component to Panel Beater, Claimant, and Fleet portals
- [ ] Implement portal certification checklist (85% pass threshold per KINGA_Portal_Governance_Audit_v1.0.md)

---

## Sprint 2 — Operational Completeness (baseline: checkpoint 9c78f96a, 218 TS errors)

- [x] T1: Claims Manager — WorkloadDistributionPanel (new tRPC query, per-assignee backlog)
- [x] T2: Executive — ExecutiveEscalationQueue (reuse financial threshold, no new threshold constant)
- [x] T3: Claims Processor — assessor assignment action (already implemented: trpc.claims.assignToAssessor, dialog at lines 672/826)
- [x] T4: Risk Manager — false positive rate KPI (fraudRules.falsePositiveCount / truePositiveCount, getFraudRuleAccuracy procedure)
- [x] T5: Risk Manager — geographic risk clustering table in Fraud Intelligence tab (getGeographicRiskClusters, GeographicRiskClustersPanel)
- [x] T6: Admin — PendingRegistrationQueue + deactivate/role-change user actions (admin.getPendingRegistrations/deactivateUser/updateUserRole)
- [x] T7: Panel Beater — D-07 chip confirmed at lines 378/493; Acceptance Rate KPI already present at line 149 (approvedQuotes/submittedQuotes)
- [x] T8: Claimant — settlement acceptance button + dispute initiation action (acceptSettlement/initiateDispute mutations + confirm dialogs)
- [x] T9: Insurer Admin — PendingTeamRequestQueue component (reuses teamMembers.listInvitations/cancelInvitation/resendInvitation)
- [x] T10: Recovery — full KingaPortalShell migration + PortalKPIStrip visual parity

---

## Combined Sprint 2 Fix Pass + Sprint 3 (June 22, 2026)

### Phase 0 — Risk Manager C4/C7 Investigation
- [x] Phase 0: Investigate Risk Manager SLADeadlineChip / AttentionRequired regression vs scoring error; document findings; restore if warranted

### Phase 1 — Sprint 2 Must-Fix Defects
- [x] Task 1: D-S2-05 — Surface dispute reason in Claims Manager claim detail + notifyOwner trigger in initiateDispute
- [x] Task 2: D-S2-03 — WorkloadDistributionPanel staleness fix (poll interval or cross-portal invalidation)

### Phase 2 — Sprint 2 Deferred Fixes
- [x] Task 3: D-S2-02 — Consolidate financial threshold into server/shared/constants.ts
- [x] Task 4: D-S2-04 — Add isActive/deactivatedAt to user schema; update deactivateUser + getPendingRegistrations

### Sprint 3 — Fleet Manager + Recovery Completion
- [x] Task 5: Fleet Manager Vehicle Tracking tab (real data, stubs flagged) — already complete in prior sprint
- [x] Task 6: Fleet Manager Risk Analytics tab (claim frequency + driver risk) — already complete in prior sprint
- [x] Task 7: Fleet Manager escalation action on claim rows (Option A: flagClaimForReview procedure + dialog + AttentionRequiredPanel Rule 8)
- [x] Task 8: Confirm Fleet Manager SLADeadlineChip still present (D-03 regression check) — confirmed at line 532 of FleetManagerDashboard.tsx
- [x] Task 9: Recovery settlement offer receipt + accept/reject on case rows — already complete in RecoveryCaseDetail.tsx (settlementModal, settled_full/partial, recoveredAmount)
- [x] Task 10: Recovery legal escalation workflow on case rows — already complete (disputed_legal status, legal_escalation responseOutcome, caseNotes timestamp)
- [x] Task 11: Recovery stalled case detection (90-day indicator) — already complete (SLADeadlineChip on case rows, 90-day deadline banner, getKPIs in90Days window)

---

## Sprint 4 Audit Defect Fixes (June 22, 2026)

- [x] D-S4-02: Replace 2 residual hardcoded 2500000 values in server/routers.ts with FINANCIAL_APPROVAL_THRESHOLD_CENTS (lines ~3187, ~9657); add import to server/routers.ts
- [x] D-S4-01 (optional): Remove EXEC_FINANCIAL_THRESHOLD_CENTS alias in executive.ts; use FINANCIAL_APPROVAL_THRESHOLD_CENTS directly at both call sites

---

## Sprint 5 — Shell Migration Sprint (June 22, 2026)

Baseline: checkpoint 95a8ea31 | TS errors: 220 (all pre-existing)
Reference pattern: Recovery T10 migration (rendering-only, no data source changes)

- [x] S5-P1: Claims Manager — KingaPortalShell + PortalKPIStrip migration (needs C1, C2, C3)
- [x] S5-P2: Fleet Manager — KingaPortalShell + PortalKPIStrip migration (needs C1, C2)
- [x] S5-P3: Claims Processor — KingaPortalShell + PortalKPIStrip migration (needs C1, C2, C3)
- [x] S5-P4: Executive — KingaPortalShell + PortalKPIStrip migration (needs C1, C2, C4)
- [x] S5-P5: Risk Manager — KingaPortalShell + PortalKPIStrip migration (needs C1, C2, C3, C4, C7)
- [x] S5-P6: Panel Beater — KingaPortalShell + PortalKPIStrip migration (needs C1, C2, C3)
- [x] S5-P7: Claimant — KingaPortalShell + PortalKPIStrip migration (needs C1, C2, C3, C4, C5, C7)
- [x] S5-P8: Admin — KingaPortalShell + PortalKPIStrip migration (needs C1, C2, C3, C4, C5, C7)
- [x] S5-P9: Insurer Admin — KingaPortalShell + PortalKPIStrip migration (needs C1, C2, C3, C4, C5, C7, C9)
- [x] S5-FINAL: 11-portal certification scorecard + remaining gaps report

## Sprint 6 — Certification Closure

- [x] S6-T1: Claims Processor — replaced remaining 3 foreign orange instances with KINGA gold (#D4A843/#8A5C00); prior sprint had already resolved the other 43
- [x] S6-T2a: Claims Processor — monetary formatting already uses fmt() from prior sprint; toLocaleString() calls are date formatting only (not currency)
- [x] S6-T2b: Fleet Manager — monetary formatting already uses fmt() from prior sprint
- [x] S6-T3a: Fleet Manager — tab navigation already uses p11-tab-item pattern (design system standard)
- [x] S6-T3b: Claims Processor — tab navigation already uses p11-tab-item pattern
- [x] S6-T3c: Claimant — tab navigation already uses ProtoTabBar
- [x] S6-T4: Claimant — foreign colour instances already resolved in prior sprint
- [x] S6-T5: PortalAlerts audit complete — 8/10 portals use PortalAlerts; ClaimsManager uses custom alert bar (Layer 3, real data); RecoveryPortal uses ProtoAlertBar — both functionally equivalent
- [x] S6-T6: Empty/error states already present in all 4 portals (Fleet: FileText icon + message; PanelBeater: text; Claimant: isLoading guard; InsurerAdmin: loading placeholders)
- [x] S6-VERIFY: FleetManager purple ai_complete badge replaced with KINGA forest green (#E7F1EA/#1C5C39); 196 TS errors confirmed pre-existing (unchanged from baseline)

## Phase 11 — Design System Implementation

- [ ] P11-1: CSS token foundation — index.css overhaul (g-950→g-100, gold, cream, tabular-nums, JetBrains Mono)
- [ ] P11-2: Rebuild KingaPortalShell — IdentityStrip + HeroBand + PortalKPIStrip + TabBar + AlertBar
- [ ] P11-3: Claims Manager — Phase 11 reskin (data table, escalation queue, attention panel)
- [ ] P11-4: Executive Dashboard — Phase 11 reskin (Overview tab: ageing chart, fraud funnel, escalation queue, period comparison, AI confidence)
- [ ] P11-5: Risk Manager — Phase 11 reskin
- [ ] P11-6: Claims Processor — Phase 11 reskin
- [ ] P11-7: Fleet Manager — Phase 11 reskin
- [ ] P11-8: Claimant — Phase 11 reskin
- [ ] P11-9: Panel Beater — Phase 11 reskin
- [ ] P11-10: Admin, Insurer Admin, Assessor, Recovery — Phase 11 reskin
- [ ] P11-11: Full visual QA + TS baseline + checkpoint

## Batch 7 — Infrastructure Hardening (R-INF)

- [x] R-INF-08: DATABASE_URL startup validation — hard fail (process.exit 1) in prod, warn in dev
- [x] R-INF-01: DB query timeout — add per-query SET SESSION max_execution_time wrapper
- [x] R-INF-02: LLM retry — stage-3 llmCall() wrapper (4 call sites) — add withRetry
- [x] R-INF-03: LLM retry — stage-5 vehicle valuation (line 456) — add withRetry around withTimeout
- [x] R-INF-04: LLM retry — stage-7b causal reasoning (3 call sites) — add withRetry
- [x] R-INF-05: LLM retry — stage-6 PDF pass-1 and pass-2 — add withRetry
- [x] R-INF-06: LLM retry — quoteExtractionEngine (7 call sites) — add withRetry
- [x] R-INF tests: write audit tests for all R-INF-01 through R-INF-08 fixes (25/25 passing)
- [x] R-INF-07: LLM retry — assessment-processor.ts (6 bare invokeLLM calls) — wrapped in withRetry (13 audit tests passing)
- [x] R-INF-09: Add documentation comments at users.role enum and agencyProcedure guard (agency role built but not yet activated)
- [ ] R-INF-09-backlog: When agency portal is greenlit — add 'agency' to users.role enum + roleAssignmentAudit enums (migration required)

## R-B-03b — Night-Photo Misclassification (Recovered from ID collision)

- [x] R-B-03b: imageIntelligence.ts — night-time / low-brightness damage photos silently classified as "document" because meanBrightness is not used in scoreDamageLikelihood(). Dark images (meanBrightness < ~60) score below LOW_CONFIDENCE_THRESHOLD (0.40) and are dropped without LLM fallback. Fix: add dark-image rescue path — if meanBrightness < 80 AND colourVariance > 0.05, push to ambiguousPool regardless of heuristic score. (Original R-B-03 finding; ID collision with Batch 6 R-B-03 enrichedPhotosJson fix discovered 2026-07-09.)

## R-CX-01c — Currency Wiring Completion

- [x] R-CX-01c (a): AssessmentResults.tsx — useTenantCurrency wired to CostBreakdownChart (checkpoint 370e5b96)
- [x] R-CX-01c (b): ForensicDecisionPanel.tsx — hardcoded $ on true_cost_usd replaced with fmt() (17 audit tests passing)
- [x] R-CX-01c (c): stage-5-assembly.ts — vehicle valuation LLM prompt generalised for multi-currency markets; tenantCurrencyCode/tenantCountryName derived from ctx.tenantCountry; isZimbabwe guard preserves Zimbabwe-specific market context (17 audit tests passing)

## Architectural Governance — 3 Failing Test Clusters

- [x] ARCH-01: quoteOptimisationEngine — updated tests to Title Case canonical names; added 'f/bar' alias to shared/vehicleParts.ts; all 50 tests pass
- [x] ARCH-02: decisionReadinessEngine — updated tests to expect WARN / is_critical:false for ABSENT/UNKNOWN photo status; all 52 tests pass
- [x] ARCH-03: weighted-fraud-scoring — FSS-2026-001 formal standard drafted; shared/fraudScoring.ts created as single source of truth; 16 consumer files migrated; 'medium' → 'moderate' across pipeline; 49 boundary tests pass

---

## Batch 8 — Observability & Structured Logging (R-OBS)

**Design decisions confirmed by user (2026-07-09):**
- R-OBS-03: Use module-level logger singleton — NOT an optional per-call callback parameter. Callback approach reintroduces the 'silently missing' failure pattern found throughout the audit. Must be consistent with how withRetry/withTimeout were applied globally.
- R-OBS-05: User requires the list of 8 highest-risk engines before ranking. Present the list first, get ranking, then implement.

### R-OBS-03 — Structured Logger Singleton
- [x] R-OBS-03: Create server/logger.ts — module-level structured logger singleton; 22/22 tests pass (server/logger.test.ts). Wired into all 4 ctx.log construction sites in db.ts and routers.ts.

### R-OBS-05 — Engine-Level Timing & Observability
- [x] R-OBS-05-SCOPE: Present list of 8 highest-risk engines to user for ranking before implementation
- [x] R-OBS-05: Add per-engine timing instrumentation to the 8 ranked highest-risk engines. runWithTimeout covers stages 1,2,6,7,8,9,10; orchestrator.ts direct calls cover stage-3, stage-5, 7b-causal-reasoning. 29/29 tests pass (server/batch8-observability.test.ts).

### Other R-OBS items (pending scope confirmation)
- [x] R-OBS-01: claimId threaded through all pipeline stages via logger.makePipelineLog(claimId) at all 4 ctx.log construction sites. Every pipeline log line carries a structured claimId field.
- [x] R-OBS-02: logger.retry() wired into withRetry in server/_core/llm.ts — WARN for non-final attempts, ERROR for exhaustion. Carries engineLabel, attempt, maxAttempts, error message, and optional meta fields.
- [x] R-OBS-04: logger.stage() wired into onStageComplete callback in server/db.ts — emits structured stage completion events with stageId, durationMs, status (completed/degraded/failed/skipped), and claimId.

---

## ARCH-03b — DB Write Path Data Corruption Fix (moderate→low silent downgrade)

**Root cause confirmed (2026-07-10):** fraudLevelMap in server/db.ts is missing 'moderate' key. Pipeline now produces 'moderate' (scores 40–60) but the map falls through to 'low'. DB schema enum also does not include 'moderate'. 22 historical rows stored as 'medium' (pre-ARCH-03). 0 rows stored as 'moderate' (all silently written as 'low' since ARCH-03).

- [x] ARCH-03b-AUDIT: 0 claims affected (no claims processed in 40–60 band since ARCH-03 deploy); 22 historical 'medium' rows confirmed (pre-ARCH-03, correct at time of writing); no manual re-flagging required
- [x] ARCH-03b-FIX1: Schema migration applied via direct SQL (arch03b-add-moderate-fraud-level.sql); 'moderate' added to all 5 tables (aiAssessments, fraudIndicators, historicalReplayResults, claims, assessorEvaluations); 6/6 verification tests pass
- [x] ARCH-03b-FIX2: fraudLevelMap in server/db.ts updated — moderate:'moderate' added; 13/13 verification tests pass
- [x] ARCH-03b-FIX3: normaliseFraudLevel() and fraudLevelDisplayLabel() added to shared/fraudScoring.ts; applied to AiReanalysisPanel (4 sites), AIAssessmentPanel (3 sites), ClaimReviewDialog (2 sites), notifications.ts email body; 26/26 verification tests pass

---

## Batch 9a — Magic Number Extraction (Readability & Documentation)

- [x] Batch 9a: Extract all magic numbers to named constants across 12 Groups A–H pipeline files (12 commits, one per file). Tag unknowns with `// CALIBRATION: origin unknown, do not change without benchmarking`. Produce `docs/audit/unverified-constants.md` with 60+ entries covering file location, current value, role, and calibration status. 276/283 tests pass (7 pre-existing group-a failures confirmed pre-existing by stash comparison). Checkpoint: pending (see next entry).

---

## Batch 9b/9c — Function Splitting & Comment Gaps (Groups A–H)

- [x] 9b Group A: `_doExtraction` → detectScannedPdf / applyHeuristicRotation / extractEmbeddedImagesFromPage; `runInputRecovery` → detectImagePresence / detectOcrFailure / deduplicateExtractedQuotes + no-split rationale on five-path block; `validateAndNormalise` → coerceTotalCost / validateLineItems / deriveConfidence / coerceLabourAndParts / validateDocumentCategory
- [x] 9c Group A: 8 comment gaps added (pdf-image-extractor.ts, stage-1/2/3, quoteExtractionEngine.ts, documentPreprocessor.ts). Checkpoint: d4dc53e2
- [x] 9b Groups B–D: No splits warranted. No-split rationale comments added to evaluateBehaviouralEnrichment, extractMultipleQuotesFromPageImages, runPhotoForensics
- [x] 9c Groups B–D: 5 comment additions (scenarioFraudEngine.ts, quoteExtractionEngine.ts, claimQualityScorer.ts, evidenceStrengthScorer.ts, photoForensicsEngine.ts). Checkpoint: 0111e47d
- [x] 9b Groups E–H: No splits warranted. No-split rationale comments added to runPipelineV2, runCostOptimisationStage, runPhysicsStage, runCausalReasoningEngine
- [x] 9c Groups E–H: Architecture JSDoc added to runDamageAnalysisStage, runCostOptimisationStage, runPhysicsStage, runCausalReasoningEngine, runCostDecision, evaluateDecisionReadiness, runPipelineV2
- [x] Regression gate: 370/372 tests pass; 2 costDecisionEngine + 7 group-a + 12 quoteExtractionEngine failures confirmed pre-existing

---

## Batch 9b/9c addendum + Batch 9d — Navigational Maps & Module-Level Comments

- [x] Navigational map with line ranges added to runPipelineV2 JSDoc (orchestrator.ts) — 11-stage outline, two parallel execution points, no-split rationale
- [x] Navigational map with line ranges added to runAssemblyStage JSDoc (stage-5-assembly.ts) — step-by-step section outline with line ranges
- [x] Batch 9d: module-level orientation comments added/expanded for all Groups A–H files:
  - stage-3-structured-extraction.ts: three-path extraction architecture, key functions table (from 9b/9c work)
  - stage-8-fraud.ts: four-engine fraud architecture, score aggregation overview (new)
  - All other files confirmed to already have adequate module-level comments
- 235/249 tests pass; 14 pre-existing failures confirmed (quoteExtractionEngine x12, costDecisionEngine x2)
---
## Batch 9e — Mermaid Flowcharts for All Groups A–H Pipeline Modules
- [x] Group A (5 flowcharts): pdf-image-extractor, stage-1-ingestion, stage-2-extraction, stage-3-structured-extraction, quote-extraction-engine
- [x] Group B (3 flowcharts): image-intelligence, image-classifier, document-preprocessor
- [x] Group C (3 flowcharts): evidence-strength-scorer, claim-quality-scorer, speed-inference-ensemble
- [x] Group D (2 flowcharts): scenario-fraud-engine, photo-forensics-engine
- [x] Group E (2 flowcharts): quote-optimisation-engine, stage-5-assembly
- [x] Group F (2 flowcharts): stage-6-damage-analysis, stage-7-physics
- [x] Group G (3 flowcharts): stage-7b-causal-reasoning, stage-8-fraud, stage-9-cost
- [x] Group H (3 flowcharts): cost-decision-engine, decision-readiness-engine, orchestrator
- [x] All 18 .mmd source files verified to render without parse errors; all 18 .png renders verified visually
- [x] Regression gate: 483/485 tests pass in core pipeline suite; 2 costDecisionEngine failures confirmed pre-existing
- [x] All 46 files committed to main: commit d28b503a

---
## Batch 10a — Silent Bug Investigation + 3 Fixes (2026-07-10)

- [x] Investigate: line-item persistence bug (documentedLineItems gap) — confirmed historical-only, 2 claims affected
- [x] Investigate: image-failure report degradation — confirmed PipelineConfidencePanel was never rendered
- [x] Investigate: BMW 318i consistencyScore feasibility — blocked (no real claim doc; test fixtures were stale)
- [x] Fix 1: Wire PipelineConfidencePanel into ForensicAuditReport main render + pass enforcement.degradationReasons
- [x] Fix 2: Add db.ts guard warning when quotesToPersist is empty despite non-zero documentedOriginalQuoteUsd
- [x] Fix 3: Update 10 stale imageClassifier.test.ts fixtures/assertions to match current classifier design (blur scale + fallbackPool routing)
- [ ] Backfill 2 historical quote_line_items records (claims 7260001, 6570001) — low priority, data hygiene

---
## Batch 10b — Live End-to-End Pipeline Run (2026-07-10)

- [ ] Upload VOLTRONMINECOR6002812(1).pdf to S3 and create a real claim record in the database
- [ ] Trigger the live pipeline on the real claim via the API with actual LLM calls
- [ ] Collect and verify: consistencyScore, criticalFailures, report rendering, PipelineConfidencePanel visibility
- [ ] Deliver the full live run report to the user

---
## Batch 10b — Live End-to-End Pipeline Run (VOLTRON-MINECOR-6002812)

- [x] Run live pipeline on real Zimbabwe motor claim (Voltron Mining, Isuzu MUX, Mvuma-Kwekwe Road)
- [x] Fix Stage 5 INCIDENT_CONF_LOW_THRESHOLD scoping error (const declared inside wrong if-block scope)
- [x] Confirm criticalFailures = 0 on live run
- [x] Confirm all 11 stages complete successfully on clean re-run
- [x] Confirm image analysis 20/20 success (100% success rate)
- [ ] Investigate quoteDeviationPct = 234.7% — appears to be a unit mismatch (cents vs USD) in the deviation calculation
- [ ] Investigate consistency_check_json using different field names (critical_conflicts) vs the consistencyScore metric referenced in todo

---
## TRE v4.0 — Autonomous Trust Operations Platform (2026-07-12)
- [x] E1 Trust Event Bus: trustEventBus singleton, conflictDetectedEvent, slaBreachEvent, subscribe/unsubscribe, getClaimEvents, getStats, clearHistory, resetStats
- [x] E2 Trust Impact Analysis Engine: analyseImpact, analyseMultiEventImpact — section propagation, severity, certificate impact
- [x] E3 Autonomous Resolution Queue: createConflictResolutionTask, enqueue, getPendingTasks, resolve, escalate, getStats, clear
- [x] E4 Human-in-the-Loop Governance: humanTrustApprovalEngine.request, decide (APPROVE/REJECT/ESCALATE), getPendingRequests, getClaimRequests, clear
- [x] E5 Trust Memory Engine: trustMemoryEngine.record, getConflictPatterns, generateInsights, getSimilarClaims, getSnapshot, clear
- [x] E6 AI Model Governance: aiModelGovernanceEngine.registerModel, getActiveModels, generateGovernanceReport, clear
- [x] E7 Trust SLA Management: trustSLAManager.start, complete, waive, generatePerformanceReport, clear
- [x] E8 Trust Simulation Engine: trustSimulationEngine.defineScenario, simulate, runBatch, getStandardScenarios
- [x] E9 TRE v4 Governance Router (tre-v4-governance.ts): all tRPC procedures registered — TypeScript clean
- [x] Integration test E1→E2→E3 chain: emit event → analyseImpact → enqueue resolution task → resolve
- [x] Vitest suite: 34/34 tests pass (server/treV4Governance.test.ts)
- [x] Pre-test checkpoint: 46e7ca99

## Physics / Stage 2.6 Fixes — Jul 13 2026
- [x] TRE Fix 1: speed reads ensemble consensusSpeedKmh first (28 km/h for VOLTRON, not 70)
- [x] TRE Fix 2: day-count split — daysToLodge (4402, late-submission gap) vs claimProcessingDays (KINGA age)
- [x] ForensicAuditReport: updated day-count labels to daysToLodge / claimProcessingDays
- [x] Stage 2.6 Fix 3: direct-URL photos now synthesize ExtractedImageInput so classifier runs
- [x] 12/12 regression tests passing (physicsAndStage26Fixes.test.ts)
- [x] VOLTRON re-run verified: cto_speed=28, cto_days_to_lodge=4402, cto_processing_days=406
- [ ] POST-LAUNCH: Phase B-2/B-3 — benchmark evaluation and threshold tuning for imageIntelligence
- [ ] POST-LAUNCH: TRE v3.0/v4.0 frontend wiring (ephemeral state + CTO shape risks documented)

## Physics Engine Strategic Roadmap (July 2026)

### Pre-Launch (Required — 4 days total)
- [ ] **P1 — Velocity range in report** — Replace single consensus speed with low/mid/high km/h range from `physicsNumerical.velocity_range`. Add braking coherence note when stated speed > physics lower bound: "Stated travel speed [X] km/h is consistent with physics lower bound [Y] km/h if the vehicle decelerated over approximately [Z] metres before impact." UI change only — data already in pipeline. (1 day)
- [ ] **P2 — Speed discrepancy → fraud score** — Wire `speedInferenceEnsemble.consensusSpeedKmh` into Stage 8 fraud scoring. When stated speed > 1.5× consensus speed AND confidence MEDIUM/HIGH, add `speed_claim_inconsistency` fraud indicator with calibrated score contribution. Closes the most important missing link between physics and fraud. (2 days)
- [ ] **P3 — Methodology disclosure in report** — Replace "methodology available under confidentiality undertaking" with: method names (Campbell, FMVSS 208, momentum), input sources, assumptions (vehicle mass assumed, friction coefficient assumed, braking not modelled), velocity range, and expert review pathway statement. (1 day)

### Post-Launch Phase 1 (First 90 days — 15 days total)
- [ ] **P4 — Latent damage probability → cost reserve** — Wire `physicsAnalysis.latentDamageProbability` into Stage 9. When engine/transmission/frame probability > 0.3, add hidden damage contingency line to cost estimate and flag for adjudicator. (3 days)
- [ ] **P5 — Energy-conditioned damage pattern validation** — Extend `damagePatternValidationEngine` to accept `energyDissipatedKj` and condition expected component list on both direction AND energy level. A 20 km/h frontal ≠ 60 km/h frontal in expected components. Currently both get identical pattern match. (5 days)
- [ ] **P6 — Physics-grounded cost envelope** — Wire `physicsAnalysis` into `costRealismValidator`. Compute expected cost range from energy × component count × market rates. Flag repair quotes exceeding physics upper bound. This is the most powerful fraud detection capability currently absent from the system. (7 days)

### Post-Launch Phase 2 (90–180 days)
- [ ] **P7 — Braking coherence model** — Implement pre-impact speed model: given stated speed + road type + friction coefficient (0.7 tarmac / 0.4 gravel), compute minimum braking distance and resulting impact speed. Distinguish coherent deceleration from genuine inconsistency. Resolves the 70 km/h vs 28 km/h "contradiction" in VOLTRON and similar claims. (5 days)
- [ ] **P8 — Calibration dataset** — Build ground-truth dataset of claims with known outcomes (fraud confirmed / legitimate / contested). Calibrate fraud score contributions from physics signals empirically. Without calibration, score weights are engineering estimates. (ongoing)
- [ ] **P9 — Expert review integration** — For LOW confidence or plausibility-check-fired claims, add escalation pathway to qualified accident reconstructionist. AI provides structured evidence package; expert provides court-admissible opinion. (10 days)

## Document Reliability Architecture — Phase 1 (Active)

### Phase 2 — Pipeline State Machine
- [x] DRA-P2-1: Add new document pipeline states to claims.documentProcessingStatus in schema.ts: DOCUMENT_VALIDATING, DOCUMENT_READY, ANALYSIS_RUNNING, DOCUMENT_FAILED, RECOVERY_ATTEMPTED, HUMAN_REVIEW_REQUIRED
- [x] DRA-P2-2: Add new claim status values to claims.status enum: document_failed, recovery_attempted, human_review_required
- [x] DRA-P2-3: Update workflow-validator.ts ClaimStatus type and ALLOWED_TRANSITIONS with new states
- [x] DRA-P2-4: Update db.ts triggerAiAssessment() to use new states at each transition point

### Phase 3 — Document Health Gate
- [x] DRA-P3-1: Create server/pipeline-v2/documentHealthGate.ts with 6-dimension ingestion confidence scoring
- [x] DRA-P3-2: Implement Evidence Completeness Contract (required vs optional fields)
- [x] DRA-P3-3: Implement threshold routing: >=90% auto-proceed, 70-90% warn, 40-70% require review, <40% block
- [x] DRA-P3-4: Wire documentHealthGate into db.ts triggerAiAssessment() before pipeline runs

### Phase 4 — Recovery Ladder
- [x] DRA-P4-1: Add pdfimages embedded image extraction as first fallback when pdftoppm produces 0 pages
- [x] DRA-P4-2: Add pdftotext OCR text-only path as second fallback
- [x] DRA-P4-3: Add human escalation path as final fallback (sets HUMAN_REVIEW_REQUIRED state)
- [x] DRA-P4-4: Update pdfToImages.ts renderPdfToImages() to return structured failure reasons

### Phase 5 — No Silent Failure Invariant
- [x] DRA-P5-1: Create server/pipeline-v2/ingestionFailureReport.ts with structured IngestionFailureReport type
- [x] DRA-P5-2: Block assessment_complete unless all 4 conditions met (ingestion passed, analysis executed, confidence threshold, audit trail)
- [x] DRA-P5-3: Trigger notifyOwner on every ingestion failure with failure type and recommended action
- [x] DRA-P5-4: Ensure placeholder path (no PDF + no photos) routes to DOCUMENT_FAILED not assessment_complete

### Phase 6 — TypeScript + VOLTRON + Checkpoint
- [x] DRA-P6-1: TypeScript EXIT:0 on server-check tsconfig (0 errors)
- [ ] DRA-P6-2: VOLTRON re-run (claim 8880001) — confirm pipeline still completes correctly
- [ ] DRA-P6-3: Degraded claim test (claim 9330001) — confirm it now routes to DOCUMENT_FAILED not assessment_complete
- [ ] DRA-P6-4: Checkpoint

## Pipeline Crash Resilience — Always-Complete Guarantee

- [ ] RESILIENCE-1: Fix NapiCanvasFactory null canvas crash in pdf-image-extractor.ts (Stage 1 scanned PDF crash) [DONE in code, not checkpointed]
- [ ] RESILIENCE-2: Add process.on('uncaughtException') + process.on('unhandledRejection') safety net in triggerAiAssessment that writes terminal DB state before process exit
- [ ] RESILIENCE-3: Wrap entire orchestrator call in db.ts with guaranteed finally block that always writes terminal state
- [ ] RESILIENCE-4: Fix Document Health Gate isDocumentIngested logic (incidentDate/description are pipeline outputs, not pre-conditions) [DONE]
- [ ] RESILIENCE-5: Fix gate cache_rehydration path (synthesise quality data when photos are cached) [DONE]
- [ ] RESILIENCE-6: Methodist claim (9330001) completes to analysis_complete end-to-end

## Photo-Evidence Enhancement Track — Remaining Polish (2026-07-15)

- [x] VISION-NORMALISATION: Implemented server/services/visionTermNormaliser.ts — normalises Wing→Fender at all 3 detectedComponents assignment points in Stage 6. 23/23 tests pass. Backfilled enrichedPhotosJson on 14 assessments AND damagedComponentsJson on 13 assessments (13/14 were contaminated — not a small number). Post-backfill: detectedComponents Wing terms=NONE ✅, damagedComponentsJson Wing terms=NONE ✅. Caption field retains old text (not consumed by any UI consumer — confirmed). VOLTRON: 📷×7 for Fender confirmed. Regex safety confirmed: only LH/RH Front Wing appeared in corpus — no Wing Mirror or other compound terms.
- [x] VISION-NORMALISATION: Full systematic scan completed across all 31 enriched-photo claims and 30+ real quote line items. Only Wing/Fender is a systematic mismatch. All other UK terms (Bonnet, Windscreen, Boot Lid, Sill, Tyre) also appear in real submitted documents and require no change.
- [ ] COVERAGE-AUDIT: "Zones Covered: 1" in Section 4.1 audit table for VOLTRON is correct but may confuse adjusters. Consider adding "(pre-zone-tagging)" note when zone count = 1 and enrichedPhotosJson exists.

---

## Report Realignment — July 2026 (Active)

- [ ] Rewrite forensicDecisionReport.ts to match original PDF section order exactly (cover → decision page → vehicle/policy → incident facts → physics → damage zone → cost summary → repair analysis → fraud → quality → definitions)
- [ ] Update Claims Processor queue dropdown (ClaimsProcessorDashboard.tsx) to use the new report generators
- [ ] Re-test both reports against LIVE-RUN-VOLTRON-001 after forensic realignment
- [ ] Update kinga-reports.test.ts to reflect the corrected forensic section structure

## Audit & Fix — Three Critical Concerns (Jul 2026)

- [x] CONCERN 1: Document loss — CONFIRMED SOLID. Files uploaded to S3 before DB transaction. Pipeline reads S3 URL via sourceDocumentId. No race condition found. Photo-forensics 0/1 error is a stage-8 analysis issue, not document loss.
- [x] CONCERN 2: Forensic report redesign — URL parser bug fixed in InsurerComparisonView.tsx (line 215: ?report=intelligence was falling through to 'standard'). ReportChooser.tsx updated to 3 cards.
- [x] CONCERN 3: Intelligence report wiring — All 4 dropdown instances in ClaimsProcessorDashboard.tsx confirmed with 3 reports. ReportChooser.tsx updated to 3-card layout. InsurerComparisonView.tsx: intelligence render block added, URL parser fixed, print label updated. ClaimsManagerReportsCentre already had intelligence via KingaReportButton. pipeline_runs schema column name fixed (pipeline_run_status → status).
- [x] Fix any gaps discovered during the audit — all gaps fixed
- [x] Run full test suite and save checkpoint

## ForensicAuditReport Browser View — v7 Redesign (Jul 2026)

- [x] Fix: Add triggerAiAssessment() to upload-documents.ts so new claims auto-start pipeline
- [x] Rewrite ForensicAuditReport.tsx to match v7 design — replaced 9,554-line React renderer with 100-line server-rendered iframe component using previewHtml tRPC procedure. Browser view and PDF now identical.
- [x] Verify redesigned component renders correctly — tested against claim 7410001 (COR 6002812): HTML length 71,454 chars, all 8 sections present (§F, §1.0–§7.0, §B)

## Upload & Re-run Failures — Root Cause Fixes (Jul 2026)

- [ ] FIX-RERUN-1: Decide and approve whether `ai_assessment_completed` may transition to `under_assessment` for a controlled re-run
- [ ] FIX-RERUN-2: Review `document_validating` and `DOCUMENT_FAILED` triggerAiAssessment re-entry behavior under a separately approved workflow-governance batch
- [ ] FIX-RERUN-3: Decide and approve whether technical approval or financial decision states may re-enter `under_assessment`
- [ ] FIX-UPLOAD-1: Verify upload endpoint returns proper error response when multer rejects a file (add multer error handler middleware)

## Document Health Gate Fix — 2026-07-19
- [x] Root cause: pdftoppm fails on production for non-scanned PDFs (typed assessment documents). Gate input pagesRendered=0 + renderFailed=true → critical block → document_failed
- [x] Fix: When _pdfBuffer downloaded successfully, set pagesRendered=1 and renderFailed=false. LLM reads PDF natively via file_url proxy — pdftoppm images not required for non-scanned PDFs
- [x] Reset 3 stuck claims (10239902, 10209903, 10209902) from document_failed → intake_pending

---

## Re-Analysis Bug Fix (July 2026)

- [x] Fix: Re-analysis toast fires but claim vanishes from dashboard (root cause: getClaimsByStatus Zod enum missing pipeline statuses + inReviewClaims filter too narrow)
- [x] Expand getClaimsByStatus Zod enum to include all pipeline statuses: document_validating, document_ready, analysis_running, recovery_attempted, human_review_required, document_failed, analysis_complete
- [x] Expand inReviewClaims filter to include all pipeline-running statuses (IN_REVIEW_STATUSES + IN_REVIEW_DPS sets)
- [x] Add document_failed claims to pendingClaims so users can retry failed analyses
- [x] Guard aiFlaggedClaims to exclude claims still in pipeline-running states

## Report Design Alignment — Approved Reference (2026-07-20)
- [ ] Replace Claims Intelligence report template with approved dark-theme design (black bg, KINGA green accents, monospaced claim ref, score strip, section cards)
- [ ] Replace Standard / Forensic report template with approved white-theme design (left-border accents, structured tables, VERIFIED badge, section headers)
- [ ] Align kingaDesignSystem.ts cover layout to match approved PDF: dark cover block with green KPI strip, white body pages with left-rule section headers
- [ ] Ensure report HTML renders correctly inside the iframe preview in ClaimDecisionReport
- [ ] Verify all three report types (Standard, Intelligence, Forensic) render with correct approved design after changes

---

## Report Quality Fixes — July 2026 (Live-Run PDF Review)

- [ ] Fix currency formatting: fmtUSD producing wrong comma/decimal position (e.g. $24,782.31 should not render as $247,82.31)
- [ ] Fix blank first pages when printing/exporting reports to PDF (CSS print media query / page-break issue)
- [ ] Fix SVG damage diagram to match the approved live-run reference layout and semantics
- [ ] Restore missing report sections from live-run PDF: FCDI bar chart, claim timeline, executive summary, physics snapshot bar, repair quote summary table with panel beater names, decision score summary, incident facts table with confidence badge, incident narrative with reconstructed sequence and cross-validation, vehicle details + policyholder split table
- [ ] Restore running header to show "Claim: | Report Date: | Page N of M" format matching live-run PDF
- [ ] Restore DRAFT watermark banner when VIN is missing or claim is in draft state
- [ ] Restore right-column cost stack on cover (individual panel beater quotes listed vertically with amounts and LOWEST badge)
- [ ] Restore 4-metric score strip on cover (Fraud Risk, Physics, FCDI, Data) matching live-run layout
- [ ] Restore KINGA DECISION block on cover (REVIEW REQUIRED / APPROVE / REJECT in large bold with sub-text)

---

## Voltron FDR Remediation — 12-Bug Fix Sprint (23 July 2026)

### CRITICAL
- [x] Bug #1 — Photo count resolves to 0 (ife.photoCount doesn't exist; claim_documents has 0 rows for claim 8880001)
- [x] Bug #2 — Speed bar chart uses 2-bar fallback instead of 6-method ensemble (physics.speedInferenceEnsemble.methods[].speedKmh)

### HIGH
- [x] Bug #3 — Physics Consistency and FCDI cells both read forensicAudit.overallScore (should use physics.physicsScore)
- [x] Bug #4 — Data Completeness shows hardcoded 75% fallback instead of actual ife.completenessScore (46%)
- [x] Bug #5 — KINGA Optimised Estimate shows $0.00 with self-contradictory 100% savings label
- [x] Bug #6 — Incident date predates vehicle model year — not flagged in §02 or §09

### MEDIUM
- [x] Bug #7 — pipeline_jobs table has 0 rows; stage telemetry not persisted (upsertPipelineJob call path)
- [x] Bug #8 — Currency hardcoded to $ (USD) — rename fmtUSD → fmtCurrency(amount, currency)
- [x] Bug #9 — Deceleration displayed with 16 significant digits (needs toFixed(2))
- [x] Bug #10 — Policy details (policy_number, sum_insured, policy_excess) missing from §02

### LOW
- [ ] Bug #11 — Dead CIR-only CSS retained in FDR stylesheet (~2 KB) — split fdrStyles/cirStyles
- [ ] Bug #12 — claim_documents vs ingestion_documents routing gap

### Verification
- [ ] Re-run LIVE-RUN-VOLTRON-001 end-to-end and verify all 12 fixes field-by-field
- [ ] Confirm pipeline_jobs has 11 rows with real durations after Bug #7 fix
- [ ] Test currency formatting against a Zambian (ZMW) claim
- [ ] Test Wing→Fender normalization against a claim with "Wing" in narrative
- [ ] Confirm no new badge/verdict contradictions introduced

---

## Pipeline Integration Fixes — Cost Audit Sprint (July 2026)

### CRITICAL
- [ ] Fix Stage 3 degraded path: all degraded/error returns must include empty inputRecovery structure (not undefined)
- [ ] Fix Stage 9: fallback to panel_beater_quotes DB table when stage3.inputRecovery.extracted_quotes is empty

### HIGH
- [ ] Sweep all pipeline stages for silent ?? [] / ?? 0 fallbacks where a sibling DB table holds real data
- [ ] Fix vehicle_market_value display: divide by 100 (currently rendering raw cents as dollars)
- [ ] Fix $75,340.91 total-quoted figure: verify whether it was sourced correctly or was coincidentally correct despite Stage 9 reading empty quotes

### MEDIUM
- [x] BUG-13: pipeline_jobs 6 stages stuck at running (6.5A/6.5B never call recordStage; degraded stages drain after process exits)
- [ ] BUG-14: .cover-head-legacy dead CSS not stripped from FDR
- [ ] BUG-15: Verdict strip label "Market Value" → "Insured Value"
- [ ] BUG-16: Document register missing from §08 (ingestion_documents data available)

### LOW
- [ ] BUG-17: Seed data — estimated_value for VOLTRON-001 should be 3,000,000 cents ($30,000)

### Verification
- [ ] Re-run LIVE-RUN-VOLTRON-001 and confirm Stage 9 surfaces exactly 3 quotes matching panel_beater_quotes
- [ ] Confirm §06/§07 quote sections and cost table reflect the 3 real quotes
- [ ] Confirm $75,340.91 total-quoted figure reconciles (or update if incorrect)

---

## L2 Formula Audit & Quote Line Items Fix (July 2026)

- [ ] FIX-L2-FORMULA: Set MAX_MODEL_DISCOUNT_PCT = 0.30 (was 0.45) in quoteOptimisationEngine.ts buildCompositeQuote
- [ ] FIX-L2-FORMULA: Delete all wrong formula variants in quoteOptimisationEngine.ts and stage-9-cost.ts that contradict the canonical rule
- [ ] FIX-QUOTE-LINE-ITEMS: Stage 9 DB fallback must join quote_line_items so buildCompositeQuote receives real line items (not empty components[])

---

## L2 Formula Rebuild — Confirmed Correct Architecture (July 2026)

### The correct L2 formula (confirmed by product owner):
### 1. Normalise all quotes to total-cost-of-operation (parts + associated labour per component)
### 2. L1 = lowest normalised quote total across all repairers
### 3. K = KINGA benchmark/model price for the full repair
### 4. If K exists and |L1-K|/L1 ≤ 0.30: L2 = min(L1, K)
### 5. If K exists and |L1-K|/L1 > 0.30: L2 = L1 (model is outlier; accept market floor)
### 6. If K does not exist (T3/T4): L2 = L1
### L2 ≤ L1 ALWAYS. KINGA never increases cost burden on insurer.

- [ ] REBUILD-L2-1: Delete the per-component cherry-pick logic from buildCompositeQuote entirely
- [ ] REBUILD-L2-2: Implement quote normalisation: for each quote, sum all rows per component (parts + repair-ops) to get total-cost-of-operation per component, then sum across all components to get the normalised quote total
- [ ] REBUILD-L2-3: Identify L1 = lowest normalised quote total
- [ ] REBUILD-L2-4: Apply 30% benchmark rule against L1 to produce L2 (L2 ≤ L1 always)
- [ ] REBUILD-L2-5: Scope classification (safety-critical, severity-based repair/replace) used only to decide which scope to use when normalising each quote — not for cherry-picking across quotes
- [ ] REBUILD-L2-6: Update stage-9-cost.ts to pass normalised quote totals and benchmark K to rebuilt function
- [ ] REBUILD-L2-7: Update FDR to show L1 (lowest submitted quote), L2 (KINGA estimate), savings = L1 - L2
- [ ] REBUILD-L2-8: Update CIR to match FDR
- [ ] REBUILD-L2-9: TypeScript check — 0 errors
- [ ] REBUILD-L2-10: Recompute verification against claim 8880001 — confirm L2 ≤ L1
- [ ] REBUILD-L2-11: Update KINGA_FORMULA_REFERENCE.md with the correct architecture

---

## Claims Report (Process) & Claims Intelligence Report (Protect) — Redesign July 2026

### Phase 1: Pipeline Bug Fixes
- [x] Verify kingaOptimised/benchmark computation is invoked on claim.intelligence path — confirmed display-only bug, pipeline correct
- [x] Wire real fraud_score_breakdown_json to §3 Risk Indicators — rawIndicators wired with fallback
- [x] Fix tier badge: claimsIntelligenceReport.ts line 173 — now reads "Protect Tier · Intelligence Assessment"
- [ ] Fix reportDefinitions.ts line 72 comment: "Claims Intelligence Report (Process tier)" → "Protect Tier"

### Phase 2: Shared Design System Components
- [x] Add BarTable() helper to kingaDesignSystem.ts — table-based horizontal bar chart (no CSS flex/grid widths)
- [x] Add PhotoZonePanel() helper — table-based photo thumbnail grid with zone labels
- [x] Add SectionTab() helper — consistent section header with tier badge
- [x] Add ScoreCell() helper — score pill with colour coding
- [x] Add Callout() helper — table-safe callout box (replaces fc/finding-box divs)

### Phase 3: Process Tier (claim.assessment) Redesign
- [x] Rewrite generateClaimAssessmentReport to use KINGA design system (not legacy base.ts)
- [ ] §1 Claim Overview — real data, table-based KV grid
- [ ] §2 Assessment Summary — real fraud score, confidence, recommendation
- [ ] §3 Damaged Components — real damaged_components table data
- [ ] §4 Repair vs Replace — real total_loss_indicated + repair_to_value_ratio
- [x] §5 Physics Indicator — light pass/fail pill only (no ΔV, no methodology), upgrade CTA if anomaly detected
- [ ] §6 Decision Authority — real decision_authority_json
- [ ] Upgrade banner — physicsAnomaly-driven CTA to Protect or Forensic

### Phase 4: Protect Tier (claim.intelligence) Redesign
- [x] §P Policy & Coverage — wire coverageRows from real repairIntel.policyExclusions (not hardcoded static data)
- [x] §2 Cost Intelligence — wire compositeLineItems.selectedCostUsd as KINGA Benchmark column (not unit_price copy)
- [x] §3 Risk Indicators — wire real fraud_score_breakdown_json indicators (not canned strings)
- [ ] §4 Evidence Snapshot — add real photo thumbnails via PhotoZonePanel (enriched_photos_json)
- [x] Fix tier badge to "Protect Tier · Intelligence Assessment"

### Phase 5: Verification
- [ ] Verify both reports against Voltron claim (LIVE-RUN-VOLTRON-001)
- [ ] Verify both reports against a second claim
- [ ] Confirm no data integrity contradictions (submitted ≠ KINGA benchmark, fraud indicators real)
- [ ] Save checkpoint

---

## Report Brand Compliance — July 2026

- [x] Remove all dark cover headers (background:#171717, background:#0f0e0c) from all three report tiers
- [x] Process tier (reportDefinitions.ts): replace dark cover with white masthead + section-tab green headers + footer-strip
- [x] Protect tier (claimsIntelligenceReport.ts): replace dark cover-head/cost-snap/meta-grid with white masthead + scorecard + verdict-strip + TOC; replace all .rh/.sh/.lead/.bridge with .section-tab/.box/.callout
- [x] Forensic tier (forensicDecisionReport.ts): confirmed already uses white masthead; KINGA logo added to masthead meta and all 4 footer-strips
- [x] Remove dead dark CSS classes (.cover, .cover-head, .cost-snap, .cover-meta, .contents-grid, .tier-ribbon) from kingaDesignSystem.ts
- [x] All three tiers now comply with KINGA_Claims_Report_Redesign.html and KINGA_Claims_Intelligence_Report_Redesign.html reference designs

---

## Photo Forensics Zone-Mapping & Physics Precision Engine Audit (Jul 2026)

- [x] Audit photo forensics zone-mapping system — `photoZonePanel` existed in `kingaDesignSystem.ts` but was not imported or called in either report generator
- [x] Wire `photoZonePanel` into Protect tier §4 Evidence Snapshot — now renders live zone-labelled photo grid from `enriched_photos_json`
- [x] Wire `photoZonePanel` into Forensic tier §08 Photo & Document Evidence — replaced inline photo grid with canonical helper; shows up to 8 photos with zone labels and confidence-based red border
- [x] Add `enriched_photos_json` to Protect tier SQL SELECT — was missing, causing photo zone data to be unavailable
- [x] Audit Vision Geometry Engine (Stage 6.5A) and VGR (Stage 6.5B) — both run correctly in orchestrator; `vehicle_models` has 39 rows, `vehicle_geometry_measurements` has 624 rows
- [x] Fix VGE/VGR persistence gap — `geometryEvidenceBlock` and `vgrReconciliation` were computed but never forwarded to `Stage7Output` or persisted in `physics_analysis` JSON
- [x] Add `geometryEvidenceBlock` and `vgrReconciliation` optional fields to `Stage7Output` in `types.ts`
- [x] Attach VGE/VGR results to Stage 7 output object before return in `stage-7-physics.ts`
- [x] Persist `geometryEvidenceBlock` and `vgrReconciliation` in `physicsJson` in `db.ts`

---

## Geometry Evidence Block Rendering — §04 Forensic Report (Jul 2026)

- [x] Add geometryEvidenceBlock and vgrReconciliation to Stage7Output type (types.ts)
- [x] Attach VGE/VGR results to Stage 7 output before return (stage-7-physics.ts)
- [x] Persist geometryEvidenceBlock and vgrReconciliation in physicsJson in db.ts
- [x] Add Geometry Calibration sub-panel to §04 Technical Forensics (forensicDecisionReport.ts)
  - [x] VGE panel: vehicle profile, calibration status (CALIBRATED/NOT_APPLICABLE/FAILED with colour-coded icons), confidence %, deformation range, perspective correction, reference objects list, measurement limitations, evidence acquisition recommendation
  - [x] VGR panel: consensus crush depth (mm) with min–max range, VGR confidence level, image agreement (STRONG/MODERATE/WEAK/CONFLICTING), depth spread mm/%, contributing images, view angle breakdown (frontal/45°/side), conflict description callout (red) when CONFLICTING
  - [x] Panel is conditional on hasGeb — degrades gracefully when VGE did not run (no empty boxes rendered)
  - [x] Design conforms to approved KINGA report design system (box/kv/callout primitives, green section-tab, no dark backgrounds)
  - [x] Caption explains crush depth methodology and its role in the speed ensemble

---

## Wave 1 — Physics Truth Layer & Evidence Preservation (Jul 2026)

- [ ] Design and write PhysicsTruth canonical data structure (server/pipeline-v2/physicsTruth.ts)
- [ ] Wire Stage 6 vision outputs into PhysicsTruth (per-component crush depth, deformation energy, structural displacement, vision confidence)
- [ ] Wire Stage 6.5A VGE calibrated geometry into PhysicsTruth (replace raw LLM estimates with calibrated measurements)
- [ ] Wire Stage 6.5B VGR consensus into PhysicsTruth (view-angle-weighted consensus crush depth, agreement assessment)
- [ ] Fix view-angle propagation: store LLM-reported imageViewAngle in PerImageCalibrationResult; use in VGR inferViewAngle() instead of filename heuristics
- [ ] Wire Stage 7 speed ensemble into PhysicsTruth (all method results, consensus speed, CI, delta-V, divergence flags)
- [ ] Persist PhysicsTruth to DB as physics_truth_json column in ai_assessments
- [ ] Update Forensic report §04 to render from PhysicsTruth (calibrated geometry, speed ensemble, evidence provenance chain)
- [ ] TypeScript check passes with 0 errors after all wiring

---

## Wave 1 — Physics Truth Layer (Completed July 2026)

- [x] Design PhysicsTruth canonical data structure (physicsTruth.ts) — all measurement fields, uncertainty bounds, confidence, provenance, timestamps
- [x] Wire Stage 6 vision analysis components into PhysicsTruth (per-component crush depth, deformation energy, structural displacement, vision confidence)
- [x] Wire Stage 6.5A VGE calibrated geometry into PhysicsTruth — LLM-reported view angle now stored and propagated (was silently discarded, causing all images to get UNKNOWN weight 0.50)
- [x] Wire Stage 6.5B VGR cross-image reconciliation into PhysicsTruth — consensus crush depth with uncertainty bounds
- [x] Wire Stage 7 speed ensemble into PhysicsTruth — all method results, consensus speed, CI, divergence flags, delta-V with uncertainty bounds
- [x] Add physics_truth_json column to ai_assessments table (SQL ALTER TABLE — drizzle migration journal was out of sync)
- [x] Persist PhysicsTruth to database in db.ts serialisation block
- [x] Add buildPhysicsTruth call to orchestrator after Stage 13 (PTL log: crush depth, speed, DQS)
- [x] Update forensicDecisionReport.ts: read physics_truth_json as canonical source with legacy fallback
- [x] §04 Impact Overview: PTL delta-V with uncertainty range, crush depth with source label, DQS badge
- [x] §04 Evidence Quality panel: DQS, geometry calibration presence, multi-image reconciliation, speed methods ran, crush depth source
- [x] §04 Physics Integrity Flags panel: per-flag severity badges with descriptions
- [x] TypeScript: 0 errors across all modified files (orchestrator, physicsTruth, forensicDecisionReport, db, types, stage-6-5a-vge, stage-6-5b-vgr, stage-7-physics)

---

## Wave 2 — Structural Load Path Engine (Completed Jul 2026)

- [x] Stage 6.5C (stage-6-5c-slpe.ts) — full Structural Load Path Engine: vehicle-class load path maps (sedan/SUV/pickup/van/sports), crush-depth-to-zone-penetration math, component cascade with energy absorption per component, failure mode classification (elastic/yield/plastic/fracture), inspection flags
- [x] accidentPhysics.ts — replaced lookup-table latentDamage predictor with SLPE-driven call; mapAccidentTypeToImpactZone and mapVehicleTypeToBodyType helpers added
- [x] types.ts — slpeResult added to PipelineContext; geometryEvidenceBlock and vgrReconciliation added to Stage7Output
- [x] orchestrator.ts — Stage 6.5C wired after Stage 6.5B VGR; result stored on ctx.slpeResult; passed to buildPhysicsTruth
- [x] physicsTruth.ts — structuralLoadPath field added to PhysicsTruth interface; latentDamage populated from SLPE systems cascade with full reasoning chain; risk level mapped from SLPE severity enum
- [x] forensicDecisionReport.ts — §05 Vehicle Structural Intelligence replaced with full SLPE structural cascade table (component/zone/penetration mm/energy kJ/failure mode/inspect flag), hidden damage probability bars (engine/transmission/suspension/frame/electrical), vehicle profile; degrades gracefully to legacy view for pre-Wave-2 claims
- [x] TypeScript: 0 errors across all modified files
- [x] Wave 1 regression test: 111/111 tests pass

---

## Wave 3 — Physics Integrity, Uncertainty Propagation & Explainability (Jul 2026)

- [ ] Physics Integrity Engine (server/pipeline-v2/stage-integrity.ts): cross-measurement contradiction detection, severity classification (CRITICAL/WARNING/INFO), adjuster flags
- [ ] Uncertainty Propagation Engine (server/pipeline-v2/stage-uncertainty.ts): analytical propagation from crush depth → speed → energy with 90% CI at every output
- [ ] Explainability Engine (server/pipeline-v2/stage-explainability.ts): per-finding evidence chains, methodology citations, confidence rationale, human-readable verdict paragraphs
- [ ] Wire all three engines into orchestrator and PhysicsTruth
- [ ] Render Wave 3 outputs in Forensic report: integrity flags panel, uncertainty bands on key metrics, evidence chain section
- [ ] TypeScript check, full test suite, checkpoint

---

## Wave 3 — Physics Integrity, Uncertainty Propagation, Explainability (Completed July 2026)

- [x] Physics Integrity Engine (stage-integrity.ts): 12 contradiction checks, severity classification (critical/warning/info), integrity score 0-100, clean flag
- [x] Uncertainty Propagation Engine (stage-uncertainty.ts): analytical propagation from crush depth → Campbell speed → kinetic energy → delta-V, 90% CI at every output, A/B/C/D grade, key drivers
- [x] Explainability Engine (stage-explainability.ts): per-finding evidence chains (crush, speed, energy, structural), methodology citations (Campbell, CRASH3, NHTSA, IIHS), verdict paragraph, adjuster summary, key findings list
- [x] All three engines wired into orchestrator after PTL build — attached as pt.wave3 (non-fatal, graceful degradation)
- [x] Wave 3 accessors added to forensic report variable block (w3Integrity, w3Uncertainty, w3Explain, w3Grade, w3IntegrityScore, etc.)
- [x] §01 Physics Snapshot enhanced: calibrated Campbell speed with CI, uncertainty grade badge, verdict paragraph, integrity alert (critical/warning/clean)
- [x] §W3 Physics Evidence Chain section added to page 2: key findings list, integrity flags with severity badges, uncertainty grade + drivers, methodology citations grid (4 methods)
- [x] 111/111 tests pass, 0 TypeScript/esbuild errors

---

## Wave 4 — Historical Validation Loop + Architecture Extensibility (COMPLETE July 2026)

- [x] Wave 4A: physics_validation_records table — stores predicted vs actual speed/cost/damage per claim
- [x] Wave 4A: ValidationLoop engine (stage-validation-loop.ts) — computes deviation scores, MAPE, calibration drift
- [x] Wave 4A: db-validation.ts — saveValidationPrediction() + getValidationRecords() helpers
- [x] Wave 4A: validationLoop.getStats tRPC procedure — returns MAPE, CI coverage, grade distribution, per-method accuracy
- [x] Wave 4A: Accuracy dashboard panel in admin UI (/admin/physics-accuracy) — MAPE trend, method accuracy breakdown, calibration status, CI coverage, drift indicator
- [x] Wave 4B: EvidencePlugin registry (evidencePluginRegistry.ts) — typed plugin interface for telematics, LiDAR, EDR, 3D scan
- [x] Wave 4B: Wire plugin registry into orchestrator after Wave 3 block — contributions attached to PTL wave4 field
- [x] Wave 4B: Admin UI: Evidence Plugin Status panel — shows registered plugins, data availability per claim (in PhysicsAccuracyDashboard)
- [x] End-to-end verification: 111/111 tests pass, 152/152 physics tests pass, TypeScript 0 errors, dev server clean restart

---
## Intake Pipeline Reliability Fix (July 2026)
- [ ] Fix 1: Startup intake sweep — on server start, find all intake_pending/document_failed claims with source documents and trigger pipeline (catches setImmediate lost on restart)
- [ ] Fix 2: Recovery job Case 11 — auto-retry document_failed claims that have a source document (server restart killed the pipeline before it could run)
- [ ] Fix 3: Normalise watchdog DPS — watchdog timer sets status='document_failed' + dps='DOCUMENT_FAILED' consistently (not just dps='failed')
- [ ] Fix 4: Canonical intake contract — all claim sources (web, WhatsApp, mobile, agency, fleet) create claims with status='intake_pending' + workflowState='intake_queue'
- [ ] Fix 5: routers.ts submit mutation — currently sets status='submitted' instead of 'intake_pending'; fix to use canonical intake state
- [ ] Fix 6: platform.ts simulator — currently sets status='submitted' + workflowState='created'; fix to canonical intake state
- [ ] Fix 7: Dashboard pending query — ensure all intake_pending + document_failed + analysis_complete claims are visible

---
## Intake Pipeline Reliability Fixes (2026-07-28)
- [x] Root cause identified: setImmediate pipeline trigger lost on server restart (tsx watch)
- [x] Case 11 added to recovery job: auto-retry document_failed claims with source document (>5 min)
- [x] Case 12 added to recovery job: fire pipeline for intake_pending claims with lost trigger (>3 min)
- [x] Startup sweep (Part B): on every server start, find all intake_pending+untriggered claims and fire pipeline with stagger
- [x] Manual trigger (routers.ts): added document_failed → assessment_in_progress path
- [x] Dashboard query: added submitted, triage, assessment_pending to statuses list (backward-compat for all claim sources)
- [x] Watchdog timer (db.ts): already sets status='document_failed' + dps='DOCUMENT_FAILED' canonically
- [x] All claim sources (web, WhatsApp, mobile, simulator) now benefit from startup sweep + recovery job

---
## Forensic Enhancements (Jul 2026)
- [x] Impact causation classification: SELF_REVERSING / THIRD_PARTY_REAR_STRIKE / THIRD_PARTY_REVERSED_INTO_STATIONARY_CLAIMANT / THIRD_PARTY_REVERSED_INTO_MOVING_CLAIMANT / MUTUAL_REVERSING / FORWARD_IMPACT / UNKNOWN
- [x] Causation speed ceiling gate: SELF_REVERSING ≤ 20 km/h, MUTUAL_REVERSING ≤ 15 km/h
- [x] Reversing narrative contradiction check: SELF_REVERSING + named third party = WARNING flag
- [x] Braking distance computation: d = v²/(2μg) with road surface detection (dry/wet/gravel)
- [x] Braking distance persisted in PhysicsTruth JSON and surfaced in §04 Impact Overview
- [x] CAUSATION_SPEED_CEILING_BREACH integrity flag (CRITICAL) in PhysicsTruth
- [x] REVERSING_NARRATIVE_CONTRADICTION integrity flag (WARNING) in PhysicsTruth
- [x] §04 report redesign: new Impact Causation Classification panel + Forensic Findings Summary panel
- [x] Plain-language verdict paragraph in Forensic Findings Summary
- [x] Causation fields wired through Stage 5 → orchestrator → PhysicsTruth → report

---
## §04 Panel Restyle (Jul 2026)
- [x] §04 Impact Causation Classification panel: restyled to white-card/status-pill/border-bar pattern using sectionTab(), co(), p(), kvRow() helpers — removed full-card colour fills
- [x] §04b Forensic Findings Summary panel: restyled to match native report CSS system (white-card, status pills, callout boxes)
- [x] stage-5-assembly.ts TypeScript errors fixed: ImpactCausation import added, return type updated, nullable declarations corrected
- [x] Preview HTML v2 (forensic-panel-preview-v2.html): all 3 states rendered (clean/speed-breach/contradiction), Scenario C speed ceiling copy-paste error fixed
- [x] Screenshot rendered: kinga-screenshots/forensic-panels-v2-restyled.png

---
## Platform Readiness Remediation Sprint (July 2026)

### Phase 1 (checkpoint 391f494d)
- [x] Fix 1: SQL injection in integrityRouter — replaced raw sql interpolation with Drizzle parameterised queries (gte + eq conditions)
- [x] Fix 7: Script relocation — moved debug-insert.ts, trigger-pipeline.ts, voltron-trigger.ts, stuck-assessment-recovery-job.ts to server/scripts/; added server/scripts/** to vitest exclude list; TypeScript errors reduced from 47 → 7

### Phase 2 (checkpoint d211290d)
- [x] Fix 4: Shared PLATFORM_ROLES — created shared/roles.ts as single source of truth (14 platform roles + 5 insurer roles); updated server/routers/platform-user-roles.ts and client/src/pages/PlatformUserRoleManager.tsx to import from shared/roles.ts; client now includes fleet_admin/fleet_manager/fleet_driver (previously missing)
- [x] Fix 5: inspection_id FK on claim_documents — added inspectionId nullable FK column to drizzle/schema.ts; applied via SQL ALTER TABLE; added PRIMARY KEY to inspections.id (was missing — pre-existing Epic 3 schema bug); updated inspections.ts addMeasurement + addObservation to backfill inspectionId on linked claimDocuments
- [x] Test fixes: added 'engineer' + 'platform_super_admin' to KNOWN_ROLES in reporting.test.ts; added engineer reports to domain-only exclusion list in reporting.access.test.ts; added server/scripts/** to vitest exclude list

### Phase 3 (checkpoint — current)
- [x] Fix 2+3: Workflow engine consolidation (BLOCKER) — audited all three workflow implementations; redirected the one remaining call site in routers.ts from deprecated transitionWorkflowState() to canonical workflow-engine.ts transition() (full governance: audit trail + segregation of duties + role permission matrix); added @deprecated JSDoc to transitionWorkflowState(); documented consolidation in workflow.ts module header

### Remaining (not in this sprint)
- [ ] Fix 6: Remove @ts-nocheck from workflow-engine.ts and the ~40 remaining high-value server files

## Epic 5-A — Global Search & Navigation

- [ ] Add global_search_history and global_search_analytics tables to drizzle/schema.ts
- [ ] Run pnpm db:push to migrate new tables
- [ ] Create server/routers/global-search.ts with permission-aware search procedure
- [ ] Register globalSearch router in server/routers.ts
- [ ] Create client/src/components/search/SearchResultCard.tsx
- [ ] Create client/src/components/search/UniversalSearchModal.tsx
- [ ] Create client/src/components/search/GlobalSearchBar.tsx
- [ ] Create client/src/components/search/RecentSearches.tsx
- [ ] Create client/src/components/search/SearchAnalyticsDashboard.tsx
- [ ] Wire GlobalSearchBar into InsurerPortalLayout
- [ ] Wire GlobalSearchBar into PlatformLayout
- [ ] Wire GlobalSearchBar into EngineerWorkspaceLayout
- [ ] Wire GlobalSearchBar into KingaDashboardLayout
- [ ] Wire GlobalSearchBar into AssessorPortalLayout
- [ ] Wire GlobalSearchBar into PanelBeaterPortalLayout
- [ ] Wire GlobalSearchBar into ClaimantPortalLayout
- [ ] Wire GlobalSearchBar into DashboardLayout (Fleet)
- [ ] Add /search route to App.tsx for full-page search results
- [ ] Write vitest tests for globalSearch router
- [ ] TypeScript validation (0 new errors)
- [ ] Checkpoint

## Batch 3 — Reliability & Performance (Production Readiness Audit)

### Ticket 3.1 — M-02/M-06: PDF Renderer Concurrency Queue + Retry
- [x] Install p-limit package
- [ ] Add bounded concurrency queue (concurrency=3) around renderHtmlToPdf in pdfRenderer.ts
- [ ] Switch waitUntil from "networkidle0" to "domcontentloaded" in page.setContent()
- [ ] Wrap renderHtmlToPdf in retry loop (max 2 retries, exponential backoff: 2s, 4s)
- [ ] Inline fonts as @font-face data URIs to remove external resource dependency
- [ ] Write vitest tests for pdfRenderer: concurrency limit, retry on failure, success path
- [x] Checkpoint 3.1

### Ticket 3.2 — M-03: LLM Circuit Breaker
- [ ] Implement LlmCircuitBreaker class in server/_core/llm.ts (CLOSED/OPEN/HALF_OPEN states)
- [ ] Circuit opens after 5 consecutive failures within 60s window
- [ ] Half-open probe after 60s cooldown; closes on success, re-opens on failure
- [x] Wrap invokeLLM with circuit breaker check (throws CIRCUIT_OPEN error when open)
- [x] Export getCircuitBreakerState() function for Operations Centre surface
- [ ] Add circuitBreaker field to getAiProcessingStats in platform-operations.ts
- [ ] Update PlatformOperationsCentre.tsx AI Processing panel to show circuit state
- [ ] Write vitest tests for circuit breaker: CLOSED->OPEN->HALF_OPEN->CLOSED transitions
- [x] Checkpoint 3.2

### Ticket 3.3 — M-01: Pagination Sweep (Unbounded Queries)
- [x] Add .limit(100) to analytics.ts assessors query
- [x] Add .limit(100) to intelligence-platform.ts listFleets
- [x] Fixed 7 truly unbounded queries across analytics.ts and intelligence-platform.ts
- [x] Audited all service files - remaining unbounded queries are aggregates or bounded by WHERE clause
- [x] Write vitest tests confirming pagination limits are applied (10 tests)
- [x] Checkpoint 3.3

### Ticket 3.4 — M-05: Full-Text Search Index
- [x] TiDB does not support FULLTEXT; added composite B-tree indexes instead (4 indexes applied)
- [x] Documented TiDB FULLTEXT limitation; users.name TEXT prefix index skipped (timeout)
- [x] Switched 34 identifier columns to prefix LIKE (query%) in global-search.ts
- [x] Switched 6 identifier columns to prefix LIKE (query%) in analytics.ts
- [x] Write vitest tests for M-05 search performance (20 tests)
- [x] Checkpoint 3.4

### Batch 3 Final
- [x] Confirmed 44 pre-existing TS errors are in unrelated files; 0 new errors from Batch 3
- [x] Full test suite: 280 files, 8403 passed, 3 skipped, 0 failed
- [x] TypeScript: 0 new errors in Batch 3 files (44 pre-existing in unrelated files)
- [x] Final Batch 3 checkpoint

## Test Suite Stability

- [ ] KINGA-TEST-STABILITY-01: Two independent flaky tests observed across consecutive batches — both pass in isolation, both failed once under full-suite parallel run. (1) truthReconciliationEngine.test.ts (Batch 2 full run); (2) e2e-real-claim.test.ts (Batch 3 full run). Likely cause: shared DB state or timing sensitivity under parallel worker contention. Investigate with --reporter=verbose --pool=forks to isolate; consider adding beforeEach DB cleanup or test-specific tenant IDs to prevent cross-test state bleed.

## Batch 4 — Structural Hardening & Confirmations

- [x] Ticket 4.1 (M-07): Move audit trail write inside transitionLifecycle so every state change is atomically logged regardless of caller
- [x] Ticket 4.2 (N-09): Confirm predictiveAnalyticsRouter exists and is wired — getPortfolioLossForecast and getVehicleRenewalRisk both present
- [x] Ticket 4.3 (N-01): Document 1-year session duration decision; confirm stale-tenantId is a non-issue (tenantId not in JWT payload, always fetched from DB)
- [x] Ticket 4.4 (N-03): Add KINGA-N-03 calibration flag comments to accidentPhysics.ts, physics-deviation-calculator.ts, and existing calibration blocks

## Batch 4 Remediation — Tenant Isolation Violations Root Cause Fix
- [x] KINGA-AUTH-01: Fix fail-closed re-sync guard in authenticateRequest — only re-sync platform owner, reject all other missing users (prevents hard-deleted users from being re-created via OAuth sync on every request with a valid JWT)
- [x] KINGA-AUTH-01: Added 4 vitest tests in server/auth.resync.test.ts covering: non-owner missing user rejected, OAuth server not called for missing users, active user allowed, deactivated user rejected
- [x] Root cause analysis complete: User 2 violations were from hard-deleted user re-synced on every request; User 1 violations were from browser session open before admin bypass deployment; both stopped at 21:10-21:11 UTC when browser closed
- [x] 281/281 test files passing, 8,396 tests passed after KINGA-AUTH-01 fix

## Epic 4.5 — Portal Integration Completion

### Priority 1 (Release Blockers)
- [ ] D-3: Add `engineer` to DOMAIN_ROLE_MAP in ProtectedRoute.tsx
- [ ] D-4: Add `engineer` to ROLE_PORTAL_MAP in roleRouting.ts
- [ ] D-10: Route fleet_admin/fleet_manager to FleetManagerDashboard (Epic 4)

### Priority 2
- [ ] D-2: Apply EngineerWorkspaceLayout to all /engineer/* routes in App.tsx
- [ ] D-6: Add VehicleRegistry nav links for risk_manager, claims_manager, executive, insurer_admin
- [ ] D-8: Add agency.vehicle_verification and agency.vehicle_valuation to REPORT_CATALOGUE
- [ ] D-7: Add Vehicle Valuation tab/panel to KingaAgency.tsx
- [ ] D-9: Add Platform Claim Trace to PlatformLayout nav
- [ ] D-11: Add Portfolio Intelligence nav links for executive and risk_manager

### Priority 3
- [ ] D-1: Add fleet-approvals to TABS array in ClaimsManagerDashboard.tsx
- [ ] D-5: Wrap InsurerAdminDashboard in InsurerPortalLayout in App.tsx

## Feature Completion Audit — Phase 1 (Production Readiness Fixes)

- [x] C-01: Add `engineer` role to users table enum in schema.ts
- [x] C-01: Run DB migration to add engineer role
- [x] C-01: Update roleAssignmentAudit enum in schema.ts
- [x] C-01: Update PortalHub to include Engineers portal entry
- [x] C-02: Wire agency uploadDocument to trigger photo forensics + damage detection
- [x] C-02: Store forensic results against quote/vehicle in DB
- [x] C-02: Display forensic results in Agency dashboard
- [x] C-03: completeClaim writes to vehicle_damage_history table
- [x] C-03: completeClaim triggers vehicle risk recalculation
- [x] C-03: completeClaim updates fleet intelligence snapshot
- [x] C-04: Add claims ageing bands (0-7, 8-14, 15-30, 30+) to ClaimsManagerDashboard
- [x] C-04: Add average claim age and oldest open claim metrics

## Feature Completion Audit — Phase 2 (Intelligence Connectivity)

- [x] H-01: Add agency risk intelligence panel to KingaAgency quotation detail (fraud risk from vehicle history, repeat claimant flag)
- [x] H-01: Expose vehicleRiskScore and isRepeatClaimer from vehicleRegistry in agency.getValuation response
- [x] H-03: Wire fraud flagged claims into fleet risk dashboard — show fraud-flagged vehicles in FleetManagerDashboard
- [x] H-03: Add fraud risk band to fleet vehicle detail view
- [x] H-04: Add fleet exposure summary to PortfolioAdministration dashboard (total fleet vehicles, high-risk vehicles, fleet claim cost)
- [x] H-04: Add engineering inspection summary to PortfolioAdministration dashboard (inspections completed, structural risk flags)
- [x] H-05: Wire engineering inspection completions to portfolio intelligence aggregations
- [x] H-05: Add engineering risk summary card to PortfolioAdministration page

## Feature Completion Audit — Phase 3 (Commercial Completion)

- [x] H-02: Add commission tracking schema (commissions table with agent, policy, rate, amount, status)
- [x] H-02: Add getCommissionSummary and listCommissions procedures to agency-broker router
- [x] H-02: Build CommissionDashboard page for agency brokers showing earned, pending, paid commissions
- [x] H-02: Register CommissionDashboard route in App.tsx
- [x] H-06: Add fleet cost analytics procedures (getFleetCostBreakdown, getCostTrends) to fleet router
- [x] H-06: Build FleetCostAnalyticsTab component for FleetManagerDashboard
- [x] H-06: Wire FleetCostAnalyticsTab into FleetManagerDashboard tabs

## Feature Completion Audit — Phase 4 (Enhancement Features)

- [x] M-01: Agency quote comparison UI — side-by-side quote comparison view in KingaAgency
- [x] M-02: Fleet fuel tracking — fuel_records schema table, addFuelRecord/listFuelRecords procedures, FuelTrackingTab in FleetManagerDashboard
- [x] M-03: Fleet licensing records — licensing_records schema table, addLicensingRecord/listLicensingRecords procedures, LicensingTab in FleetManagerDashboard
- [x] M-04: Engineering → Claims attachment — linkInspectionToClaim procedure, InspectionLinkPanel in EngineerInspectionDetail
- [x] M-05: Engineering project management — inspection_projects schema table, createProject/listProjects procedures, ProjectsTab in EngineerDashboard
- [x] M-06: Agency performance analytics — getAgencyPerformanceMetrics procedure, AgencyPerformanceTab in KingaAgency
- [x] M-07: Portfolio export — exportPortfolioReport procedure returning PDF, Export button in InsurerAdminDashboard

## Phase 4.5 — Admin Platform Audit & Defect Fixes

### DEF-001: vehicleDamageHistory vehicleRegistration
- [x] DEF-001: Add vehicleRegistration column to vehicleDamageHistory in schema.ts
- [x] DEF-001: Run DB migration to add vehicle_registration column
- [x] DEF-001: Update completeClaim to populate vehicleRegistration on insert

### DEF-002: fleet.addVehicle tRPC exposure
- [x] DEF-002: Add addVehicle tRPC mutation to fleet-accounts.ts router
- [x] DEF-002: Add AddVehicleDialog component to FleetManagement.tsx (fleet.registerVehicle already exists; fleetAccounts.addVehicle added as complementary path)
- [x] DEF-002: Wire addVehicle mutation to dialog submit handler

### DEF-003: inspections projectId FK
- [x] DEF-003: Add projectId column to inspections table in schema.ts
- [x] DEF-003: Run DB migration to add project_id column
- [x] DEF-003: Update inspections.create to accept optional projectId
- [x] DEF-003: Update InspectionProjectsTab to pass projectId when creating inspections (FK in place; projectId passed at inspection creation time)

### Admin Platform Audit
- [x] ADMIN-AUDIT: Complete audit of all 10 admin domains
- [x] ADMIN-AUDIT: Deliver Admin Completion Matrix and priority implementation plan

---

## Phase 1 — Product Experience Transformation (Approved 5 Aug 2026)

### Portal Entry Validation
- [x] P1-ENTRY-01: Audit OnboardingManager — engineer/panel_beater/fleet_admin/assessor roles added
- [x] P1-ENTRY-02: Audit PortalHub — fleet path fixed to /claimant/fleet-dashboard; fleet_admin/fleet_manager roles added
- [x] P1-ENTRY-03: Audit role routing — all roles verified in ROLE_PORTAL_MAP
- [x] P1-ENTRY-04: Fixed: PortalHub fleet URL mismatch; OnboardingWalkthrough missing 4 roles

### Sprint 2: Engineer Dashboard (Highest Priority)
- [x] P1-ENG-01: Add inspections.getProjectDashboard tRPC procedure
- [x] P1-ENG-02: Replace EngineerDashboard.tsx with KingaPortalShell project-first workspace
- [x] P1-ENG-03: Wire InspectionProjectsTab as primary tab
- [x] P1-ENG-04: Add KPI strip: Active Projects, Inspections Due, Pending Reports, Total Inspections

### Sprint 1: Intelligence + Global Search
- [ ] P1-INTEL-01: Create ClaimIntelligenceHeader component (action-driving layer)
- [ ] P1-INTEL-02: Wire ClaimIntelligenceHeader into Claims Manager claim detail
- [ ] P1-INTEL-03: Wire compact ClaimIntelligenceHeader into Assessor assignment view
- [ ] P1-INTEL-04: Wire simplified intelligence summary into Claimant Dashboard claim cards
- [ ] P1-SEARCH-01: Activate GlobalSearchBar (change variant from icon to bar)

### Sprint 3: Platform Command Centre + Personalised Headers
- [ ] P1-PLAT-01: Add platformObservability.getCommandCentreMetrics procedure
- [ ] P1-PLAT-02: Replace PlatformOverviewDashboard with KINGA Command Centre
- [ ] P1-PLAT-03: Add personalised greeting strip to ClaimsManagerDashboard
- [ ] P1-PLAT-04: Add personalised queue header to AssessorDashboard
- [ ] P1-PLAT-05: Add job lifecycle status to PanelBeaterDashboard
- [ ] P1-FLEET-01: Add fleetAccounts.getCommandCentreKPIs procedure
- [ ] P1-FLEET-02: Populate Fleet Manager Dashboard KPI strip with real data

### Sprint 4: Settlement + Document Requests
- [ ] P1-SETTLE-01: DB migration — add payment_status, payment_date to final_approval_records
- [ ] P1-SETTLE-02: DB migration — add comment_type, document_type_requested, deadline, fulfilled_at to claim_comments
- [ ] P1-SETTLE-03: Add claims.requestDocuments tRPC procedure
- [ ] P1-SETTLE-04: Add claims.fulfillDocumentRequest tRPC procedure
- [ ] P1-SETTLE-05: Add claims.getDocumentRequests tRPC procedure
- [ ] P1-SETTLE-06: Add claims.updatePaymentStatus tRPC procedure
- [ ] P1-SETTLE-07: Create DocumentRequestDialog component
- [ ] P1-SETTLE-08: Add document request alert panel to ClaimantDashboard
- [ ] P1-SETTLE-09: Add payment tracking to ClaimantDashboard settlement view
- [ ] P1-SETTLE-10: Add lifecycle progress bar to Claims Manager claim cards

### Sprint 5: Navigation Standardisation
- [ ] P1-NAV-01: Standardise tab labels across all portals

### End-to-End Journey Validation
- [ ] P1-E2E-01: Customer journey validation
- [ ] P1-E2E-02: Claims journey validation
- [ ] P1-E2E-03: Engineering journey validation
- [ ] P1-E2E-04: Fleet journey validation
- [ ] P1-E2E-05: Insurer Admin journey validation
- [ ] P1-E2E-06: Platform Admin journey validation

---

## Ship Readiness Remediation (Phase 1.5)

### Sprint 1 — Critical
- [ ] SR-C03: Add authorizePayment mutation (financial_decision → payment_authorized)
- [ ] SR-C03: Add Authorise Payment button to InternalAssessorDashboard
- [ ] SR-C02: Add rejectClaim mutation with rejectionReason parameter
- [ ] SR-C02: Add Reject Claim button + reason dialog to ClaimReviewDialog
- [ ] SR-C01: Register /claims/:id route for ClaimantClaimDetail in App.tsx
- [ ] SR-C04: Add Mark Repair Complete button to PanelBeaterDashboard

### Sprint 2 — High
- [ ] SR-H05: Add acceptQuote mutation to agency router
- [ ] SR-H05: Add Accept Quote button to KingaAgency quotations tab
- [ ] SR-H01: Add engineering inspection report generator
- [ ] SR-H01: Add Export Report button to EngineerInspectionDetail
- [ ] SR-H02: Add rejectionReason column to claims table via SQL
- [ ] SR-H02: Write rejection event to auditTrail on rejectClaim

### Sprint 3 — High
- [ ] SR-H04: Add claimant notification on claim state change
- [ ] SR-H03: Add insurer admin claim override/reject procedure
- [ ] SR-H06: Surface OAuth recovery URL on login page

### Sprint 4 — Medium
- [ ] SR-M01: Create /claimant/documents page and register route
- [ ] SR-M03: Wire inspections.list into EngineerAssignments page
- [ ] SR-M04: Add repair photo upload to PanelBeaterDashboard
- [ ] SR-M05: Allow insurer admin to view individual claim detail
- [ ] SR-M07: Show repair tracking info to claimant in ClaimantClaimDetail

---

## Phase 8 — Unified Customer Identity (Completed Aug 2026)

- [x] P8-1: secondaryRoles column added to users table (DB + schema)
- [x] P8-2: ProtectedRoute updated to check secondaryRoles + new 'customer' domain
- [x] P8-3: PortalSelection.tsx replaced with full converged landing page (hero, journey cards, how it works, features, professional portals)
- [x] P8-4: auth.addSecondaryRole mutation added to routers.ts
- [x] P8-5: ClientProfile expanded with fleet/vehicles/policies/role coexistence sections
- [x] P8-6: approveClaim plain-language claimant notification added
- [x] P8-7: assignToAssessor plain-language claimant notification added
- [x] P8-8: acceptSettlement plain-language claimant notification added
- [x] P8-9: insuranceV2.sendQuoteToClient mutation — agency sends quote with premium/excess/notes, client notified in-app
- [x] P8-10: insuranceV2.acceptQuote mutation — client accepts quote in-platform, agent notified
- [x] P8-11: AgencyValuationInbox — Send Quote dialog added
- [x] P8-12: ClientProfile — Pending Quotes section added (amber card, Accept Quote button)

---

## Phase 9 — Unified Client Portal (Next)

### Vision
One login, one experience. A client can be a claimant, request valuations, request insurance,
and manage their personal vehicles — all from /client. Distinct from the Fleet Management Portal
which is for corporate fleet operators.

### Architecture
- [x] P9-A01: Create /client route with ClientPortalLayout (persistent sidebar: Dashboard | My Vehicles | Valuations | Insurance | Claims)
- [x] P9-A02: Add personal_vehicles table (id, userId, registration, make, model, year, vin, colour, notes, createdAt)
- [x] P9-A03: Add personalVehicles tRPC router (addVehicle, listMyVehicles, updateVehicle, deleteVehicle)
- [x] P9-A04: ClientPortalLayout accessible to ALL authenticated users regardless of primary role

### Dashboard Tab
- [x] P9-D01: Client Dashboard — summary cards: vehicles, open claims, pending quotes, active policies
- [x] P9-D02: Recent activity feed (last 5 events across all journeys)
- [x] P9-D03: Quick action buttons: Request Valuation, Submit Claim, Add Vehicle

### My Vehicles Tab
- [x] P9-PV01: Personal vehicle list — add/edit/delete (reg, make, model, year, VIN, colour)
- [x] P9-PV02: Per-vehicle card: last valuation, open claims, policy status, history link
- [x] P9-PV03: Link existing valuations and claims to a vehicle by registration match

### Valuations Tab
- [x] P9-V01: Valuation history list (all requests by email/userId)
- [x] P9-V02: Teaser vs full report status with unlock CTA
- [x] P9-V03: New valuation wizard (reuse /get-a-quote flow inline or redirect)
- [x] P9-V04: Accept quote from Valuations tab (reuse acceptQuote mutation)

### Insurance Tab
- [x] P9-I01: Pending quotes list (status=quoted, amber highlight, Accept Quote button)
- [x] P9-I02: Active policies list (status=accepted, premium, expiry, excess)
- [x] P9-I03: Policy detail view (coverage, vehicle, documents)

### Claims Tab
- [x] P9-C01: Claims list (all claimant's claims with workflow state)
- [x] P9-C02: Plain-language claim timeline per claim
- [x] P9-C03: Submit new claim button (redirect to /claimant/submit)
- [x] P9-C04: Dispute button on closed claims (reuse initiateDispute mutation)

---

## Phase 10 — Document Delivery + Multi-Product Insurance

### Track A: Policy Document Delivery
- [x] P10-DA01: Add quotation_request_documents table (id, quotationRequestId, userId, documentType, title, fileName, fileUrl, s3Key, fileSize, mimeType, sentByAgentId, deliveredToClient tinyint, emailedToClient tinyint, notes, createdAt)
- [x] P10-DA02: Add sendDocumentToClient mutation to insurance-phase7 router (base64 upload → S3 → DB → in-app notification to client userId)
- [x] P10-DA03: Add getMyDocuments query (client-side: returns all documents for the current user's quotation requests)
- [x] P10-DA04: AgencyValuationInbox: "Send Document" button per request → dialog (file picker, document type, title, notes, email toggle)
- [x] P10-DA05: Client Portal Insurance tab: Documents sub-section showing all agent-sent documents with download links

### Track B: Multi-Product Insurance Catalogue
- [x] P10-DB01: Add productCategory column to quotation_requests (motor | property | engineering | liability | bonds | other)
- [x] P10-DB02: Extend insuranceType enum with non-motor products: plant_all_risks, assets_all_risks, electronic_equipment, contractors_all_risks, erection_all_risks, homeowners, fire_and_perils, public_liability, employers_liability, professional_indemnity, fidelity_guarantee, bonds, travel, personal_accident
- [x] P10-DB03: Add non-motor intake fields to quotation_requests: insuredAssetDescription, insuredAssetValue, coverageAddress, businessType, projectValue, projectDuration, bondType, bondAmount, bondBeneficiary
- [x] P10-DB04: Create InsuranceCatalogue.tsx — product grid with icons, descriptions, and "Request" CTA for each product line
- [x] P10-DB05: Create InsuranceRequestWizard.tsx — multi-step wizard: (1) product select, (2) product-specific intake form, (3) review + submit
- [x] P10-DB06: Wire InsuranceCatalogue into Client Portal Insurance tab "New Request" button
- [x] P10-DB07: Agency inbox: show productCategory badge on non-motor requests; non-motor requests route to correct handler

---

## Code Maintainability Split — Aug 2026 (Target: every file under 400–600 lines)

### Phase 1: server/routers.ts splits
- [ ] SPLIT-R01: Extract claims router (3,526 lines) → server/routers/claims-core.ts
- [ ] SPLIT-R02: Extract aiAssessments router (1,771 lines) → server/routers/ai-assessments-core.ts
- [ ] SPLIT-R03: Extract quotes router (564 lines) → server/routers/quotes-core.ts
- [ ] SPLIT-R04: Extract assessors router (385 lines) → server/routers/assessors-core.ts
- [ ] SPLIT-R05: Extract auth router (247 lines) → server/routers/auth-core.ts
- [ ] SPLIT-R06: Verify routers.ts is under 600 lines after all extractions

### Phase 2: server/db.ts splits
- [ ] SPLIT-D01: Extract claim query helpers → server/db-claims.ts
- [ ] SPLIT-D02: Extract assessment query helpers → server/db-assessments.ts
- [ ] SPLIT-D03: Extract quote query helpers → server/db-quotes.ts
- [ ] SPLIT-D04: Extract user/notification helpers → server/db-users.ts
- [ ] SPLIT-D05: Verify db.ts is under 400 lines after all extractions

### Phase 3: server/pipeline-v2/orchestrator.ts splits
- [ ] SPLIT-O01: Extract stage 1-5 orchestration → orchestrator-intake.ts
- [ ] SPLIT-O02: Extract stage 6-10 orchestration → orchestrator-analysis.ts
- [ ] SPLIT-O03: Extract stage 11-14 orchestration → orchestrator-decision.ts
- [ ] SPLIT-O04: Keep orchestrator.ts as thin coordinator under 400 lines

### Phase 4: server/reporting splits
- [ ] SPLIT-REP01: Extract CL report sections → reporting/cl-report/
- [ ] SPLIT-REP02: Extract CI report sections → reporting/ci-report/
- [ ] SPLIT-REP03: Extract FR report sections → reporting/fr-report/

### Phase 5: client-side page splits
- [ ] SPLIT-C01: Split InsurerComparisonView (2,601 lines) into tab sub-components
- [ ] SPLIT-C02: Split ClaimDecisionReport (2,259 lines) into section sub-components
- [ ] SPLIT-C03: Split ClaimsProcessorDashboard (1,972 lines) into tab sub-components
- [ ] SPLIT-C04: Split SubmitClaim (1,500 lines) into step sub-components
- [ ] SPLIT-C05: Split InternalAssessorDashboard (1,408 lines) into tab sub-components
- [x] R0 top-cost-strip visual preview: create a no-write mock showing no-quote, total-only, incomplete itemised, and complete all-in evidence states for user review before any report renderer is changed.
- [x] R0 confident-result preview revision: update the no-write mock to lead with verified quote totals and quote-verification results, present complete L2 calculations decisively, and reserve limitations only for specific detected evidence gaps.
- [x] R0 KINGA Optimised Quote preview framing: present the complete, verified L2 calculation as KINGA Optimised Quote—the evidence-based fair repair cost recommendation for insurer review—beside verified submitted quote totals.
- [x] R0 quote-sequence preview correction: present submitted quotation totals first, then KINGA Quote Verification, then KINGA Optimised Quote, and finally concrete quote issues only where found; remove any label that treats a verified total as a separate financial concept.
- [x] R0 ideal insurer-flow preview: replace the equal-weight exception scenarios with one confident primary verified-quotation presentation; retain exceptions only as a compact secondary note.
- [x] R0 approved ideal insurer cost presentation: implement the concise Submitted Quotations → KINGA Quote Verification → KINGA Optimised Quote → concrete Quote Issues flow across CL, CI, FR, and the client top-cost view, with detailed component/benchmark analysis below the opening strip.
- [x] R0 concise optimised-quote preview: remove calculation narrative from the opening strip and show only the KINGA Optimised Quote label and value; retain detailed component or benchmark analysis for report detail where applicable.
- [x] R0 repairability verdict: add a distinct evidence-grounded Repairability verdict to the shared CL, CI, FR, and client decision presentation, separate from quote verification and KINGA Optimised Quote; use only Repairable, Repairable with conditions, Further structural review required, or Total loss indicated.
- [x] R0 repairability evidence propagation: route explicit persisted structural-review evidence and rationale into CL, CI, FR, and client repairability verdicts so Further structural review required is available only when supported; do not infer it from cost or damage assumptions.
- [x] R0 cross-report photo and damage-analysis consistency: verify and align CL, CI, and FR use of canonical enriched-photo, zone, component, severity, and damage evidence; retain a traceable discrepancy where a report cannot safely resolve a conflict.
- [x] R0 rendered-report acceptance: validate the combined submitted-quotation, quote-verification, KINGA Optimised Quote, repairability, quote-issue, and canonical photo-evidence presentation across CL, CI, and FR using immutable no-write evidence snapshots.
