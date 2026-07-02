/**
 * Export/import EdgePress database + R2 uploads + theme packages as a .edgepress (tar.gz) archive.
 */
import { createTarGzip, parseTarGzip } from "nanotar";
import { eq, sql } from "drizzle-orm";
import {
  account,
  postTypes,
  posts,
  postsMedia,
  postsTaxonomies,
  seoMetadata,
  settings,
  taxonomies,
  user,
} from "../../db/schema.ts";
import { tableName } from "../../db/table-prefix.ts";
import type { Database } from "../../utils/types/database.ts";
import { THEME_PKG_KV_PREFIX } from "../theme/theme-package.ts";
import { getActiveThemeFromDb, THEME_ACTIVE_KV_KEY, THEME_META_KV_PREFIX } from "./theme-service.ts";
import { upsertActiveThemeSetting } from "./settings-service.ts";

export const EDGEPRESS_FORMAT = "edgepress" as const;
export const EDGEPRESS_SCHEMA_VERSION = 2;
export const APP_VERSION = "0.0.1";

export type ExportOptions = {
  database: boolean;
  media: boolean;
  themes: boolean;
};

export type ExportIncludes = ExportOptions;

export const DEFAULT_EXPORT_INCLUDES: ExportIncludes = {
  database: true,
  media: true,
  themes: true,
};

export type FtsRow = {
  rowid: number;
  post_id: number;
  post_type_id: number;
  status: string;
  id_locale_code: number | null;
  title: string;
  body: string;
  taxonomy: string;
  custom_fields: string;
};

export const FTS_TABLE = "edp_posts_fts";
export const FTS_INSERT_BATCH_SIZE = 8;
export const MEDIA_PREFIX = "uploads/";
export const MEDIA_TAR_PREFIX = "media/uploads/";
export const THEME_PKG_TAR_PREFIX = "themes/";
export const THEME_ASSET_TAR_PREFIX = "themes/";
export const THEME_PACKAGE_JSON = "package.json";

/** FK-safe insert order. Reverse for wipe. User-created content only. */
export const TABLE_ORDER = [
  "post_types",
  "user",
  "account",
  "taxonomies",
  "settings",
  "posts",
  "seo_metadata",
  "posts_taxonomies",
  "posts_media",
] as const;

/** Seed/system tables preserved on the target instance — never exported, wiped, or imported. */
export const PRESERVED_TABLES = [
  "locales",
  "role_capability",
  "translations",
  "translations_languages",
] as const;

export type EdgepressLogicalTable = (typeof TABLE_ORDER)[number];

const WIPE_ORDER = [...TABLE_ORDER].reverse();

const AUTO_INCREMENT_TABLES: EdgepressLogicalTable[] = [
  "post_types",
  "taxonomies",
  "settings",
  "posts",
  "seo_metadata",
];

type RowRecord = Record<string, unknown>;

export type EdgepressManifest = {
  format: typeof EDGEPRESS_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  appVersion: string;
  includes: ExportIncludes;
  tableOrder: EdgepressLogicalTable[];
  counts: Partial<Record<EdgepressLogicalTable, number>>;
  ftsCount?: number;
  mediaCount: number;
  mediaFiles: Array<{ key: string; contentType: string }>;
  themeCount: number;
  themePackages: Array<{ slug: string }>;
};

export type EdgepressDatabasePayload = {
  tables: Partial<Record<EdgepressLogicalTable, RowRecord[]>>;
  fts?: FtsRow[];
};

export type EdgepressImportResult = {
  includes: ExportIncludes;
  counts: Partial<Record<EdgepressLogicalTable, number>>;
  mediaCount: number;
  themeCount: number;
  ftsRestored: boolean;
};

export type ArchiveKvLike = {
  get: (key: string, type?: "text" | "json") => Promise<unknown>;
  put: (key: string, value: string) => Promise<void>;
  list?: (options?: { prefix?: string; limit?: number; cursor?: string }) => Promise<{
    keys: { name: string }[];
    list_complete: boolean;
    cursor?: string;
  }>;
  delete?: (key: string) => Promise<void>;
};

