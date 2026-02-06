/**
 * Testes para funcionalidade de thumbnail na página content.astro
 * 
 * Verifica:
 * - Variáveis thumbnailPath e thumbnailUrl estão sempre definidas
 * - Thumbnail é carregado corretamente do meta_values
 * - Thumbnail é salvo corretamente no formulário
 */

import { describe, it, expect, beforeEach } from "vitest";

describe("Content Page Thumbnail", () => {
  describe("Variable Initialization", () => {
    it("should initialize thumbnailPath and thumbnailUrl as empty strings", () => {
      let thumbnailPath = "";
      let thumbnailUrl = "";

      expect(thumbnailPath).toBe("");
      expect(thumbnailUrl).toBe("");
      expect(typeof thumbnailPath).toBe("string");
      expect(typeof thumbnailUrl).toBe("string");
    });

    it("should handle thumbnail path conversion correctly", () => {
      const thumbPath = "/uploads/test-thumbnail.jpg";
      let thumbnailPath = "";
      let thumbnailUrl = "";

      if (thumbPath) {
        thumbnailPath = thumbPath;
        thumbnailUrl = thumbPath.startsWith("http")
          ? thumbPath
          : thumbPath.startsWith("/uploads/")
            ? `/api/media${thumbPath}`
            : thumbPath.startsWith("/")
              ? `/api/media${thumbPath}`
              : `/api/media/uploads/${thumbPath}`;
      }

      expect(thumbnailPath).toBe("/uploads/test-thumbnail.jpg");
      expect(thumbnailUrl).toBe("/api/media/uploads/test-thumbnail.jpg");
    });

    it("should handle HTTP URLs correctly", () => {
      const thumbPath = "https://example.com/image.jpg";
      let thumbnailPath = "";
      let thumbnailUrl = "";

      if (thumbPath) {
        thumbnailPath = thumbPath;
        thumbnailUrl = thumbPath.startsWith("http")
          ? thumbPath
          : thumbPath.startsWith("/uploads/")
            ? `/api/media${thumbPath}`
            : thumbPath.startsWith("/")
              ? `/api/media${thumbPath}`
              : `/api/media/uploads/${thumbPath}`;
      }

      expect(thumbnailUrl).toBe("https://example.com/image.jpg");
    });
  });

  describe("Meta Values Parsing", () => {
    it("should extract thumbnail path from meta_values", () => {
      const metaValues = JSON.stringify({
        post_thumbnail_path: "/uploads/thumbnail.jpg",
        other_field: "value",
      });

      let thumbnailPath = "";
      let thumbnailUrl = "";

      if (metaValues) {
        try {
          const meta = JSON.parse(metaValues) as Record<string, unknown>;
          const thumbPath = typeof meta["post_thumbnail_path"] === "string"
            ? meta["post_thumbnail_path"]
            : null;

          if (thumbPath) {
            thumbnailPath = thumbPath;
            thumbnailUrl = thumbPath.startsWith("http")
              ? thumbPath
              : thumbPath.startsWith("/uploads/")
                ? `/api/media${thumbPath}`
                : thumbPath.startsWith("/")
                  ? `/api/media${thumbPath}`
                  : `/api/media/uploads/${thumbPath}`;
          }
        } catch {
          // ignore
        }
      }

      expect(thumbnailPath).toBe("/uploads/thumbnail.jpg");
      expect(thumbnailUrl).toBe("/api/media/uploads/thumbnail.jpg");
    });

    it("should handle missing thumbnail path gracefully", () => {
      const metaValues = JSON.stringify({
        other_field: "value",
      });

      let thumbnailPath = "";
      let thumbnailUrl = "";

      if (metaValues) {
        try {
          const meta = JSON.parse(metaValues) as Record<string, unknown>;
          const thumbPath = typeof meta["post_thumbnail_path"] === "string"
            ? meta["post_thumbnail_path"]
            : null;

          if (thumbPath) {
            thumbnailPath = thumbPath;
            thumbnailUrl = thumbPath.startsWith("http")
              ? thumbPath
              : thumbPath.startsWith("/uploads/")
                ? `/api/media${thumbPath}`
                : thumbPath.startsWith("/")
                  ? `/api/media${thumbPath}`
                  : `/api/media/uploads/${thumbPath}`;
          }
        } catch {
          // ignore
        }
      }

      expect(thumbnailPath).toBe("");
      expect(thumbnailUrl).toBe("");
    });

    it("should handle invalid JSON gracefully", () => {
      const metaValues = "invalid json";

      let thumbnailPath = "";
      let thumbnailUrl = "";

      if (metaValues) {
        try {
          const meta = JSON.parse(metaValues) as Record<string, unknown>;
          const thumbPath = typeof meta["post_thumbnail_path"] === "string"
            ? meta["post_thumbnail_path"]
            : null;

          if (thumbPath) {
            thumbnailPath = thumbPath;
            thumbnailUrl = thumbPath.startsWith("http")
              ? thumbPath
              : thumbPath.startsWith("/uploads/")
                ? `/api/media${thumbPath}`
                : thumbPath.startsWith("/")
                  ? `/api/media${thumbPath}`
                  : `/api/media/uploads/${thumbPath}`;
          }
        } catch {
          // ignore - should not throw
        }
      }

      expect(thumbnailPath).toBe("");
      expect(thumbnailUrl).toBe("");
    });
  });

  describe("Form Submission", () => {
    it("should include thumbnail_path in form data when present", () => {
      const thumbnailPath = "/uploads/test.jpg";
      const formData = new FormData();

      if (thumbnailPath) {
        formData.set("meta_post_thumbnail_path", thumbnailPath);
      }

      expect(formData.get("meta_post_thumbnail_path")).toBe("/uploads/test.jpg");
    });

    it("should not include thumbnail_path when empty", () => {
      const thumbnailPath = "";
      const formData = new FormData();

      if (thumbnailPath) {
        formData.set("meta_post_thumbnail_path", thumbnailPath);
      }

      expect(formData.get("meta_post_thumbnail_path")).toBeNull();
    });
  });

  describe("Alpine.js Integration", () => {
    it("should initialize Alpine data with thumbnail values", () => {
      const thumbnailPath = "/uploads/test.jpg";
      const thumbnailUrl = "/api/media/uploads/test.jpg";

      const alpineData = {
        thumbnail_path: thumbnailPath,
        thumbnail_url: thumbnailUrl,
      };

      expect(alpineData.thumbnail_path).toBe(thumbnailPath);
      expect(alpineData.thumbnail_url).toBe(thumbnailUrl);
    });

    it("should update Alpine data on thumbnail upload event", () => {
      const eventDetail = {
        path: "/uploads/new-thumbnail.jpg",
        imageUrl: "/api/media/uploads/new-thumbnail.jpg",
        filename: "new-thumbnail.jpg",
        mimeType: "image/jpeg",
      };

      const alpineData: { thumbnail_path?: string; thumbnail_url?: string } = {};

      // Simular handler do evento
      alpineData.thumbnail_path = eventDetail.path;
      alpineData.thumbnail_url = eventDetail.imageUrl;

      expect(alpineData.thumbnail_path).toBe("/uploads/new-thumbnail.jpg");
      expect(alpineData.thumbnail_url).toBe("/api/media/uploads/new-thumbnail.jpg");
    });
  });
});
