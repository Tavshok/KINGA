-- Source-derived final cumulative inventory; read-only.
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'kinga_staging'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