type R2BucketLike = {
  list: (options?: {
    prefix?: string;
    cursor?: string;
    limit?: number;
  }) => Promise<{
    objects: Array<{ key: string }>;
    truncated: boolean;
    cursor?: string;
  }>;
  get: (
    key: string,
  ) => Promise<{
    body: ReadableStream<Uint8Array> | null;
    httpMetadata?: { contentType?: string };
  } | null>;
  put: (
    key: string,
    value: BodyInit,
    options?: { httpMetadata?: { contentType?: string } },
  ) => Promise<unknown>;
  delete: (key: string | string[]) => Promise<void>;
};

type TarEntryInput = {
  name: string;
  data: Uint8Array | string;
};

type RowInserter = (db: Database, rows: RowRecord[]) => Promise<void>;

const TABLE_READERS: Record<EdgepressLogicalTable, (db: Database) => Promise<RowRecord[]>> = {
  post_types: (db) => db.select().from(postTypes) as Promise<RowRecord[]>,
  user: (db) => db.select().from(user) as Promise<RowRecord[]>,
  account: (db) => db.select().from(account) as Promise<RowRecord[]>,
  taxonomies: (db) => db.select().from(taxonomies) as Promise<RowRecord[]>,
  settings: (db) => db.select().from(settings) as Promise<RowRecord[]>,
  posts: (db) => db.select().from(posts) as Promise<RowRecord[]>,
  seo_metadata: (db) => db.select().from(seoMetadata) as Promise<RowRecord[]>,
  posts_taxonomies: (db) => db.select().from(postsTaxonomies) as Promise<RowRecord[]>,
  posts_media: (db) => db.select().from(postsMedia) as Promise<RowRecord[]>,
};

const TABLE_INSERTERS: Record<EdgepressLogicalTable, RowInserter> = {
  post_types: async (db, rows) => {
    if (rows.length) await db.insert(postTypes).values(rows as typeof postTypes.$inferInsert[]);
  },
  user: async (db, rows) => {
    if (rows.length) await db.insert(user).values(rows as typeof user.$inferInsert[]);
  },
  account: async (db, rows) => {
    if (rows.length) await db.insert(account).values(rows as typeof account.$inferInsert[]);
  },
  taxonomies: async (db, rows) => {
    if (!rows.length) return;
    // Insert with parent_id = null to avoid self-referential FK violations on D1.
    // A second pass in restoreImport will update parent_id after all rows are inserted.
    const nullified = rows.map((r) => ({ ...(r as typeof taxonomies.$inferInsert), parent_id: null }));
    await db.insert(taxonomies).values(nullified);
  },
  settings: async (db, rows) => {
    if (rows.length) await db.insert(settings).values(rows as typeof settings.$inferInsert[]);
  },
  posts: async (db, rows) => {
    if (!rows.length) return;
    // Insert with parent_id = null to avoid self-referential FK violations on D1.
    // A second pass in restoreImport will update parent_id after all rows are inserted.
    const nullified = rows.map((r) => ({ ...(r as typeof posts.$inferInsert), parent_id: null }));
    await db.insert(posts).values(nullified);
  },
  seo_metadata: async (db, rows) => {
    if (rows.length) await db.insert(seoMetadata).values(rows as typeof seoMetadata.$inferInsert[]);
  },
  posts_taxonomies: async (db, rows) => {
    if (rows.length) await db.insert(postsTaxonomies).values(rows as typeof postsTaxonomies.$inferInsert[]);
  },
  posts_media: async (db, rows) => {
    if (rows.length) await db.insert(postsMedia).values(rows as typeof postsMedia.$inferInsert[]);
  },
};

