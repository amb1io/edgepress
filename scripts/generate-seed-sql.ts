/**
 * Generates drizzle/seed/seed-remote.sql from src/db/seed-data.ts, default-post-types and i18n JSONs.
 * Ensures remote seed (wrangler d1 execute --file=...) uses the same data as runSeed.
 *
 * Usage: tsx scripts/generate-seed-sql.ts
 * Called before db:seed:remote or in build (build-with-seed).
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
} from "../src/db/seed-data.ts";
// JSON imports (translation keys)
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

const lines: string[] = [
  "-- Seed remoto (idempotente). Gerado por scripts/generate-seed-sql.ts",
  "-- Fonte: seed-data + default-post-types + i18n/languages/*.json (mesmos dados que runSeed)",
  "",
  "-- Locales (idiomas/países + en_US, es_ES, pt_BR para i18n)",
  "INSERT OR IGNORE INTO locales (language, hello_world, locale_code, country, timezone) VALUES",
  ...FULL_LOCALES.map(
    (r, i) =>
      `  ('${escapeSql(r.language)}', '${escapeSql(r.hello_world)}', '${escapeSql(r.locale_code)}', '${escapeSql(r.country)}', '${escapeSql(r.timezone)}')${i < FULL_LOCALES.length - 1 ? "," : ";"}`
  ),
  "",
  "-- Post types padrão (post, page, dashboard, settings, user, attachment, etc.)",
  "INSERT OR IGNORE INTO post_types (slug, name, meta_schema, created_at, updated_at) VALUES",
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
        : `(SELECT id FROM taxonomies WHERE slug='${escapeSql(row.parent_slug)}' LIMIT 1)`;
    return `INSERT OR IGNORE INTO taxonomies (name, slug, type, parent_id, created_at, updated_at) VALUES ('${name}', '${slug}', '${type}', ${parentId}, ${SEED_TS}, ${SEED_TS});`;
  }),
  "",
  "-- Permissões por perfil (0=admin, 1=editor, 2=autor, 3=leitor)",
  "INSERT OR IGNORE INTO role_capability (role_id, capability) VALUES",
  ...ROLE_CAPABILITY_ROWS.map(
    (r, i) =>
      `  (${r.roleId}, '${escapeSql(r.capability)}')${i < ROLE_CAPABILITY_ROWS.length - 1 ? "," : ";"}`
  ),
  "",
];

// translations: INSERT por chave (idempotente com WHERE NOT EXISTS)
lines.push("-- Traduções (chaves dos arquivos en.json, es.json, pt_br.json)");
for (const row of translationsSeed) {
  const ns = escapeSql(row.namespace);
  const k = escapeSql(row.key);
  lines.push(
    `INSERT INTO translations (namespace, key, created_at, updated_at) SELECT '${ns}', '${k}', ${SEED_TS}, ${SEED_TS} WHERE NOT EXISTS (SELECT 1 FROM translations WHERE namespace='${ns}' AND key='${k}');`
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
      `INSERT OR REPLACE INTO translations_languages (id_translations, id_locale_code, value) SELECT (SELECT id FROM translations WHERE namespace='${ns}' AND key='${k}' LIMIT 1), (SELECT id FROM locales WHERE locale_code='${locale}' LIMIT 1), '${val}';`
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
    `INSERT OR IGNORE INTO posts (post_type_id, title, slug, status, meta_values, created_at, updated_at) SELECT (SELECT id FROM post_types WHERE slug='${typeSlug}' LIMIT 1), '${title}', '${slug}', 'published', '${metaValues}', ${SEED_TS}, ${SEED_TS} WHERE NOT EXISTS (SELECT 1 FROM posts WHERE slug='${slug}');`
  );
}
lines.push("");

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, lines.join("\n"), "utf8");
console.log(`[generate-seed-sql] Written ${OUT_FILE}`);
