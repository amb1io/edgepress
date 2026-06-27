/**
 * GET /api/export
 * Gera um arquivo .edgepress (tar.gz) com banco D1 + imagens R2 (uploads/).
 * Requer autenticação de administrador.
 */
import type { APIRoute } from "astro";
import { env as cfEnv } from "cloudflare:workers";
import { db } from "../../db/index.ts";
import { buildExport, buildExportFilename } from "../../core/services/edgepress-archive.ts";
import { requireMinRole } from "../../utils/api-auth.ts";
import { internalServerErrorResponse } from "../../utils/http-responses.ts";

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
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
    const archive = await buildExport(db, bucket);
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
