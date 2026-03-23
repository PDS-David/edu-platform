\o C:\Users\MASHAALLAH\Desktop\schema_dump.txt

SELECT c.table_name, c.column_name, c.data_type, c.character_maximum_length, c.is_nullable, c.column_default, c.ordinal_position
FROM information_schema.columns c
WHERE c.table_schema = 'public'
ORDER BY c.table_name, c.ordinal_position;

SELECT tc.table_name AS from_table, kcu.column_name AS from_column, ccu.table_name AS to_table, ccu.column_name AS to_column, tc.constraint_name, rc.delete_rule, rc.update_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;

SELECT t.relname AS table_name, i.relname AS index_name, ix.indisunique AS is_unique, ix.indisprimary AS is_primary, array_to_string(array_agg(a.attname ORDER BY k.n), ', ') AS indexed_columns
FROM pg_class t
JOIN pg_index ix ON t.oid = ix.indrelid
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
CROSS JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(attnum, n)
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
WHERE n.nspname = 'public' AND t.relkind = 'r'
GROUP BY t.relname, i.relname, ix.indisunique, ix.indisprimary
ORDER BY t.relname, i.relname;

\o