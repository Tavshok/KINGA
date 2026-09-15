-- Source-derived final non-primary index-column metadata; read-only.
SELECT
  table_name,
  index_name,
  seq_in_index,
  column_name,
  non_unique
FROM information_schema.statistics
WHERE table_schema = 'kinga_staging'
  AND index_name <> 'PRIMARY'
ORDER BY table_name, index_name, seq_in_index;
