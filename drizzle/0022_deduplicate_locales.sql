-- Mescla variantes de locale nos canônicos e remove duplicatas.
-- en, en-GB → en_US | pt-BR, pt-PT → pt_BR | es, es-MX → es_ES | fr-CA → fr

-- translations_languages: atualizar quando não houver conflito de unique (id_translations, id_locale_code)
UPDATE edp_translations_languages
SET id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'en_US' LIMIT 1)
WHERE id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'en' LIMIT 1)
  AND NOT EXISTS (
    SELECT 1 FROM edp_translations_languages AS t2
    WHERE t2.id_translations = edp_translations_languages.id_translations
      AND t2.id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'en_US' LIMIT 1)
  );

UPDATE edp_translations_languages
SET id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'en_US' LIMIT 1)
WHERE id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'en-GB' LIMIT 1)
  AND NOT EXISTS (
    SELECT 1 FROM edp_translations_languages AS t2
    WHERE t2.id_translations = edp_translations_languages.id_translations
      AND t2.id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'en_US' LIMIT 1)
  );

UPDATE edp_translations_languages
SET id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'pt_BR' LIMIT 1)
WHERE id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'pt-BR' LIMIT 1)
  AND NOT EXISTS (
    SELECT 1 FROM edp_translations_languages AS t2
    WHERE t2.id_translations = edp_translations_languages.id_translations
      AND t2.id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'pt_BR' LIMIT 1)
  );

UPDATE edp_translations_languages
SET id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'pt_BR' LIMIT 1)
WHERE id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'pt-PT' LIMIT 1)
  AND NOT EXISTS (
    SELECT 1 FROM edp_translations_languages AS t2
    WHERE t2.id_translations = edp_translations_languages.id_translations
      AND t2.id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'pt_BR' LIMIT 1)
  );

UPDATE edp_translations_languages
SET id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'es_ES' LIMIT 1)
WHERE id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'es' LIMIT 1)
  AND NOT EXISTS (
    SELECT 1 FROM edp_translations_languages AS t2
    WHERE t2.id_translations = edp_translations_languages.id_translations
      AND t2.id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'es_ES' LIMIT 1)
  );

UPDATE edp_translations_languages
SET id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'es_ES' LIMIT 1)
WHERE id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'es-MX' LIMIT 1)
  AND NOT EXISTS (
    SELECT 1 FROM edp_translations_languages AS t2
    WHERE t2.id_translations = edp_translations_languages.id_translations
      AND t2.id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'es_ES' LIMIT 1)
  );

UPDATE edp_translations_languages
SET id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'fr' LIMIT 1)
WHERE id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'fr-CA' LIMIT 1)
  AND NOT EXISTS (
    SELECT 1 FROM edp_translations_languages AS t2
    WHERE t2.id_translations = edp_translations_languages.id_translations
      AND t2.id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'fr' LIMIT 1)
  );

-- Remover linhas que ficaram nas variantes (conflito de unique)
DELETE FROM edp_translations_languages
WHERE id_locale_code IN (
  SELECT id FROM edp_locales
  WHERE locale_code IN ('en', 'en-GB', 'pt-BR', 'pt-PT', 'es', 'es-MX', 'fr-CA')
);

-- posts e taxonomies
UPDATE edp_posts
SET id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'en_US' LIMIT 1)
WHERE id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'en' LIMIT 1);

UPDATE edp_posts
SET id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'en_US' LIMIT 1)
WHERE id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'en-GB' LIMIT 1);

UPDATE edp_posts
SET id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'pt_BR' LIMIT 1)
WHERE id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'pt-BR' LIMIT 1);

UPDATE edp_posts
SET id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'pt_BR' LIMIT 1)
WHERE id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'pt-PT' LIMIT 1);

UPDATE edp_posts
SET id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'es_ES' LIMIT 1)
WHERE id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'es' LIMIT 1);

UPDATE edp_posts
SET id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'es_ES' LIMIT 1)
WHERE id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'es-MX' LIMIT 1);

UPDATE edp_posts
SET id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'fr' LIMIT 1)
WHERE id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'fr-CA' LIMIT 1);

UPDATE edp_taxonomies
SET id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'en_US' LIMIT 1)
WHERE id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'en' LIMIT 1);

UPDATE edp_taxonomies
SET id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'en_US' LIMIT 1)
WHERE id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'en-GB' LIMIT 1);

UPDATE edp_taxonomies
SET id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'pt_BR' LIMIT 1)
WHERE id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'pt-BR' LIMIT 1);

UPDATE edp_taxonomies
SET id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'pt_BR' LIMIT 1)
WHERE id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'pt-PT' LIMIT 1);

UPDATE edp_taxonomies
SET id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'es_ES' LIMIT 1)
WHERE id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'es' LIMIT 1);

UPDATE edp_taxonomies
SET id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'es_ES' LIMIT 1)
WHERE id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'es-MX' LIMIT 1);

UPDATE edp_taxonomies
SET id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'fr' LIMIT 1)
WHERE id_locale_code = (SELECT id FROM edp_locales WHERE locale_code = 'fr-CA' LIMIT 1);

DELETE FROM edp_locales
WHERE locale_code IN ('en', 'en-GB', 'pt-BR', 'pt-PT', 'es', 'es-MX', 'fr-CA');
