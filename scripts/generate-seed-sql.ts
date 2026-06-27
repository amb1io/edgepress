/**
 * Gera drizzle/seed/seed-remote.sql a partir de src/db/seed-data.ts, default-post-types e i18n JSONs.
 * Garante que o seed remoto (wrangler d1 execute --file=...) use os mesmos dados que runSeed.
 *
 * Uso: tsx scripts/generate-seed-sql.ts
 * Chamado antes de db:seed:remote ou no build (build-with-seed).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  FULL_LOCALES,
  ROLE_CAPABILITY_ROWS,
  DEFAULT_POST_TYPES,
  MENU_CONFIG,
  META_ONLY_POST_TYPE_SLUGS,
  TAXONOMY_SEED_ROWS,
  DEFAULT_SETTINGS_ROWS,
  SHOWCASE_ATTACHMENT,
  SHOWCASE_PAGE,
  SHOWCASE_PAGE_EN,
  SHOWCASE_POST,
  SHOWCASE_POST_EN,
  buildShowcasePageBodyHtml,
  buildShowcasePageBodyHtmlEn,
} from "../src/db/seed-data.ts";
import { prefixedTable } from "../src/db/table-prefix.ts";
// JSON imports (chaves de tradução)
import enTranslations from "../src/i18n/languages/en.json";
import esTranslations from "../src/i18n/languages/es.json";
import ptBrTranslations from "../src/i18n/languages/pt_br.json";

const OUT_DIR = join(process.cwd(), "drizzle", "seed");
const OUT_FILE = join(OUT_DIR, "seed-remote.sql");

function escapeSql(s: string): string {
  return s.replace(/'/g, "''");
}

/** Timestamp fixo para seed idempotente. */
const SEED_TS = 0;

/** Mesma lógica do seed.ts para extrair namespace e key. */
function extractNamespaceAndKey(keyString: string): { namespace: string; key: string } {
  const parts = keyString.split(".");
  if (parts.length >= 3) {
    return {
      namespace: parts.slice(0, -1).join("."),
      key: parts[parts.length - 1] ?? "",
    };
  }
  if (parts.length === 2) {
    return { namespace: parts[0] ?? "", key: parts[1] ?? "" };
  }
  return { namespace: "default", key: parts[0] ?? "" };
}

/** Monta lista de traduções (namespace, key, en_US, es_ES, pt_BR) a partir dos 3 JSONs. */
function buildTranslationsSeed(): { namespace: string; key: string; en_US: string; es_ES: string; pt_BR: string }[] {
  const en = enTranslations as Record<string, string>;
  const es = esTranslations as Record<string, string>;
  const pt = ptBrTranslations as Record<string, string>;
  const keys = new Set([...Object.keys(en), ...Object.keys(es), ...Object.keys(pt)]);
  return Array.from(keys).map((keyString) => {
    const { namespace, key } = extractNamespaceAndKey(keyString);
    return {
      namespace,
      key,
      en_US: en[keyString] ?? "",
      es_ES: es[keyString] ?? "",
      pt_BR: pt[keyString] ?? "",
    };
  });
}

const translationsSeed = buildTranslationsSeed();
const T = prefixedTable;

/** Garante tabelas usadas pelo seed quando migrações ainda não rodaram no remoto. */
const SCHEMA_PREAMBLE = `-- Schema mínimo (idempotente) antes dos INSERTs
CREATE TABLE IF NOT EXISTS ${EDP_TABLES.locales} (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  language TEXT NOT NULL,
  hello_world TEXT NOT NULL,
  locale_code TEXT NOT NULL UNIQUE,
  country TEXT NOT NULL,
  timezone TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS locales_locale_code_idx ON ${EDP_TABLES.locales} (locale_code);
CREATE INDEX IF NOT EXISTS locales_language_idx ON ${EDP_TABLES.locales} (language);

CREATE TABLE IF NOT EXISTS ${EDP_TABLES.translations} (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  namespace TEXT NOT NULL,
  key TEXT NOT NULL,
  created_at INTEGER,
  updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS translations_namespace_idx ON ${EDP_TABLES.translations} (namespace);
CREATE INDEX IF NOT EXISTS translations_key_idx ON ${EDP_TABLES.translations} (key);
CREATE INDEX IF NOT EXISTS translations_namespace_key_idx ON ${EDP_TABLES.translations} (namespace, key);

CREATE TABLE IF NOT EXISTS ${EDP_TABLES.translations_languages} (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  id_translations INTEGER NOT NULL REFERENCES ${EDP_TABLES.translations}(id) ON DELETE CASCADE,
  id_locale_code INTEGER NOT NULL REFERENCES ${EDP_TABLES.locales}(id) ON DELETE CASCADE,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS translations_languages_id_translations_idx ON ${EDP_TABLES.translations_languages} (id_translations);
CREATE INDEX IF NOT EXISTS translations_languages_id_locale_code_idx ON ${EDP_TABLES.translations_languages} (id_locale_code);
CREATE INDEX IF NOT EXISTS translations_languages_translations_locale_idx ON ${EDP_TABLES.translations_languages} (id_translations, id_locale_code);
CREATE UNIQUE INDEX IF NOT EXISTS translations_languages_unique_translation_locale ON ${EDP_TABLES.translations_languages} (id_translations, id_locale_code);

CREATE TABLE IF NOT EXISTS ${EDP_TABLES.role_capability} (
  role_id INTEGER NOT NULL,
  capability TEXT NOT NULL,
  PRIMARY KEY (role_id, capability)
);
`;

