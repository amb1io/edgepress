import { describe, it, expect, beforeEach } from "vitest";
import { renderTheme, resetLiquidForTests } from "../render.ts";
import { defaultThemePackage } from "../../../themes-default/2026/bundle.ts";
import type { ThemeRenderContext } from "../types.ts";

function baseContext(overrides: Partial<ThemeRenderContext> = {}): ThemeRenderContext {
  return {
    site: {
      title: "Demo Site",
      description: "Demo",
      locale: "pt-br",
      base_url: "http://localhost:8787",
      html_lang: "pt-BR",
      year: 2026,
    },
    seo: {
      title: "Demo",
      description: "Demo description",
      canonical: "http://localhost:8787/",
      og_type: "website",
    },
    menus: {
      primary: [{ label: "Home", url: "/", active: true }],
    },
    theme: {
      slug: "2026",
      version: "1.0.0",
      asset_base_url: "http://localhost:8787/themes-assets/2026",
    },
    route: { kind: "home", path: "/", locale: "pt-br" },
    body_class: "route-home",
    post: {
      id: 1,
      title: "Hello",
      slug: "hello",
      excerpt: "Lead text",
      body_html: "<p>Body content</p>",
      author_name: "Author",
      published_at: Date.now(),
      post_type_slug: "page",
      meta: {},
    },
    ...overrides,
  };
}

describe("renderTheme", () => {
  beforeEach(() => {
    resetLiquidForTests();
  });

  it("renders home with seo_head and the_content", async () => {
    const html = await renderTheme(defaultThemePackage, baseContext());
    expect(html).toContain("<title>Demo</title>");
    expect(html).toContain("<p>Body content</p>");
    expect(html).toContain('<section class="hero">');
    expect(html).toContain("Theme API (tutorial)");
    expect(html).toContain('class="site-header"');
  });

  it("renders 404 template", async () => {
    const html = await renderTheme(
      defaultThemePackage,
      baseContext({
        route: { kind: "404", path: "/missing", locale: "pt-br" },
        post: undefined,
      }),
    );
    expect(html).toContain("Página não encontrada");
    expect(html).toContain("/missing");
  });
});
