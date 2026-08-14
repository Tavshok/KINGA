import { enqueueReport, getJobStatus } from "../server/reporting/reportQueue";

const claimId = 12909902;
const tenantId = "tenant-1771335377063";
const requestedByUserId = 1;
const requestedByUserName = "Tavonga Shoko";
const reportKeys = ["claim.assessment", "claim.intelligence", "claim.forensic"];
const timeoutMs = 180_000;
const pollMs = 2_000;

const scope = {
  tenantId,
  userId: requestedByUserId,
  isPlatformSuperAdmin: true,
};

async function waitForJob(jobId: string) {
  const deadline = Date.now() + timeoutMs;
  let latest: Awaited<ReturnType<typeof getJobStatus>> = null;
  while (Date.now() < deadline) {
    latest = await getJobStatus(jobId, scope);
    if (latest?.status === "completed" || latest?.status === "failed") return latest;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return latest;
}

const results = [] as Array<Record<string, unknown>>;
for (const reportKey of reportKeys) {
  const jobId = await enqueueReport({
    reportKey,
    requestedByUserId,
    requestedByUserName,
    tenantId,
    parameters: { claimId, tenantId, validationRun: "user-authorised-real-claim-2026-08-14" },
    outputFormat: "pdf",
  });
  const job = await waitForJob(jobId);
  results.push({ reportKey, jobId, job });
}

console.log(JSON.stringify({ claimId, tenantId, results }, null, 2));
process.exit(0);
