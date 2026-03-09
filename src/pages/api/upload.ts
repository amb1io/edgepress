/**
 * Upload de arquivos para Cloudflare R2 (bucket MEDIA_BUCKET).
 * Aceita multipart/form-data com um único arquivo (campo "file" ou primeiro arquivo).
 * Retorna JSON: { key, path, mimeType, filename }.
 * Requer autenticação (mínimo role autor).
 */
import type { APIRoute } from "astro";
import { applyRateLimit, getRateLimits } from "../../lib/utils/rate-limiter.ts";
import { requireMinRole } from "../../lib/api-auth.ts";

export const prerender = false;

const UPLOAD_PREFIX = "uploads";
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

const REJECTED_EXTENSIONS = new Set([
  ".js", ".ts", ".jsx", ".tsx", ".mjs", ".cjs", ".py", ".rb", ".php", ".java",
  ".c", ".cpp", ".h", ".hpp", ".cs", ".go", ".rs", ".vue", ".svelte", ".astro",
  ".sh", ".bash", ".ps1", ".bat", ".cmd", ".sql", ".html", ".htm", ".css",
  ".scss", ".less", ".json", ".xml", ".yaml", ".yml", ".md", ".lock",
]);

const ALLOWED_IMAGE_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".svg", ".bmp", ".ico"
]);

function isAllowedMime(mime: string): boolean {
  return mime.startsWith("image/") || mime.startsWith("audio/") || mime === "application/pdf";
}

function isAllowedImageExtension(ext: string): boolean {
  return ALLOWED_IMAGE_EXTENSIONS.has(ext.toLowerCase());
}

function getExtension(name: string): string {
  return name.includes(".") ? name.slice(name.lastIndexOf(".")).toLowerCase() : "";
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, 200) || "file";
}

function buildKey(filename: string, _mimeType: string): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")) : "";
  const base = sanitizeFilename(filename.slice(0, filename.lastIndexOf(".") || undefined) || "file");
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${UPLOAD_PREFIX}/${y}/${m}/${unique}-${base}${ext}`;
}

async function uploadToCloudflareImages(
  file: File,
  key: string,
  env: Record<string, string>,
): Promise<string | null> {
  const accountId = env.CLOUDFLARE_IMAGES_ACCOUNT_ID;
  const apiToken = env.CLOUDFLARE_IMAGES_API_TOKEN;

  if (!accountId || !apiToken) {
    return null;
  }

  try {
    const form = new FormData();
    form.set("file", file);
    // Usar a key do R2 como ID estável no Cloudflare Images (opcional)
    form.set("id", key);

    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
        },
        body: form,
      },
    );

    if (!res.ok) {
      console.error("Cloudflare Images upload failed:", res.status, await res.text().catch(() => ""));
      return null;
    }

    const json = (await res.json()) as {
      success?: boolean;
      result?: { id?: string };
    };

    if (!json.success || !json.result?.id) {
      console.error("Cloudflare Images unexpected response:", json);
      return null;
    }

    return json.result.id || null;
  } catch (err) {
    console.error("Cloudflare Images error:", err);
    return null;
  }
}

export const POST: APIRoute = async ({ request, locals }) => {
  const authResult = await requireMinRole(request, 2, locals);
  if (authResult instanceof Response) return authResult;

  const env = (locals as { runtime?: { env?: Record<string, string> } }).runtime?.env ?? {};

  // Obter rate limits do ambiente
  const rateLimits = getRateLimits(env);

  // Aplicar rate limiting: configurável via env (padrão: 20 uploads / hora)
  const rateLimitResponse = applyRateLimit(request, rateLimits.UPLOAD);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const bucket = env?.MEDIA_BUCKET as
    | { put: (key: string, value: BodyInit, options?: { httpMetadata?: { contentType?: string } }) => Promise<unknown> }
    | undefined;

  if (!bucket) {
    return new Response(
      JSON.stringify({ error: "R2 bucket not configured" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return new Response(
      JSON.stringify({ error: "Expected multipart/form-data" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  let file: File;
  try {
    const formData = await request.formData();
    const firstFile = formData.get("file");
    if (firstFile instanceof File) {
      file = firstFile;
    } else {
      const entries = Array.from(formData.entries()).filter(([, v]) => v instanceof File);
      const first = entries[0]?.[1];
      if (!(first instanceof File)) {
        return new Response(
          JSON.stringify({ error: "No file in request" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
      file = first;
    }
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid form data" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return new Response(
      JSON.stringify({ error: "File too large", maxSize: MAX_FILE_SIZE }),
      { status: 413, headers: { "Content-Type": "application/json" } }
    );
  }

  const filename = file.name || "upload";
  const mimeType = file.type || "application/octet-stream";
  const ext = getExtension(filename);

  if (REJECTED_EXTENSIONS.has(ext)) {
    return new Response(
      JSON.stringify({ error: "Tipo de arquivo não permitido (arquivos de programação)" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  
  // Se o MIME type não foi detectado mas a extensão é de imagem permitida, aceitar
  let finalMimeType = mimeType;
  if (mimeType === "application/octet-stream" && isAllowedImageExtension(ext)) {
    // Mapear extensões de imagem para seus MIME types corretos quando não detectados
    const imageMimeMap: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".avif": "image/avif",
      ".svg": "image/svg+xml",
      ".bmp": "image/bmp",
      ".ico": "image/x-icon",
    };
    finalMimeType = imageMimeMap[ext.toLowerCase()] || mimeType;
  } else if (!isAllowedMime(mimeType)) {
    return new Response(
      JSON.stringify({ error: "Tipo de arquivo não permitido. Use imagens, áudio ou PDF." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const key = buildKey(filename, finalMimeType);

  try {
    await bucket.put(key, file.stream(), {
      httpMetadata: { contentType: finalMimeType },
    });
  } catch (err) {
    console.error("R2 put error:", err);
    return new Response(
      JSON.stringify({ error: "Upload failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Opcional: enviar também para Cloudflare Images quando for imagem
  let cloudflareImageId: string | null = null;
  if (finalMimeType.startsWith("image/")) {
    cloudflareImageId = await uploadToCloudflareImages(file, key, env);
  }

  const path = `/${key}`;
  return new Response(
    JSON.stringify({
      key,
      path,
      mimeType: finalMimeType,
      filename,
      // ID opcional do Cloudflare Images para salvar em meta_values
      cloudflareImageId: cloudflareImageId ?? undefined,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};
