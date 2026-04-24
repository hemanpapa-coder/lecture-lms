SELECT c.column_name, c.data_type, k.constraint_name
FROM information_schema.columns c
LEFT JOIN information_schema.key_column_usage k ON c.column_name = k.column_name AND c.table_name = k.table_name
WHERE c.table_name = 'evaluations';
