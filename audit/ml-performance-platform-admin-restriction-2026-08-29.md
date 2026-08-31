# ML Performance Report Access Verification

`executive.ml_performance` is registered in the report access matrix only for the top-level `admin` role. The report catalogue filters through `canAccessReport`, and both report generation and preview use the same function before obtaining report output. An insurer executive has an `insurerRole` of `executive`, which is not contained in the key's permitted role list; direct generation is therefore rejected before the renderer is reached.

The focused `server/reporting.access.test.ts` suite passed 37/37, including the executive assertion that `executive.ml_performance` is unavailable and the platform-admin assertion that it is available. No data, model, schema, or ML-output change was required.
