import { describe, expect, it } from "vitest";
import {
  buildMediaUrl,
  buildMediaUrlSet,
  isMediaSize,
  MEDIA_SIZE_PRESETS,
} from "../media-urls.ts";

describe("isMediaSize", () => {
  it("accepts the four presets", () => {
    expect(isMediaSize("thumbnail")).toBe(true);
    expect(isMediaSize("medium")).toBe(true);
    expect(isMediaSize("large")).toBe(true);
    expect(isMediaSize("original")).toBe(true);
  });

  it("rejects invalid values", () => {
    expect(isMediaSize("xl")).toBe(false);
    expect(isMediaSize("")).toBe(false);
    expect(isMediaSize(null)).toBe(false);
  });
});

describe("MEDIA_SIZE_PRESETS", () => {
  it("matches the Free-plan fixed dimensions", () => {
    expect(MEDIA_SIZE_PRESETS.thumbnail).toEqual({ width: 300, height: 300 });
    expect(MEDIA_SIZE_PRESETS.medium).toEqual({ width: 800, height: 800 });
    expect(MEDIA_SIZE_PRESETS.large).toEqual({ width: 1920, height: 1920 });
  });
});

describe("buildMediaUrl", () => {
  it("returns undefined for empty input", () => {
    expect(buildMediaUrl(undefined, "medium")).toBeUndefined();
    expect(buildMediaUrl(null, "medium")).toBeUndefined();
    expect(buildMediaUrl("  ", "medium")).toBeUndefined();
  });

  it("adds size to relative /api/media URLs", () => {
    expect(buildMediaUrl("/api/media/uploads/a.jpg", "medium")).toBe(
      "/api/media/uploads/a.jpg?size=medium",
    );
  });

  it("adds size to absolute /api/media URLs", () => {
    expect(
      buildMediaUrl("http://localhost:8787/api/media/uploads/a.jpg", "large"),
    ).toBe("http://localhost:8787/api/media/uploads/a.jpg?size=large");
  });

  it("replaces an existing size and strips width/height", () => {
    expect(
      buildMediaUrl("/api/media/uploads/a.jpg?size=large&width=100&height=100", "thumbnail"),
    ).toBe("/api/media/uploads/a.jpg?size=thumbnail");
  });

  it("removes size/width/height for original", () => {
    expect(
      buildMediaUrl("/api/media/uploads/a.jpg?size=medium&width=800&height=800", "original"),
    ).toBe("/api/media/uploads/a.jpg");
  });

  it("passes through external URLs unchanged", () => {
    const external = "https://cdn.example/avatar.png?x=1";
    expect(buildMediaUrl(external, "thumbnail")).toBe(external);
    expect(buildMediaUrl("https://imagedelivery.net/hash/id/public", "medium")).toBe(
      "https://imagedelivery.net/hash/id/public",
    );
  });
});

describe("buildMediaUrlSet", () => {
  it("returns undefined for empty input", () => {
    expect(buildMediaUrlSet(undefined)).toBeUndefined();
    expect(buildMediaUrlSet("")).toBeUndefined();
  });

  it("returns all four presets for an /api/media URL", () => {
    expect(buildMediaUrlSet("/api/media/uploads/a.jpg")).toEqual({
      thumbnail: "/api/media/uploads/a.jpg?size=thumbnail",
      medium: "/api/media/uploads/a.jpg?size=medium",
      large: "/api/media/uploads/a.jpg?size=large",
      original: "/api/media/uploads/a.jpg",
    });
  });
});
