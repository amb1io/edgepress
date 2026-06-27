/**
 * Export/import EdgePress database + R2 uploads as a .edgepress (tar.gz) archive.
 */
import { createTarGzip, parseTarGzip } from "nanotar";
import { sql } from "drizzle-orm";
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

export const EDGEPRESS_FORMAT = "edgepress" as const;
export const EDGEPRESS_SCHEMA_VERSION = 1;
export const APP_VERSION = "0.0.1";
export const MEDIA_PREFIX = "uploads/";
export const MEDIA_TAR_PREFIX = "media/uploads/";

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
  tableOrder: EdgepressLogicalTable[];
  counts: Partial<Record<EdgepressLogicalTable, number>>;
  mediaCount: number;
  mediaFiles: Array<{ key: string; contentType: string }>;
};

export type EdgepressDatabasePayload = {
  tables: Partial<Record<EdgepressLogicalTable, RowRecord[]>>;
};

export type EdgepressImportResult = {
  counts: Partial<Record<EdgepressLogicalTable, number>>;
  mediaCount: number;
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
    if (rows.length) await db.insert(taxonomies).values(rows as typeof taxonomies.$inferInsert[]);
  },
  settings: async (db, rows) => {
    if (rows.length) await db.insert(settings).values(rows as typeof settings.$inferInsert[]);
  },
  posts: async (db, rows) => {
    if (rows.length) await db.insert(posts).values(rows as typeof posts.$inferInsert[]);
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

async function readAllR2Objects(bucket: R2BucketLike): Promise<
  Array<{ key: string; data: Uint8Array; contentType: string }>
> {
  const results: Array<{ key: string; data: Uint8Array; contentType: string }> = [];
  let cursor: string | undefined;

  do {
    const listed = await bucket.list({
      prefix: MEDIA_PREFIX,
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

async function wipeR2Uploads(bucket: R2BucketLike): Promise<number> {
  let deleted = 0;
  let cursor: string | undefined;

  do {
    const listed = await bucket.list({
      prefix: MEDIA_PREFIX,
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

async function wipeDatabase(db: Database): Promise<void> {
  await runSql(db, sql`PRAGMA foreign_keys = OFF`);
  try {
    for (const logicalTable of WIPE_ORDER) {
      const physical = tableName(logicalTable);
      await runSql(db, sql.raw(`DELETE FROM ${physical}`));
    }
  } finally {
    await runSql(db, sql`PRAGMA foreign_keys = ON`);
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

export async function buildExport(db: Database, bucket: R2BucketLike): Promise<Uint8Array> {
  const tables: Partial<Record<EdgepressLogicalTable, RowRecord[]>> = {};
  const counts: Partial<Record<EdgepressLogicalTable, number>> = {};

  for (const logicalTable of TABLE_ORDER) {
    const rows = await TABLE_READERS[logicalTable](db);
    tables[logicalTable] = rows;
    counts[logicalTable] = rows.length;
  }

  const mediaObjects = await readAllR2Objects(bucket);
  const manifest: EdgepressManifest = {
    format: EDGEPRESS_FORMAT,
    schemaVersion: EDGEPRESS_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    tableOrder: [...TABLE_ORDER],
    counts,
    mediaCount: mediaObjects.length,
    mediaFiles: mediaObjects.map((item) => ({
      key: item.key,
      contentType: item.contentType,
    })),
  };
  const databasePayload: EdgepressDatabasePayload = { tables };
  const tarEntries: TarEntryInput[] = [
    { name: "manifest.json", data: encodeJson(manifest) },
    { name: "database.json", data: encodeJson(databasePayload) },
    ...mediaObjects.map((item) => ({
      name: `${MEDIA_TAR_PREFIX}${item.key.slice(MEDIA_PREFIX.length)}`,
      data: item.data,
    })),
  ];

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
  if (manifest.schemaVersion !== EDGEPRESS_SCHEMA_VERSION) {
    throw new Error(
      `Versão de schema não suportada: ${String(manifest.schemaVersion)} (esperado ${EDGEPRESS_SCHEMA_VERSION})`,
    );
  }
  return manifest as EdgepressManifest;
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
): Promise<EdgepressImportResult> {
  const entries = await parseTarGzip(archiveBuffer);
  const entryMap = new Map<string, Uint8Array>();

  for (const entry of entries) {
    if (!entry.name || !entry.data) continue;
    entryMap.set(entry.name, entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data));
  }

  const manifestBytes = entryMap.get("manifest.json");
  const databaseBytes = entryMap.get("database.json");
  if (!manifestBytes || !databaseBytes) {
    throw new Error("Arquivo .edgepress incompleto (manifest.json ou database.json ausente)");
  }

  const manifest = parseManifest(JSON.parse(new TextDecoder().decode(manifestBytes)));
  const databasePayload = parseDatabasePayload(JSON.parse(new TextDecoder().decode(databaseBytes)));

  await wipeDatabase(db);
  await wipeR2Uploads(bucket);

  const counts: Partial<Record<EdgepressLogicalTable, number>> = {};
  const tableOrder = resolveImportTableOrder(manifest.tableOrder);

  await runSql(db, sql`PRAGMA foreign_keys = OFF`);
  try {
    for (const logicalTable of tableOrder) {
      const rows = databasePayload.tables[logicalTable] ?? [];
      await insertRowsInBatches(db, logicalTable, rows);
      counts[logicalTable] = rows.length;
    }
    await resetAutoIncrementSequences(db);
  } finally {
    await runSql(db, sql`PRAGMA foreign_keys = ON`);
  }

  const contentTypeByKey = new Map(
    (manifest.mediaFiles ?? []).map((item) => [item.key, item.contentType] as const),
  );

  let mediaCount = 0;
  for (const [name, data] of entryMap.entries()) {
    if (!name.startsWith(MEDIA_TAR_PREFIX)) continue;
    const r2Key = `${MEDIA_PREFIX}${name.slice(MEDIA_TAR_PREFIX.length)}`;
    const contentType = contentTypeByKey.get(r2Key) ?? inferContentType(r2Key);
    await bucket.put(r2Key, data, { httpMetadata: { contentType } });
    mediaCount++;
  }

  return { counts, mediaCount };
}

export function buildExportFilename(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `edgepress-export-${stamp}.edgepress`;
}