const DEFAULT_INSERT_BATCH_SIZE = 10;
/** D1 allows at most 100 bound parameters per statement. Posts have 15 columns → max 6 rows. */
const INSERT_BATCH_SIZE: Partial<Record<EdgepressLogicalTable, number>> = {
  posts: 1,
  post_types: 5,
  taxonomies: 8,
  settings: 20,
};

function resolveImportTableOrder(manifestOrder?: string[]): EdgepressLogicalTable[] {
  const preserved = new Set<string>(PRESERVED_TABLES);
  const source = manifestOrder?.length ? manifestOrder : TABLE_ORDER;
  const seen = new Set<EdgepressLogicalTable>();
  const ordered: EdgepressLogicalTable[] = [];

  for (const table of source) {
    if (preserved.has(table)) continue;
    if (!(table in TABLE_INSERTERS)) continue;
    const logical = table as EdgepressLogicalTable;
    if (seen.has(logical)) continue;
    seen.add(logical);
    ordered.push(logical);
  }

  for (const table of TABLE_ORDER) {
    if (seen.has(table)) continue;
    seen.add(table);
    ordered.push(table);
  }

  return ordered;
}

const IMAGE_MIME_MAP: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
};

function inferContentType(key: string): string {
  const ext = key.includes(".") ? key.slice(key.lastIndexOf(".")).toLowerCase() : "";
  return IMAGE_MIME_MAP[ext] ?? "application/octet-stream";
}

function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value, null, 2));
}

async function runSql(db: Database, statement: ReturnType<typeof sql.raw> | ReturnType<typeof sql>): Promise<void> {
  if ("run" in db && typeof db.run === "function") {
    await db.run(statement);
    return;
  }
  await db.all(statement);
}

async function readAllFtsRows(db: Database): Promise<FtsRow[]> {
  const rows = (await db.all(
    sql.raw(`
      SELECT rowid, post_id, post_type_id, status, id_locale_code,
             title, body, taxonomy, custom_fields
      FROM ${FTS_TABLE}
      ORDER BY rowid
    `),
  )) as FtsRow[];
  return rows.map((row) => ({
    rowid: Number(row.rowid),
    post_id: Number(row.post_id),
    post_type_id: Number(row.post_type_id),
    status: String(row.status ?? ""),
    id_locale_code: row.id_locale_code == null ? null : Number(row.id_locale_code),
    title: String(row.title ?? ""),
    body: String(row.body ?? ""),
    taxonomy: String(row.taxonomy ?? ""),
    custom_fields: String(row.custom_fields ?? ""),
  }));
}

async function wipeFtsTable(db: Database): Promise<void> {
  await runSql(db, sql.raw(`DELETE FROM ${FTS_TABLE}`));
}

async function restoreFtsRows(db: Database, rows: FtsRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += FTS_INSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + FTS_INSERT_BATCH_SIZE);
    for (const row of batch) {
      await runSql(
        db,
        sql`
          INSERT INTO edp_posts_fts (
            rowid, post_id, post_type_id, status, id_locale_code,
            title, body, taxonomy, custom_fields
          ) VALUES (
            ${row.rowid},
            ${row.post_id},
            ${row.post_type_id},
            ${row.status},
            ${row.id_locale_code},
            ${row.title},
            ${row.body},
            ${row.taxonomy},
            ${row.custom_fields}
          )
        `,
      );
    }
  }
}

function resolveExportIncludes(options?: Partial<ExportOptions>): ExportIncludes {
  return {
    database: options?.database ?? DEFAULT_EXPORT_INCLUDES.database,
    media: options?.media ?? DEFAULT_EXPORT_INCLUDES.media,
    themes: options?.themes ?? DEFAULT_EXPORT_INCLUDES.themes,
  };
}

function resolveManifestIncludes(manifest: Partial<EdgepressManifest>): ExportIncludes {
  if (manifest.includes) {
    return {
      database: Boolean(manifest.includes.database),
      media: Boolean(manifest.includes.media),
      themes: Boolean(manifest.includes.themes),
    };
  }
  // Legacy v1 archives always included everything.
  return { ...DEFAULT_EXPORT_INCLUDES };
}

