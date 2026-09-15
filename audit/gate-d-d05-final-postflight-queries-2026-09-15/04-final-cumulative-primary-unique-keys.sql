-- Source-derived final primary/unique-key metadata; read-only.
SELECT
  table_name,
  index_name,
  seq_in_index,
  column_name,
  non_unique
FROM information_schema.statistics
WHERE table_schema = 'kinga_staging'
  AND non_unique = 0
ORDER BY table_name, index_name, seq_in_index;
