/**
 * Cloudflare Queue consumer for chunked EdgePress import jobs.
 */
import { parseTarGzip } from "nanotar";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/schema.ts";
import type { Database } from "../../utils/types/database.ts";
import { backfillAllSearchIndexes } from "./search-service.ts";
import {
  MEDIA_PREFIX,
  THEME_ASSET_TAR_PREFIX,
  inferContentType,
  insertRowsInBatches,
  resetAutoIncrementSequences,
  restoreFtsRows,
  restorePostParentIds,
  restoreTaxonomyParentIds,
  syncThemeCacheAfterImport,
  wipeDatabase,
  wipeFtsTable,
  wipeThemeKvCache,
  type ArchiveKvLike,
  type EdgepressManifest,
  type FtsRow,
} from "./edgepress-archive.ts";
import { THEME_PKG_KV_PREFIX } from "../theme/theme-package.ts";
import {
  phaseLabelForStep,
  R2_WIPE_PAGE_SIZE,
  type ImportStep,
} from "./edgepress-import-job.ts";
import {
  markImportJobFailed,
  readImportJob,
  writeImportJob,
  completeImportBundlePart,
  type ImportJobState,
} from "./import-job-state.ts";
import {
  deleteImportStaging,
  importStagingKey,
  readStagedArchiveBuffer,
  readStagedFtsRows,
  readStagedMediaFiles,
  readStagedTableRows,
  readStagedThemeFiles,
  type ImportStagingBucket,
  type StagedMediaFile,
  type StagedThemeFile,
} from "./import-staging.ts";

export type ImportQueueMessage = {
  jobId: string;
  stepIndex: number;
};

export type ImportQueueEnv = {
  DB: D1Database;
  CACHE: ImportJobKvLike & ArchiveKvLike;
  MEDIA_BUCKET: ImportStagingBucket;
  IMPORT_QUEUE: {
    send: (message: ImportQueueMessage) => Promise<void>;
  };
};

type ImportJobKvLike = {
  get: (key: string, type?: "text" | "json") => Promise<unknown>;
  put: (
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ) => Promise<void>;
};

type StepExecutionResult = {
  updates: Partial<ImportJobState>;
  requeueSameStep?: boolean;
};

function createDb(env: ImportQueueEnv): Database {
  return drizzle(env.DB, { schema }) as Database;
}

async function readJobManifest(
  bucket: ImportStagingBucket,
  jobId: string,
): Promise<EdgepressManifest> {
  const object = await bucket.get(importStagingKey(jobId, "manifest.json"));
  if (!object?.body) {
    throw new Error("Import manifest missing from staging");
  }
  const text = await new Response(object.body).text();
  return JSON.parse(text) as EdgepressManifest;
}

async function loadArchiveEntryMap(
  bucket: ImportStagingBucket,
  jobId: string,
): Promise<Map<string, Uint8Array>> {
  const buffer = await readStagedArchiveBuffer(bucket, jobId);
  const entries = await parseTarGzip(buffer);
  const entryMap = new Map<string, Uint8Array>();
  for (const entry of entries) {
    if (!entry.name || !entry.data) continue;
    entryMap.set(
      entry.name,
      entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data),
    );
  }
  return entryMap;
}

async function restoreMediaSlice(
  bucket: ImportStagingBucket,
  jobId: string,
  files: StagedMediaFile[],
): Promise<void> {
  if (files.length === 0) return;
  const entryMap = await loadArchiveEntryMap(bucket, jobId);
  for (const file of files) {
    const data = entryMap.get(file.tarPath);
    if (!data) continue;
    await bucket.put(file.r2Key, data, {
      httpMetadata: { contentType: file.contentType },
    });
  }
}

async function restoreThemeSlice(
  bucket: ImportStagingBucket,
  kv: ArchiveKvLike,
  jobId: string,
  files: StagedThemeFile[],
): Promise<number> {
  if (files.length === 0) return 0;
  const entryMap = await loadArchiveEntryMap(bucket, jobId);
  let restored = 0;

  for (const file of files) {
    const data = entryMap.get(file.tarPath);
    if (!data) continue;

    if (file.kind === "package" && file.slug) {
      const packageJson = new TextDecoder().decode(data);
      await kv.put(`${THEME_PKG_KV_PREFIX}${file.slug}`, packageJson);
      restored++;
      continue;
    }

    if (file.kind === "asset") {
      await bucket.put(file.tarPath, data, {
        httpMetadata: { contentType: inferContentType(file.tarPath) },
      });
      restored++;
    }
  }

  return restored;
}

