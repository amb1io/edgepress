import { describe, expect, it, vi } from "vitest";
import {
  buildMenuItemTree,
  buildMenuItemUrl,
  getEnabledTaxonomyTypesFromPostTypes,
  menuItemRowToPersist,
  persistMenuItems,
  type MenuItemFlatPublic,
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

describe("buildMenuItemTree", () => {
  it("nests items by parent_menu_item_id and sorts children alphabetically", () => {
    const flat: MenuItemFlatPublic[] = [
      {
        id: 1,
        label: "Home",
        url: "/",
        slug: "home-1",
        order: 1,
        parent_menu_item_id: null,
      },
      {
        id: 2,
        label: "About",
        url: "/about",
        slug: "about-1",
        order: 2,
        parent_menu_item_id: null,
        submenu_sort: "alphabetical",
        submenu_display: ["title", "thumbnail"],
      },
      {
        id: 3,
        label: "Team",
        url: "/team",
        slug: "team-1",
        order: 1,
        parent_menu_item_id: 2,
      },
      {
        id: 4,
        label: "Contact",
        url: "/contact",
        slug: "contact-1",
        order: 2,
        parent_menu_item_id: 2,
      },
    ];

    const tree = buildMenuItemTree(flat);
    expect(tree).toHaveLength(2);
    expect(tree[0]?.children).toEqual([]);
    expect(tree[1]?.children).toHaveLength(2);
    expect(tree[1]?.children.map((c) => c.label)).toEqual(["Contact", "Team"]);
    expect(tree[1]?.submenu_sort).toBe("alphabetical");
    expect(tree[1]?.submenu_display).toEqual(["title", "thumbnail"]);
  });

  it("sorts siblings independently when order values repeat across parents", () => {
    const flat: MenuItemFlatPublic[] = [
      {
        id: 1,
        label: "Services",
        url: "/services",
        slug: "services-1",
        order: 1,
        parent_menu_item_id: null,
      },
      {
        id: 2,
        label: "About",
        url: "/about",
        slug: "about-1",
        order: 2,
        parent_menu_item_id: null,
      },
      {
        id: 3,
        label: "Design",
        url: "/design",
        slug: "design-1",
        order: 1,
        parent_menu_item_id: 1,
      },
      {
        id: 4,
        label: "Dev",
        url: "/dev",
        slug: "dev-1",
        order: 2,
        parent_menu_item_id: 1,
      },
      {
        id: 5,
        label: "Team",
        url: "/team",
        slug: "team-1",
        order: 1,
        parent_menu_item_id: 2,
      },
      {
        id: 6,
        label: "History",
        url: "/history",
        slug: "history-1",
        order: 2,
        parent_menu_item_id: 2,
      },
    ];

    const tree = buildMenuItemTree(flat);
    expect(tree[0]?.children.map((child) => child.label)).toEqual(["Design", "Dev"]);
    expect(tree[1]?.children.map((child) => child.label)).toEqual(["Team", "History"]);
  });
});

const createPostMock = vi.fn();
const updatePostMock = vi.fn();

vi.mock("../post-service.ts", () => ({
  createPost: (...args: unknown[]) => createPostMock(...args),
  updatePost: (...args: unknown[]) => updatePostMock(...args),
}));

describe("persistMenuItems", () => {
  it("resolves parent_client_id for new submenu items", async () => {
    createPostMock
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(20)
      .mockResolvedValueOnce(30);
    updatePostMock.mockResolvedValue(undefined);

    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    };

    await persistMenuItems(db as never, {
      menuPostId: 99,
      menusTypeId: 5,
      parentLocaleId: 1,
      status: "published",
      author_id: "user-1",
      now: 1_700_000_000,
      items: [
        {
          client_id: "parent-a",
          label: "Services",
          slug: "services",
          order: 1,
          link_type: "custom",
          custom_url: "/services",
        },
        {
          client_id: "child-b",
          label: "Design",
          slug: "design",
          order: 2,
          link_type: "custom",
          custom_url: "/design",
          parent_client_id: "parent-a",
        },
        {
          id: 50,
          client_id: "existing-c",
          label: "Blog",
          slug: "blog",
          order: 3,
          link_type: "custom",
          custom_url: "/blog",
        },
      ],
    });

    expect(createPostMock).toHaveBeenCalledTimes(2);
    expect(updatePostMock).toHaveBeenCalledTimes(1);

    const childMeta = JSON.parse(createPostMock.mock.calls[1][1].meta_values);
    expect(childMeta.parent_menu_item_id).toBe(10);
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
