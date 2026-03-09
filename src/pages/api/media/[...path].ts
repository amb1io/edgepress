/**
 * Endpoint para servir arquivos do R2 bucket (MEDIA_BUCKET).
 * - /api/media/{id} — id numérico do attachment (post tipo attachment): busca attachment_path no banco e serve o arquivo.
 * - /api/media/uploads/... — path do arquivo no R2 (comportamento anterior).
 *
 * Query params para imagens (R2 e Cloudflare Images):
 * - width: número (ex.: 400)
 * - height: número (ex.: 300)
 * - size: "thumbnail" | "medium" | "large" (presets)
 * - raw=1: devolve binário original (sem otimização). Sempre WebP quando não raw.
 */
import type { APIRoute } from "astro";
import { db } from "../../../db/index.ts";
import { getMediaById } from "../../../lib/services/media-service.ts";
import { parseMetaValues } from "../../../lib/utils/meta-parser.ts";

export const prerender = false;

type MediaEnv = {
  MEDIA_BUCKET?: { get: (key: string) => Promise<R2ObjectBody | null> };
  CLOUDFLARE_IMAGES_BASE_URL?: string;
  CLOUDFLARE_IMAGES_ACCOUNT_HASH?: string;
  CLOUDFLARE_IMAGES_VARIANT?: string;
};

const SIZE_PRESETS = {
  thumbnail: { width: 300, height: 300 },
  medium: { width: 800, height: 800 },
  large: { width: 1920, height: 1920 },
} as const;

type SizePreset = keyof typeof SIZE_PRESETS;

function parseImageParams(url: URL): {
  width: number | undefined;
  height: number | undefined;
  size: SizePreset | undefined;
} {
  const widthParam = url.searchParams.get("width");
  const heightParam = url.searchParams.get("height");
  const sizeParam = url.searchParams.get("size");

  let width: number | undefined;
  let height: number | undefined;
  if (widthParam !== null && widthParam !== "") {
    const n = parseInt(widthParam, 10);
    if (Number.isFinite(n) && n > 0 && n <= 4096) width = n;
  }
  if (heightParam !== null && heightParam !== "") {
    const n = parseInt(heightParam, 10);
    if (Number.isFinite(n) && n > 0 && n <= 4096) height = n;
  }

  let size: SizePreset | undefined;
  if (
    sizeParam === "thumbnail" ||
    sizeParam === "medium" ||
    sizeParam === "large"
  ) {
    size = sizeParam;
  }

  return { width, height, size };
}

/** Resolve width/height finais a partir de query params e presets. */
function resolveDimensions(params: {
  width: number | undefined;
  height: number | undefined;
  size: SizePreset | undefined;
}): { width: number; height: number } {
  const { width, height, size } = params;
  if (width !== undefined && height !== undefined) {
    return { width, height };
  }
  if (width !== undefined) {
    return { width, height: width };
  }
  if (height !== undefined) {
    return { width: height, height };
  }
  if (size !== undefined) {
    return { ...SIZE_PRESETS[size] };
  }
  return { width: 1920, height: 1920 };
}

/**
 * Monta a string de variant para Cloudflare Images (flexible variants).
 * Ex.: "w=400,h=300,f=webp"
 */
function cloudflareImagesVariantSpec(dims: { width: number; height: number }): string {
  const parts = [`w=${dims.width}`, `h=${dims.height}`, "f=webp"];
  return parts.join(",");
}

function pathToR2Key(path: string): string {
  let key = path.trim();
  if (key.startsWith("/")) key = key.slice(1);
  if (!key.startsWith("uploads/")) key = `uploads/${key}`;
  return key;
}

/** Content types para os quais aplicamos otimização via Cloudflare Image Resizing (apenas imagens). */
const IMAGE_CONTENT_TYPES = /^image\/(jpeg|jpg|png|gif|webp|avif|bmp|ico|svg\+xml)/i;

export const GET: APIRoute = async ({ params, locals, request }) => {
  const pathArray = params["path"];
  if (!pathArray || (Array.isArray(pathArray) && pathArray.length === 0)) {
    return new Response("Not Found", { status: 404 });
  }

  const url = new URL(request.url);
  const isRawRequest = url.searchParams.get("raw") === "1";
  const imageParams = parseImageParams(url);
  const dimensions = resolveDimensions(imageParams);

  const path = Array.isArray(pathArray) ? pathArray.join("/") : pathArray;

  const env = (locals as { runtime?: { env?: MediaEnv } }).runtime?.env;
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
    const meta = parseMetaValues(media.meta_values) as Record<string, unknown>;

    // Se houver configuração e ID de Cloudflare Images, redireciona para a imagem otimizada
    const cfImageId =
      (meta["cloudflare_image_id"] as string | undefined) ??
      (meta["cloudflareImageId"] as string | undefined) ??
      (meta["cf_image_id"] as string | undefined) ??
      (meta["cloudflare_images_id"] as string | undefined);

    if (cfImageId) {
      const baseFromEnv =
        typeof env?.CLOUDFLARE_IMAGES_BASE_URL === "string"
          ? env.CLOUDFLARE_IMAGES_BASE_URL.trim()
          : "";
      const accountHash =
        typeof env?.CLOUDFLARE_IMAGES_ACCOUNT_HASH === "string"
          ? env.CLOUDFLARE_IMAGES_ACCOUNT_HASH.trim()
          : "";

      const baseUrl = baseFromEnv || (accountHash ? `https://imagedelivery.net/${accountHash}` : "");

      if (baseUrl) {
        const variantSpec = cloudflareImagesVariantSpec(dimensions);
        const cleanedBase = baseUrl.replace(/\/$/, "");
        const imageUrl = `${cleanedBase}/${encodeURIComponent(cfImageId)}/${encodeURIComponent(
          variantSpec,
        )}`;

        return Response.redirect(imageUrl, 302);
      }
    }

    const metaParsed = meta as { attachment_path?: string; file_path?: string };
    const attachmentPath = metaParsed.attachment_path ?? metaParsed.file_path ?? "";
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

    const contentType = object.httpMetadata?.contentType ?? "";
    const isImage = IMAGE_CONTENT_TYPES.test(contentType);

    // Para imagens do R2 (sem Cloudflare Images): otimizar via Image Resizing do Cloudflare
    // antes de enviar. Subrequest com ?raw=1 devolve o binário; fetch com cf.image transforma.
    // Parâmetros width, height e size são aplicados; entrega sempre WebP.
    if (isImage && !isRawRequest && typeof globalThis.fetch === "function") {
      const rawUrl = new URL(request.url);
      rawUrl.searchParams.set("raw", "1");
      try {
        const optimized = await fetch(rawUrl.toString(), {
          cf: {
            image: {
              width: dimensions.width,
              height: dimensions.height,
              fit: "scale-down",
              format: "webp",
              quality: 85,
            },
          } as RequestInitCfProperties,
        });
        if (optimized.ok && optimized.body) {
          const outHeaders = new Headers(optimized.headers);
          outHeaders.set("Content-Type", "image/webp");
          if (object.httpMetadata?.cacheControl) {
            outHeaders.set("Cache-Control", object.httpMetadata.cacheControl);
          }
          return new Response(optimized.body, { status: 200, headers: outHeaders });
        }
      } catch (subErr) {
        console.warn("Image Resizing subrequest failed, serving original:", subErr);
      }
    }

    const headers = new Headers();
    if (contentType) headers.set("Content-Type", contentType);
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
