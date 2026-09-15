SELECT table_name, index_name, non_unique, seq_in_index, column_name
FROM information_schema.statistics
WHERE table_schema = 'kinga_staging'
  AND table_name IN ('assessor_insurer_relationships', 'policy_claim_links', 'fleet_drivers')
  AND index_name IN ('unique_assessor_tenant', 'uq_assessor_insurer_relationship', 'uq_policy_claim_link', 'uq_fleet_driver_membership')
ORDER BY table_name, index_name, seq_in_index;
