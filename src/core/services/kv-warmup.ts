import type { KVLike } from "../../utils/runtime-locals.ts";
import type { Database } from "../../shared/types/database.ts";
import { getActiveTheme } from "./theme-service.ts";
import { getSettingsWithCache } from "./settings-service.ts";
import { loadPublishedMenusByLocation } from "./menu-items-service.ts";
import { buildMenuCacheKey, putMenusCache } from "../../utils/menu-cache.ts";
import { getExistingTaxonomyTypes } from "../theme/taxonomy-routes.ts";
import { getArchivablePostTypes } from "../theme/post-type-routes.ts";
import { loadThemePackage } from "../theme/theme-package.ts";
import { syncThemeCacheToKv } from "../../utils/kv-cache-sync.ts";
import { adminUrlLocaleToDbCode } from "../../utils/admin-locale-constants.ts";

type R2Bucket = {
  get: (key: string) => Promise<{ text: () => Promise<string> } | null>;
};

const WARMUP_URL_LOCALES = ["pt-br", "en", "es"] as const;

export type KvWarmupResult = {
  theme_slug: string | null;
  theme_package_loaded: boolean;
  settings_warmed: boolean;
  menus_warmed: string[];
  taxonomy_types_warmed: boolean;
  archivable_post_types_warmed: boolean;
};

/**
 * Pré-popula chaves KV críticas após deploy ou reset (cache-aside warm-up).
 * Não aquece posts individuais — isso continua lazy no primeiro request.
 */
export async function warmKvCache(
  db: Database,
  kv: KVLike,
  bucket: R2Bucket | null = null,
): Promise<KvWarmupResult> {
  const result: KvWarmupResult = {
    theme_slug: null,
    theme_package_loaded: false,
    settings_warmed: false,
    menus_warmed: [],
    taxonomy_types_warmed: false,
    archivable_post_types_warmed: false,
  };

  await syncThemeCacheToKv(db, kv);

  const activeTheme = await getActiveTheme(db, kv);
  const slug = activeTheme.is_active
    ? (activeTheme.meta?.theme_slug?.trim() || activeTheme.slug?.trim() || "")
    : "";
  result.theme_slug = slug || null;

  if (slug) {
    const pkg = await loadThemePackage(kv, slug, bucket);
    result.theme_package_loaded = Boolean(pkg);
  }

  try {
    const settings = await getSettingsWithCache(db, {
      namesParam: null,
      kv,
      isAuthenticated: false,
    });
    result.settings_warmed = Object.keys(settings).length > 0;
  } catch {
    // ignora
  }

  for (const urlLocale of WARMUP_URL_LOCALES) {
    try {
      const dbLocale = adminUrlLocaleToDbCode(urlLocale);
      const menus = await loadPublishedMenusByLocation(db, dbLocale);
      const key = buildMenuCacheKey(dbLocale);
      await putMenusCache(kv, key, menus);
      result.menus_warmed.push(dbLocale);
    } catch {
      // ignora locale individual
    }
  }

  try {
    await getExistingTaxonomyTypes(db, kv);
    result.taxonomy_types_warmed = true;
  } catch {
    // ignora
  }

  try {
    await getArchivablePostTypes(db, kv);
    result.archivable_post_types_warmed = true;
  } catch {
    // ignora
  }

  return result;
}
