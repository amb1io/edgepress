import { describe, expect, it, beforeAll } from "vitest";
import { getPlatformProxy } from "wrangler";
import { env as cfEnv } from "cloudflare:workers";

describe("trabalhos jobs cover images", () => {
  beforeAll(async () => {
    const proxy = await getPlatformProxy({ configPath: "wrangler.toml" });
    Object.assign(cfEnv, proxy.env);
  });

  it("resolves cover_image for published jobs via get_posts path", async () => {
    const { db } = await import("../../../db/index.ts");
    const { createEdgepressContent } = await import("../edgepress-content.ts");
    const { adminUrlLocaleToDbCode } = await import("../../../utils/admin-locale-constants.ts");
    const { filterPublicThemeListPosts } = await import("../../theme/post-filters.ts");
    const { resolveCoverImage } = await import("../../theme/cover-image.ts");
    const { getMediaById } = await import("../media-service.ts");
    const { parsePostThumbnailId } = await import("../../theme/cover-image.ts");
    type ContentPostDetail = import("../edgepress-content.ts").ContentPostDetail;

    const dbLocale = adminUrlLocaleToDbCode("pt-br");
    const content = createEdgepressContent({} as App.Locals, {
      baseUrl: "http://localhost:8787",
    });
    const cacheKv = (cfEnv.CACHE ?? null) as App.KVLike | null;

    const listResult = await content.getList("posts", {
      limit: 5,
      locale: dbLocale,
      filter: { status: "published", post_type: "jobs" },
      order: "order",
      orderDir: "desc",
    });

    const filtered = filterPublicThemeListPosts(listResult.items) as ContentPostDetail[];
    expect(filtered.length).toBeGreaterThan(0);

    const first = filtered[0]!;
    const thumbId = parsePostThumbnailId((first.meta_values ?? {}) as Record<string, unknown>);
    expect(thumbId).toBeGreaterThan(0);

    const media = await getMediaById(db, thumbId!, cacheKv);
    expect(media, `attachment ${thumbId} should exist with KV cache`).toBeTruthy();

    const cover = await resolveCoverImage(
      first,
      "http://localhost:8787",
      db,
      new Map(),
      cacheKv,
    );
    expect(cover, `expected cover for ${first.slug}`).toBeTruthy();
  });
});