const lines: string[] = [
  "-- Seed remoto (idempotente). Gerado por scripts/generate-seed-sql.ts",
  "-- Fonte: seed-data + default-post-types + i18n/languages/*.json (mesmos dados que runSeed)",
  "",
  SCHEMA_PREAMBLE,
  "",
  "-- Locales (idiomas/países + en_US, es_ES, pt_BR para i18n)",
  `INSERT OR IGNORE INTO ${T("locales")} (language, hello_world, locale_code, country, timezone) VALUES`,
  ...FULL_LOCALES.map(
    (r, i) =>
      `  ('${escapeSql(r.language)}', '${escapeSql(r.hello_world)}', '${escapeSql(r.locale_code)}', '${escapeSql(r.country)}', '${escapeSql(r.timezone)}')${i < FULL_LOCALES.length - 1 ? "," : ";"}`
  ),
  "",
  "-- Post types padrão (post, page, dashboard, settings, user, attachment, etc.)",
  `INSERT OR IGNORE INTO ${T("post_types")} (slug, name, meta_schema, created_at, updated_at) VALUES`,
  ...DEFAULT_POST_TYPES.map((pt, i) => {
    const metaSchemaJson = escapeSql(JSON.stringify(pt.meta_schema));
    return `  ('${escapeSql(pt.slug)}', '${escapeSql(pt.name)}', '${metaSchemaJson}', ${SEED_TS}, ${SEED_TS})${i < DEFAULT_POST_TYPES.length - 1 ? "," : ";"}`;
  }),
  "",
  "-- Taxonomias padrão (Categoria, Uncategorized, Tag). Mesma estrutura do seed.ts.",
  ...TAXONOMY_SEED_ROWS.map((row) => {
    const name = escapeSql(row.name);
    const slug = escapeSql(row.slug);
    const type = escapeSql(row.type);
    const parentId =
      row.parent_slug == null
        ? "NULL"
        : `(SELECT id FROM ${T("taxonomies")} WHERE slug='${escapeSql(row.parent_slug)}' LIMIT 1)`;
    return `INSERT OR IGNORE INTO ${T("taxonomies")} (name, slug, type, parent_id, created_at, updated_at) VALUES ('${name}', '${slug}', '${type}', ${parentId}, ${SEED_TS}, ${SEED_TS});`;
  }),
  "",
  "-- Permissões por perfil (0=admin, 1=editor, 2=autor, 3=leitor)",
  `INSERT OR IGNORE INTO ${T("role_capability")} (role_id, capability) VALUES`,
  ...ROLE_CAPABILITY_ROWS.map(
    (r, i) =>
      `  (${r.roleId}, '${escapeSql(r.capability)}')${i < ROLE_CAPABILITY_ROWS.length - 1 ? "," : ";"}`
  ),
  "",
  "-- Settings iniciais (setup_done=N até concluir /setup)",
  `INSERT OR IGNORE INTO ${T("settings")} (name, value, autoload) VALUES`,
  ...DEFAULT_SETTINGS_ROWS.map(
    (row, i) =>
      `  ('${escapeSql(row.name)}', '${escapeSql(row.value)}', ${row.autoload ? 1 : 0})${i < DEFAULT_SETTINGS_ROWS.length - 1 ? "," : ";"}`
  ),
  "",
];

