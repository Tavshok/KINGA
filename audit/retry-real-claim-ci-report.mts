import { enqueueReport, getJobStatus } from "../server/reporting/reportQueue";

const tenantId = "tenant-1771335377063";
const requestedByUserId = 1;
const jobId = await enqueueReport({
  reportKey: "claim.intelligence",
  requestedByUserId,
  requestedByUserName: "Tavonga Shoko",
  tenantId,
  parameters: { claimId: 12909902, tenantId, validationRun: "user-authorised-real-claim-2026-08-14-ci-retry" },
  outputFormat: "pdf",
});

const deadline = Date.now() + 180_000;
let job: Awaited<ReturnType<typeof getJobStatus>> = null;
while (Date.now() < deadline) {
  job = await getJobStatus(jobId, { tenantId, userId: requestedByUserId, isPlatformSuperAdmin: true });
  if (job?.status === "completed" || job?.status === "failed") break;
  await new Promise((resolve) => setTimeout(resolve, 3_000));
}

console.log(JSON.stringify({ claimId: 12909902, jobId, job }, null, 2));
process.exit(0);
