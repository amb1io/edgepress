/**
 * KV-backed import job state for chunked queue processing.
 */
import type { EdgepressLogicalTable } from "./edgepress-archive.ts";
import type { ImportStep } from "./edgepress-import-job.ts";

export const IMPORT_JOB_KV_PREFIX = "import:job:";
export const IMPORT_BUNDLE_KV_PREFIX = "import-bundle:";
export const IMPORT_JOB_TTL_SECONDS = 60 * 60;
export const IMPORT_BUNDLE_TTL_SECONDS = 60 * 60 * 2;

export type ImportJobStatus = "queued" | "running" | "completed" | "failed";

export type ImportBundleState = {
  partCount: number;
  lastCompletedPart: number;
  completedAt?: number;
  uploadToken?: string;
};

export type ImportJobState = {
  status: ImportJobStatus;
  steps: ImportStep[];
  stepIndex: number;
  totalSteps: number;
  phaseLabel: string;
  pollToken: string;
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
  delete?: (key: string) => Promise<void>;
};

export function importBundleKvKey(bundleId: string): string {
  return `${IMPORT_BUNDLE_KV_PREFIX}${bundleId}`;
}

export function importJobKvKey(jobId: string): string {
  return `${IMPORT_JOB_KV_PREFIX}${jobId}`;
}

export const IMPORT_POLL_TOKEN_HEADER = "X-Import-Poll-Token";
export const IMPORT_BUNDLE_UPLOAD_TOKEN_HEADER = "X-Import-Bundle-Token";

export function createImportPollToken(): string {
  return crypto.randomUUID();
}

function tokensMatchConstantTime(expected: string, provided: string): boolean {
  if (provided.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < provided.length; i++) {
    mismatch |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

export function isImportPollTokenValid(
  job: Pick<ImportJobState, "pollToken">,
  token: string | null | undefined,
): boolean {
  if (!token || !job.pollToken) return false;
  return tokensMatchConstantTime(job.pollToken, token);
}

export function isBundleUploadTokenValid(
  state: Pick<ImportBundleState, "uploadToken">,
  token: string | null | undefined,
): boolean {
  if (!token || !state.uploadToken) return false;
  return tokensMatchConstantTime(state.uploadToken, token);
}

export async function readImportBundle(
  kv: ImportJobKvLike,
  bundleId: string,
): Promise<ImportBundleState | null> {
  const raw = await kv.get(importBundleKvKey(bundleId), "json");
  if (!raw || typeof raw !== "object") return null;
  return raw as ImportBundleState;
}

export async function writeImportBundle(
  kv: ImportJobKvLike,
  bundleId: string,
  state: ImportBundleState,
): Promise<void> {
  await kv.put(importBundleKvKey(bundleId), JSON.stringify(state), {
    expirationTtl: IMPORT_BUNDLE_TTL_SECONDS,
  });
}

export async function deleteImportBundle(
  kv: ImportJobKvLike,
  bundleId: string,
): Promise<void> {
  if (kv.delete) {
    await kv.delete(importBundleKvKey(bundleId));
    return;
  }
  await kv.put(importBundleKvKey(bundleId), "", { expirationTtl: 1 });
}

export async function initImportBundleUpload(
  kv: ImportJobKvLike,
  bundle: { id: string; partCount: number },
): Promise<string> {
  const uploadToken = createImportPollToken();
  await writeImportBundle(kv, bundle.id, {
    partCount: bundle.partCount,
    lastCompletedPart: 0,
    uploadToken,
  });
  return uploadToken;
}

export async function completeImportBundlePart(
  kv: ImportJobKvLike,
  bundle: { id: string; partIndex: number; partCount: number },
): Promise<void> {
  if (bundle.partIndex >= bundle.partCount) {
    await deleteImportBundle(kv, bundle.id);
    return;
  }

  const existing = await readImportBundle(kv, bundle.id);
  await writeImportBundle(kv, bundle.id, {
    partCount: bundle.partCount,
    lastCompletedPart: bundle.partIndex,
    completedAt: Date.now(),
    uploadToken: existing?.uploadToken,
  });
}

export function validateBundlePartOrder(
  bundle: { id: string; partIndex: number; partCount: number; partKind: "base" | "media" },
  state: ImportBundleState | null,
): string | null {
  if (bundle.partKind === "base") {
    if (bundle.partIndex !== 1) {
      return "A parte base deve ser importada primeiro (part-001.edgepress)";
    }
    return null;
  }

  if (!state) {
    return "Importe a parte base primeiro";
  }

  if (state.partCount !== bundle.partCount) {
    return "Número de partes do bundle não confere";
  }

  const expectedPart = state.lastCompletedPart + 1;
  if (bundle.partIndex !== expectedPart) {
    return `Parte ${expectedPart} de ${bundle.partCount} esperada`;
  }

  return null;
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
