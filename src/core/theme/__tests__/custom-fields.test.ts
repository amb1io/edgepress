import { describe, expect, it, beforeEach } from "vitest";
import { renderTheme, resetLiquidForTests } from "../render.ts";
import type { ThemePackageRecord, ThemeRenderContext } from "../types.ts";
import { parseCustomFieldArgs, pickCustomFieldValue } from "../theme-functions.ts";

function minimalPackage(templates: Record<string, string>): ThemePackageRecord {
  return {
    manifest: {
      name: "Test",
      slug: "test",
      version: "1.0.0",
      engine: "liquid",
      supports: ["home"],
      templates: {},
    },
    templates,
    updated_at: Date.now(),
  };
}

describe("pickCustomFieldValue", () => {
  it("reads nested block field by title and name", () => {
    const value = pickCustomFieldValue(
      {
        custom_fields: [
          {
            id: 1,
            title: "Dados da Equipe",
            slug: "dados-da-equipe",
            fields: [
              { name: "cargo", value: "Sócio" },
              { name: "dono", value: "sim" },
            ],
          },
        ],
      },
      "Dados da Equipe",
      "cargo",
    );
    expect(value).toBe("Sócio");
  });
});

describe("parseCustomFieldArgs", () => {
  it("parses tag arguments", () => {
    expect(
      parseCustomFieldArgs("member, 'Dados da Equipe', 'cargo' as job_title"),
    ).toEqual({
      postExpr: "member",
      blockTitle: "Dados da Equipe",
      fieldName: "cargo",
      varName: "job_title",
    });
  });
});

describe("custom_fields in Liquid context", () => {
  beforeEach(() => {
    resetLiquidForTests();
  });

  it("renders nested custom_fields from post objects", async () => {
    const pkg = minimalPackage({
      index: `{% get_taxonomy_posts 'category', 'equipe', 10 as members %}
{% for member in members %}
{% for block in member.custom_fields %}
{% if block.title == 'Dados da Equipe' %}
{% for field in block.fields %}
{% if field.name == 'cargo' %}<p class="job">{{ field.value }}</p>{% endif %}
{% endfor %}
{% endif %}
{% endfor %}
{% endfor %}`,
    });

    const html = await renderTheme(
      pkg,
      {
        site: {
          title: "Demo",
          description: "",
          locale: "pt-br",
          locale_prefix: "",
          home_url: "/",
          base_url: "http://localhost:8787",
          html_lang: "pt-BR",
          year: 2026,
        },
        seo: {
          title: "Demo",
          description: "",
          canonical: "http://localhost:8787/",
          og_type: "website",
        },
        menus: {},
        theme: {
          slug: "test",
          version: "1.0.0",
          asset_base_url: "http://localhost:8787/themes-assets/test",
          supports: [],
        },
        route: { kind: "home", path: "/", locale: "pt-br", template_key: "index", params: {} },
        body_class: "route-home",
        locale_switcher: [],
        posts: [],
        archive: { title: "Blog", type: "post" },
        pagination: { page: 1, total_pages: 1 },
        is_front_page: true,
        is_single: false,
        is_page: false,
        is_singular: false,
        is_archive: false,
        is_search: false,
        is_404: false,
        have_posts: false,
        get_taxonomy_posts: async () => [
          {
            id: 1,
            title: "Ana",
            slug: "ana",
            excerpt: "",
            body_html: "",
            author_name: "",
            published_at: null,
            post_type_slug: "equipe",
            meta: { "dados-da-equipe_cargo": "Diretora" },
            custom_fields: [
              {
                id: 10,
                title: "Dados da Equipe",
                slug: "dados-da-equipe",
                fields: [{ name: "cargo", value: "Diretora", type: "text" }],
              },
            ],
          },
        ],
      } satisfies ThemeRenderContext,
    );

    expect(html).toContain('<p class="job">Diretora</p>');
  });

  it("reads flattened custom field values from meta", async () => {
    const pkg = minimalPackage({
      index: `<p class="owner">{{ member.meta['dados-da-equipe_dono'] }}</p>`,
    });

    const html = await renderTheme(
      pkg,
      {
        site: {
          title: "Demo",
          description: "",
          locale: "pt-br",
          locale_prefix: "",
          home_url: "/",
          base_url: "http://localhost:8787",
          html_lang: "pt-BR",
          year: 2026,
        },
        seo: {
          title: "Demo",
          description: "",
          canonical: "http://localhost:8787/",
          og_type: "website",
        },
        menus: {},
        theme: {
          slug: "test",
          version: "1.0.0",
          asset_base_url: "http://localhost:8787/themes-assets/test",
          supports: [],
        },
        route: { kind: "home", path: "/", locale: "pt-br", template_key: "index", params: {} },
        body_class: "route-home",
        locale_switcher: [],
        posts: [],
        archive: { title: "Blog", type: "post" },
        pagination: { page: 1, total_pages: 1 },
        is_front_page: true,
        is_single: false,
        is_page: false,
        is_singular: false,
        is_archive: false,
        is_search: false,
        is_404: false,
        have_posts: false,
        member: {
          id: 1,
          title: "Ana",
          slug: "ana",
          excerpt: "",
          body_html: "",
          author_name: "",
          published_at: null,
          post_type_slug: "equipe",
          meta: { "dados-da-equipe_dono": "sim" },
          custom_fields: [],
        },
      } as ThemeRenderContext,
    );

    expect(html).toContain('<p class="owner">sim</p>');
  });

  it("assigns value via custom_field tag", async () => {
    const pkg = minimalPackage({
      index: `{% custom_field member, 'Dados da Equipe', 'dono' as is_owner %}<span>{{ is_owner }}</span>`,
    });

    const html = await renderTheme(
      pkg,
      {
        site: {
          title: "Demo",
          description: "",
          locale: "pt-br",
          locale_prefix: "",
          home_url: "/",
          base_url: "http://localhost:8787",
          html_lang: "pt-BR",
          year: 2026,
        },
        seo: {
          title: "Demo",
          description: "",
          canonical: "http://localhost:8787/",
          og_type: "website",
        },
        menus: {},
        theme: {
          slug: "test",
          version: "1.0.0",
          asset_base_url: "http://localhost:8787/themes-assets/test",
          supports: [],
        },
        route: { kind: "home", path: "/", locale: "pt-br", template_key: "index", params: {} },
        body_class: "route-home",
        locale_switcher: [],
        posts: [],
        archive: { title: "Blog", type: "post" },
        pagination: { page: 1, total_pages: 1 },
        is_front_page: true,
        is_single: false,
        is_page: false,
        is_singular: false,
        is_archive: false,
        is_search: false,
        is_404: false,
        have_posts: false,
        member: {
          id: 1,
          title: "Ana",
          slug: "ana",
          excerpt: "",
          body_html: "",
          author_name: "",
          published_at: null,
          post_type_slug: "equipe",
          meta: {},
          custom_fields: [
            {
              id: 10,
              title: "Dados da Equipe",
              slug: "dados-da-equipe",
              fields: [{ name: "dono", value: "sim", type: "text" }],
            },
          ],
        },
      } as ThemeRenderContext,
    );

    expect(html).toContain("<span>sim</span>");
  });
});
