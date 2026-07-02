/**
 * Stage .edgepress archives in R2 for chunked import jobs.
 */
import { parseTarGzip } from "nanotar";
import {
  MEDIA_PREFIX,
  MEDIA_TAR_PREFIX,
  THEME_ASSET_TAR_PREFIX,
  inferContentType,
  isThemeAssetTarPath,
  parseEdgepressDatabasePayload,
  parseEdgepressManifest,
  parseThemePackageTarPath,
  remapDatabasePayloadLocales,
  resolveImportTableOrder,
  type EdgepressLogicalTable,
  type EdgepressManifest,
  type ExportIncludes,
} from "./edgepress-archive.ts";
import type { Database } from "../../utils/types/database.ts";

export const IMPORT_STAGING_PREFIX = "imports/";

export type StagedMediaFile = {
  tarPath: string;
  r2Key: string;
  contentType: string;
};

export type StagedThemeFile = {
  tarPath: string;
  kind: "package" | "asset";
  slug?: string;
};

export type ImportStagingManifest = {
  manifest: EdgepressManifest;
  includes: ExportIncludes;
  mediaFiles: StagedMediaFile[];
  themeFiles: StagedThemeFile[];
};

export type ImportStagingBucket = {
  put: (
    key: string,
    value: BodyInit,
    options?: { httpMetadata?: { contentType?: string } },
  ) => Promise<unknown>;
  get: (key: string) => Promise<{ body: ReadableStream<Uint8Array> | null } | null>;
  list: (options?: {
    prefix?: string;
    cursor?: string;
    limit?: number;
  }) => Promise<{
    objects: Array<{ key: string }>;
    truncated: boolean;
    cursor?: string;
  }>;
  delete: (key: string | string[]) => Promise<void>;
};

export function importStagingRoot(jobId: string): string {
  return `${IMPORT_STAGING_PREFIX}${jobId}/`;
}

export function importStagingKey(jobId: string, relativePath: string): string {
  return `${importStagingRoot(jobId)}${relativePath}`;
}

function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

export async function parseImportArchive(buffer: ArrayBuffer): Promise<{
  manifest: EdgepressManifest;
  includes: ExportIncludes;
  databasePayload: ReturnType<typeof parseEdgepressDatabasePayload>;
  mediaFiles: StagedMediaFile[];
  themeFiles: StagedThemeFile[];
}> {
  const entries = await parseTarGzip(buffer);
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

  const contentTypeByKey = new Map(
    (manifest.mediaFiles ?? []).map((item) => [item.key, item.contentType] as const),
  );

  const mediaFiles: StagedMediaFile[] = [];
  const themeFiles: StagedThemeFile[] = [];

  for (const [name] of entryMap.entries()) {
    if (includes.media && name.startsWith(MEDIA_TAR_PREFIX)) {
      const r2Key = `${MEDIA_PREFIX}${name.slice(MEDIA_TAR_PREFIX.length)}`;
      mediaFiles.push({
        tarPath: name,
        r2Key,
        contentType: contentTypeByKey.get(r2Key) ?? inferContentType(r2Key),
      });
      continue;
    }

    if (!includes.themes) continue;

    const packageSlug = parseThemePackageTarPath(name);
    if (packageSlug) {
      themeFiles.push({ tarPath: name, kind: "package", slug: packageSlug });
      continue;
    }

    if (isThemeAssetTarPath(name)) {
      themeFiles.push({ tarPath: name, kind: "asset" });
    }
  }

  mediaFiles.sort((a, b) => a.tarPath.localeCompare(b.tarPath));
  themeFiles.sort((a, b) => a.tarPath.localeCompare(b.tarPath));

  return { manifest, includes, databasePayload, mediaFiles, themeFiles };
}

