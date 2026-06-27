import { describe, it, expect, beforeEach } from "vitest";
import { resolveTemplateKey, normalizeTemplateKey } from "../resolve-template.ts";
import type { ThemeManifest } from "../types.ts";

const manifest: ThemeManifest = {
  name: "Test",
  slug: "test",
  version: "1.0.0",
  engine: "liquid",
  supports: ["home", "single", "page", "archive"],
  templates: {
    home: "home",
    single: "single",
    page: "page",
    archive: "archive",
    "404": "404",
  },
};

describe("resolve-template", () => {
  it("normalizes template paths", () => {
    expect(normalizeTemplateKey("templates/home.liquid")).toBe("home");
    expect(normalizeTemplateKey("parts/header.liquid")).toBe("parts/header");
  });

  it("resolves direct template keys", () => {
    expect(resolveTemplateKey("home", manifest)).toBe("home");
    expect(resolveTemplateKey("archive", manifest)).toBe("archive");
  });

  it("falls back for 404", () => {
    const minimal = { ...manifest, templates: { page: "page" } };
    expect(resolveTemplateKey("404", minimal)).toBe("page");
  });
});
