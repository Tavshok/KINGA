-- Source-derived final cumulative foreign-key definitions; read-only.
SELECT
  kcu.constraint_name,
  kcu.table_name,
  kcu.column_name,
  kcu.referenced_table_name,
  kcu.referenced_column_name,
  rc.update_rule,
  rc.delete_rule
FROM information_schema.key_column_usage AS kcu
JOIN information_schema.referential_constraints AS rc
  ON rc.constraint_schema = kcu.constraint_schema
 AND rc.constraint_name = kcu.constraint_name
WHERE kcu.constraint_schema = 'kinga_staging'
  AND kcu.referenced_table_name IS NOT NULL
ORDER BY kcu.constraint_name, kcu.ordinal_position;
