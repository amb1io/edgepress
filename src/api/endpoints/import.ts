/**
 * POST /api/import
 * Restaura banco D1 + imagens R2 + pacotes de tema a partir de um arquivo .edgepress (tar.gz).
 * Substitui todos os dados atuais (wipe + restore). Requer autenticação de administrador.
 */
import type { APIRoute } from "astro";
import { env as cfEnv } from "cloudflare:workers";
import { db } from "../../db/index.ts";
import {
  restoreImport,
  type ArchiveKvLike,
} from "../../core/services/edgepress-archive.ts";
import { backfillAllSearchIndexes } from "../../core/services/search-service.ts";
import { requireMinRole } from "../../utils/api-auth.ts";
import { internalServerErrorResponse } from "../../utils/http-responses.ts";

export const prerender = false;

const MAX_ARCHIVE_SIZE = 100 * 1024 * 1024; // 100 MB

export const POST: APIRoute = async ({ request, locals }) => {
  const authResult = await requireMinRole(request, 0, locals);
  if (authResult instanceof Response) return authResult;

  const bucket = cfEnv.MEDIA_BUCKET as
    | {
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
        ) => Promise<void>;
        delete: (key: string | string[]) => Promise<void>;
      }
    | undefined;

  if (!bucket) {
    return new Response(JSON.stringify({ error: "R2 bucket not configured" }), {
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
    const kv = cfEnv.CACHE as ArchiveKvLike | undefined;
    const result = await restoreImport(db, bucket, buffer, kv);
    if (result.includes.database && !result.ftsRestored) {
      try {
        await backfillAllSearchIndexes(db);
      } catch (backfillErr) {
        console.warn("[import] FTS backfill skipped:", backfillErr);
      }
    }
    return new Response(
      JSON.stringify({
        ok: true,
        message: "Import completed successfully",
        counts: result.counts,
        mediaCount: result.mediaCount,
        themeCount: result.themeCount,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    const error = err as (Error & { cause?: unknown }) | undefined;
    const cause = error?.cause;
    const causeMessage =
      cause instanceof Error ? cause.message : typeof cause === "string" ? cause : undefined;
    console.error(
      "[import] failed:",
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
