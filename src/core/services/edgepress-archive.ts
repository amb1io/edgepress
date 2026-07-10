/**
 * Export/import EdgePress database + R2 uploads + theme packages as a .edgepress (tar.gz) archive.
 */
import { zipSync } from "fflate";
import { createTarGzip, parseTarGzip } from "nanotar";
import { MAX_IMPORT_PART_BYTES } from "./edgepress-import-limits.ts";
import { eq, sql } from "drizzle-orm";
import {
  account,
  locales,
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

/** Source locale id (string) → locale_code. Used to remap FKs on import (locales are preserved per instance). */
export type LocaleIdMap = Record<string, string>;

export type EdgepressBundleInfo = {
  id: string;
  partIndex: number;
  partCount: number;
  partKind: "base" | "media";
};

export type EdgepressManifest = {
  format: typeof EDGEPRESS_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  appVersion: string;
  includes: ExportIncludes;
  tableOrder: EdgepressLogicalTable[];
  counts: Partial<Record<EdgepressLogicalTable, number>>;
  localeMap?: LocaleIdMap;
  ftsCount?: number;
  mediaCount: number;
  mediaFiles: Array<{ key: string; contentType: string }>;
  themeCount: number;
  themePackages: Array<{ slug: string }>;
  bundle?: EdgepressBundleInfo;
};

export const EDGEPRESS_BUNDLE_FORMAT = "edgepress-bundle" as const;

export type EdgepressBundleManifest = {
  format: typeof EDGEPRESS_BUNDLE_FORMAT;
  bundleId: string;
  exportedAt: string;
  partCount: number;
  parts: Array<{
    filename: string;
    partIndex: number;
    partKind: "base" | "media";
  }>;
};

export type ExportPart = {
  filename: string;
  data: Uint8Array;
  manifest: EdgepressManifest;
};

export type ExportBuildResult =
  | { type: "single"; data: Uint8Array; filename: string }
  | { type: "bundle"; data: Uint8Array; filename: string; parts: ExportPart[] };

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

function pickRowValue<T>(row: RowRecord, camelKey: string, snakeKey: string): T | undefined {
  if (row[camelKey] !== undefined) return row[camelKey] as T;
  if (row[snakeKey] !== undefined) return row[snakeKey] as T;
  return undefined;
}

/** Accept camelCase (Drizzle export) or snake_case (legacy SQL/CSV archives). */
export function normalizeUserImportRow(row: RowRecord): typeof user.$inferInsert {
  const createdAt = pickRowValue<number>(row, "createdAt", "created_at");
  const updatedAt = pickRowValue<number>(row, "updatedAt", "updated_at");
  if (createdAt == null || updatedAt == null) {
    throw new Error(`Linha de usuário inválida (id=${String(row["id"] ?? "?")}): created_at/updated_at ausentes`);
  }

  return {
    id: row["id"] as string,
    name: row["name"] as string,
    email: row["email"] as string,
    emailVerified: Boolean(pickRowValue(row, "emailVerified", "email_verified") ?? false),
    image: (pickRowValue<string | null>(row, "image", "image") ?? null) as string | null,
    description: (pickRowValue<string | null>(row, "description", "description") ?? null) as string | null,
    role: Number(pickRowValue(row, "role", "role") ?? 3),
    createdAt,
    updatedAt,
  };
}

/** Accept camelCase (Drizzle export) or snake_case (legacy SQL/CSV archives). */
export function normalizeAccountImportRow(row: RowRecord): typeof account.$inferInsert {
  const createdAt = pickRowValue<number>(row, "createdAt", "created_at");
  const updatedAt = pickRowValue<number>(row, "updatedAt", "updated_at");
  const userId = pickRowValue<string>(row, "userId", "user_id");
  const accountId = pickRowValue<string>(row, "accountId", "account_id");
  const providerId = pickRowValue<string>(row, "providerId", "provider_id");
  if (!userId || !accountId || !providerId || createdAt == null || updatedAt == null) {
    throw new Error(`Linha de account inválida (id=${String(row["id"] ?? "?")}): campos obrigatórios ausentes`);
  }

  return {
    id: row["id"] as string,
    userId,
    accountId,
    providerId,
    accessToken: pickRowValue<string | null>(row, "accessToken", "access_token") ?? null,
    refreshToken: pickRowValue<string | null>(row, "refreshToken", "refresh_token") ?? null,
    accessTokenExpiresAt: pickRowValue<number | null>(row, "accessTokenExpiresAt", "access_token_expires_at") ?? null,
    refreshTokenExpiresAt:
      pickRowValue<number | null>(row, "refreshTokenExpiresAt", "refresh_token_expires_at") ?? null,
    scope: pickRowValue<string | null>(row, "scope", "scope") ?? null,
    idToken: pickRowValue<string | null>(row, "idToken", "id_token") ?? null,
    password: pickRowValue<string | null>(row, "password", "password") ?? null,
    createdAt,
    updatedAt,
  };
}

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
    if (!rows.length) return;
    await db
      .insert(postTypes)
      .values(rows as typeof postTypes.$inferInsert[])
      .onConflictDoUpdate({
        target: postTypes.slug,
        set: {
          name: sql`excluded.name`,
          meta_schema: sql`excluded.meta_schema`,
          created_at: sql`excluded.created_at`,
          updated_at: sql`excluded.updated_at`,
        },
      });
  },
  user: async (db, rows) => {
    if (!rows.length) return;
    await db
      .insert(user)
      .values(rows.map(normalizeUserImportRow))
      .onConflictDoUpdate({
        target: user.id,
        set: {
          name: sql`excluded.name`,
          email: sql`excluded.email`,
          emailVerified: sql`excluded.email_verified`,
          image: sql`excluded.image`,
          description: sql`excluded.description`,
          role: sql`excluded.role`,
          createdAt: sql`excluded.created_at`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  },
  account: async (db, rows) => {
    if (!rows.length) return;
    await db
      .insert(account)
      .values(rows.map(normalizeAccountImportRow))
      .onConflictDoUpdate({
        target: account.id,
        set: {
          userId: sql`excluded.user_id`,
          accountId: sql`excluded.account_id`,
          providerId: sql`excluded.provider_id`,
          accessToken: sql`excluded.access_token`,
          refreshToken: sql`excluded.refresh_token`,
          accessTokenExpiresAt: sql`excluded.access_token_expires_at`,
          refreshTokenExpiresAt: sql`excluded.refresh_token_expires_at`,
          scope: sql`excluded.scope`,
          idToken: sql`excluded.id_token`,
          password: sql`excluded.password`,
          createdAt: sql`excluded.created_at`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  },
  taxonomies: async (db, rows) => {
    if (!rows.length) return;
    // Insert with parent_id = null to avoid self-referential FK violations on D1.
    // A second pass in restoreImport will update parent_id after all rows are inserted.
    const nullified = rows.map((r) => ({ ...(r as typeof taxonomies.$inferInsert), parent_id: null }));
    await db
      .insert(taxonomies)
      .values(nullified)
      .onConflictDoUpdate({
        target: taxonomies.id,
        set: {
          name: sql`excluded.name`,
          slug: sql`excluded.slug`,
          description: sql`excluded.description`,
          type: sql`excluded.type`,
          parent_id: sql`excluded.parent_id`,
          id_locale_code: sql`excluded.id_locale_code`,
          created_at: sql`excluded.created_at`,
          updated_at: sql`excluded.updated_at`,
        },
      });
  },
  settings: async (db, rows) => {
    if (!rows.length) return;
    await db
      .insert(settings)
      .values(rows as typeof settings.$inferInsert[])
      .onConflictDoUpdate({
        target: settings.name,
        set: {
          value: sql`excluded.value`,
          autoload: sql`excluded.autoload`,
        },
      });
  },
  posts: async (db, rows) => {
    if (!rows.length) return;
    // Insert with parent_id = null to avoid self-referential FK violations on D1.
    // A second pass in restoreImport will update parent_id after all rows are inserted.
    const nullified = rows.map((r) => ({ ...(r as typeof posts.$inferInsert), parent_id: null }));
    await db
      .insert(posts)
      .values(nullified)
      .onConflictDoUpdate({
        target: posts.id,
        set: {
          post_type_id: sql`excluded.post_type_id`,
          parent_id: sql`excluded.parent_id`,
          author_id: sql`excluded.author_id`,
          id_locale_code: sql`excluded.id_locale_code`,
          title: sql`excluded.title`,
          slug: sql`excluded.slug`,
          excerpt: sql`excluded.excerpt`,
          body: sql`excluded.body`,
          body_blocks: sql`excluded.body_blocks`,
          status: sql`excluded.status`,
          meta_values: sql`excluded.meta_values`,
          published_at: sql`excluded.published_at`,
          created_at: sql`excluded.created_at`,
          updated_at: sql`excluded.updated_at`,
        },
      });
  },
  seo_metadata: async (db, rows) => {
    if (!rows.length) return;
    await db
      .insert(seoMetadata)
      .values(rows as typeof seoMetadata.$inferInsert[])
      .onConflictDoUpdate({
        target: seoMetadata.post_id,
        set: {
          seo_title: sql`excluded.seo_title`,
          seo_description: sql`excluded.seo_description`,
          seo_canonical: sql`excluded.seo_canonical`,
          created_at: sql`excluded.created_at`,
          updated_at: sql`excluded.updated_at`,
        },
      });
  },
  posts_taxonomies: async (db, rows) => {
    if (!rows.length) return;
    await db
      .insert(postsTaxonomies)
      .values(rows as typeof postsTaxonomies.$inferInsert[])
      .onConflictDoUpdate({
        target: [postsTaxonomies.post_id, postsTaxonomies.term_id],
        set: {
          post_id: sql`excluded.post_id`,
          term_id: sql`excluded.term_id`,
        },
      });
  },
  posts_media: async (db, rows) => {
    if (!rows.length) return;
    await db
      .insert(postsMedia)
      .values(rows as typeof postsMedia.$inferInsert[])
      .onConflictDoUpdate({
        target: [postsMedia.post_id, postsMedia.media_id],
        set: {
          post_id: sql`excluded.post_id`,
          media_id: sql`excluded.media_id`,
        },
      });
  },
};

export const DEFAULT_INSERT_BATCH_SIZE = 10;
/**
 * D1 allows at most 100 bound parameters per statement. Multi-row inserts cut the number of
 * sequential D1 round-trips (a large import doing one insert per row can run for minutes and is
 * prone to transient D1 errors). Posts have 15 columns → 4 rows = 60 params, keeping the statement
 * small enough even when bodies carry large HTML.
 */
export const INSERT_BATCH_SIZE: Partial<Record<EdgepressLogicalTable, number>> = {
  posts: 4,
  post_types: 5,
  taxonomies: 8,
  settings: 20,
};

export function resolveImportTableOrder(manifestOrder?: string[]): EdgepressLogicalTable[] {
  const preserved = new Set<string>(PRESERVED_TABLES);
  const source = manifestOrder?.length ? manifestOrder : TABLE_ORDER;
  const wanted = new Set<EdgepressLogicalTable>();

  for (const table of source) {
    if (preserved.has(table)) continue;
    if (!(table in TABLE_INSERTERS)) continue;
    wanted.add(table as EdgepressLogicalTable);
  }

  for (const table of TABLE_ORDER) {
    wanted.add(table);
  }

  // Always follow TABLE_ORDER so parent rows (e.g. user) precede children (account).
  return TABLE_ORDER.filter((table) => wanted.has(table));
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

export function inferContentType(key: string): string {
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

export async function wipeFtsTable(db: Database): Promise<void> {
  await runSql(db, sql.raw(`DELETE FROM ${FTS_TABLE}`));
}

export async function restoreFtsRows(db: Database, rows: FtsRow[]): Promise<void> {
  // One multi-row INSERT per batch to minimize D1 round-trips.
  // 9 columns × FTS_INSERT_BATCH_SIZE (8) = 72 bound params, under D1's 100 limit.
  for (let i = 0; i < rows.length; i += FTS_INSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + FTS_INSERT_BATCH_SIZE);
    if (batch.length === 0) continue;
    const valuesGroups = batch.map(
      (row) =>
        sql`(${row.rowid}, ${row.post_id}, ${row.post_type_id}, ${row.status}, ${row.id_locale_code}, ${row.title}, ${row.body}, ${row.taxonomy}, ${row.custom_fields})`,
    );
    await runSql(
      db,
      sql`
        INSERT INTO edp_posts_fts (
          rowid, post_id, post_type_id, status, id_locale_code,
          title, body, taxonomy, custom_fields
        ) VALUES ${sql.join(valuesGroups, sql`, `)}
      `,
    );
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

export async function wipeR2ByPrefix(bucket: R2BucketLike, prefix: string): Promise<number> {
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

export async function wipeR2Uploads(bucket: R2BucketLike): Promise<number> {
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

export async function wipeThemeKvCache(kv: ArchiveKvLike): Promise<void> {
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

export function parseThemePackageTarPath(path: string): string | null {
  const match = path.match(/^themes\/([^/]+)\/package\.json$/);
  return match?.[1]?.trim().toLowerCase() ?? null;
}

export function isThemeAssetTarPath(path: string): boolean {
  if (!path.startsWith(THEME_ASSET_TAR_PREFIX)) return false;
  return !path.endsWith(`/${THEME_PACKAGE_JSON}`);
}

export async function syncThemeCacheAfterImport(db: Database, kv: ArchiveKvLike): Promise<void> {
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

export async function wipeDatabase(db: Database): Promise<void> {
  // WIPE_ORDER is the reverse of TABLE_ORDER (children before parents),
  // so FK constraints are respected without needing PRAGMA foreign_keys = OFF.
  // D1 in production does not support PRAGMA statements via the HTTP API.
  for (const logicalTable of WIPE_ORDER) {
    const physical = tableName(logicalTable);
    await runSql(db, sql.raw(`DELETE FROM ${physical}`));
  }
}

export async function insertRowsInBatches(
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
export async function restorePostParentIds(db: Database, rows: RowRecord[]): Promise<void> {
  for (const row of rows) {
    if (row["parent_id"] == null) continue;
    await db
      .update(posts)
      .set({ parent_id: row["parent_id"] as number })
      .where(eq(posts.id, row["id"] as number));
  }
}

export async function restoreTaxonomyParentIds(db: Database, rows: RowRecord[]): Promise<void> {
  for (const row of rows) {
    if (row["parent_id"] == null) continue;
    await db
      .update(taxonomies)
      .set({ parent_id: row["parent_id"] as number })
      .where(eq(taxonomies.id, row["id"] as number));
  }
}

export async function resetAutoIncrementSequences(db: Database): Promise<void> {
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

export async function readLocaleIdMap(db: Database): Promise<LocaleIdMap> {
  const rows = await db
    .select({ id: locales.id, locale_code: locales.locale_code })
    .from(locales);
  const map: LocaleIdMap = {};
  for (const row of rows) {
    map[String(row.id)] = row.locale_code;
  }
  return map;
}

export function remapLocaleId(
  sourceId: number | null | undefined,
  sourceLocaleMap: LocaleIdMap,
  targetByCode: Map<string, number>,
  targetIds: Set<number>,
): number | null {
  if (sourceId == null) return null;

  const localeCode = sourceLocaleMap[String(sourceId)];
  if (localeCode) {
    return targetByCode.get(localeCode) ?? null;
  }

  // Legacy archives without localeMap: keep the id when it already exists on the target.
  if (targetIds.has(sourceId)) return sourceId;
  return null;
}

function rowIdSet(rows: RowRecord[] | undefined): Set<string> {
  const ids = new Set<string>();
  for (const row of rows ?? []) {
    const id = String(row["id"] ?? "").trim();
    if (id) ids.add(id);
  }
  return ids;
}

function warnDropped(kind: string, dropped: number, detail: string): void {
  if (dropped <= 0) return;
  console.warn(`[import] dropping ${dropped} ${kind} (${detail})`);
}

/**
 * Scrub dangling FK references before D1 sees them.
 *
 * D1 enforces foreign keys and does not support `PRAGMA foreign_keys = OFF` over
 * the HTTP API, so a single orphan row rejects an entire multi-row INSERT.
 *
 * Not handled: posts.post_type_id is NOT NULL + RESTRICT; a post pointing at a
 * missing post type would still hard-fail (no safe null-out without dropping the post).
 */
export function sanitizeDatabasePayload(
  payload: EdgepressDatabasePayload,
): EdgepressDatabasePayload {
  const tables: EdgepressDatabasePayload["tables"] = { ...payload.tables };
  const userIds = rowIdSet(tables.user);
  const postIds = rowIdSet(tables.posts);
  const taxonomyIds = rowIdSet(tables.taxonomies);

  if (tables.account?.length) {
    const kept: RowRecord[] = [];
    let dropped = 0;
    for (const row of tables.account) {
      const userId = String(pickRowValue(row, "userId", "user_id") ?? "").trim();
      if (userId && userIds.has(userId)) {
        kept.push(row);
      } else {
        dropped++;
      }
    }
    warnDropped("account row(s) with missing user_id", dropped, `users in archive: ${userIds.size}`);
    tables.account = kept;
  }

  if (tables.posts?.length) {
    let clearedAuthors = 0;
    let clearedParents = 0;
    tables.posts = tables.posts.map((row) => {
      let next = row;
      const authorId = row["author_id"];
      if (authorId != null && authorId !== "" && !userIds.has(String(authorId))) {
        next = { ...next, author_id: null };
        clearedAuthors++;
      }
      const parentId = next["parent_id"];
      if (parentId != null && parentId !== "" && !postIds.has(String(parentId))) {
        next = next === row ? { ...next, parent_id: null } : { ...next, parent_id: null };
        clearedParents++;
      }
      return next;
    });
    if (clearedAuthors > 0) {
      console.warn(`[import] clearing ${clearedAuthors} posts.author_id pointing at missing users`);
    }
    if (clearedParents > 0) {
      console.warn(`[import] clearing ${clearedParents} posts.parent_id pointing at missing posts`);
    }
  }

  if (tables.taxonomies?.length) {
    let clearedParents = 0;
    tables.taxonomies = tables.taxonomies.map((row) => {
      const parentId = row["parent_id"];
      if (parentId == null || parentId === "") return row;
      if (taxonomyIds.has(String(parentId))) return row;
      clearedParents++;
      return { ...row, parent_id: null };
    });
    if (clearedParents > 0) {
      console.warn(
        `[import] clearing ${clearedParents} taxonomies.parent_id pointing at missing taxonomies`,
      );
    }
  }

  if (tables.posts_taxonomies?.length) {
    const kept: RowRecord[] = [];
    let dropped = 0;
    for (const row of tables.posts_taxonomies) {
      const postId = String(row["post_id"] ?? "").trim();
      const termId = String(row["term_id"] ?? "").trim();
      if (postId && termId && postIds.has(postId) && taxonomyIds.has(termId)) {
        kept.push(row);
      } else {
        dropped++;
      }
    }
    warnDropped(
      "posts_taxonomies row(s)",
      dropped,
      `posts=${postIds.size} taxonomies=${taxonomyIds.size}`,
    );
    tables.posts_taxonomies = kept;
  }

  if (tables.posts_media?.length) {
    const kept: RowRecord[] = [];
    let dropped = 0;
    for (const row of tables.posts_media) {
      const postId = String(row["post_id"] ?? "").trim();
      const mediaId = String(row["media_id"] ?? "").trim();
      if (postId && mediaId && postIds.has(postId) && postIds.has(mediaId)) {
        kept.push(row);
      } else {
        dropped++;
      }
    }
    warnDropped("posts_media row(s)", dropped, `posts=${postIds.size}`);
    tables.posts_media = kept;
  }

  if (tables.seo_metadata?.length) {
    const kept: RowRecord[] = [];
    let dropped = 0;
    for (const row of tables.seo_metadata) {
      const postId = String(row["post_id"] ?? "").trim();
      if (postId && postIds.has(postId)) {
        kept.push(row);
      } else {
        dropped++;
      }
    }
    warnDropped("seo_metadata row(s)", dropped, `posts=${postIds.size}`);
    tables.seo_metadata = kept;
  }

  return { ...payload, tables };
}

export async function remapDatabasePayloadLocales(
  db: Database,
  manifest: Pick<EdgepressManifest, "localeMap">,
  payload: EdgepressDatabasePayload,
): Promise<EdgepressDatabasePayload> {
  const sourceLocaleMap = manifest.localeMap ?? {};
  const targetRows = await db
    .select({ id: locales.id, locale_code: locales.locale_code })
    .from(locales);
  const targetByCode = new Map(targetRows.map((row) => [row.locale_code, row.id]));
  const targetIds = new Set(targetRows.map((row) => row.id));

  const remapRow = (row: RowRecord): RowRecord => {
    if (row["id_locale_code"] == null) return row;
    return {
      ...row,
      id_locale_code: remapLocaleId(
        row["id_locale_code"] as number,
        sourceLocaleMap,
        targetByCode,
        targetIds,
      ),
    };
  };

  const tables: EdgepressDatabasePayload["tables"] = { ...payload.tables };
  if (tables.posts) {
    tables.posts = tables.posts.map(remapRow);
  }
  if (tables.taxonomies) {
    tables.taxonomies = tables.taxonomies.map(remapRow);
  }

  const fts = payload.fts?.map((row) => ({
    ...row,
    id_locale_code: remapLocaleId(
      row.id_locale_code,
      sourceLocaleMap,
      targetByCode,
      targetIds,
    ),
  }));

  return sanitizeDatabasePayload({ tables, fts });
}

type MediaObject = { key: string; data: Uint8Array; contentType: string };

function mediaTarEntries(objects: MediaObject[]): TarEntryInput[] {
  return objects.map((item) => ({
    name: `${MEDIA_TAR_PREFIX}${item.key.slice(MEDIA_PREFIX.length)}`,
    data: item.data,
  }));
}

function themeTarEntries(
  themePackages: Array<{ slug: string; data: Uint8Array }>,
  themeAssets: Array<{ key: string; data: Uint8Array }>,
): TarEntryInput[] {
  return [
    ...themePackages.map((item) => ({
      name: themePackageTarPath(item.slug),
      data: item.data,
    })),
    ...themeAssets.map((item) => ({
      name: item.key,
      data: item.data,
    })),
  ];
}

function buildBaseManifestFields(
  includes: ExportIncludes,
  counts: Partial<Record<EdgepressLogicalTable, number>>,
  localeMap: LocaleIdMap | undefined,
  ftsRows: FtsRow[],
  themePackages: Array<{ slug: string }>,
  exportedAt: string,
): Omit<EdgepressManifest, "mediaCount" | "mediaFiles" | "bundle"> {
  return {
    format: EDGEPRESS_FORMAT,
    schemaVersion: EDGEPRESS_SCHEMA_VERSION,
    exportedAt,
    appVersion: APP_VERSION,
    includes,
    tableOrder: [...TABLE_ORDER],
    counts,
    localeMap,
    ftsCount: includes.database ? ftsRows.length : undefined,
    themeCount: themePackages.length,
    themePackages: themePackages.map((item) => ({ slug: item.slug })),
  };
}

async function createPartArchive(entries: TarEntryInput[]): Promise<Uint8Array> {
  return createTarGzip(entries);
}

/** Per-file tar header overhead; gzip barely shrinks already-compressed media. */
const TAR_ENTRY_OVERHEAD_BYTES = 512;
const GZIP_SIZE_MARGIN = 1.05;

export function estimateTarGzipBytes(entries: TarEntryInput[]): number {
  let raw = 0;
  for (const entry of entries) {
    const data =
      typeof entry.data === "string" ? new TextEncoder().encode(entry.data) : entry.data;
    raw += TAR_ENTRY_OVERHEAD_BYTES + data.byteLength;
  }
  return Math.ceil(raw * GZIP_SIZE_MARGIN);
}

export function chunkMediaByEstimatedSize(
  mediaObjects: MediaObject[],
  maxPartBytes: number,
  firstPartPrefixBytes: number,
  mediaOnlyPrefixBytes: number,
): MediaObject[][] {
  if (mediaObjects.length === 0) return [];

  const chunks: MediaObject[][] = [];
  let current: MediaObject[] = [];
  let prefixBytes = firstPartPrefixBytes;
  let currentSize = prefixBytes;

  for (const item of mediaObjects) {
    const itemBytes = TAR_ENTRY_OVERHEAD_BYTES + item.data.byteLength;
    if (current.length > 0 && currentSize + itemBytes > maxPartBytes) {
      chunks.push(current);
      current = [];
      prefixBytes = mediaOnlyPrefixBytes;
      currentSize = prefixBytes;
    }
    current.push(item);
    currentSize += itemBytes;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

export async function buildExportParts(
  db: Database,
  bucket: R2BucketLike,
  kv?: ArchiveKvLike | null,
  options?: Partial<ExportOptions>,
): Promise<ExportPart[]> {
  const includes = resolveExportIncludes(options);
  const tables: Partial<Record<EdgepressLogicalTable, RowRecord[]>> = {};
  const counts: Partial<Record<EdgepressLogicalTable, number>> = {};
  let ftsRows: FtsRow[] = [];
  let localeMap: LocaleIdMap | undefined;

  if (includes.database) {
    for (const logicalTable of TABLE_ORDER) {
      const rows = await TABLE_READERS[logicalTable](db);
      tables[logicalTable] = rows;
    }
    const sanitized = sanitizeDatabasePayload({ tables });
    Object.assign(tables, sanitized.tables);
    for (const logicalTable of TABLE_ORDER) {
      counts[logicalTable] = tables[logicalTable]?.length ?? 0;
    }
    ftsRows = await readAllFtsRows(db);
    localeMap = await readLocaleIdMap(db);
  }

  const mediaObjects = includes.media ? await readAllR2Objects(bucket) : [];
  const themePackages = includes.themes && kv ? await readAllThemePackages(kv) : [];
  const themeAssets = includes.themes ? await readAllR2ByPrefix(bucket, THEME_ASSET_TAR_PREFIX) : [];
  const exportedAt = new Date().toISOString();

  const baseManifestFields = buildBaseManifestFields(
    includes,
    counts,
    localeMap,
    ftsRows,
    themePackages,
    exportedAt,
  );

  const baseEntries: TarEntryInput[] = [];
  if (includes.database) {
    const databasePayload: EdgepressDatabasePayload = { tables, fts: ftsRows };
    baseEntries.push({ name: "database.json", data: encodeJson(databasePayload) });
  }
  if (includes.themes) {
    baseEntries.push(...themeTarEntries(themePackages, themeAssets));
  }

  const allMediaManifest: EdgepressManifest = {
    ...baseManifestFields,
    mediaCount: mediaObjects.length,
    mediaFiles: mediaObjects.map((item) => ({
      key: item.key,
      contentType: item.contentType,
    })),
  };

  const singleEntries: TarEntryInput[] = [
    { name: "manifest.json", data: encodeJson(allMediaManifest) },
    ...baseEntries,
    ...mediaTarEntries(mediaObjects),
  ];
  const singleEstimate = estimateTarGzipBytes(singleEntries);

  if (singleEstimate <= MAX_IMPORT_PART_BYTES) {
    const singleArchive = await createPartArchive(singleEntries);
    if (singleArchive.byteLength <= MAX_IMPORT_PART_BYTES) {
      return [
        {
          filename: buildExportFilename(),
          data: singleArchive,
          manifest: allMediaManifest,
        },
      ];
    }
  }

  const bundleId = crypto.randomUUID();
  const basePrefixEstimate = estimateTarGzipBytes([
    { name: "manifest.json", data: encodeJson({ format: EDGEPRESS_FORMAT }) },
    ...baseEntries,
  ]);
  const mediaOnlyPrefixEstimate = estimateTarGzipBytes([
    { name: "manifest.json", data: encodeJson({ format: EDGEPRESS_FORMAT }) },
  ]);
  const mediaChunks = chunkMediaByEstimatedSize(
    mediaObjects,
    MAX_IMPORT_PART_BYTES,
    basePrefixEstimate,
    mediaOnlyPrefixEstimate,
  );

  const partCount = mediaChunks.length > 0 ? mediaChunks.length : 1;
  const parts: ExportPart[] = [];
  const firstMediaChunk = mediaChunks[0] ?? [];
  const basePartManifest: EdgepressManifest = {
    ...baseManifestFields,
    includes: {
      database: includes.database,
      media: firstMediaChunk.length > 0,
      themes: includes.themes,
    },
    mediaCount: firstMediaChunk.length,
    mediaFiles: firstMediaChunk.map((item) => ({
      key: item.key,
      contentType: item.contentType,
    })),
    bundle: {
      id: bundleId,
      partIndex: 1,
      partCount,
      partKind: "base",
    },
  };

  const basePartEntries: TarEntryInput[] = [
    { name: "manifest.json", data: encodeJson(basePartManifest) },
    ...baseEntries,
    ...mediaTarEntries(firstMediaChunk),
  ];
  parts.push({
    filename: buildPartFilename(1),
    data: await createPartArchive(basePartEntries),
    manifest: basePartManifest,
  });

  for (let i = 1; i < mediaChunks.length; i++) {
    const chunk = mediaChunks[i]!;
    const partIndex = i + 1;
    const mediaManifest: EdgepressManifest = {
      format: EDGEPRESS_FORMAT,
      schemaVersion: EDGEPRESS_SCHEMA_VERSION,
      exportedAt,
      appVersion: APP_VERSION,
      includes: { database: false, media: true, themes: false },
      tableOrder: [...TABLE_ORDER],
      counts: {},
      mediaCount: chunk.length,
      mediaFiles: chunk.map((item) => ({
        key: item.key,
        contentType: item.contentType,
      })),
      themeCount: 0,
      themePackages: [],
      bundle: {
        id: bundleId,
        partIndex,
        partCount,
        partKind: "media",
      },
    };

    const mediaEntries: TarEntryInput[] = [
      { name: "manifest.json", data: encodeJson(mediaManifest) },
      ...mediaTarEntries(chunk),
    ];

    parts.push({
      filename: buildPartFilename(partIndex),
      data: await createPartArchive(mediaEntries),
      manifest: mediaManifest,
    });
  }

  return parts;
}

export function buildExportBundleManifest(
  bundleId: string,
  exportedAt: string,
  parts: ExportPart[],
): EdgepressBundleManifest {
  return {
    format: EDGEPRESS_BUNDLE_FORMAT,
    bundleId,
    exportedAt,
    partCount: parts.length,
    parts: parts.map((part) => ({
      filename: part.filename,
      partIndex: part.manifest.bundle?.partIndex ?? 0,
      partKind: part.manifest.bundle?.partKind ?? "base",
    })),
  };
}

export function buildExportBundleZip(parts: ExportPart[]): Uint8Array {
  const zipEntries: Record<string, Uint8Array> = {};
  for (const part of parts) {
    zipEntries[part.filename] = part.data;
  }
  return zipSync(zipEntries);
}

export async function buildExportResult(
  db: Database,
  bucket: R2BucketLike,
  kv?: ArchiveKvLike | null,
  options?: Partial<ExportOptions>,
): Promise<ExportBuildResult> {
  const parts = await buildExportParts(db, bucket, kv, options);

  if (parts.length === 1) {
    const part = parts[0]!;
    return {
      type: "single",
      data: part.data,
      filename: part.filename,
    };
  }

  return {
    type: "bundle",
    data: buildExportBundleZip(parts),
    filename: buildExportBundleFilename(),
    parts,
  };
}

/** @deprecated Use buildExportResult for multi-part support. */
export async function buildExport(
  db: Database,
  bucket: R2BucketLike,
  kv?: ArchiveKvLike | null,
  options?: Partial<ExportOptions>,
): Promise<Uint8Array> {
  const result = await buildExportResult(db, bucket, kv, options);
  return result.data;
}

export function parseEdgepressManifest(raw: unknown): EdgepressManifest {
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

export function parseEdgepressDatabasePayload(raw: unknown): EdgepressDatabasePayload {
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

  const manifest = parseEdgepressManifest(JSON.parse(new TextDecoder().decode(manifestBytes)));
  const includes = manifest.includes;
  const databaseBytes = entryMap.get("database.json");
  if (includes.database && !databaseBytes) {
    throw new Error("Arquivo .edgepress incompleto (database.json ausente)");
  }

  const databasePayload = databaseBytes
    ? parseEdgepressDatabasePayload(JSON.parse(new TextDecoder().decode(databaseBytes)))
    : { tables: {} };
  const importPayload = includes.database
    ? await remapDatabasePayloadLocales(db, manifest, databasePayload)
    : databasePayload;

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
      const rows = importPayload.tables[logicalTable] ?? [];
      await insertRowsInBatches(db, logicalTable, rows);
      counts[logicalTable] = rows.length;
    }
    await resetAutoIncrementSequences(db);

    // Second pass: restore self-referential parent_id values nullified during insert.
    // Use sanitized importPayload so dangling parent_ids are not re-applied.
    await restorePostParentIds(db, importPayload.tables["posts"] ?? []);
    await restoreTaxonomyParentIds(db, importPayload.tables["taxonomies"] ?? []);
  }

  const contentTypeByKey = new Map(
    (manifest.mediaFiles ?? []).map((item) => [item.key, item.contentType] as const),
  );

  let mediaCount = 0;
  let themeCount = 0;
  let ftsRestored = false;

  if (includes.database && importPayload.fts && importPayload.fts.length > 0) {
    await restoreFtsRows(db, importPayload.fts);
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

export function buildPartFilename(partIndex: number): string {
  return `part-${String(partIndex).padStart(3, "0")}.edgepress`;
}

export function buildExportBundleFilename(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `edgepress-bundle-${stamp}.zip`;
}
