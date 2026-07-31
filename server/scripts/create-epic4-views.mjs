/**
 * Epic 4 — Wave 1 Foundation
 * Creates 12 database views for the Intelligence Platform aggregation layer.
 * Run once: node server/scripts/create-epic4-views.mjs
 *
 * Column names verified against drizzle/schema.ts 2026-07-31
 */
import { createPool } from 'mysql2/promise';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }

const withoutProto = url.replace('mysql://', '');
const [userPass, rest] = withoutProto.split('@');
const [user, password] = userPass.split(':');
const [hostPort, dbQuery] = rest.split('/');
const [host, port] = hostPort.split(':');
const [database] = dbQuery.split('?');

const pool = createPool({
  host, port: +port, user, password, database,
  ssl: { rejectUnauthorized: false },
});

const views = [
  // V1: Vehicle claim summary — joins via vehicle_registry.registration_number = claims.vehicle_registration
  {
    name: 'vw_vehicle_claim_summary',
    sql: `CREATE OR REPLACE VIEW vw_vehicle_claim_summary AS
SELECT
  vr.id                                                     AS vehicle_id,
  vr.registration_number,
  vr.tenant_id,
  COUNT(DISTINCT c.id)                                      AS total_claims,
  SUM(CASE WHEN c.status='completed' THEN 1 ELSE 0 END)    AS completed_claims,
  SUM(CASE WHEN c.status IN ('submitted','triage','assessment_pending','assessment_in_progress') THEN 1 ELSE 0 END) AS open_claims,
  MAX(c.created_at)                                         AS last_claim_date,
  MIN(c.created_at)                                         AS first_claim_date,
  AVG(CAST(c.final_approved_amount AS DECIMAL(15,2)))       AS avg_settlement_amount,
  SUM(CAST(c.final_approved_amount AS DECIMAL(15,2)))       AS total_settlement_amount
FROM vehicle_registry vr
LEFT JOIN claims c ON c.vehicle_registration = vr.registration_number
GROUP BY vr.id, vr.registration_number, vr.tenant_id`,
  },
  // V2: Vehicle fraud summary — cross_claim_signals links via claim_id → claims.vehicle_registration
  {
    name: 'vw_vehicle_fraud_summary',
    sql: `CREATE OR REPLACE VIEW vw_vehicle_fraud_summary AS
SELECT
  vr.id                                                                          AS vehicle_id,
  vr.registration_number,
  vr.tenant_id,
  COUNT(DISTINCT ccs.id)                                                         AS total_fraud_signals,
  SUM(CASE WHEN ccs.signal_type='repeat_damage_zone' THEN 1 ELSE 0 END)        AS repeat_damage_signals,
  SUM(CASE WHEN ccs.signal_type='staged_accident' THEN 1 ELSE 0 END)           AS staged_accident_signals,
  SUM(CASE WHEN ccs.signal_type='repairer_collusion' THEN 1 ELSE 0 END)        AS repairer_collusion_signals,
  MAX(ccs.created_at)                                                            AS last_signal_date
FROM vehicle_registry vr
LEFT JOIN claims c2 ON c2.vehicle_registration = vr.registration_number
LEFT JOIN cross_claim_signals ccs ON ccs.claim_id = c2.id
GROUP BY vr.id, vr.registration_number, vr.tenant_id`,
  },
  // V3: Vehicle damage summary — vehicle_damage_history.vehicle_id → vehicle_registry.id
  {
    name: 'vw_vehicle_damage_summary',
    sql: `CREATE OR REPLACE VIEW vw_vehicle_damage_summary AS
SELECT
  vdh.vehicle_id,
  vr.registration_number,
  COUNT(*)                                                   AS total_damage_events,
  SUM(CASE WHEN vdh.is_repeat_zone=1 THEN 1 ELSE 0 END)   AS repeat_zone_count,
  COUNT(DISTINCT vdh.damage_zone)                            AS distinct_damage_zones,
  MAX(vdh.created_at)                                        AS last_damage_date,
  MIN(vdh.created_at)                                        AS first_damage_date
FROM vehicle_damage_history vdh
JOIN vehicle_registry vr ON vr.id = vdh.vehicle_id
GROUP BY vdh.vehicle_id, vr.registration_number`,
  },
  // V4: Driver risk summary — drivers + driver_claims
  {
    name: 'vw_driver_risk_summary',
    sql: `CREATE OR REPLACE VIEW vw_driver_risk_summary AS
SELECT
  d.id                                                        AS driver_id,
  d.full_name,
  d.national_id_number,
  d.driver_risk_score,
  d.tenant_id,
  COUNT(DISTINCT dc.id)                                       AS total_claims,
  SUM(CASE WHEN dc.is_at_fault=1 THEN 1 ELSE 0 END)        AS at_fault_claims,
  MAX(dc.created_at)                                          AS last_claim_date
FROM drivers d
LEFT JOIN driver_claims dc ON dc.driver_id = d.id
GROUP BY d.id, d.full_name, d.national_id_number, d.driver_risk_score, d.tenant_id`,
  },
  // V5: Fleet vehicle risk — fleet_vehicles uses registration_number (no vehicle_id FK)
  {
    name: 'vw_fleet_vehicle_risk',
    sql: `CREATE OR REPLACE VIEW vw_fleet_vehicle_risk AS
SELECT
  fv.fleet_id,
  fv.registration_number,
  fv.make,
  fv.model,
  fv.year,
  fv.risk_score                                              AS vehicle_risk_score,
  vr.id                                                      AS vehicle_registry_id,
  COUNT(DISTINCT vdh.id)                                     AS damage_event_count,
  SUM(CASE WHEN vdh.is_repeat_zone=1 THEN 1 ELSE 0 END)   AS repeat_zone_count
FROM fleet_vehicles fv
LEFT JOIN vehicle_registry vr ON vr.registration_number = fv.registration_number
LEFT JOIN vehicle_damage_history vdh ON vdh.vehicle_id = vr.id
GROUP BY fv.fleet_id, fv.registration_number, fv.make, fv.model, fv.year, fv.risk_score, vr.id`,
  },
  // V6: Fleet driver risk — fleet_drivers.user_id links to users, not drivers table
  {
    name: 'vw_fleet_driver_risk',
    sql: `CREATE OR REPLACE VIEW vw_fleet_driver_risk AS
SELECT
  fd.fleet_id,
  fd.user_id,
  fd.driver_license_number,
  fd.employment_status,
  COUNT(DISTINCT dc.id)                                      AS total_claims,
  SUM(CASE WHEN dc.is_at_fault=1 THEN 1 ELSE 0 END)       AS at_fault_claims
FROM fleet_drivers fd
LEFT JOIN drivers d ON d.license_number = fd.driver_license_number
LEFT JOIN driver_claims dc ON dc.driver_id = d.id
GROUP BY fd.fleet_id, fd.user_id, fd.driver_license_number, fd.employment_status`,
  },
  // V7: Fleet claim summary — fleet_vehicles.registration_number → claims.vehicle_registration
  {
    name: 'vw_fleet_claim_summary',
    sql: `CREATE OR REPLACE VIEW vw_fleet_claim_summary AS
SELECT
  fv.fleet_id,
  COUNT(DISTINCT c.id)                                                           AS total_claims,
  SUM(CASE WHEN c.status='completed' THEN 1 ELSE 0 END)                        AS completed_claims,
  SUM(CASE WHEN c.status NOT IN ('completed','rejected','closed') THEN 1 ELSE 0 END) AS open_claims,
  AVG(CAST(c.final_approved_amount AS DECIMAL(15,2)))                           AS avg_settlement_amount,
  SUM(CAST(c.final_approved_amount AS DECIMAL(15,2)))                           AS total_settlement_amount,
  MAX(c.created_at)                                                              AS last_claim_date
FROM fleet_vehicles fv
LEFT JOIN claims c ON c.vehicle_registration = fv.registration_number
GROUP BY fv.fleet_id`,
  },
  // V8: Portfolio exposure — claims.tenant_id is the insurer identifier
  {
    name: 'vw_portfolio_exposure',
    sql: `CREATE OR REPLACE VIEW vw_portfolio_exposure AS
SELECT
  c.tenant_id,
  COUNT(DISTINCT c.id)                                                           AS total_claims,
  SUM(CASE WHEN c.status NOT IN ('completed','rejected','closed') THEN 1 ELSE 0 END) AS open_claims,
  SUM(CAST(c.final_approved_amount AS DECIMAL(15,2)))                           AS total_settled_amount,
  AVG(CAST(c.final_approved_amount AS DECIMAL(15,2)))                           AS avg_settlement_amount,
  AVG(CAST(ccs2.overall_confidence AS DECIMAL(5,2)))                            AS avg_confidence_score
FROM claims c
LEFT JOIN claim_confidence_scores ccs2 ON ccs2.claim_id = c.id
GROUP BY c.tenant_id`,
  },
  // V9: Portfolio fraud summary — via claims.tenant_id
  {
    name: 'vw_portfolio_fraud_summary',
    sql: `CREATE OR REPLACE VIEW vw_portfolio_fraud_summary AS
SELECT
  c.tenant_id,
  COUNT(DISTINCT ccs.id)                                                                     AS total_fraud_signals,
  COUNT(DISTINCT CASE WHEN ccs.signal_type='staged_accident' THEN ccs.id END)              AS staged_accident_signals,
  COUNT(DISTINCT CASE WHEN ccs.signal_type='repeat_damage_zone' THEN ccs.id END)           AS repeat_damage_signals,
  COUNT(DISTINCT CASE WHEN ccs.signal_type='repairer_collusion' THEN ccs.id END)           AS repairer_collusion_signals,
  COUNT(DISTINCT fa.id)                                                                      AS fraud_alerts_count
FROM claims c
LEFT JOIN cross_claim_signals ccs ON ccs.claim_id = c.id
LEFT JOIN fraud_alerts fa ON fa.claim_id = c.id
GROUP BY c.tenant_id`,
  },
  // V10: Asset inspection summary — inspections.asset_registry_id → asset_registry.id
  {
    name: 'vw_asset_inspection_summary',
    sql: `CREATE OR REPLACE VIEW vw_asset_inspection_summary AS
SELECT
  ar.id                                                      AS asset_id,
  ar.asset_ref,
  ar.asset_type,
  ar.tenant_id,
  COUNT(DISTINCT i.id)                                       AS total_inspections,
  MAX(i.completed_at)                                        AS last_inspection_date,
  MIN(i.completed_at)                                        AS first_inspection_date,
  SUM(CASE WHEN i.status='completed' THEN 1 ELSE 0 END)   AS completed_inspections
FROM asset_registry ar
LEFT JOIN inspections i ON i.asset_registry_id = ar.id
GROUP BY ar.id, ar.asset_ref, ar.asset_type, ar.tenant_id`,
  },
  // V11: Asset risk summary — risk_register links via claim_id (no asset_id); maintenance_alerts via vehicle_id
  // For assets, we use asset_registry.risk_rating directly and inspection count as proxy
  {
    name: 'vw_asset_risk_summary',
    sql: `CREATE OR REPLACE VIEW vw_asset_risk_summary AS
SELECT
  ar.id                                                      AS asset_id,
  ar.asset_ref,
  ar.risk_rating,
  ar.tenant_id,
  ar.inspection_count                                        AS total_inspections,
  ar.last_inspected_at                                       AS last_inspection_date,
  CASE ar.risk_rating
    WHEN 'critical' THEN 1 ELSE 0
  END                                                        AS is_critical_risk,
  CASE ar.risk_rating
    WHEN 'high'     THEN 1
    WHEN 'critical' THEN 1
    ELSE 0
  END                                                        AS is_high_or_critical
FROM asset_registry ar`,
  },
  // V12: Timeline events — unified event stream for any entity
  {
    name: 'vw_timeline_events',
    sql: `CREATE OR REPLACE VIEW vw_timeline_events AS
SELECT
  'claim'                   AS event_type,
  c.id                      AS event_id,
  c.vehicle_registration    AS entity_ref,
  c.status                  AS event_status,
  c.created_at              AS event_date,
  c.tenant_id               AS tenant_id,
  c.id                      AS claim_id,
  NULL                      AS inspection_id,
  NULL                      AS vehicle_registry_id,
  NULL                      AS fleet_id
FROM claims c
UNION ALL
SELECT
  'inspection'              AS event_type,
  i.id                      AS event_id,
  COALESCE(vr.registration_number, ar.asset_ref, i.asset_ref) AS entity_ref,
  i.status                  AS event_status,
  i.created_at              AS event_date,
  i.tenant_id               AS tenant_id,
  i.claim_id                AS claim_id,
  i.id                      AS inspection_id,
  vr.id                     AS vehicle_registry_id,
  NULL                      AS fleet_id
FROM inspections i
LEFT JOIN vehicle_registry vr ON vr.registration_number = i.vehicle_registration
LEFT JOIN asset_registry ar ON ar.id = i.asset_registry_id
UNION ALL
SELECT
  'damage_event'            AS event_type,
  vdh.id                    AS event_id,
  vr2.registration_number   AS entity_ref,
  'recorded'                AS event_status,
  vdh.created_at            AS event_date,
  NULL                      AS tenant_id,
  vdh.claim_id              AS claim_id,
  NULL                      AS inspection_id,
  vdh.vehicle_id            AS vehicle_registry_id,
  NULL                      AS fleet_id
FROM vehicle_damage_history vdh
JOIN vehicle_registry vr2 ON vr2.id = vdh.vehicle_id
UNION ALL
SELECT
  'fraud_signal'            AS event_type,
  ccs.id                    AS event_id,
  c3.vehicle_registration   AS entity_ref,
  ccs.signal_type           AS event_status,
  ccs.created_at            AS event_date,
  ccs.tenant_id             AS tenant_id,
  ccs.claim_id              AS claim_id,
  NULL                      AS inspection_id,
  NULL                      AS vehicle_registry_id,
  NULL                      AS fleet_id
FROM cross_claim_signals ccs
JOIN claims c3 ON c3.id = ccs.claim_id`,
  },
];

(async () => {
  const conn = await pool.getConnection();
  let ok = 0, fail = 0;
  for (const v of views) {
    try {
      await conn.execute(v.sql);
      console.log(`✅  ${v.name}`);
      ok++;
    } catch (e) {
      console.error(`❌  ${v.name}: ${e.message.substring(0, 150)}`);
      fail++;
    }
  }
  conn.release();
  await pool.end();
  console.log(`\nDone: ${ok} created, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
})();
