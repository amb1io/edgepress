import { describe, it, expect } from "vitest";
import { resolveFallbackTemplateKey, resolveRouteKind } from "../resolve-route-kind.ts";
import type { RouteKindResolverDeps } from "../resolve-route-kind.ts";

const deps: RouteKindResolverDeps = {
  archivablePostTypes: [{ slug: "post", name: "Post" }],
  taxonomyTypes: ["category"],
  resolvePostBySlug: async () => null,
  resolveTaxonomyTerm: async () => ({ slug: "visum" }),
};

describe("resolve-route-kind", () => {
  it("falls back to 404 template key", () => {
    expect(resolveFallbackTemplateKey("404", new Set(["404", "index"]))).toBe("404");
    expect(resolveFallbackTemplateKey("archive", new Set(["archive", "index"]))).toBe("archive");
  });

  it("resolves archive for post type index without extra params", async () => {
    const resolved = await resolveRouteKind(
      { templateKey: "posts/index", params: {}, staticSegments: ["posts"] },
      deps,
    );
    expect(resolved.kind).toBe("archive");
    expect(resolved.postType).toBe("post");
  });
});
