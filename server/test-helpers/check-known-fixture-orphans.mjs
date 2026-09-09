import mysql from "mysql2/promise";

const db = await mysql.createConnection(process.env.DATABASE_URL);
try {
  const [[result]] = await db.execute(`
    SELECT
      (SELECT COUNT(*) FROM police_reports p LEFT JOIN claims c ON c.id = p.claim_id
       WHERE c.id IS NULL AND p.report_number = 'ZRP-TAB 95/24'
         AND p.police_station = 'Mutare Rural ZRP' AND p.reported_speed = 80) AS legacy_police_fixture_orphans,
      (SELECT COUNT(*) FROM agency_insurance_service_requests r LEFT JOIN agency_clients ac ON ac.id = r.agency_client_id
       WHERE ac.id IS NULL AND r.request_number LIKE 'VP-REQUEST-%'
         AND r.client_instruction = 'Owned Vehicle Passport regression fixture'
         AND r.vehicle_make = 'Fixture' AND r.vehicle_model = 'Passport'
         AND r.created_by = r.agency_client_id) AS vehicle_passport_fixture_orphans
  `);
  const counts = Object.fromEntries(Object.entries(result).map(([key, value]) => [key, Number(value)]));
  console.log(JSON.stringify(counts, null, 2));
  if (Object.values(counts).some((count) => count !== 0)) {
    throw new Error("Known test-fixture orphan residue detected; inspect the failed suite before any cleanup action.");
  }
} finally {
  await db.end();
}