async function executeImportStep(
  db: Database,
  bucket: ImportStagingBucket,
  kv: ArchiveKvLike,
  jobId: string,
  step: ImportStep,
  stepIndex: number,
  job: ImportJobState,
  manifest: EdgepressManifest,
): Promise<StepExecutionResult> {
  const updates: Partial<ImportJobState> = {
    phaseLabel: phaseLabelForStep(step, manifest),
  };
  const nextSteps = [...job.steps];

  switch (step.type) {
    case "wipe_database": {
      await wipeDatabase(db);
      await wipeFtsTable(db);
      break;
    }
    case "insert_table": {
      const rows = await readStagedTableRows(bucket, jobId, step.table);
      const slice = rows.slice(step.offset, step.offset + step.limit);
      await insertRowsInBatches(db, step.table, slice);
      updates.countsSoFar = {
        ...job.countsSoFar,
        [step.table]: (job.countsSoFar[step.table] ?? 0) + slice.length,
      };
      break;
    }
    case "reset_sequences": {
      await resetAutoIncrementSequences(db);
      break;
    }
    case "restore_parent_ids": {
      const rows = await readStagedTableRows(bucket, jobId, step.table);
      const slice = rows.slice(step.offset, step.offset + step.limit);
      if (step.table === "posts") {
        await restorePostParentIds(db, slice);
      } else {
        await restoreTaxonomyParentIds(db, slice);
      }
      break;
    }
    case "restore_fts": {
      const ftsRows = await readStagedFtsRows(bucket, jobId);
      const slice = ftsRows.slice(step.offset, step.offset + step.limit) as FtsRow[];
      await restoreFtsRows(db, slice);
      break;
    }
    case "backfill_fts": {
      await backfillAllSearchIndexes(db);
      break;
    }
    case "wipe_media": {
      const listed = await bucket.list({
        prefix: MEDIA_PREFIX,
        ...(step.cursor ? { cursor: step.cursor } : {}),
        limit: R2_WIPE_PAGE_SIZE,
      });
      if (listed.objects.length > 0) {
        await bucket.delete(listed.objects.map((object) => object.key));
      }
      if (listed.truncated && listed.cursor) {
        nextSteps[stepIndex] = { type: "wipe_media", cursor: listed.cursor };
        updates.steps = nextSteps;
        return { updates, requeueSameStep: true };
      }
      break;
    }
    case "restore_media": {
      const mediaFiles = await readStagedMediaFiles(bucket, jobId);
      const slice = mediaFiles.slice(step.offset, step.offset + step.limit);
      await restoreMediaSlice(bucket, jobId, slice);
      updates.mediaCountSoFar = (job.mediaCountSoFar ?? 0) + slice.length;
      break;
    }
    case "wipe_themes": {
      if (step.kvWiped === false) {
        await wipeThemeKvCache(kv);
        break;
      }
      const listed = await bucket.list({
        prefix: THEME_ASSET_TAR_PREFIX,
        ...(step.cursor ? { cursor: step.cursor } : {}),
        limit: R2_WIPE_PAGE_SIZE,
      });
      if (listed.objects.length > 0) {
        await bucket.delete(listed.objects.map((object) => object.key));
      }
      if (listed.truncated && listed.cursor) {
        nextSteps[stepIndex] = { type: "wipe_themes", kvWiped: true, cursor: listed.cursor };
        updates.steps = nextSteps;
        return { updates, requeueSameStep: true };
      }
      break;
    }
    case "restore_themes": {
      const themeFiles = await readStagedThemeFiles(bucket, jobId);
      const slice = themeFiles.slice(step.offset, step.offset + step.limit);
      const restored = await restoreThemeSlice(bucket, kv, jobId, slice);
      updates.themeCountSoFar = (job.themeCountSoFar ?? 0) + restored;
      if (step.offset + step.limit >= themeFiles.length) {
        await syncThemeCacheAfterImport(db, kv);
      }
      break;
    }
    case "finalize": {
      await deleteImportStaging(bucket, jobId);
      updates.status = "completed";
      if (manifest.bundle) {
        await completeImportBundlePart(kv, manifest.bundle);
      }
      break;
    }
    default: {
      const _exhaustive: never = step;
      throw new Error(`Unknown import step: ${JSON.stringify(_exhaustive)}`);
    }
  }

  return { updates };
}

export async function processImportStep(
  jobId: string,
  stepIndex: number,
  env: ImportQueueEnv,
): Promise<void> {
  const kv = env.CACHE;
  const bucket = env.MEDIA_BUCKET;
  const job = await readImportJob(kv, jobId);

  if (!job) {
    throw new Error(`Import job not found: ${jobId}`);
  }

  if (job.status === "failed" || job.status === "completed") {
    return;
  }

  if (stepIndex < job.stepIndex) {
    return;
  }

  if (stepIndex > job.stepIndex) {
    throw new Error(`Out-of-order import step ${stepIndex} (expected ${job.stepIndex})`);
  }

  const step = job.steps[stepIndex];
  if (!step) {
    throw new Error(`Import step ${stepIndex} not found for job ${jobId}`);
  }

  const db = createDb(env);
  const manifest = await readJobManifest(bucket, jobId);

  const runningState: ImportJobState = {
    ...job,
    status: "running",
    updatedAt: Date.now(),
  };
  await writeImportJob(kv, jobId, runningState);

  try {
    const { updates, requeueSameStep } = await executeImportStep(
      db,
      bucket,
      kv,
      jobId,
      step,
      stepIndex,
      runningState,
      manifest,
    );

    const mergedSteps = updates.steps ?? job.steps;

    if (requeueSameStep) {
      const sameStepState: ImportJobState = {
        ...runningState,
        ...updates,
        steps: mergedSteps,
        updatedAt: Date.now(),
      };
      await writeImportJob(kv, jobId, sameStepState);
      await env.IMPORT_QUEUE.send({ jobId, stepIndex });
      return;
    }

    const nextStepIndex = stepIndex + 1;
    const nextState: ImportJobState = {
      ...runningState,
      ...updates,
      steps: mergedSteps,
      stepIndex: nextStepIndex,
      status: updates.status === "completed" ? "completed" : "running",
      updatedAt: Date.now(),
    };

    if (nextStepIndex < job.totalSteps && nextState.status !== "completed") {
      await writeImportJob(kv, jobId, nextState);
      await env.IMPORT_QUEUE.send({ jobId, stepIndex: nextStepIndex });
      return;
    }

    if (nextState.status !== "completed") {
      nextState.status = "completed";
    }

    await writeImportJob(kv, jobId, nextState);
  } catch (error) {
    await markImportJobFailed(kv, jobId, runningState, error);
    throw error;
  }
}