// translations: INSERT por chave (idempotente com WHERE NOT EXISTS)
lines.push("-- Traduções (chaves dos arquivos en.json, es.json, pt_br.json)");
for (const row of translationsSeed) {
  const ns = escapeSql(row.namespace);
  const k = escapeSql(row.key);
  lines.push(
    `INSERT INTO ${T("translations")} (namespace, key, created_at, updated_at) SELECT '${ns}', '${k}', ${SEED_TS}, ${SEED_TS} WHERE NOT EXISTS (SELECT 1 FROM ${T("translations")} WHERE namespace='${ns}' AND key='${k}');`
  );
}
lines.push("");

// translations_languages: um INSERT por (translation, locale) com subquery para ids
lines.push("-- Valores por locale (en_US, es_ES, pt_BR)");
for (const row of translationsSeed) {
  const ns = escapeSql(row.namespace);
  const k = escapeSql(row.key);
  for (const locale of ["en_US", "es_ES", "pt_BR"] as const) {
    const val = escapeSql(row[locale]);
    lines.push(
      `INSERT OR REPLACE INTO ${T("translations_languages")} (id_translations, id_locale_code, value) SELECT (SELECT id FROM ${T("translations")} WHERE namespace='${ns}' AND key='${k}' LIMIT 1), (SELECT id FROM ${T("locales")} WHERE locale_code='${locale}' LIMIT 1), '${val}';`
    );
  }
}
lines.push("");

// posts: post inicial de menu por post type (mesma estrutura do seed.ts)
lines.push("-- Posts iniciais de menu (um por post type, show_in_menu=true)");
for (const config of MENU_CONFIG) {
  if (META_ONLY_POST_TYPE_SLUGS.has(config.typeSlug)) continue;
  const slug = `menu-${config.typeSlug}`;
  const metaValues = escapeSql(
    JSON.stringify({
      show_in_menu: true,
      menu_options: config.menu_options,
      menu_order: config.menu_order,
      icon: config.icon,
      post_types: ["custom_fields"],
    })
  );
  const typeSlug = escapeSql(config.typeSlug);
  const title = escapeSql(config.typeSlug);
  lines.push(
    `INSERT OR IGNORE INTO ${T("posts")} (post_type_id, title, slug, status, meta_values, created_at, updated_at) SELECT (SELECT id FROM ${T("post_types")} WHERE slug='${typeSlug}' LIMIT 1), '${title}', '${slug}', 'published', '${metaValues}', ${SEED_TS}, ${SEED_TS} WHERE NOT EXISTS (SELECT 1 FROM ${T("posts")} WHERE slug='${slug}');`
  );
  lines.push(
    `UPDATE ${T("posts")} SET meta_values='${metaValues}', updated_at=${SEED_TS} WHERE slug='${slug}';`
  );
}
lines.push("");

lines.push("-- Conteúdo de demonstração Hello World (tema 2026)");
const attachmentMeta = escapeSql(
  JSON.stringify({
    mime_type: SHOWCASE_ATTACHMENT.mime_type,
    attachment_file: SHOWCASE_ATTACHMENT.file,
    attachment_width: SHOWCASE_ATTACHMENT.width,
    attachment_height: SHOWCASE_ATTACHMENT.height,
    attachment_path: SHOWCASE_ATTACHMENT.path,
    attachment_alt: SHOWCASE_ATTACHMENT.alt,
  }),
);
lines.push(
  `INSERT OR IGNORE INTO ${T("posts")} (post_type_id, title, slug, status, meta_values, created_at, updated_at) SELECT (SELECT id FROM ${T("post_types")} WHERE slug='attachment' LIMIT 1), '${escapeSql(SHOWCASE_ATTACHMENT.title)}', '${escapeSql(SHOWCASE_ATTACHMENT.slug)}', 'published', '${attachmentMeta}', ${SEED_TS}, ${SEED_TS} WHERE NOT EXISTS (SELECT 1 FROM ${T("posts")} WHERE slug='${escapeSql(SHOWCASE_ATTACHMENT.slug)}');`,
);

