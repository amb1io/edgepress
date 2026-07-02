/**
 * KV-backed import job state for chunked queue processing.
 */
import type { EdgepressLogicalTable } from "./edgepress-archive.ts";
import type { ImportStep } from "./edgepress-import-job.ts";

export const IMPORT_JOB_KV_PREFIX = "import:job:";
export const IMPORT_JOB_TTL_SECONDS = 60 * 60;

export type ImportJobStatus = "queued" | "running" | "completed" | "failed";

export type ImportJobState = {
  status: ImportJobStatus;
  steps: ImportStep[];
  stepIndex: number;
  totalSteps: number;
  phaseLabel: string;
  countsSoFar: Partial<Record<EdgepressLogicalTable, number>>;
  mediaCountSoFar?: number;
  themeCountSoFar?: number;
  error?: string;
  cause?: string;
  createdAt: number;
  updatedAt: number;
};

export type ImportJobKvLike = {
  get: (key: string, type?: "text" | "json") => Promise<unknown>;
  put: (
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ) => Promise<void>;
};

export function importJobKvKey(jobId: string): string {
  return `${IMPORT_JOB_KV_PREFIX}${jobId}`;
}

export async function readImportJob(
  kv: ImportJobKvLike,
  jobId: string,
): Promise<ImportJobState | null> {
  const raw = await kv.get(importJobKvKey(jobId), "json");
  if (!raw || typeof raw !== "object") return null;
  return raw as ImportJobState;
}

export async function writeImportJob(
  kv: ImportJobKvLike,
  jobId: string,
  state: ImportJobState,
): Promise<void> {
  await kv.put(importJobKvKey(jobId), JSON.stringify(state), {
    expirationTtl: IMPORT_JOB_TTL_SECONDS,
  });
}

export async function markImportJobFailed(
  kv: ImportJobKvLike,
  jobId: string,
  state: ImportJobState,
  error: unknown,
): Promise<void> {
  const err = error as (Error & { cause?: unknown }) | undefined;
  const cause = err?.cause;
  const causeMessage =
    cause instanceof Error ? cause.message : typeof cause === "string" ? cause : undefined;

  await writeImportJob(kv, jobId, {
    ...state,
    status: "failed",
    error: err?.message ?? "Import failed",
    cause: causeMessage,
    updatedAt: Date.now(),
  });
}
