/**
 * Endpoint para servir arquivos do R2 bucket (MEDIA_BUCKET).
 * Em desenvolvimento local, permite acessar arquivos do R2 local do Wrangler.
 */
import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  // params.path é um array quando usa [...path]
  const pathArray = params.path;
  if (!pathArray || (Array.isArray(pathArray) && pathArray.length === 0)) {
    return new Response("Not Found", { status: 404 });
  }

  // Juntar o array de paths em uma string
  const path = Array.isArray(pathArray) ? pathArray.join("/") : pathArray;

  const env = (locals as { runtime?: { env?: Record<string, unknown> } }).runtime?.env as
    | { MEDIA_BUCKET?: { get: (key: string) => Promise<R2ObjectBody | null> } }
    | undefined;
  const bucket = env?.MEDIA_BUCKET;

  if (!bucket) {
    return new Response("R2 bucket not configured", { status: 503 });
  }

  try {
    // A key no R2 já inclui "uploads/" quando vem do upload.ts
    // Se o path já começa com "uploads/", usar diretamente, senão adicionar
    const key = path.startsWith("uploads/") ? path : `uploads/${path}`;
    const object = await bucket.get(key);

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