const pageMetaBase = escapeSql(JSON.stringify({ translation_key: SHOWCASE_PAGE.translation_key }));
const pageBody = escapeSql(buildShowcasePageBodyHtml());
lines.push(
  `INSERT OR IGNORE INTO ${T("posts")} (post_type_id, id_locale_code, title, slug, excerpt, body, status, meta_values, published_at, created_at, updated_at) SELECT (SELECT id FROM ${T("post_types")} WHERE slug='page' LIMIT 1), (SELECT id FROM ${T("locales")} WHERE locale_code='${escapeSql(SHOWCASE_PAGE.locale_code)}' LIMIT 1), '${escapeSql(SHOWCASE_PAGE.title)}', '${escapeSql(SHOWCASE_PAGE.slug)}', '${escapeSql(SHOWCASE_PAGE.excerpt)}', '${pageBody}', 'published', '${pageMetaBase}', ${SEED_TS}, ${SEED_TS}, ${SEED_TS} WHERE NOT EXISTS (SELECT 1 FROM ${T("posts")} WHERE slug='${escapeSql(SHOWCASE_PAGE.slug)}');`,
);
lines.push(
  `UPDATE ${T("posts")} SET meta_values=json_object('translation_key', '${escapeSql(SHOWCASE_PAGE.translation_key)}', 'post_thumbnail_id', CAST((SELECT id FROM ${T("posts")} WHERE slug='${escapeSql(SHOWCASE_ATTACHMENT.slug)}' LIMIT 1) AS TEXT)) WHERE slug='${escapeSql(SHOWCASE_PAGE.slug)}';`,
);
lines.push(
  `INSERT OR IGNORE INTO ${T("posts_media")} (post_id, media_id) SELECT (SELECT id FROM ${T("posts")} WHERE slug='${escapeSql(SHOWCASE_PAGE.slug)}' LIMIT 1), (SELECT id FROM ${T("posts")} WHERE slug='${escapeSql(SHOWCASE_ATTACHMENT.slug)}' LIMIT 1) WHERE NOT EXISTS (SELECT 1 FROM ${T("posts_media")} WHERE post_id=(SELECT id FROM ${T("posts")} WHERE slug='${escapeSql(SHOWCASE_PAGE.slug)}' LIMIT 1) AND media_id=(SELECT id FROM ${T("posts")} WHERE slug='${escapeSql(SHOWCASE_ATTACHMENT.slug)}' LIMIT 1));`,
);

const postBody = escapeSql(SHOWCASE_POST.body_html);
const postMeta = escapeSql(JSON.stringify({ translation_key: SHOWCASE_POST.translation_key }));
lines.push(
  `INSERT OR IGNORE INTO ${T("posts")} (post_type_id, id_locale_code, title, slug, excerpt, body, status, meta_values, published_at, created_at, updated_at) SELECT (SELECT id FROM ${T("post_types")} WHERE slug='post' LIMIT 1), (SELECT id FROM ${T("locales")} WHERE locale_code='${escapeSql(SHOWCASE_POST.locale_code)}' LIMIT 1), '${escapeSql(SHOWCASE_POST.title)}', '${escapeSql(SHOWCASE_POST.slug)}', '${escapeSql(SHOWCASE_POST.excerpt)}', '${postBody}', 'published', '${postMeta}', ${SEED_TS}, ${SEED_TS}, ${SEED_TS} WHERE NOT EXISTS (SELECT 1 FROM ${T("posts")} WHERE slug='${escapeSql(SHOWCASE_POST.slug)}');`,
);
lines.push(
  `INSERT OR IGNORE INTO ${T("posts_taxonomies")} (post_id, term_id) SELECT (SELECT id FROM ${T("posts")} WHERE slug='${escapeSql(SHOWCASE_POST.slug)}' LIMIT 1), (SELECT id FROM ${T("taxonomies")} WHERE slug='${escapeSql(SHOWCASE_POST.category_slug)}' LIMIT 1) WHERE NOT EXISTS (SELECT 1 FROM ${T("posts_taxonomies")} WHERE post_id=(SELECT id FROM ${T("posts")} WHERE slug='${escapeSql(SHOWCASE_POST.slug)}' LIMIT 1) AND term_id=(SELECT id FROM ${T("taxonomies")} WHERE slug='${escapeSql(SHOWCASE_POST.category_slug)}' LIMIT 1));`,
);

