/**
 * Endpoint para servir arquivos do R2 bucket (MEDIA_BUCKET).
 * - /api/media/{id} — id numérico do attachment (post tipo attachment): busca attachment_path no banco e serve o arquivo.
 * - /api/media/uploads/... — path do arquivo no R2 (comportamento anterior).
 */
import type { APIRoute } from "astro";
import { db } from "../../../db/index.ts";
import { getMediaById } from "../../../lib/services/media-service.ts";
import { parseMetaValues } from "../../../lib/utils/meta-parser.ts";

export const prerender = false;

function pathToR2Key(path: string): string {
  let key = path.trim();
  if (key.startsWith("/")) key = key.slice(1);
  if (!key.startsWith("uploads/")) key = `uploads/${key}`;
  return key;
}

export const GET: APIRoute = async ({ params, locals }) => {
  const pathArray = params.path;
  if (!pathArray || (Array.isArray(pathArray) && pathArray.length === 0)) {
    return new Response("Not Found", { status: 404 });
  }

  const path = Array.isArray(pathArray) ? pathArray.join("/") : pathArray;

  const env = (locals as { runtime?: { env?: Record<string, unknown> } }).runtime?.env as
    | { MEDIA_BUCKET?: { get: (key: string) => Promise<R2ObjectBody | null> } }
    | undefined;
  const bucket = env?.MEDIA_BUCKET;

  if (!bucket) {
    return new Response("R2 bucket not configured", { status: 503 });
  }

  let r2Key: string;

  const isIdSegment = !path.includes("/") && /^\d+$/.test(path);
  if (isIdSegment) {
    const mediaId = parseInt(path, 10);
    const media = await getMediaById(db, mediaId);
    if (!media) {
      return new Response("File not found", { status: 404 });
    }
    const meta = parseMetaValues(media.meta_values);
    const attachmentPath = meta.attachment_path ?? meta.file_path ?? "";
    if (!attachmentPath) {
      return new Response("File not found", { status: 404 });
    }
    r2Key = pathToR2Key(attachmentPath);
  } else {
    r2Key = pathToR2Key(path);
  }

  try {
    const object = await bucket.get(r2Key);

    if (!object) {
      return new Response("File not found", { status: 404 });
    }

    const headers = new Headers();
    if (object.httpMetadata?.contentType) {
      headers.set("Content-Type", object.httpMetadata.contentType);
    }
    if (object.httpMetadata?.cacheControl) {
      headers.set("Cache-Control", object.httpMetadata.cacheControl);
    }
    headers.set("Content-Length", String(object.size));

    return new Response(object.body, { headers });
  } catch (err) {
    console.error("R2 get error:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
};
