# Post-P0 Assessment PDF Server Authority

The former Assessment PDF endpoint accepted a complete client-controlled report object. It now accepts only a positive persisted `claimId`, requires an insurer-tenant session, resolves the report through `resolveReportRecord`, and maps that canonical record to the legacy PDF template. Unrecognised injected fields such as `estimatedCost` and `damageDescription` are stripped by the input schema and are never rendered.

The pre-persistence Assessment Results page can no longer request an authoritative PDF from transient session storage. It now visibly states that a claim must be created before export, avoiding any implication that an unpersisted, editable client payload is a verified document.

The live-TiDB regression creates and cleans up only its own claim and assessment. It proves canonical persisted cost and damage render, injected values are stripped, and a foreign tenant cannot resolve the claim. It passed 1/1. Server and Vite production builds passed. The fresh-worker suite included the new test; an unrelated full-suite-only schema-mock leak caused `assessor-onboarding` to fail, while that suite passed 5/5 in isolation. No Assessment PDF failure occurred. No schema, data, policy, payment, or external-provider action was performed.