const pageBodyEn = escapeSql(buildShowcasePageBodyHtmlEn());
lines.push(
  `INSERT OR IGNORE INTO ${T("posts")} (post_type_id, id_locale_code, title, slug, excerpt, body, status, meta_values, published_at, created_at, updated_at) SELECT (SELECT id FROM ${T("post_types")} WHERE slug='page' LIMIT 1), (SELECT id FROM ${T("locales")} WHERE locale_code='${escapeSql(SHOWCASE_PAGE_EN.locale_code)}' LIMIT 1), '${escapeSql(SHOWCASE_PAGE_EN.title)}', '${escapeSql(SHOWCASE_PAGE_EN.slug)}', '${escapeSql(SHOWCASE_PAGE_EN.excerpt)}', '${pageBodyEn}', 'published', '${escapeSql(JSON.stringify({ translation_key: SHOWCASE_PAGE_EN.translation_key }))}', ${SEED_TS}, ${SEED_TS}, ${SEED_TS} WHERE NOT EXISTS (SELECT 1 FROM ${T("posts")} WHERE slug='${escapeSql(SHOWCASE_PAGE_EN.slug)}');`,
);
lines.push(
  `UPDATE ${T("posts")} SET meta_values=json_object('translation_key', '${escapeSql(SHOWCASE_PAGE_EN.translation_key)}', 'post_thumbnail_id', CAST((SELECT id FROM ${T("posts")} WHERE slug='${escapeSql(SHOWCASE_ATTACHMENT.slug)}' LIMIT 1) AS TEXT)) WHERE slug='${escapeSql(SHOWCASE_PAGE_EN.slug)}';`,
);
lines.push(
  `INSERT OR IGNORE INTO ${T("posts_media")} (post_id, media_id) SELECT (SELECT id FROM ${T("posts")} WHERE slug='${escapeSql(SHOWCASE_PAGE_EN.slug)}' LIMIT 1), (SELECT id FROM ${T("posts")} WHERE slug='${escapeSql(SHOWCASE_ATTACHMENT.slug)}' LIMIT 1) WHERE NOT EXISTS (SELECT 1 FROM ${T("posts_media")} WHERE post_id=(SELECT id FROM ${T("posts")} WHERE slug='${escapeSql(SHOWCASE_PAGE_EN.slug)}' LIMIT 1) AND media_id=(SELECT id FROM ${T("posts")} WHERE slug='${escapeSql(SHOWCASE_ATTACHMENT.slug)}' LIMIT 1));`,
);

const postBodyEn = escapeSql(SHOWCASE_POST_EN.body_html);
const postMetaEn = escapeSql(JSON.stringify({ translation_key: SHOWCASE_POST_EN.translation_key }));
lines.push(
  `INSERT OR IGNORE INTO ${T("posts")} (post_type_id, id_locale_code, title, slug, excerpt, body, status, meta_values, published_at, created_at, updated_at) SELECT (SELECT id FROM ${T("post_types")} WHERE slug='post' LIMIT 1), (SELECT id FROM ${T("locales")} WHERE locale_code='${escapeSql(SHOWCASE_POST_EN.locale_code)}' LIMIT 1), '${escapeSql(SHOWCASE_POST_EN.title)}', '${escapeSql(SHOWCASE_POST_EN.slug)}', '${escapeSql(SHOWCASE_POST_EN.excerpt)}', '${postBodyEn}', 'published', '${postMetaEn}', ${SEED_TS}, ${SEED_TS}, ${SEED_TS} WHERE NOT EXISTS (SELECT 1 FROM ${T("posts")} WHERE slug='${escapeSql(SHOWCASE_POST_EN.slug)}');`,
);
lines.push(
  `INSERT OR IGNORE INTO ${T("posts_taxonomies")} (post_id, term_id) SELECT (SELECT id FROM ${T("posts")} WHERE slug='${escapeSql(SHOWCASE_POST_EN.slug)}' LIMIT 1), (SELECT id FROM ${T("taxonomies")} WHERE slug='${escapeSql(SHOWCASE_POST_EN.category_slug)}' LIMIT 1) WHERE NOT EXISTS (SELECT 1 FROM ${T("posts_taxonomies")} WHERE post_id=(SELECT id FROM ${T("posts")} WHERE slug='${escapeSql(SHOWCASE_POST_EN.slug)}' LIMIT 1) AND term_id=(SELECT id FROM ${T("taxonomies")} WHERE slug='${escapeSql(SHOWCASE_POST_EN.category_slug)}' LIMIT 1));`,
);
lines.push("");

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, lines.join("\n"), "utf8");
console.log(`[generate-seed-sql] Written ${OUT_FILE}`);
