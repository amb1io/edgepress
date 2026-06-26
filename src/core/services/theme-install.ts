import { env as cfEnv } from "cloudflare:workers";
import { db } from "../../db/index.ts";
import { getKvFromLocals } from "../../utils/runtime-locals.ts";
import { syncThemeCache, syncThemeStatusCacheByPostId } from "../../utils/kv-cache-sync.ts";
import {
  saveThemePackage,
  type ThemePackageRecord,
} from "../theme/theme-package.ts";
import type { ThemeManifest } from "../theme/types.ts";
import { getPostTypeId, updatePost } from "./post-service.ts";
import {
  enforceSingleActiveTheme,
  getThemeSnapshotById,
  withThemeImportState,
} from "./theme-service.ts";

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
  const pkg: ThemePackageRecord = {
    manifest: {
      ...input.manifest,
      slug: input.manifest.slug || input.themeSlug.trim().toLowerCase(),
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

  const themesTypeId = await getPostTypeId(db, "themes");
  if (!themesTypeId) {
    throw new Error("Themes post type not found");
  }

  const snapshot = await getThemeSnapshotById(db, input.themePostId);
  const nextMeta = withThemeImportState(snapshot?.meta_values ?? null, {
    requested_active: false,
    is_active: input.activate,
    import_status: "ready",
    import_error: undefined,
  });

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
