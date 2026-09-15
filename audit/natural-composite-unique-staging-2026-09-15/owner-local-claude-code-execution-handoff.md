# NCU-01 Owner-Only Local Claude Code Execution Handoff

## Authority and scope

On 15 September 2026, **Tavonga Shoko** separately authorized NCU-01 execution after reviewing the fresh read-only preflight record. This authority is restricted to the four files below, in their exact ordinal order, against `KINGA-staging` only. The owner remains the sole operator, reviewer, and application-validation owner under the recorded NCU-01 exception.

> The authority expires at NCU-01 closure, stop, abandonment, or approved-window expiry. It does not authorize account/grant changes, recovery, deployment, D-06, data loading, production, or any statement outside this list.

This environment must not submit DDL. The owner must execute through their **local Claude Code** environment using its existing configured staging runner connection. Do not place credentials in this packet or in chat.

## Preconditions already passed

The same-day snapshot, exact 188-table inventory and zero-row state, target structure, current index state, duplicate-pair checks, and tenant-prefixed runner grants all passed. The durable evidence is `read-only-preflight-evidence.md`.

Before execution, locally re-run these no-database integrity checks from the checked-out PR #92 head:

```bash
git rev-parse HEAD
node scripts/generate-natural-composite-unique-staging-packet.mjs verify
sha256sum audit/natural-composite-unique-2026-09-15/natural-composite-unique-constraints.sql
sha256sum audit/natural-composite-unique-staging-2026-09-15/statements/*.sql
```

Expected transition SHA-256: `a8b8e8fda51a0830116d2516a7d017ee7401e3b35a72e7a7773e1689c10ab9be`.

Expected ordered file hash: `81f1cba9f009ea414edd06c3bb8fbaf34fc462d25e3a5f6063a6731aa6ab1ab5`.

## Strict one-statement sequence

For **each** ordinal, first calculate the listed file’s SHA-256 and confirm it equals the pinned value. Only then have the local runner execute the exact content of that one file. Record a success or the full error; do not modify the SQL, skip, reorder, batch, or retry blind.

| Ordinal | File | Exact SHA-256 | Exact SQL |
|---:|---|---|---|
| 001 | `statements/001-unique_assessor_tenant.sql` | `3228ccf99192b5e284b243e09984bb42e76ec95347d6578f20c9a0d6ee333685` | `DROP INDEX \`unique_assessor_tenant\` ON \`assessor_insurer_relationships\`;` |
| 002 | `statements/002-uq_assessor_insurer_relationship.sql` | `49cd35e35a020bf9ba979ff692ce3714fdc547b209351ac91e6631e16549ca43` | `CREATE UNIQUE INDEX \`uq_assessor_insurer_relationship\` ON \`assessor_insurer_relationships\` (\`assessor_id\`,\`tenant_id\`);` |
| 003 | `statements/003-uq_policy_claim_link.sql` | `1d79f04dde9f2eb73c78a8548379f3ccc936170f630ab8e15165795b2e8459b5` | `CREATE UNIQUE INDEX \`uq_policy_claim_link\` ON \`policy_claim_links\` (\`policy_id\`,\`claim_id\`);` |
| 004 | `statements/004-uq_fleet_driver_membership.sql` | `b25f7fdd7113236392caee8ee963fc1def3fe6786a83f120a961418e90b74246` | `CREATE UNIQUE INDEX \`uq_fleet_driver_membership\` ON \`fleet_drivers\` (\`fleet_id\`,\`user_id\`);` |

Do **not** use `mysql < file`, raw-transition redirection, a marker splitter, or a command that sends more than one statement. No raw source file contains a needed execution wrapper; only the four one-statement files are in scope.

## Stop conditions

Stop immediately and report before any further statement if a hash differs, the runner is not the tenant-prefixed account, a privilege/server/tool error occurs, a statement returns an unexpected result, or the snapshot is no longer valid. Do not alter grants or apply a workaround without a new explicit decision.

## Required owner execution report

Report the exact ordinal reached; each pre-execution SHA-256 result; execution outcome per ordinal; any stop/error; and a self-checked summary of the four intended objects. The assistant will then independently perform authenticated read-only postflight before deciding closure.
