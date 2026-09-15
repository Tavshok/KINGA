SELECT table_name, ordinal_position, column_name, column_type, is_nullable, column_default, extra, column_key
FROM information_schema.columns
WHERE table_schema = 'kinga_staging'
  AND table_name IN ('assessor_insurer_relationships', 'policy_claim_links', 'fleet_drivers')
ORDER BY table_name, ordinal_position;
