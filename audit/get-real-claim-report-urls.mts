import { storageGet } from "../server/storage";

const keys = [
  "reports/tenant-1771335377063/claim.assessment/ff39e43d-97be-46a1-b569-89a777d5cd44-1786712038258.pdf",
  "reports/tenant-1771335377063/claim.intelligence/f269c560-94ba-4e37-8baa-df6eb52cf02c-1786712135831.pdf",
  "reports/tenant-1771335377063/claim.forensic/59dd1eff-a5ab-411e-b7fd-f4ff07e044be-1786712055127.pdf",
];

const reports = [] as Array<{ key: string; url: string }>;
for (const key of keys) {
  const { url } = await storageGet(key, 600);
  reports.push({ key, url });
}
console.log(JSON.stringify({ reports }, null, 2));
process.exit(0);
