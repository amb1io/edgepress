-- Adiciona "import_export" ao menu_options do post de menu de settings (Configurações).
-- Idempotente: só altera se import_export ainda não estiver presente.
UPDATE edp_posts
SET meta_values = json_set(
  meta_values,
  '$.menu_options',
  json_insert(
    json(meta_values, '$.menu_options'),
    '$[#]',
    'import_export'
  )
),
updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE post_type_id = (SELECT id FROM edp_post_types WHERE slug = 'settings' LIMIT 1)
  AND json_extract(meta_values, '$.show_in_menu') = 1
  AND NOT EXISTS (
    SELECT 1
    FROM json_each(json(meta_values, '$.menu_options'))
    WHERE json_each.value = 'import_export'
  );