export async function stageImportArchive(
  bucket: ImportStagingBucket,
  jobId: string,
  archiveBuffer: ArrayBuffer,
  db?: Database,
): Promise<ImportStagingManifest> {
  const parsed = await parseImportArchive(archiveBuffer);
  const databasePayload =
    db && parsed.includes.database
      ? await remapDatabasePayloadLocales(db, parsed.manifest, parsed.databasePayload)
      : parsed.databasePayload;
  const root = importStagingRoot(jobId);

  await bucket.put(importStagingKey(jobId, "manifest.json"), encodeJson(parsed.manifest), {
    httpMetadata: { contentType: "application/json" },
  });

  await bucket.put(importStagingKey(jobId, "media-files.json"), encodeJson(parsed.mediaFiles), {
    httpMetadata: { contentType: "application/json" },
  });

  await bucket.put(importStagingKey(jobId, "theme-files.json"), encodeJson(parsed.themeFiles), {
    httpMetadata: { contentType: "application/json" },
  });

  await bucket.put(importStagingKey(jobId, "archive.edgepress"), archiveBuffer, {
    httpMetadata: { contentType: "application/gzip" },
  });

  if (parsed.includes.database) {
    const tableOrder = resolveImportTableOrder(parsed.manifest.tableOrder);
    for (const table of tableOrder) {
      const rows = databasePayload.tables[table as EdgepressLogicalTable] ?? [];
      await bucket.put(importStagingKey(jobId, `tables/${table}.json`), encodeJson(rows), {
        httpMetadata: { contentType: "application/json" },
      });
    }

    if (databasePayload.fts?.length) {
      await bucket.put(importStagingKey(jobId, "fts.json"), encodeJson(databasePayload.fts), {
        httpMetadata: { contentType: "application/json" },
      });
    }
  }

  return {
    manifest: parsed.manifest,
    includes: parsed.includes,
    mediaFiles: parsed.mediaFiles,
    themeFiles: parsed.themeFiles,
  };
}

async function readJsonFromR2<T>(bucket: ImportStagingBucket, key: string): Promise<T> {
  const object = await bucket.get(key);
  if (!object?.body) {
    throw new Error(`Staging object not found: ${key}`);
  }
  const text = await new Response(object.body).text();
  return JSON.parse(text) as T;
}

export async function readStagedTableRows(
  bucket: ImportStagingBucket,
  jobId: string,
  table: EdgepressLogicalTable,
): Promise<Record<string, unknown>[]> {
  return readJsonFromR2(bucket, importStagingKey(jobId, `tables/${table}.json`));
}

export async function readStagedFtsRows(
  bucket: ImportStagingBucket,
  jobId: string,
): Promise<import("./edgepress-archive.ts").FtsRow[]> {
  return readJsonFromR2(bucket, importStagingKey(jobId, "fts.json"));
}

export async function readStagedMediaFiles(
  bucket: ImportStagingBucket,
  jobId: string,
): Promise<StagedMediaFile[]> {
  return readJsonFromR2(bucket, importStagingKey(jobId, "media-files.json"));
}

export async function readStagedThemeFiles(
  bucket: ImportStagingBucket,
  jobId: string,
): Promise<StagedThemeFile[]> {
  return readJsonFromR2(bucket, importStagingKey(jobId, "theme-files.json"));
}

export async function readStagedArchiveBuffer(
  bucket: ImportStagingBucket,
  jobId: string,
): Promise<ArrayBuffer> {
  const object = await bucket.get(importStagingKey(jobId, "archive.edgepress"));
  if (!object?.body) {
    throw new Error("Staging archive.edgepress not found");
  }
  return new Response(object.body).arrayBuffer();
}

export async function deleteImportStaging(
  bucket: ImportStagingBucket,
  jobId: string,
): Promise<void> {
  const prefix = importStagingRoot(jobId);
  let cursor: string | undefined;

  do {
    const listed = await bucket.list({
      prefix,
      ...(cursor ? { cursor } : {}),
      limit: 1000,
    });

    if (listed.objects.length > 0) {
      await bucket.delete(listed.objects.map((object) => object.key));
    }

    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
}
