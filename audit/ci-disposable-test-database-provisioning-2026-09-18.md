# Disposable CI Database Provisioning and Isolation Proof

**Date:** 18 September 2026

**Scope:** local CI/test database only; no live application schema or data change
**Status:** provisioned, reinitialized empty after validation, and packaged for source review

## Purpose

This record closes the root cause exposed by the earlier CI run: database-writing tests inherited the managed application's remote `DATABASE_URL` and therefore wrote test fixtures into the real application database. The replacement environment is a dedicated, disposable MariaDB instance intended only for test and CI execution in this sandbox.

No live application credential was reused as a test connection target. A temporary read-only schema-copy process used the source connection only to obtain **DDL with `--no-data`** and immediately removed its temporary client configuration. No source rows were copied. The local test database was reinitialized after guard validation and is confirmed empty.

## Provisioned environment

| Property                | Verified value                     | Isolation meaning                             |
| ----------------------- | ---------------------------------- | --------------------------------------------- |
| Engine                  | MariaDB 10.11                      | Separate local engine and data directory      |
| Listener                | `127.0.0.1:33306` only             | No LAN or public listener                     |
| Database                | `kinga_ci_test`                    | Dedicated test-only schema                    |
| Schema                  | 238 base tables                    | Current source-compatible structural baseline |
| Final fixture rows      | 0 users; 0 claims                  | No application data copied or retained        |
| Test account            | `kinga_ci_runner@127.0.0.1`        | Host-restricted account, not remotely usable  |
| Account privilege scope | `kinga_ci_test.*` only             | No privilege on the live application database |
| Configuration storage   | Local mode-`0600` file outside Git | Credential is not committed or exposed        |

The live application target remains remote on port 4000. It does not share a host or database identity with the dedicated CI target. A connection attempt to the adjacent nonconfigured loopback address (`127.0.0.2`) was refused; the database server listens only on `127.0.0.1`.

## Fail-closed test invocation package

The pending isolated source package makes the boundary enforceable rather than operational convention.

1. `pnpm test` is routed through `scripts/run-isolated-vitest.ts`.
2. The launcher obtains a test URL only from `KINGA_CI_DATABASE_URL` or the protected sandbox-local test URL file, validates it before spawning Vitest, and overwrites inherited `DATABASE_URL` for the child process.
3. A single shared policy accepts only the literal raw form `mysql://<userinfo>@127.0.0.1:33306/kinga_ci_test`. It rejects aliases, percent-encoded database paths, alternate/implicit ports, query strings, fragments, missing URLs, and different schemas.
4. Both Vitest configurations load a setup module before test modules. The module validates the environment and intercepts the default and named `mysql2` / `mysql2/promise` `createConnection` and `createPool` factories.
5. Direct test clients may use only the same exact URL string. The application pool’s fixed non-target tuning object is allowed only when its `uri` has that exact URL and every option belongs to the fixed safe allowlist. `host`, `port`, `database`, `socketPath`, `ssl`, unknown options, and arbitrary configuration objects are rejected.
6. `createPoolCluster` is denied entirely during tests because no current test needs it and a cluster could add an independent remote target later.
7. `server/db.ts` also validates the test target before it constructs its pool. A policy error is deliberately outside the generic connection-error catch, so it is propagated rather than converted to a null/no-op database connection.
8. The existing opt-in tenant-role scratch test no longer creates its own database or overwrites `DATABASE_URL`; when explicitly enabled, it uses the one dedicated CI schema and applies the shared policy.

> **Security correction during review.** Two independent static reviews found and stopped genuine initial gaps: first, hostname/port aliases and MySQL URI query overrides; then, direct `mysql2` constructors and `createPoolCluster`. The final package centralizes the policy, rejects URI option overrides before MySQL parses them, intercepts test-reachable direct client factories, and denies the unused cluster factory.

## Validation evidence

| Check                                                 | Result                                                                                                                                                                                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test process connected with the approved URL          | Passed; confirmed database `kinga_ci_test`                                                                                                                                                                       |
| Schema/data proof after reinitialization              | 238 base tables; 0 `users`; 0 `claims`                                                                                                                                                                           |
| Shared policy unit tests and exact client integration | 25/25 tests passed across 3 focused test files                                                                                                                                                                   |
| Direct MySQL interception proof                       | 4/4 tests passed: default and named promise/callback factories, unsafe object forms, and pool clusters                                                                                                           |
| Unsafe launcher and direct-Vitest URL tests           | Remote target, query `host`/`port`/`database`/`socketPath` overrides, aliases, and invalid ports rejected before test code ran                                                                                   |
| Direct test module using a MySQL constructor          | Rejected by setup before its `beforeAll` factory could run with an unsafe URL                                                                                                                                    |
| Server bundle                                         | Passed (`pnpm check:server`)                                                                                                                                                                                     |
| Changed-path TypeScript check                         | No diagnostics naming the new guard, runner, shared policy, or Vitest setup files; the repository retains 998 inherited diagnostics, including one pre-existing `server/db.ts` diagnostic unrelated to this diff |
| Diff whitespace check                                 | Passed                                                                                                                                                                                                           |

An initial runner argument-forwarding defect caused the **first validation command** to invoke the full suite rather than the intended focused files. It was already pointed at the local database, not the live application database. The forwarding defect was corrected, all focused proof was rerun, and the local database was reinitialized from the DDL-only schema copy; it has no fixture residue.

An independent final static security review passed. It confirmed the raw URL grammar, runner pinning, both Vitest setup registrations, test-only `server/db.ts` guard, direct default/named `mysql2` / `mysql2/promise` factory interception, and pool-cluster denial. No required changes remained.

## Scope and operating constraints

This is a **sandbox-local disposable development/CI target**, not a staging or production service. It is now the required target for all further Vitest work in this session. A future GitHub Actions workflow cannot use this local process; it must provision its own ephemeral MariaDB service and pass an equivalent exact `KINGA_CI_DATABASE_URL` to the guarded runner. That workflow configuration is a later CI package, not part of this provisioning package.

The `test:portal` and `test:integration` scripts still invoke Vitest directly, but both resolve to a configuration that loads the same setup guard. The repository has a Playwright configuration but no discovered end-to-end specification files; when browser tests are added, their server must be started with the dedicated CI URL rather than the managed development environment.

No live cleanup operation is performed or authorized by this record. The post-reset live application database remains untouched throughout this CI provisioning work.
