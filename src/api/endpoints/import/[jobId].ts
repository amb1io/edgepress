/**
 * GET /api/import/:jobId — import job progress from KV.
 */
import type { APIRoute } from "astro";
import { env as cfEnv } from "cloudflare:workers";
import { importJobPercent } from "../../../core/services/edgepress-import-job.ts";
import {
  IMPORT_POLL_TOKEN_HEADER,
  isImportPollTokenValid,
  readImportJob,
} from "../../../core/services/import-job-state.ts";
import { requireMinRole } from "../../../utils/api-auth.ts";
import { unauthorizedResponse } from "../../../utils/http-responses.ts";

export const prerender = false;

export const GET: APIRoute = async ({ params, request, locals }) => {
  const jobId = params.jobId?.trim();
  if (!jobId) {
    return new Response(JSON.stringify({ error: "Missing jobId" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const kv = cfEnv.CACHE as
    | {
        get: (key: string, type?: "text" | "json") => Promise<unknown>;
      }
    | undefined;

  if (!kv) {
    return new Response(JSON.stringify({ error: "KV cache not configured" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const job = await readImportJob(kv, jobId);
  if (!job) {
    return new Response(JSON.stringify({ error: "Import job not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const authResult = await requireMinRole(request, 0, locals);
  const hasSession = !(authResult instanceof Response);
  const pollToken = request.headers.get(IMPORT_POLL_TOKEN_HEADER);
  const hasPollToken = isImportPollTokenValid(job, pollToken);

  if (!hasSession && !hasPollToken) {
    return authResult instanceof Response ? authResult : unauthorizedResponse();
  }

  const percent = importJobPercent(job.stepIndex, job.totalSteps);

  return new Response(
    JSON.stringify({
      jobId,
      status: job.status,
      phaseLabel: job.phaseLabel,
      percent,
      stepIndex: job.stepIndex,
      totalSteps: job.totalSteps,
      counts: job.countsSoFar,
      mediaCount: job.mediaCountSoFar,
      themeCount: job.themeCountSoFar,
      error: job.error,
      cause: job.cause,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
