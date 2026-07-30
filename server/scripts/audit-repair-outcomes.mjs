import mysql from 'mysql2/promise';

const url = process.env.DATABASE_URL;
const conn = await mysql.createConnection(url);

const [overall] = await conn.execute(`
  SELECT
    COUNT(*) AS total_rows,
    SUM(CASE WHEN outcome IS NOT NULL AND outcome != '' THEN 1 ELSE 0 END) AS has_outcome,
    SUM(CASE WHEN outcome = 'repair' THEN 1 ELSE 0 END) AS scope_repair,
    SUM(CASE WHEN outcome = 'replace' THEN 1 ELSE 0 END) AS scope_replace,
    SUM(CASE WHEN outcome = 'write_off' THEN 1 ELSE 0 END) AS scope_write_off,
    SUM(CASE WHEN part_origin IS NOT NULL AND part_origin != '' AND part_origin != 'unknown' THEN 1 ELSE 0 END) AS has_part_origin,
    SUM(CASE WHEN part_origin = 'oem' THEN 1 ELSE 0 END) AS part_oem,
    SUM(CASE WHEN part_origin = 'aftermarket' THEN 1 ELSE 0 END) AS part_aftermarket,
    SUM(CASE WHEN part_origin = 'reconditioned' THEN 1 ELSE 0 END) AS part_reconditioned,
    SUM(CASE WHEN part_origin = 'used' THEN 1 ELSE 0 END) AS part_used,
    SUM(CASE WHEN repair_cost_usd IS NOT NULL AND replace_cost_usd IS NOT NULL THEN 1 ELSE 0 END) AS has_both_costs
  FROM component_repair_outcomes
`);
console.log('=== OVERALL FILL RATES ===');
console.log(JSON.stringify(overall[0], null, 2));

const [byComp] = await conn.execute(`
  SELECT
    component_name,
    COUNT(*) AS n,
    SUM(CASE WHEN outcome = 'repair' THEN 1 ELSE 0 END) AS repair_n,
    SUM(CASE WHEN outcome = 'replace' THEN 1 ELSE 0 END) AS replace_n,
    SUM(CASE WHEN part_origin IS NOT NULL AND part_origin != '' AND part_origin != 'unknown' THEN 1 ELSE 0 END) AS part_origin_n,
    ROUND(AVG(CASE WHEN outcome='repair' THEN repair_cost_usd END), 2) AS avg_repair,
    ROUND(AVG(CASE WHEN outcome='replace' THEN replace_cost_usd END), 2) AS avg_replace
  FROM component_repair_outcomes
  GROUP BY component_name
  ORDER BY n DESC
  LIMIT 40
`);
console.log('\n=== BY COMPONENT (top 40 by row count) ===');
for (const r of byComp) {
  console.log(`  ${r.component_name}: n=${r.n} repair=${r.repair_n} replace=${r.replace_n} part_origin=${r.part_origin_n} avg_repair=$${r.avg_repair} avg_replace=$${r.avg_replace}`);
}

await conn.end();
