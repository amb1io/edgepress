import type { ThemeManifest, ThemePackageRecord } from "./types.ts";
import type { KVLike } from "../../utils/runtime-locals.ts";

export const THEME_PKG_KV_PREFIX = "theme:pkg:";

type R2Bucket = {
  put: (
    key: string,
    value: ArrayBuffer | ArrayBufferView | string | ReadableStream | Blob,
    options?: { httpMetadata?: { contentType?: string } },
  ) => Promise<unknown>;
  delete: (key: string) => Promise<void>;
};

const packageCache = new Map<string, ThemePackageRecord>();

export function themePackageKvKey(slug: string): string {
  return `${THEME_PKG_KV_PREFIX}${slug.trim().toLowerCase()}`;
}

export function themeAssetR2Prefix(slug: string): string {
  return `themes/${slug.trim().toLowerCase()}/assets`;
}

export function themeAssetR2Key(slug: string, relativePath: string): string {
  const clean = relativePath.trim().replace(/^\/+/, "");
  return `${themeAssetR2Prefix(slug)}/${clean}`;
}

export function validateThemeManifest(raw: unknown): ThemeManifest {
  if (!raw || typeof raw !== "object") {
    throw new Error("theme.json must be a JSON object");
  }
  const obj = raw as Record<string, unknown>;
  const name = String(obj.name ?? "").trim();
  const slug = String(obj.slug ?? "").trim().toLowerCase();
  const version = String(obj.version ?? "1.0.0").trim();
  const engine = String(obj.engine ?? "liquid").trim();
  if (engine !== "liquid") {
    throw new Error(`Unsupported theme engine: ${engine}`);
  }
  if (!name || !slug) {
    throw new Error("theme.json requires name and slug");
  }
  const templates =
    obj.templates && typeof obj.templates === "object"
      ? (obj.templates as ThemeManifest["templates"])
      : {};
  const supports = Array.isArray(obj.supports)
    ? obj.supports.map((s) => String(s).trim().toLowerCase()).filter(Boolean)
    : ["single", "page", "archive", "home"];

  return {
    name,
    slug,
    version,
    engine: "liquid",
    supports,
    templates,
    ...(typeof obj.layout === "string" ? { layout: obj.layout } : {}),
    ...(typeof obj.assets_dir === "string" ? { assets_dir: obj.assets_dir } : {}),
    ...(typeof obj.home_content_key === "string"
      ? { home_content_key: obj.home_content_key }
      : {}),
  };
}

export async function saveThemePackage(
  kv: KVLike,
  bucket: R2Bucket | null,
  pkg: ThemePackageRecord,
  assets: Map<string, ArrayBuffer>,
): Promise<void> {
  const slug = pkg.manifest.slug;
  await kv.put(themePackageKvKey(slug), JSON.stringify(pkg));

  if (bucket) {
    for (const [relativePath, data] of assets.entries()) {
      const key = themeAssetR2Key(slug, relativePath);
      await bucket.put(key, data, {
        httpMetadata: { contentType: guessContentType(relativePath) },
      });
    }
  }

  packageCache.set(slug, pkg);
}

export async function loadThemePackage(
  kv: KVLike | null,
  slug: string,
): Promise<ThemePackageRecord | null> {
  const normalized = slug.trim().toLowerCase();
  const cached = packageCache.get(normalized);
  if (cached) return cached;

  if (!kv) return null;
  const raw = await kv.get(themePackageKvKey(normalized));
  if (!raw) return null;

  try {
    const pkg = JSON.parse(raw) as ThemePackageRecord;
    const cached = packageCache.get(normalized);
    if (cached && cached.updated_at === pkg.updated_at) {
      return cached;
    }
    packageCache.set(normalized, pkg);
    return pkg;
  } catch {
    return null;
  }
}

export function clearThemePackageCache(slug?: string): void {
  if (slug) {
    packageCache.delete(slug.trim().toLowerCase());
    return;
  }
  packageCache.clear();
}

function guessContentType(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".css")) return "text/css; charset=utf-8";
  if (lower.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".ico")) return "image/x-icon";
  if (lower.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}
