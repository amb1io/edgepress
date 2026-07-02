/**
 * GET /api/export
 * Gera um arquivo .edgepress (tar.gz) com banco D1 + imagens R2 (uploads/) + pacotes de tema.
 * Requer autenticação de administrador.
 */
import type { APIRoute } from "astro";
import { env as cfEnv } from "cloudflare:workers";
import { db } from "../../db/index.ts";
import {
  buildExport,
  buildExportFilename,
  type ArchiveKvLike,
  type ExportOptions,
} from "../../core/services/edgepress-archive.ts";
import { requireMinRole } from "../../utils/api-auth.ts";
import { internalServerErrorResponse } from "../../utils/http-responses.ts";

export const prerender = false;

function parseExportOptions(url: URL): ExportOptions | null {
  const database = url.searchParams.get("database") === "1";
  const media = url.searchParams.get("media") === "1";
  const themes = url.searchParams.get("themes") === "1";
  if (!database && !media && !themes) return null;
  return { database, media, themes };
}

export const GET: APIRoute = async ({ request, locals }) => {
  const authResult = await requireMinRole(request, 0, locals);
  if (authResult instanceof Response) return authResult;

  const exportOptions = parseExportOptions(new URL(request.url));
  if (!exportOptions) {
    return new Response(JSON.stringify({ error: "select at least one option" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

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
        ) => Promise<unknown>;
        delete: (key: string | string[]) => Promise<void>;
      }
    | undefined;

  if (!bucket) {
    return new Response(JSON.stringify({ error: "R2 bucket not configured" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const kv = cfEnv.CACHE as ArchiveKvLike | undefined;
    const archive = await buildExport(db, bucket, kv, exportOptions);
    const filename = buildExportFilename();
    return new Response(archive, {
      status: 200,
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Export failed";
    return internalServerErrorResponse(message);
  }
};
