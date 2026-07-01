import { describe, expect, it, vi } from "vitest";
import {
  buildMenuItemUrl,
  getEnabledTaxonomyTypesFromPostTypes,
  menuItemRowToPersist,
} from "../menu-items-service.ts";

describe("buildMenuItemUrl", () => {
  it("returns custom URL from body", () => {
    expect(
      buildMenuItemUrl({
        link_type: "custom",
        body: "https://example.com/about",
      }),
    ).toBe("https://example.com/about");
  });

  it("builds post link with locale prefix for English", () => {
    expect(
      buildMenuItemUrl({
        link_type: "post",
        target_slug: "hello-world",
        target_locale_code: "en_US",
      }),
    ).toBe("/en/hello-world");
  });

  it("builds post link without prefix for pt-br default", () => {
    expect(
      buildMenuItemUrl({
        link_type: "post",
        target_slug: "sobre",
        target_locale_code: "pt_BR",
      }),
    ).toBe("/sobre");
  });

  it("builds taxonomy link for category", () => {
    expect(
      buildMenuItemUrl({
        link_type: "taxonomy",
        target_slug: "uncategorized",
        target_taxonomy_type: "category",
        target_locale_code: "pt_BR",
      }),
    ).toBe("/category/uncategorized");
  });

  it("builds taxonomy link with locale prefix for English", () => {
    expect(
      buildMenuItemUrl({
        link_type: "taxonomy",
        target_slug: "foo",
        target_taxonomy_type: "category",
        target_locale_code: "en_US",
      }),
    ).toBe("/en/category/foo");
  });
});

describe("menuItemRowToPersist", () => {
  it("uses parent locale for custom items", () => {
    const row = menuItemRowToPersist(
      {
        label: "Contato",
        slug: "contato",
        order: 1,
        link_type: "custom",
        custom_url: "/contato",
      },
      5,
    );
    expect(row.body).toBe("/contato");
    expect(row.id_locale_code).toBe(5);
    expect(row.link_type).toBe("custom");
  });

  it("keeps target locale for linked posts", () => {
    const row = menuItemRowToPersist(
      {
        label: "About",
        slug: "about",
        order: 2,
        link_type: "post",
        target_post_id: 10,
        target_post_type: "page",
        target_slug: "about",
        target_locale_code: "en_US",
        id_locale_code: 3,
      },
      5,
    );
    expect(row.id_locale_code).toBe(3);
    expect(row.target_slug).toBe("about");
    expect(row.body).toBe("");
  });

  it("persists taxonomy target fields", () => {
    const row = menuItemRowToPersist(
      {
        label: "News",
        slug: "news",
        order: 1,
        link_type: "taxonomy",
        target_taxonomy_id: 5,
        target_taxonomy_type: "category",
        target_slug: "news",
        target_locale_code: "pt_BR",
        id_locale_code: 1,
      },
      2,
    );
    expect(row.link_type).toBe("taxonomy");
    expect(row.target_taxonomy_id).toBe(5);
    expect(row.target_taxonomy_type).toBe("category");
    expect(row.target_slug).toBe("news");
    expect(row.target_post_id).toBeNull();
    expect(row.body).toBe("");
  });
});

describe("getEnabledTaxonomyTypesFromPostTypes", () => {
  it("collects taxonomy types from enabled post types and filters buckets", async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              meta_schema: JSON.stringify([
                { key: "taxonomy", type: "array", default: ["category", "tag"] },
              ]),
            },
            {
              meta_schema: JSON.stringify([
                {
                  key: "taxonomy",
                  type: "array",
                  default: ["categorias", "taxonomia_jobs"],
                },
              ]),
            },
          ]),
        }),
      }),
    };

    const types = await getEnabledTaxonomyTypesFromPostTypes(
      db as unknown as Parameters<typeof getEnabledTaxonomyTypesFromPostTypes>[0],
    );

    expect(types).toContain("category");
    expect(types).toContain("tag");
    expect(types).toContain("categorias");
    expect(types).not.toContain("taxonomia_jobs");
  });
});
