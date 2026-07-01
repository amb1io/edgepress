-- Full-text search index for posts (title, body, taxonomy, custom_fields).
-- Populated by scripts/backfill-post-search-index.ts and kept in sync via search-service.

CREATE VIRTUAL TABLE IF NOT EXISTS edp_posts_fts USING fts5(
  post_id UNINDEXED,
  post_type_id UNINDEXED,
  status UNINDEXED,
  id_locale_code UNINDEXED,
  title,
  body,
  taxonomy,
  custom_fields,
  tokenize='unicode61 remove_diacritics 2'
);
