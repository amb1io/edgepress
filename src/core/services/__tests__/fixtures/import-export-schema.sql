PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS edp_locales (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  language TEXT NOT NULL,
  hello_world TEXT NOT NULL,
  locale_code TEXT NOT NULL UNIQUE,
  country TEXT NOT NULL,
  timezone TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS edp_post_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  meta_schema TEXT,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS edp_user (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  email_verified INTEGER DEFAULT 0 NOT NULL,
  image TEXT,
  description TEXT,
  role INTEGER DEFAULT 3,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS edp_account (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES edp_user(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  access_token_expires_at INTEGER,
  refresh_token_expires_at INTEGER,
  scope TEXT,
  id_token TEXT,
  password TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS edp_taxonomies (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,
  parent_id INTEGER REFERENCES edp_taxonomies(id) ON DELETE SET NULL,
  id_locale_code INTEGER REFERENCES edp_locales(id) ON DELETE SET NULL,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS edp_taxonomies_type_slug_idx ON edp_taxonomies (type, slug);

CREATE TABLE IF NOT EXISTS edp_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  name TEXT NOT NULL,
  value TEXT NOT NULL,
  autoload INTEGER DEFAULT 1 NOT NULL
);

CREATE TABLE IF NOT EXISTS edp_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  post_type_id INTEGER NOT NULL REFERENCES edp_post_types(id) ON DELETE RESTRICT,
  parent_id INTEGER REFERENCES edp_posts(id) ON DELETE SET NULL,
  author_id TEXT REFERENCES edp_user(id) ON DELETE SET NULL,
  id_locale_code INTEGER REFERENCES edp_locales(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  excerpt TEXT,
  body TEXT,
  body_blocks TEXT,
  status TEXT DEFAULT 'draft',
  meta_values TEXT,
  published_at INTEGER,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS edp_seo_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  post_id INTEGER NOT NULL UNIQUE REFERENCES edp_posts(id) ON DELETE CASCADE,
  seo_title TEXT,
  seo_description TEXT,
  seo_canonical TEXT,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS edp_posts_taxonomies (
  post_id INTEGER NOT NULL REFERENCES edp_posts(id) ON DELETE CASCADE,
  term_id INTEGER NOT NULL REFERENCES edp_taxonomies(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, term_id)
);

CREATE TABLE IF NOT EXISTS edp_posts_media (
  post_id INTEGER NOT NULL REFERENCES edp_posts(id) ON DELETE CASCADE,
  media_id INTEGER NOT NULL REFERENCES edp_posts(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, media_id)
);

CREATE TABLE IF NOT EXISTS edp_translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  namespace TEXT NOT NULL,
  key TEXT NOT NULL,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS edp_translations_languages (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  id_translations INTEGER NOT NULL REFERENCES edp_translations(id) ON DELETE CASCADE,
  id_locale_code INTEGER NOT NULL REFERENCES edp_locales(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  UNIQUE (id_translations, id_locale_code)
);

CREATE TABLE IF NOT EXISTS edp_role_capability (
  role_id INTEGER NOT NULL,
  capability TEXT NOT NULL,
  PRIMARY KEY (role_id, capability)
);

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

PRAGMA foreign_keys = ON;
