import { describe, it, expect, beforeEach } from "vitest";
import {
  buildTemplateCandidates,
  resolveTemplateKey,
  normalizeTemplateKey,
} from "../resolve-template.ts";

const baseTemplates: Record<string, string> = {
  home: "<div>home</div>",
  single: "<div>single</div>",
  page: "<div>page</div>",
  archive: "<div>archive</div>",
  "404": "<div>404</div>",
};

describe("resolve-template", () => {
  it("normalizes template paths", () => {
    expect(normalizeTemplateKey("templates/home.liquid")).toBe("home");
    expect(normalizeTemplateKey("parts/header.liquid")).toBe("parts/header");
  });

  it("resolves direct template keys from package", () => {
    expect(resolveTemplateKey("home", baseTemplates)).toBe("home");
    expect(resolveTemplateKey("archive", baseTemplates)).toBe("archive");
  });

  it("prefers front-page over home on front page route", () => {
    const templates = { ...baseTemplates, "front-page": "<div>front</div>" };
    expect(resolveTemplateKey("home", templates)).toBe("front-page");
  });

  it("prefers single-post over single for post singles", () => {
    const templates = {
      ...baseTemplates,
      "single-post": "<div>single-post</div>",
    };
    expect(
      resolveTemplateKey("single", templates, {
        postTypeSlug: "post",
        postSlug: "hello-world",
      }),
    ).toBe("single-post");
  });

  it("resolves single-{type}-{slug} when present", () => {
    const templates = {
      ...baseTemplates,
      "single-post-hello-world": "<div>specific</div>",
    };
    expect(
      resolveTemplateKey("single", templates, {
        postTypeSlug: "post",
        postSlug: "hello-world",
      }),
    ).toBe("single-post-hello-world");
  });

  it("falls back to index when no specific template exists", () => {
    const templates = { index: "<div>index</div>" };
    expect(resolveTemplateKey("home", templates)).toBe("index");
    expect(resolveTemplateKey("single", templates, { postTypeSlug: "post" })).toBe("index");
  });

  it("falls back for 404 to index", () => {
    const templates = { index: "<div>index</div>" };
    expect(resolveTemplateKey("404", templates)).toBe("index");
  });

  it("builds WordPress-style candidate lists", () => {
    expect(buildTemplateCandidates("home")).toEqual(["front-page", "home", "index"]);
    expect(
      buildTemplateCandidates("single", { postTypeSlug: "post", postSlug: "x" }),
    ).toEqual(["single-post-x", "single-post", "single", "singular", "index"]);
    expect(buildTemplateCandidates("page", { postSlug: "about" })).toEqual([
      "page-about",
      "page",
      "singular",
      "index",
    ]);
    expect(buildTemplateCandidates("archive", { archiveType: "post" })).toEqual([
      "archive-post",
      "archive",
      "index",
    ]);
    expect(buildTemplateCandidates("404")).toEqual(["404", "index"]);
    expect(buildTemplateCandidates("search")).toEqual(["search", "archive", "index"]);
  });

  it("prefers taxonomy-specific templates for taxonomy routes", () => {
    const templates = {
      ...baseTemplates,
      "taxonomy-category-visum": "<div>visum</div>",
      "taxonomy-category": "<div>category</div>",
      taxonomy: "<div>taxonomy</div>",
    };
    expect(
      resolveTemplateKey("taxonomy", templates, {
        taxonomyType: "category",
        taxonomySlug: "visum",
      }),
    ).toBe("taxonomy-category-visum");
    expect(
      buildTemplateCandidates("taxonomy", { taxonomyType: "category", taxonomySlug: "visum" }),
    ).toEqual([
      "taxonomy-category-visum",
      "taxonomy-category",
      "taxonomy",
      "archive-category",
      "archive",
      "index",
    ]);
  });
});
