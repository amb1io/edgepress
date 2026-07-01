import { describe, it, expect, beforeEach } from "vitest";
import { renderTheme, resetLiquidForTests } from "../render.ts";
import { referenceThemePackage } from "./fixtures/reference-theme.ts";
import type { ThemePackageRecord, ThemeRenderContext } from "../types.ts";

function baseContext(overrides: Partial<ThemeRenderContext> = {}): ThemeRenderContext {
  const post = {
    id: 1,
    title: "Hello",
    slug: "hello",
    excerpt: "Lead text",
    body_html: "<p>Body content</p>",
    author_name: "Author",
    published_at: Date.now(),
    post_type_slug: "page",
    meta: {},
  };

  return {
    site: {
      title: "Demo Site",
      description: "Demo",
      locale: "pt-br",
      locale_prefix: "",
      home_url: "/",
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
    locale_switcher: [
      { code: "pt-br", flag: "🇧🇷", label: "PT", url: "/", active: true },
      { code: "en", flag: "🇺🇸", label: "EN", url: "/en", active: false },
    ],
    post,
    posts: [post],
    archive: { title: "Blog", type: "post" },
    pagination: { page: 1, total_pages: 1 },
    is_front_page: true,
    is_single: false,
    is_page: false,
    is_singular: false,
    is_archive: false,
    is_404: false,
    have_posts: true,
    ...overrides,
  };
}

function minimalPackage(templates: Record<string, string>): ThemePackageRecord {
  return {
    manifest: {
      name: "Test",
      slug: "test",
      version: "1.0.0",
      engine: "liquid",
      supports: ["home", "single", "page", "archive"],
      templates: {},
    },
    templates,
    updated_at: Date.now(),
  };
}

describe("renderTheme", () => {
  beforeEach(() => {
    resetLiquidForTests();
  });

  it("renders home with seo_head and the_content", async () => {
    const html = await renderTheme(referenceThemePackage, baseContext());
    expect(html).toContain("<title>Demo</title>");
    expect(html).toContain("<p>Body content</p>");
    expect(html).toContain('<section class="hero">');
    expect(html).toContain("Theme API (tutorial)");
    expect(html).toContain('class="site-header"');
    expect(html).toContain('class="site-lang-switcher"');
    expect(html).toContain("🇧🇷");
    expect(html).toContain("🇺🇸");
  });

  it("renders 404 template", async () => {
    const html = await renderTheme(
      referenceThemePackage,
      baseContext({
        route: { kind: "404", path: "/missing", locale: "pt-br" },
        post: undefined,
        is_front_page: false,
        is_404: true,
      }),
    );
    expect(html).toContain("Página não encontrada");
    expect(html).toContain("/missing");
  });

  it("prefers single-post over single in template hierarchy", async () => {
    const pkg = minimalPackage({
      "single-post": "{% layout 'layouts/base' %}<p>single-post template</p>",
      single: "{% layout 'layouts/base' %}<p>generic single</p>",
      "layouts/base": "<html><body>{{ content }}</body></html>",
    });

    const html = await renderTheme(
      pkg,
      baseContext({
        route: { kind: "single", path: "/hello", locale: "pt-br" },
        post: {
          id: 2,
          title: "Post",
          slug: "hello",
          excerpt: "",
          body_html: "",
          author_name: "A",
          published_at: Date.now(),
          post_type_slug: "post",
          meta: {},
        },
        is_front_page: false,
        is_single: true,
        is_singular: true,
      }),
    );

    expect(html).toContain("single-post template");
    expect(html).not.toContain("generic single");
  });

  it("falls back to index when no route-specific template exists", async () => {
    const pkg = minimalPackage({
      index: "<p>index fallback</p>",
    });

    const html = await renderTheme(
      pkg,
      baseContext({
        route: { kind: "home", path: "/", locale: "pt-br" },
      }),
    );

    expect(html).toContain("index fallback");
  });

  it("assigns taxonomy terms via get_taxonomies tag", async () => {
    const pkg = minimalPackage({
      home: `{% get_taxonomies 'post', 'category' as cats %}
<ul>{% for cat in cats %}<li>{{ cat.name }}:{{ cat.slug }}</li>{% endfor %}</ul>`,
    });

    const html = await renderTheme(
      pkg,
      baseContext({
        get_taxonomies: async () => [{ name: "Categoria", slug: "categoria" }],
      }),
    );

    expect(html).toContain("Categoria:categoria");
  });

  it("assigns related posts via get_related_posts tag", async () => {
    const pkg = minimalPackage({
      home: `{% get_related_posts post.id, 2 as related %}
<ul>{% for item in related %}<li>{{ item.title }}</li>{% endfor %}</ul>`,
    });

    const html = await renderTheme(
      pkg,
      baseContext({
        post: {
          id: 1,
          title: "Current",
          slug: "current",
          excerpt: "",
          body_html: "",
          author_name: "",
          published_at: null,
          post_type_slug: "post",
          meta: {},
        },
        get_related_posts: async () => [
          {
            id: 2,
            title: "Related One",
            slug: "related-one",
            excerpt: "",
            body_html: "",
            author_name: "",
            published_at: null,
            post_type_slug: "post",
            meta: {},
          },
        ],
      }),
    );

    expect(html).toContain("Related One");
  });

  it("assigns author via get_author tag", async () => {
    const pkg = minimalPackage({
      home: `{% get_author post.id as author %}{% if author %}{{ author.name }}:{{ author.description }}{% else %}none{% endif %}`,
    });

    const html = await renderTheme(
      pkg,
      baseContext({
        post: {
          id: 1,
          title: "Current",
          slug: "current",
          excerpt: "",
          body_html: "",
          author_name: "",
          published_at: null,
          post_type_slug: "post",
          meta: {},
        },
        get_author: async () => ({
          name: "Rhamses",
          image: "https://example.com/a.jpg",
          description: "Bio do autor",
        }),
      }),
    );

    expect(html).toContain("Rhamses:Bio do autor");
  });
});
