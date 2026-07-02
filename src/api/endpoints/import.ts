/**
 * POST /api/import
 * Stages a .edgepress archive in R2, creates a KV-backed import job, and enqueues chunked processing.
 */
import type { APIRoute } from "astro";
import { env as cfEnv } from "cloudflare:workers";
import {
  computeImportSteps,
  phaseLabelForStep,
} from "../../core/services/edgepress-import-job.ts";
import { writeImportJob, type ImportJobState } from "../../core/services/import-job-state.ts";
import { stageImportArchive, type ImportStagingBucket } from "../../core/services/import-staging.ts";
import { requireMinRole } from "../../utils/api-auth.ts";
import { internalServerErrorResponse } from "../../utils/http-responses.ts";

export const prerender = false;

const MAX_ARCHIVE_SIZE = 100 * 1024 * 1024; // 100 MB

type ImportQueueBinding = {
  send: (message: { jobId: string; stepIndex: number }) => Promise<void>;
};

export const POST: APIRoute = async ({ request, locals }) => {
  const authResult = await requireMinRole(request, 0, locals);
  if (authResult instanceof Response) return authResult;

  const bucket = cfEnv.MEDIA_BUCKET as ImportStagingBucket | undefined;
  const kv = cfEnv.CACHE as
    | {
        get: (key: string, type?: "text" | "json") => Promise<unknown>;
        put: (
          key: string,
          value: string,
          options?: { expirationTtl?: number },
        ) => Promise<void>;
      }
    | undefined;
  const importQueue = cfEnv.IMPORT_QUEUE as ImportQueueBinding | undefined;

  if (!bucket) {
    return new Response(JSON.stringify({ error: "R2 bucket not configured" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!kv) {
    return new Response(JSON.stringify({ error: "KV cache not configured" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!importQueue) {
    return new Response(JSON.stringify({ error: "Import queue not configured" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return new Response(JSON.stringify({ error: "Expected multipart/form-data" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let file: File;
  try {
    const formData = await request.formData();
    const uploaded = formData.get("file");
    if (!(uploaded instanceof File)) {
      return new Response(JSON.stringify({ error: "No file in request" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    file = uploaded;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid form data" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (file.size > MAX_ARCHIVE_SIZE) {
    return new Response(
      JSON.stringify({ error: "File too large", maxSize: MAX_ARCHIVE_SIZE }),
      { status: 413, headers: { "Content-Type": "application/json" } },
    );
  }

  const lowerName = (file.name || "").toLowerCase();
  if (
    !lowerName.endsWith(".edgepress") &&
    !lowerName.endsWith(".tar.gz") &&
    !lowerName.endsWith(".tgz")
  ) {
    return new Response(JSON.stringify({ error: "Invalid file type. Use .edgepress" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const buffer = await file.arrayBuffer();
    const jobId = crypto.randomUUID();
    const staged = await stageImportArchive(bucket, jobId, buffer);
    const steps = computeImportSteps(staged.manifest, staged.includes, {
      themeFileCount: staged.themeFiles.length,
    });
    const now = Date.now();
    const firstStep = steps[0];
    const job: ImportJobState = {
      status: "queued",
      steps,
      stepIndex: 0,
      totalSteps: steps.length,
      phaseLabel: firstStep ? phaseLabelForStep(firstStep, staged.manifest) : "Na fila…",
      countsSoFar: {},
      mediaCountSoFar: 0,
      themeCountSoFar: 0,
      createdAt: now,
      updatedAt: now,
    };

    await writeImportJob(kv, jobId, job);
    await importQueue.send({ jobId, stepIndex: 0 });

    return new Response(JSON.stringify({ jobId, status: "queued" }), {
      status: 202,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const error = err as (Error & { cause?: unknown }) | undefined;
    const cause = error?.cause;
    const causeMessage =
      cause instanceof Error ? cause.message : typeof cause === "string" ? cause : undefined;
    console.error(
      "[import] staging failed:",
      error?.message,
      "| cause:",
      causeMessage ?? cause,
      "| stack:",
      error?.stack,
    );
    const baseMessage = error?.message ?? "Import failed";
    const message = causeMessage ? `${baseMessage} — cause: ${causeMessage}` : baseMessage;
    return internalServerErrorResponse(message);
  }
};
