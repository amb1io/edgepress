import { describe, it, expect } from "vitest";
import {
  normalizeTranslationKey,
  buildTranslationPostCacheKey,
  TRANSLATION_KEY_META,
} from "../post-translation-service.ts";

describe("post-translation-service", () => {
  it("exports translation_key meta name", () => {
    expect(TRANSLATION_KEY_META).toBe("translation_key");
  });

  describe("normalizeTranslationKey", () => {
    it("accepts valid slug-like keys", () => {
      expect(normalizeTranslationKey("hello-world")).toBe("hello-world");
      expect(normalizeTranslationKey("  about-us  ")).toBe("about-us");
    });

    it("rejects empty or invalid keys", () => {
      expect(normalizeTranslationKey("")).toBeNull();
      expect(normalizeTranslationKey("   ")).toBeNull();
      expect(normalizeTranslationKey("bad slug")).toBeNull();
      expect(normalizeTranslationKey("../etc")).toBeNull();
    });
  });

  describe("buildTranslationPostCacheKey", () => {
    it("includes key, locale and status", () => {
      expect(buildTranslationPostCacheKey("hello-world", "pt-br", "published")).toBe(
        "post:tk:hello-world:locale=pt-br:status=published",
      );
    });
  });
});
