import { env as cfEnv } from "cloudflare:workers";
import { db } from "../../db/index.ts";
import { getKvFromLocals } from "../../utils/runtime-locals.ts";
import { syncThemeCache, syncThemeStatusCacheByPostId } from "../../utils/kv-cache-sync.ts";
import {
  saveThemePackage,
  type ThemePackageRecord,
} from "../theme/theme-package.ts";
import type { ThemeManifest } from "../theme/types.ts";
import { themeAssetR2Key, themePackageKvKey } from "../theme/theme-package.ts";
import { getPostTypeId, updatePost } from "./post-service.ts";
import {
  enforceSingleActiveTheme,
  getThemeSnapshotById,
  normalizeThemeSlug,
  withThemeImportState,
} from "./theme-service.ts";
import { parseMetaValues } from "../../utils/meta-parser.ts";

type R2Bucket = {
  put: (
    key: string,
    value: ArrayBuffer | ArrayBufferView | string | ReadableStream | Blob,
    options?: { httpMetadata?: { contentType?: string } },
  ) => Promise<unknown>;
};

export async function installThemePackage(
  locals: App.Locals,
  input: {
    themePostId: number;
    themeSlug: string;
    manifest: ThemeManifest;
    templates: Record<string, string>;
    assets: Map<string, ArrayBuffer>;
    activate: boolean;
  },
): Promise<ThemePackageRecord> {
  const packageSlug = normalizeThemeSlug(input.themeSlug);
  const pkg: ThemePackageRecord = {
    manifest: {
      ...input.manifest,
      slug: packageSlug,
    },
    templates: input.templates,
    updated_at: Date.now(),
  };

  const kv = getKvFromLocals(locals);
  if (!kv) {
    throw new Error("KV cache is not available for theme import");
  }

  const bucket = (cfEnv as { MEDIA_BUCKET?: R2Bucket }).MEDIA_BUCKET ?? null;
  await saveThemePackage(kv, bucket, pkg, input.assets);

  const manifestSlug = normalizeThemeSlug(input.manifest.slug);
  if (manifestSlug && manifestSlug !== packageSlug) {
    const legacyPkg: ThemePackageRecord = {
      ...pkg,
      manifest: { ...pkg.manifest, slug: manifestSlug },
    };
    await kv.put(themePackageKvKey(manifestSlug), JSON.stringify(legacyPkg));
    if (bucket) {
      for (const [relativePath, data] of input.assets.entries()) {
        const key = themeAssetR2Key(manifestSlug, relativePath);
        await bucket.put(key, data, {
          httpMetadata: { contentType: guessAssetContentType(relativePath) },
        });
      }
    }
  }

  const themesTypeId = await getPostTypeId(db, "themes");
  if (!themesTypeId) {
    throw new Error("Themes post type not found");
  }

  const snapshot = await getThemeSnapshotById(db, input.themePostId);
  let nextMeta = withThemeImportState(snapshot?.meta_values ?? null, {
    requested_active: false,
    is_active: input.activate,
    import_status: "ready",
    import_error: undefined,
  });

  if (manifestSlug && manifestSlug !== packageSlug) {
    const metaObj = parseMetaValues(nextMeta);
    metaObj["manifest_slug"] = manifestSlug;
    nextMeta = JSON.stringify(metaObj);
  }

  await updatePost(db, input.themePostId, themesTypeId, {
    meta_values: nextMeta,
    updated_at: Date.now(),
  });

  if (input.activate) {
    await enforceSingleActiveTheme(db, input.themePostId);
  }

  await syncThemeStatusCacheByPostId(locals, db, input.themePostId);
  await syncThemeCache(locals, db);

  return pkg;
}

function guessAssetContentType(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".css")) return "text/css; charset=utf-8";
  if (lower.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}
