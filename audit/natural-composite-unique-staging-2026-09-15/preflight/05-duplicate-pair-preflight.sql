SELECT 'assessor_insurer_relationships (assessor_id, tenant_id)' AS pair_rule,
       COUNT(*) AS duplicate_groups,
       COALESCE(SUM(pair_rows), 0) AS rows_in_duplicate_groups
FROM (
  SELECT assessor_id, tenant_id, COUNT(*) AS pair_rows
  FROM `kinga_staging`.`assessor_insurer_relationships`
  GROUP BY assessor_id, tenant_id
  HAVING COUNT(*) > 1
) AS duplicate_pairs
UNION ALL
SELECT 'policy_claim_links (policy_id, claim_id)' AS pair_rule,
       COUNT(*) AS duplicate_groups,
       COALESCE(SUM(pair_rows), 0) AS rows_in_duplicate_groups
FROM (
  SELECT policy_id, claim_id, COUNT(*) AS pair_rows
  FROM `kinga_staging`.`policy_claim_links`
  GROUP BY policy_id, claim_id
  HAVING COUNT(*) > 1
) AS duplicate_pairs
UNION ALL
SELECT 'fleet_drivers (fleet_id, user_id)' AS pair_rule,
       COUNT(*) AS duplicate_groups,
       COALESCE(SUM(pair_rows), 0) AS rows_in_duplicate_groups
FROM (
  SELECT fleet_id, user_id, COUNT(*) AS pair_rows
  FROM `kinga_staging`.`fleet_drivers`
  GROUP BY fleet_id, user_id
  HAVING COUNT(*) > 1
) AS duplicate_pairs;
