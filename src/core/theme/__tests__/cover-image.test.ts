import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ContentPostDetail } from "../../services/edgepress-content.ts";

const getMediaById = vi.fn();
vi.mock("../../services/media-service.ts", () => ({
  getMediaById: (...args: unknown[]) => getMediaById(...args),
}));

import {
  parsePostThumbnailId,
  resolveCoverImage,
  resolveCoverImageFromMedia,
  resolveMediaPathToAbsoluteUrl,
} from "../cover-image.ts";

const baseUrl = "http://localhost:8787";

describe("parsePostThumbnailId", () => {
  it("parses numeric and string ids", () => {
    expect(parsePostThumbnailId({ post_thumbnail_id: 64 })).toBe(64);
    expect(parsePostThumbnailId({ post_thumbnail_id: "64" })).toBe(64);
  });

  it("returns null for invalid values", () => {
    expect(parsePostThumbnailId({})).toBeNull();
    expect(parsePostThumbnailId({ post_thumbnail_id: "abc" })).toBeNull();
    expect(parsePostThumbnailId({ post_thumbnail_id: 0 })).toBeNull();
  });
});

describe("resolveMediaPathToAbsoluteUrl", () => {
  it("keeps absolute urls", () => {
    expect(resolveMediaPathToAbsoluteUrl("https://cdn.example/img.jpg", baseUrl)).toBe(
      "https://cdn.example/img.jpg",
    );
  });

  it("builds api media url from relative paths", () => {
    expect(resolveMediaPathToAbsoluteUrl("uploads/2024/photo.jpg", baseUrl)).toBe(
      "http://localhost:8787/api/media/uploads/2024/photo.jpg",
    );
    expect(resolveMediaPathToAbsoluteUrl("/uploads/2024/photo.jpg", baseUrl)).toBe(
      "http://localhost:8787/api/media/uploads/2024/photo.jpg",
    );
  });
});

describe("resolveCoverImageFromMedia", () => {
  it("matches post_thumbnail_id in media array with medium preset by default", () => {
    const post = {
      meta_values: { post_thumbnail_id: 64 },
      media: [
        { id: 10, meta_values: { attachment_path: "/uploads/other.jpg" } },
        { id: 64, meta_values: { attachment_path: "/uploads/cover.jpg" } },
      ],
    };

    expect(resolveCoverImageFromMedia(post, baseUrl)).toBe(
      "http://localhost:8787/api/media/uploads/cover.jpg?size=medium",
    );
  });

  it("applies an explicit size preset", () => {
    const post = {
      meta_values: { post_thumbnail_id: 64 },
      media: [{ id: 64, meta_values: { attachment_path: "/uploads/cover.jpg" } }],
    };

    expect(resolveCoverImageFromMedia(post, baseUrl, "large")).toBe(
      "http://localhost:8787/api/media/uploads/cover.jpg?size=large",
    );
  });
});

describe("resolveCoverImage", () => {
  beforeEach(() => {
    getMediaById.mockReset();
  });

  it("falls back to post_thumbnail_path when media is empty (medium default)", async () => {
    const post = {
      meta_values: {
        post_thumbnail_id: 64,
        post_thumbnail_path: "/uploads/fallback.jpg",
      },
      media: [],
    } as ContentPostDetail;

    const url = await resolveCoverImage(post, baseUrl, {} as never, new Map());
    expect(url).toBe("http://localhost:8787/api/media/uploads/fallback.jpg?size=medium");
    expect(getMediaById).not.toHaveBeenCalled();
  });

  it("loads attachment by post_thumbnail_id when not in media", async () => {
    getMediaById.mockResolvedValue({
      id: 64,
      meta_values: JSON.stringify({ attachment_path: "/uploads/thumb-64.jpg" }),
    });

    const post = {
      meta_values: { post_thumbnail_id: 64 },
      media: [],
    } as ContentPostDetail;

    const cache = new Map<number, string | undefined>();
    const url = await resolveCoverImage(post, baseUrl, {} as never, cache);
    expect(url).toBe("http://localhost:8787/api/media/uploads/thumb-64.jpg?size=medium");
    expect(getMediaById).toHaveBeenCalledWith({}, 64, undefined);
    // Cache stores the original (unsized) URL so other presets can reuse it.
    expect(cache.get(64)).toBe("http://localhost:8787/api/media/uploads/thumb-64.jpg");
  });

  it("applies large preset for singular/SEO covers", async () => {
    const post = {
      meta_values: {
        post_thumbnail_path: "/uploads/hero.jpg",
      },
      media: [],
    } as ContentPostDetail;

    const url = await resolveCoverImage(post, baseUrl, {} as never, new Map(), undefined, "large");
    expect(url).toBe("http://localhost:8787/api/media/uploads/hero.jpg?size=large");
  });

  it("reuses attachment cache for repeated thumb ids", async () => {
    getMediaById.mockResolvedValue({
      id: 64,
      meta_values: { attachment_path: "/uploads/thumb-64.jpg" },
    });

    const post = {
      meta_values: { post_thumbnail_id: 64 },
      media: [],
    } as ContentPostDetail;

    const cache = new Map<number, string | undefined>();
    await resolveCoverImage(post, baseUrl, {} as never, cache);
    await resolveCoverImage(post, baseUrl, {} as never, cache, undefined, "large");
    expect(getMediaById).toHaveBeenCalledTimes(1);
  });
});
