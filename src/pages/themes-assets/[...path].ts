import type { APIRoute } from "astro";
import { env as cfEnv } from "cloudflare:workers";

import { defaultThemeAssets } from "../../themes/2026/assets-bundle.ts";

export const prerender = false;

function guessContentType(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".css")) return "text/css; charset=utf-8";
  if (lower.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".ico")) return "image/x-icon";
  return "application/octet-stream";
}

/** Astro pode enviar `2026/theme.js` como string única no rest param. */
function parseThemeAssetPath(
  pathParam: string | string[] | undefined,
): { themeSlug: string; assetPath: string } | null {
  if (!pathParam || (Array.isArray(pathParam) && pathParam.length === 0)) {
    return null;
  }

  const segments = (Array.isArray(pathParam) ? pathParam : [pathParam])
    .flatMap((part) => part.split("/"))
    .filter(Boolean);

  if (segments.length < 2) return null;

  return {
    themeSlug: segments[0]!,
    assetPath: segments.slice(1).join("/"),
  };
}

function serveBundledDefaultAsset(themeSlug: string, assetPath: string): Response | null {
  if (themeSlug !== "2026") return null;
  const fallback = defaultThemeAssets[assetPath];
  if (!fallback) return null;

  return new Response(fallback.body, {
    status: 200,
    headers: {
      "Content-Type": fallback.contentType,
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export const GET: APIRoute = async ({ params }) => {
  const parsed = parseThemeAssetPath(params.path);
  if (!parsed) {
    return new Response("Not Found", { status: 404 });
  }

  const { themeSlug, assetPath } = parsed;
  const r2Key = `themes/${themeSlug}/assets/${assetPath}`;

  const bucket = cfEnv.MEDIA_BUCKET;
  if (bucket) {
    const object = await bucket.get(r2Key);
    if (object) {
      const headers = new Headers();
      headers.set(
        "Content-Type",
        object.httpMetadata?.contentType ?? guessContentType(assetPath),
      );
      if (object.httpMetadata?.cacheControl) {
        headers.set("Cache-Control", object.httpMetadata.cacheControl);
      } else {
        headers.set("Cache-Control", "public, max-age=31536000, immutable");
      }
      headers.set("Content-Length", String(object.size));
      return new Response(object.body, { status: 200, headers });
    }
  }

  const bundled = serveBundledDefaultAsset(themeSlug, assetPath);
  if (bundled) return bundled;

  return new Response("Not Found", { status: 404 });
};