async function readAllR2ByPrefix(
  bucket: R2BucketLike,
  prefix: string,
): Promise<Array<{ key: string; data: Uint8Array; contentType: string }>> {
  const results: Array<{ key: string; data: Uint8Array; contentType: string }> = [];
  let cursor: string | undefined;

  do {
    const listed = await bucket.list({
      prefix,
      ...(cursor ? { cursor } : {}),
      limit: 1000,
    });

    for (const object of listed.objects) {
      const stored = await bucket.get(object.key);
      if (!stored?.body) continue;
      const buffer = await new Response(stored.body).arrayBuffer();
      results.push({
        key: object.key,
        data: new Uint8Array(buffer),
        contentType: stored.httpMetadata?.contentType ?? inferContentType(object.key),
      });
    }

    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  return results;
}

async function readAllR2Objects(bucket: R2BucketLike): Promise<
  Array<{ key: string; data: Uint8Array; contentType: string }>
> {
  return readAllR2ByPrefix(bucket, MEDIA_PREFIX);
}

async function wipeR2ByPrefix(bucket: R2BucketLike, prefix: string): Promise<number> {
  let deleted = 0;
  let cursor: string | undefined;

  do {
    const listed = await bucket.list({
      prefix,
      ...(cursor ? { cursor } : {}),
      limit: 1000,
    });

    if (listed.objects.length > 0) {
      await bucket.delete(listed.objects.map((object) => object.key));
      deleted += listed.objects.length;
    }

    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  return deleted;
}

async function wipeR2Uploads(bucket: R2BucketLike): Promise<number> {
  return wipeR2ByPrefix(bucket, MEDIA_PREFIX);
}

async function readAllThemePackages(
  kv: ArchiveKvLike,
): Promise<Array<{ slug: string; data: string }>> {
  if (!kv.list) return [];

  const packages: Array<{ slug: string; data: string }> = [];
  let cursor: string | undefined;

  do {
    const listed = await kv.list({
      prefix: THEME_PKG_KV_PREFIX,
      limit: 200,
      ...(cursor ? { cursor } : {}),
    });

    for (const key of listed.keys) {
      const slug = key.name.slice(THEME_PKG_KV_PREFIX.length).trim().toLowerCase();
      if (!slug) continue;
      const raw = await kv.get(key.name, "text");
      if (typeof raw !== "string" || !raw.trim()) continue;
      packages.push({ slug, data: raw });
    }

    cursor = listed.list_complete ? undefined : listed.cursor;
  } while (cursor);

  return packages;
}

async function wipeThemeKvPackages(kv: ArchiveKvLike): Promise<number> {
  if (!kv.list || !kv.delete) return 0;

  let deleted = 0;
  let cursor: string | undefined;

  do {
    const listed = await kv.list({
      prefix: THEME_PKG_KV_PREFIX,
      limit: 200,
      ...(cursor ? { cursor } : {}),
    });

    for (const key of listed.keys) {
      await kv.delete(key.name);
      deleted++;
    }

    cursor = listed.list_complete ? undefined : listed.cursor;
  } while (cursor);

  return deleted;
}

async function deleteKvKeysByPrefix(kv: ArchiveKvLike, prefix: string): Promise<void> {
  if (!kv.list || !kv.delete) return;

  let cursor: string | undefined;
  do {
    const listed = await kv.list({
      prefix,
      limit: 200,
      ...(cursor ? { cursor } : {}),
    });

    for (const key of listed.keys) {
      await kv.delete(key.name);
    }

    cursor = listed.list_complete ? undefined : listed.cursor;
  } while (cursor);
}

async function wipeThemeKvCache(kv: ArchiveKvLike): Promise<void> {
  await wipeThemeKvPackages(kv);
  if (kv.delete) {
    try {
      await kv.delete(THEME_ACTIVE_KV_KEY);
    } catch {
      // ignore
    }
  }
  await deleteKvKeysByPrefix(kv, THEME_META_KV_PREFIX);
}

function themePackageTarPath(slug: string): string {
  return `${THEME_PKG_TAR_PREFIX}${slug}/${THEME_PACKAGE_JSON}`;
}

function parseThemePackageTarPath(path: string): string | null {
  const match = path.match(/^themes\/([^/]+)\/package\.json$/);
  return match?.[1]?.trim().toLowerCase() ?? null;
}

function isThemeAssetTarPath(path: string): boolean {
  if (!path.startsWith(THEME_ASSET_TAR_PREFIX)) return false;
  return !path.endsWith(`/${THEME_PACKAGE_JSON}`);
}

async function syncThemeCacheAfterImport(db: Database, kv: ArchiveKvLike): Promise<void> {
  try {
    const activeTheme = await getActiveThemeFromDb(db);
    await kv.put(THEME_ACTIVE_KV_KEY, JSON.stringify(activeTheme));

    if (activeTheme.meta?.theme_slug) {
      await kv.put(
        `${THEME_META_KV_PREFIX}${activeTheme.meta.theme_slug}`,
        JSON.stringify(activeTheme.meta),
      );
      await upsertActiveThemeSetting(db, activeTheme.meta.theme_slug);
    } else if (activeTheme.slug) {
      await upsertActiveThemeSetting(db, activeTheme.slug);
    }
  } catch {
    // ignore cache sync failures
  }
}

async function wipeDatabase(db: Database): Promise<void> {
  // WIPE_ORDER is the reverse of TABLE_ORDER (children before parents),
  // so FK constraints are respected without needing PRAGMA foreign_keys = OFF.
  // D1 in production does not support PRAGMA statements via the HTTP API.
  for (const logicalTable of WIPE_ORDER) {
    const physical = tableName(logicalTable);
    await runSql(db, sql.raw(`DELETE FROM ${physical}`));
  }
}

async function insertRowsInBatches(
  db: Database,
  logicalTable: EdgepressLogicalTable,
  rows: RowRecord[],
): Promise<void> {
  const inserter = TABLE_INSERTERS[logicalTable];
  const batchSize = INSERT_BATCH_SIZE[logicalTable] ?? DEFAULT_INSERT_BATCH_SIZE;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    await inserter(db, batch);
  }
}

/**
 * Second pass: restores self-referential parent_id for posts and taxonomies.
 * During the first insert pass, parent_id is set to null to avoid FK violations on D1
 * (which enforces FK constraints by default, unlike standard SQLite).
 */
async function restorePostParentIds(db: Database, rows: RowRecord[]): Promise<void> {
  for (const row of rows) {
    if (row["parent_id"] == null) continue;
    await db
      .update(posts)
      .set({ parent_id: row["parent_id"] as number })
      .where(eq(posts.id, row["id"] as number));
  }
}

async function restoreTaxonomyParentIds(db: Database, rows: RowRecord[]): Promise<void> {
  for (const row of rows) {
    if (row["parent_id"] == null) continue;
    await db
      .update(taxonomies)
      .set({ parent_id: row["parent_id"] as number })
      .where(eq(taxonomies.id, row["id"] as number));
  }
}

async function resetAutoIncrementSequences(db: Database): Promise<void> {
  for (const logicalTable of AUTO_INCREMENT_TABLES) {
    const physical = tableName(logicalTable);
    await runSql(
      db,
      sql.raw(`
        INSERT OR REPLACE INTO sqlite_sequence (name, seq)
        SELECT '${physical}', COALESCE(MAX(id), 0)
        FROM ${physical}
      `),
    );
  }
}

export async function buildExport(
  db: Database,
  bucket: R2BucketLike,
  kv?: ArchiveKvLike | null,
  options?: Partial<ExportOptions>,
): Promise<Uint8Array> {
  const includes = resolveExportIncludes(options);
  const tables: Partial<Record<EdgepressLogicalTable, RowRecord[]>> = {};
  const counts: Partial<Record<EdgepressLogicalTable, number>> = {};
  let ftsRows: FtsRow[] = [];

  if (includes.database) {
    for (const logicalTable of TABLE_ORDER) {
      const rows = await TABLE_READERS[logicalTable](db);
      tables[logicalTable] = rows;
      counts[logicalTable] = rows.length;
    }
    ftsRows = await readAllFtsRows(db);
  }

  const mediaObjects = includes.media ? await readAllR2Objects(bucket) : [];
  const themePackages = includes.themes && kv ? await readAllThemePackages(kv) : [];
  const themeAssets = includes.themes ? await readAllR2ByPrefix(bucket, THEME_ASSET_TAR_PREFIX) : [];

  const manifest: EdgepressManifest = {
    format: EDGEPRESS_FORMAT,
    schemaVersion: EDGEPRESS_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    includes,
    tableOrder: [...TABLE_ORDER],
    counts,
    ftsCount: includes.database ? ftsRows.length : undefined,
    mediaCount: mediaObjects.length,
    mediaFiles: mediaObjects.map((item) => ({
      key: item.key,
      contentType: item.contentType,
    })),
    themeCount: themePackages.length,
    themePackages: themePackages.map((item) => ({ slug: item.slug })),
  };

  const tarEntries: TarEntryInput[] = [{ name: "manifest.json", data: encodeJson(manifest) }];

  if (includes.database) {
    const databasePayload: EdgepressDatabasePayload = { tables, fts: ftsRows };
    tarEntries.push({ name: "database.json", data: encodeJson(databasePayload) });
  }

  if (includes.media) {
    tarEntries.push(
      ...mediaObjects.map((item) => ({
        name: `${MEDIA_TAR_PREFIX}${item.key.slice(MEDIA_PREFIX.length)}`,
        data: item.data,
      })),
    );
  }

  if (includes.themes) {
    tarEntries.push(
      ...themePackages.map((item) => ({
        name: themePackageTarPath(item.slug),
        data: item.data,
      })),
      ...themeAssets.map((item) => ({
        name: item.key,
        data: item.data,
      })),
    );
  }

  return createTarGzip(tarEntries);
}

function parseManifest(raw: unknown): EdgepressManifest {
  if (!raw || typeof raw !== "object") {
    throw new Error("manifest.json inválido");
  }
  const manifest = raw as Partial<EdgepressManifest>;
  if (manifest.format !== EDGEPRESS_FORMAT) {
    throw new Error("Arquivo não é um pacote EdgePress válido");
  }
  const schemaVersion = manifest.schemaVersion;
  if (schemaVersion !== 1 && schemaVersion !== EDGEPRESS_SCHEMA_VERSION) {
    throw new Error(
      `Versão de schema não suportada: ${String(schemaVersion)} (esperado ${EDGEPRESS_SCHEMA_VERSION})`,
    );
  }
  return {
    ...(manifest as EdgepressManifest),
    includes: resolveManifestIncludes(manifest),
  };
}

function parseDatabasePayload(raw: unknown): EdgepressDatabasePayload {
  if (!raw || typeof raw !== "object") {
    throw new Error("database.json inválido");
  }
  const payload = raw as Partial<EdgepressDatabasePayload>;
  if (!payload.tables || typeof payload.tables !== "object") {
    throw new Error("database.json sem tabelas");
  }
  return payload as EdgepressDatabasePayload;
}

export async function restoreImport(
  db: Database,
  bucket: R2BucketLike,
  archiveBuffer: ArrayBuffer,
  kv?: ArchiveKvLike | null,
): Promise<EdgepressImportResult> {
  const entries = await parseTarGzip(archiveBuffer);
  const entryMap = new Map<string, Uint8Array>();

  for (const entry of entries) {
    if (!entry.name || !entry.data) continue;
    entryMap.set(entry.name, entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data));
  }

  const manifestBytes = entryMap.get("manifest.json");
  if (!manifestBytes) {
    throw new Error("Arquivo .edgepress incompleto (manifest.json ausente)");
  }

  const manifest = parseManifest(JSON.parse(new TextDecoder().decode(manifestBytes)));
  const includes = manifest.includes;
  const databaseBytes = entryMap.get("database.json");
  if (includes.database && !databaseBytes) {
    throw new Error("Arquivo .edgepress incompleto (database.json ausente)");
  }

  const databasePayload = databaseBytes
    ? parseDatabasePayload(JSON.parse(new TextDecoder().decode(databaseBytes)))
    : { tables: {} };

  if (includes.database) {
    await wipeDatabase(db);
    await wipeFtsTable(db);
  }
  if (includes.media) {
    await wipeR2Uploads(bucket);
  }
  if (includes.themes) {
    await wipeR2ByPrefix(bucket, THEME_ASSET_TAR_PREFIX);
    if (kv) {
      await wipeThemeKvCache(kv);
    }
  }

  const counts: Partial<Record<EdgepressLogicalTable, number>> = {};
  const tableOrder = resolveImportTableOrder(manifest.tableOrder);

  if (includes.database) {
    // TABLE_ORDER inserts parents before children, so inter-table FK constraints are respected
    // without needing PRAGMA foreign_keys = OFF (unsupported on D1 in production).
    // Self-referential FKs (posts.parent_id, taxonomies.parent_id) are handled via a second
    // pass after all rows are inserted (see restorePostParentIds / restoreTaxonomyParentIds).
    for (const logicalTable of tableOrder) {
      const rows = databasePayload.tables[logicalTable] ?? [];
      await insertRowsInBatches(db, logicalTable, rows);
      counts[logicalTable] = rows.length;
    }
    await resetAutoIncrementSequences(db);

    // Second pass: restore self-referential parent_id values nullified during insert.
    await restorePostParentIds(db, databasePayload.tables["posts"] ?? []);
    await restoreTaxonomyParentIds(db, databasePayload.tables["taxonomies"] ?? []);
  }

  const contentTypeByKey = new Map(
    (manifest.mediaFiles ?? []).map((item) => [item.key, item.contentType] as const),
  );

  let mediaCount = 0;
  let themeCount = 0;
  let ftsRestored = false;

  if (includes.database && databasePayload.fts && databasePayload.fts.length > 0) {
    await restoreFtsRows(db, databasePayload.fts);
    ftsRestored = true;
  }

  for (const [name, data] of entryMap.entries()) {
    if (includes.media && name.startsWith(MEDIA_TAR_PREFIX)) {
      const r2Key = `${MEDIA_PREFIX}${name.slice(MEDIA_TAR_PREFIX.length)}`;
      const contentType = contentTypeByKey.get(r2Key) ?? inferContentType(r2Key);
      await bucket.put(r2Key, data, { httpMetadata: { contentType } });
      mediaCount++;
      continue;
    }

    if (!includes.themes) continue;

    const packageSlug = parseThemePackageTarPath(name);
    if (packageSlug && kv) {
      const packageJson = new TextDecoder().decode(data);
      await kv.put(`${THEME_PKG_KV_PREFIX}${packageSlug}`, packageJson);
      themeCount++;
      continue;
    }

    if (isThemeAssetTarPath(name)) {
      const contentType = inferContentType(name);
      await bucket.put(name, data, { httpMetadata: { contentType } });
    }
  }

  if (includes.themes && kv) {
    await syncThemeCacheAfterImport(db, kv);
  }

  return { includes, counts, mediaCount, themeCount, ftsRestored };
}

export function buildExportFilename(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `edgepress-export-${stamp}.edgepress`;
}
