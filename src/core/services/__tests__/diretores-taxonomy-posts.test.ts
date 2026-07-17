import { describe, expect, it, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { getPlatformProxy } from "wrangler";
import { env as cfEnv } from "cloudflare:workers";

describe("diretores taxonomy posts SSR data", () => {
  beforeAll(async () => {
    const proxy = await getPlatformProxy({ configPath: "wrangler.toml" });
    Object.assign(cfEnv, proxy.env);
  });

  it("returns published diretores with reel data", async () => {
    const { db } = await import("../../../db/index.ts");
    const { createEdgepressContent } = await import("../edgepress-content.ts");
    const { resolveTaxonomySlugForFilter } = await import("../taxonomy-translation-service.ts");
    const { adminUrlLocaleToDbCode } = await import("../../../utils/admin-locale-constants.ts");
    const { filterPublicThemeListPosts } = await import("../../theme/post-filters.ts");

    const cacheKv = (cfEnv.CACHE ?? null) as App.KVLike | null;
    const dbLocale = adminUrlLocaleToDbCode("pt-br");
    const content = createEdgepressContent({} as App.Locals, {
      baseUrl: "http://localhost:8787",
    });

    const canonicalSlug = await resolveTaxonomySlugForFilter(
      db,
      "category",
      "diretores",
      dbLocale,
      { kv: cacheKv },
    );
    expect(canonicalSlug).toBe("diretores");

    const listResult = await content.getList("posts", {
      limit: 200,
      locale: dbLocale,
      filter: { status: "published" },
      filter_taxonomy_slug: canonicalSlug!,
      filter_taxonomy_type: "category",
      order: "order",
      orderDir: "desc",
      include: "custom_fields",
    });

    expect(listResult.total).toBeGreaterThanOrEqual(3);

    const filtered = filterPublicThemeListPosts(listResult.items);
    expect(filtered.length).toBeGreaterThanOrEqual(3);

    const withReel = filtered.filter((item) => {
      const meta = (item.meta_values ?? {}) as Record<string, unknown>;
      if (meta.reel) return true;
      const blocks = Array.isArray(item.custom_fields) ? item.custom_fields : [];
      return blocks.some(
        (b) =>
          b.title === "Reel" &&
          Array.isArray(b.fields) &&
          b.fields.some((f) => f.value != null && String(f.value).trim() !== ""),
      );
    });
    expect(withReel.length).toBeGreaterThanOrEqual(3);
  });
});
