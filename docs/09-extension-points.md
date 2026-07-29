# 09 — Extension Points

## How to Add a New Pipeline Stage

### Step 1: Define the output type

Add the stage output interface to `server/pipeline-v2/types.ts`:

```ts
export interface Stage99Output {
  myNewField: string;
  confidence: number;
}
```

Add the field to `PipelineResult`:

```ts
export interface PipelineResult {
  // ... existing fields ...
  stage99Output: Stage99Output | null;
}
```

### Step 2: Add the DB column

In `drizzle/schema.ts`, add a column to `ai_assessments`:

```ts
stage99OutputJson: longtext("stage99_output_json"),
```

Run `pnpm db:push`.

### Step 3: Implement the stage in the orchestrator

In `server/pipeline-v2/orchestrator.ts`, add the stage block at the appropriate position in the execution flow:

```ts
// Stage 99: My New Stage
ctx.onStageStart?.("Stage 99 — My New Stage");
let stage99Output: Stage99Output | null = null;
try {
  const result = await invokeLLM({ /* ... */ });
  stage99Output = JSON.parse(result.choices[0].message.content);
  ctx.log("Stage 99", `Completed: myNewField=${stage99Output.myNewField}`);
} catch (err) {
  ctx.log("Stage 99", `Failed (non-fatal): ${String(err)}`);
  // Non-fatal: continue pipeline
}
```

Update the navigational map comment at the top of the orchestrator file.

### Step 4: Persist the output

In `db.ts`, add the field to the `upsert` call after `runPipelineV2` returns:

```ts
stage99OutputJson: result.stage99Output ? JSON.stringify(result.stage99Output) : null,
```

### Step 5: Write a test

Add a test in `server/pipeline-v2/stage99.test.ts` (or co-locate with the orchestrator). The test should verify the stage output shape and at least one happy-path scenario.

### Step 6: Verify end-to-end

Run the pipeline on a reference claim and verify `stage99_output_json` is populated in `ai_assessments`.

---

## How to Add a New Claim Field

### Step 1: Add to schema

In `drizzle/schema.ts`, add the column to the `claims` table:

```ts
myNewField: varchar("my_new_field", { length: 100 }),
```

Run `pnpm db:push`.

### Step 2: Add to the pipeline (if populated by the pipeline)

In the appropriate stage in the orchestrator, add the DB update:

```ts
await db.update(claims).set({ myNewField: value }).where(eq(claims.id, ctx.claimId));
```

### Step 3: Add to the tRPC procedure (if user-editable)

In the relevant router, add the field to the input schema and the update handler.

### Step 4: Add to the UI

In the relevant page component, add the field to the display and/or edit form.

---

## How to Add a New Claim Source

A new claim source (e.g., a new mobile app, a new API integration) must:

1. **Create the claim with canonical intake state:**
   ```ts
   status: "intake_pending",
   workflowState: "intake_queue",
   claimSource: "my_new_source",
   aiAssessmentTriggered: 0,
   aiAssessmentCompleted: 0,
   ```

2. **Set `sourceDocumentId`** if the claim has an associated document (required for the pipeline to run). If the claim has no document, the pipeline cannot run automatically — it will need a human to attach a document first.

3. **Trigger the pipeline** via `setImmediate(() => triggerAiAssessment(claimId))` after the claim is created. The startup sweep will catch any claims where this trigger is lost.

4. **Verify dashboard visibility:** Ensure the new `claimSource` value does not require any dashboard filter changes. The dashboard queries by `status`, not by `claimSource`, so new sources are automatically visible.

---

## How to Add a New Portal

### Step 1: Define the portal role

In `server/rbac.ts`, add the new role to the appropriate union type. If it is a top-level portal role (not an insurer sub-role), add it to the `role` enum in `drizzle/schema.ts` and run `pnpm db:push`.

### Step 2: Add the portal layout

Create `client/src/components/MyNewPortalLayout.tsx`. Use an existing layout (e.g., `InsurerPortalLayout.tsx`) as a template. The layout should:
- Check `useAuth().user?.role === 'my_new_role'` and redirect to login if not authenticated
- Provide navigation links to the portal's pages
- Include a logout button

### Step 3: Register the routes

In `client/src/App.tsx`, add the portal routes under a new path prefix:

```tsx
<Route path="/my-portal/*">
  <ProtectedRoute requiredRole="my_new_role">
    <MyNewPortalLayout>
      <Switch>
        <Route path="/my-portal/dashboard" component={MyPortalDashboard} />
      </Switch>
    </MyNewPortalLayout>
  </ProtectedRoute>
</Route>
```

### Step 4: Add the server-side domain middleware

In `server/_core/domain-middleware.ts`, add the new role to the `DOMAIN_ROLE_MAP`. This ensures the server correctly identifies the portal from the request context.

### Step 5: Add tRPC procedures

Create a new router file in `server/routers/my-new-portal.ts`. Use `protectedProcedure` with a role check:

```ts
const myPortalProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'my_new_role') {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next({ ctx });
});
```

Register the router in `server/routers.ts`.

---

## How to Add a New Insurer Sub-Role

1. Add the role to the `InsurerRole` union type in `server/rbac.ts`
2. Add a permissions entry in the `PERMISSIONS` object in `server/rbac.ts`
3. Add workflow transition rules if the role has unique transition permissions
4. Add a dashboard component in `client/src/pages/`
5. Add a route in `App.tsx` under `/insurer-portal/`
6. Update `DashboardLayout.tsx` to show the correct navigation for the new role

---

## How to Add a New Report Type

1. Create the report data assembly function in `server/routers/reports.ts` (or a new file)
2. Create the HTML template function (returns an HTML string)
3. Use `renderAndUpload(html, s3KeyPrefix)` from `server/reporting/pdfRenderer.ts` to generate the PDF
4. Store the S3 URL in the appropriate DB table
5. Add a tRPC procedure to trigger generation and return the URL
6. Add a download button in the relevant UI page

Follow the existing pattern in `server/routers/reports.ts` for the procedure structure.

---

## How to Extend the Fraud Detection System

**Important:** The fraud scoring weights, thresholds, and indicator definitions are intentionally not documented here. Contact the KINGA security team before modifying fraud detection logic.

The safe extension points are:

1. **Adding a new fraud indicator** — add a new field to the `FraudIndicator` type in `server/pipeline-v2/types.ts` and populate it in Stage 8. The indicator will automatically appear in the fraud assessment report section.

2. **Adding a new data source for fraud cross-referencing** — add a new DB table for the reference data, add a query helper in `server/db.ts`, and call it from Stage 8 in the orchestrator.

3. **Adding a new cross-claim intelligence check** — add a new procedure in `server/routers/intelligence.ts`. Cross-claim queries MUST filter by `tenantId` — never query across tenants.
